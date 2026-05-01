// Kling AI video-generation provider — implements VideoGenerationProvider.
//
// Two operations:
//   1. Image-to-Video — silent motion from a still
//   2. LipSync         — silent video + audio → lip-synced video
//
// Both are submit-then-poll. URLs (not base64) are passed for the
// LipSync inputs — Kling's server fetches them directly. Audio comes
// from ElevenLabs and the caller is responsible for resolving its
// public URL via lib/animation/public-url.ts before invoking lipsync.
//
// All Kling-specific field names (`model_name`, `image_list`, `task_id`,
// `task_status`, `video_url`, `audio_url`, `mode`, `aspect_ratio`) live
// ONLY in this file. Outside, the pipeline talks to the generic
// VideoGenerationProvider interface in ./types.ts.
//
// Configuration (env):
//   KLING_API_BASE_URL              base host. Default https://api-singapore.klingai.com
//   KLING_IMAGE_TO_VIDEO_ENDPOINT   path. Default /v1/videos/image2video
//   KLING_LIPSYNC_ENDPOINT          path. Default /v1/videos/lip-sync
//   KLING_IMAGE_TO_VIDEO_MODEL      model id. Default kling-v3-omni
//   KLING_LIPSYNC_MODEL             model id. Default kling-lip-sync-v1
//   KLING_API_KEY                   Bearer token (preferred for wrappers)
//   KLING_ACCESS_KEY +              AK/SK pair for HS256 JWT (official only).
//   KLING_SECRET_KEY                Used only when KLING_API_KEY is unset.
//   KLING_LIPSYNC_MOCK=1            Use the mock lipsync provider (returns
//                                   the silent input video unchanged). Lets
//                                   us exercise the full pipeline without
//                                   hitting Kling lipsync until endpoints
//                                   are stable.

import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

import {
  AspectRatio,
  FinalVideoResult,
  ImageToVideoInput,
  StatusResult,
  SubmitResult,
  VideoGenerationProvider,
  VideoProviderApiError,
  VideoProviderConfigError,
  VideoProviderTimeoutError,
} from './types';
import { withRetry } from '@/lib/utils/retry';

// Re-exports so existing callers (clip-impl.ts) can import error types
// from this file even after the architecture refactor.
export {
  VideoProviderApiError as KlingApiError,
  VideoProviderConfigError as KlingConfigError,
  VideoProviderTimeoutError as KlingTimeoutError,
} from './types';

const DEFAULT_BASE_URL = 'https://api-singapore.klingai.com';
const DEFAULT_I2V_ENDPOINT = '/v1/videos/image2video';
const DEFAULT_LIPSYNC_ENDPOINT = '/v1/videos/lip-sync';
// Two endpoint families on Kling:
//   /v1/videos/image2video  — classic i2v. Models: kling-v1, kling-v1-5,
//                              kling-v1-6, kling-v2-master, kling-v2-1-master.
//                              image_list field: { image: <url|base64> }
//   /v1/videos/omni-video    — newer multimodal. Models: kling-video-o1,
//                              kling-v3-omni. image_list field:
//                              { image_url: <url|base64> }, supports
//                              multi-shot, sound generation, etc.
// We pick by KLING_IMAGE_TO_VIDEO_ENDPOINT — when it ends with /omni-video
// we use the omni request shape; otherwise the legacy image2video shape.
const DEFAULT_I2V_MODEL = 'kling-v2-master';
function isOmniEndpoint(endpoint: string): boolean {
  return /\/omni-video\/?$/.test(endpoint);
}
const DEFAULT_LIPSYNC_MODEL = 'kling-lip-sync-v1';

const POLL_INTERVAL_MS = 5_000;
// Bumped from 8 → 15 min after observing v3-omni jobs running 9-10
// minutes during peak load (April 2026). Our previous timeout would
// abandon a task while Kling was still processing — wasting the
// $0.82 spend with nothing to show for it.
const POLL_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/* ---------- Auth + transport ---------- */

function getBaseUrl(): string {
  return (process.env.KLING_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function buildAuthHeader(): string {
  if (process.env.KLING_API_KEY) {
    return `Bearer ${process.env.KLING_API_KEY}`;
  }
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) {
    throw new VideoProviderConfigError(
      'Kling auth missing. Set either KLING_API_KEY (for wrapper providers) or ' +
        'KLING_ACCESS_KEY + KLING_SECRET_KEY (for the official api-singapore.klingai.com).',
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const headerB64 = enc({ alg: 'HS256', typ: 'JWT' });
  const payloadB64 = enc({ iss: ak, exp: now + 1800, nbf: now - 5 });
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', sk).update(signingInput).digest('base64url');
  return `Bearer ${signingInput}.${sig}`;
}

async function klingFetch<T>(
  endpointPath: string,
  init: RequestInit,
  stage: 'i2v' | 'lipsync',
): Promise<T> {
  const url = `${getBaseUrl()}${endpointPath}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: buildAuthHeader(),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new VideoProviderApiError(
      `Kling ${stage} ${res.status}: ${body.slice(0, 300)}`,
      stage,
      res.status,
    );
  }
  return (await res.json()) as T;
}

/* ---------- Image payload helper ---------- */

async function imageToPayload(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  if (imageUrl.startsWith('/')) {
    // V12.1 — readPublicAsset handles disk + Vercel HTTP fallback.
    const { readPublicAsset } = await import('@/lib/storage/read-public-asset');
    const { bytes } = await readPublicAsset(imageUrl);
    return bytes.toString('base64');
  }
  return imageUrl; // assume already base64
}

/* ---------- Kling task response shapes ---------- */

interface KlingCreateResponse {
  code: number;
  message: string;
  data?: { task_id: string };
}
interface KlingStatusResponse {
  code: number;
  message: string;
  data?: {
    task_id: string;
    task_status: 'submitted' | 'processing' | 'succeed' | 'failed';
    task_status_msg?: string;
    task_result?: { videos?: Array<{ url: string; duration: string }> };
  };
}

function parseKlingStatus(payload: KlingStatusResponse): StatusResult {
  if (payload.code !== 0 || !payload.data) {
    return { status: 'failed', errorMessage: payload.message ?? `code=${payload.code}` };
  }
  switch (payload.data.task_status) {
    case 'submitted':
      return { status: 'queued' };
    case 'processing':
      return { status: 'processing' };
    case 'succeed': {
      const video = payload.data.task_result?.videos?.[0];
      if (!video?.url) return { status: 'failed', errorMessage: 'succeed without video URL' };
      return { status: 'completed', videoUrl: video.url };
    }
    case 'failed':
      return {
        status: 'failed',
        errorMessage: payload.data.task_status_msg ?? 'unknown',
      };
    default:
      return { status: 'queued' };
  }
}

/* ---------- The Kling provider ---------- */

class KlingProvider implements VideoGenerationProvider {
  async submitImageToVideo(input: ImageToVideoInput): Promise<SubmitResult> {
    const endpoint =
      process.env.KLING_IMAGE_TO_VIDEO_ENDPOINT ?? DEFAULT_I2V_ENDPOINT;
    // V14+ — caller may override the model per-request (used for the
    // dev compare button that runs kling-v3-omni AND kling-video-o1
    // side by side on the same scene). Both models live on the
    // /v1/videos/omni-video endpoint with the same body shape.
    const model =
      input.model?.trim() ||
      process.env.KLING_IMAGE_TO_VIDEO_MODEL ||
      DEFAULT_I2V_MODEL;
    const omni = isOmniEndpoint(endpoint);

    // Resolve all images to URLs/base64. Omni-Video accepts up to 4
    // entries in image_list and weights the first one highest — so the
    // primary scene image always goes first, with additional references
    // (e.g. product photo) appended after.
    const primary = await imageToPayload(input.imageUrl);
    const refs = input.referenceImageUrls?.length
      ? await Promise.all(input.referenceImageUrls.map(imageToPayload))
      : [];

    // Field shape differs between the two endpoint families:
    //   omni-video    → image_list: [{ image_url: <url|b64> }, ...]
    //                    + supports `negative_prompt` natively
    //   image2video   → image_list: [{ image: <url|b64> }] (single only)
    //                    no native negative_prompt → we append "NEGATIVE: …"
    //                    to the main prompt as a best-effort fallback
    let body: Record<string, unknown>;
    if (omni) {
      const imageList = [
        { image_url: primary },
        ...refs.map((r) => ({ image_url: r })),
      ];
      body = {
        model_name: model,
        image_list: imageList,
        mode: 'std',
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio,
        duration: String(input.durationSeconds),
      };
      // `sound: false` was sent here previously to suppress Omni's
      // ambient-sound generation, but Kling code 1201 ("Failed to
      // resolve the request body") came back — `sound` isn't a
      // documented field on /v1/videos/omni-video. Removed.
      // Audio is replaced downstream by the ElevenLabs voice mux for
      // every scene that has a voiceUrl, so for our pipeline this is
      // moot in practice. If we ever ship silent-no-voice scenes,
      // strip Kling's audio with `ffmpeg -an` instead.
      if (input.negativePrompt && input.negativePrompt.trim().length > 0) {
        body.negative_prompt = input.negativePrompt;
      }
      // V14+ — cfg_scale knob for prompt adherence. Higher = stricter.
      // Recommended 0.7 for product/hands (label integrity), 0.5 for
      // talking-head plates. The renderers in buildPromptFromPlan emit
      // the right value per scene; we just forward it.
      if (typeof input.cfgScale === 'number' && Number.isFinite(input.cfgScale)) {
        body.cfg_scale = clampCfgScale(input.cfgScale);
      }
    } else {
      // Legacy image2video: single-image only, fold negatives into prompt.
      const promptWithNeg =
        input.negativePrompt && input.negativePrompt.trim().length > 0
          ? `${input.prompt}. NEGATIVE: ${input.negativePrompt}`
          : input.prompt;
      body = {
        model_name: model,
        image_list: [{ image: primary }],
        mode: 'std',
        prompt: promptWithNeg,
        aspect_ratio: input.aspectRatio,
        duration: String(input.durationSeconds),
      };
      // Legacy endpoint also accepts cfg_scale — same semantics.
      if (typeof input.cfgScale === 'number' && Number.isFinite(input.cfgScale)) {
        body.cfg_scale = clampCfgScale(input.cfgScale);
      }
    }

    // Structured trace for /admin/costs debugging — what we asked Kling
    // for, in one log line, so we can audit drift cases retrospectively.
    // We log the body SHAPE (keys + truncated lengths) but never the
    // full base64 payloads or the prompt text — keeps the log readable
    // and avoids dumping a 3MB log line per scene.
    const bodyShape = Object.keys(body).reduce<Record<string, string>>((acc, k) => {
      const v = body[k];
      if (k === 'image_list' && Array.isArray(v)) {
        acc[k] = `[${v.length} ref${v.length === 1 ? '' : 's'}]`;
      } else if (typeof v === 'string') {
        acc[k] = v.length > 60 ? `<${v.length} chars>` : v;
      } else {
        acc[k] = String(v);
      }
      return acc;
    }, {});
    console.log(
      `[kling i2v] scene=${input.sceneId} endpoint=${endpoint} model=${model} ` +
        `refs=${1 + refs.length} negPrompt=${!!input.negativePrompt} ` +
        `dur=${input.durationSeconds}s ar=${input.aspectRatio} ` +
        `body=${JSON.stringify(bodyShape)}`,
    );

    // V26.11 — wrap the submit (NOT the poll) in withRetry. The poll
    // loop is naturally retry-tolerant — its next 5s tick is the
    // implicit retry on a transient failure. Wrapping individual poll
    // calls would compound attempts and waste budget.
    const res = await withRetry(
      () =>
        klingFetch<KlingCreateResponse>(
          endpoint,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
          'i2v',
        ),
      { label: 'kling.i2v.submit', earlyFailWindowMs: 15_000 },
    );
    if (res.code !== 0 || !res.data?.task_id) {
      throw new VideoProviderApiError(
        `Kling i2v submit failed: ${res.message ?? 'unknown'} (code=${res.code})`,
        'i2v',
      );
    }
    return { providerJobId: res.data.task_id, status: 'queued' };
  }

  async getStatus(providerJobId: string): Promise<StatusResult> {
    const i2vEndpoint =
      process.env.KLING_IMAGE_TO_VIDEO_ENDPOINT ?? DEFAULT_I2V_ENDPOINT;
    const res = await klingFetch<KlingStatusResponse>(
      `${i2vEndpoint}/${encodeURIComponent(providerJobId)}`,
      { method: 'GET' },
      'i2v',
    );
    return parseKlingStatus(res);
  }

  async generateImageToVideo(input: ImageToVideoInput): Promise<FinalVideoResult> {
    const submit = await this.submitImageToVideo(input);
    return pollAndDownload(this, submit.providerJobId, {
      durationSeconds: input.durationSeconds,
      modelUsed:
        input.model?.trim() ||
        process.env.KLING_IMAGE_TO_VIDEO_MODEL ||
        DEFAULT_I2V_MODEL,
    });
  }
}

export const klingProvider: VideoGenerationProvider = new KlingProvider();

/* ---------- Polling helper ---------- */

async function pollAndDownload(
  provider: KlingProvider,
  providerJobId: string,
  ctx: {
    durationSeconds: number;
    modelUsed: string;
  },
): Promise<FinalVideoResult> {
  const startedAt = Date.now();
  while (true) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new VideoProviderTimeoutError(
        `Kling job ${providerJobId} did not finish within ${POLL_TIMEOUT_MS / 1000}s.`,
      );
    }
    const status = await provider.getStatus(providerJobId);
    if (status.status === 'completed' && status.videoUrl) {
      const videoBytes = await downloadAsBuffer(status.videoUrl);
      return {
        providerJobId,
        videoBytes,
        videoUrl: status.videoUrl,
        durationSeconds: ctx.durationSeconds,
        modelUsed: ctx.modelUsed,
      };
    }
    if (status.status === 'failed') {
      throw new VideoProviderApiError(
        `Kling i2v job ${providerJobId} failed: ${status.errorMessage ?? 'unknown'}`,
        'i2v',
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/* ---------- Misc helpers ---------- */

async function downloadAsBuffer(url: string): Promise<Buffer> {
  // V12.3 — production-safe: readPublicAsset handles both local disk
  // (dev) and HTTP fallback to PUBLIC_BASE_URL (Vercel where public/
  // is excluded from the function bundle), plus absolute URLs (R2)
  // pass straight through.
  const { readPublicAsset } = await import('@/lib/storage/read-public-asset');
  const { bytes } = await readPublicAsset(url);
  return bytes;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// V14+ — clamp cfg_scale to Kling's documented range. The PiAPI / Kling
// docs put cfg_scale at 0-1 with 0.5 default; we clamp to [0.1, 1.0] to
// catch caller bugs (e.g. accidentally passing 7 instead of 0.7).
function clampCfgScale(value: number): number {
  if (value < 0.1) return 0.1;
  if (value > 1.0) return 1.0;
  return value;
}

/* ---------- Backwards-compat re-exports + motion-prompt builder ---------- */

// Old API kept so legacy callers compile during the transition. New code
// should use klingProvider.generateImageToVideo / generateLipSync.
export interface BrollInput extends ImageToVideoInput {}
export type BrollResult = FinalVideoResult;
export async function generateBroll(input: BrollInput): Promise<FinalVideoResult> {
  return klingProvider.generateImageToVideo(input);
}

// AspectRatio re-export for callers that don't want to import from types.ts.
export type KlingAspectRatio = AspectRatio;

// V14+ — provider-aware prompt builders.
//
// The AnimationPlan is the contract; the prompt is just the rendered
// form of the contract. We render DIFFERENTLY for Kling vs Grok because
// the two models have different prompt-craft expectations:
//
//   Kling Omni v3:
//     • Comma-separated short clauses, camera-first, ~30-50 word positive.
//     • Native `negative_prompt` field with strong per-token weighting.
//     • Cap negatives at ~10 items (loses weight past ~12).
//     • Anti-drift "DO NOT" guards belong in the negative list, NOT the
//       positive — leading positive tokens are weighted hardest.
//
//   Grok Imagine (xAI grok-imagine-video):
//     • Single prompt string; no native negative field (provider folds
//       any negative as "AVOID: …" tail text).
//     • Cinematic / paragraph style outperforms tight comma-tokens.
//     • Positive framing wins ("the face is never the subject" > "do not
//       zoom to the face").
//
// Both renderers consume the same AnimationPlan + the same V14+ physics
// fields (contactAnchors, motionTimeframeSeconds, motionEndpoint,
// emotionalTone) so improvements to motion-analysis upstream propagate
// to both providers automatically.

export interface KlingMotionPrompt {
  /** Goes into the Omni `prompt` field (Kling) or the `prompt` body
   *  field (Grok). */
  positive: string;
  /** Goes into the Omni `negative_prompt` field (Kling) or appended as
   *  "AVOID: …" by the Grok adapter. */
  negative: string;
  /** Kling-only adherence knob (0.1–1.0, default 0.5). The Grok adapter
   *  ignores this. The Kling adapter folds it into the request body. */
  cfgScale?: number;
}

// V13 PR3.2 — Kling-flavored camera vocabulary. The plan stores the
// camera move as an enum; this table renders it into Kling's preferred
// short-clause style.
const KLING_CAMERA_TOKEN: Record<
  import('./animation-plan-builder').AnimationCameraMotion,
  string
> = {
  static: 'Static camera, eye-level',
  subtle_handheld: 'Static frame with very slight handheld breathing, eye-level',
  slow_push_in: 'Slow Zoom In, locked-off framing',
  slow_pull_back: 'Slow Zoom Out, locked-off framing',
};

// V14+ — Grok prefers cinematic prose. Same enum, fuller sentences.
const GROK_CAMERA_SENTENCE: Record<
  import('./animation-plan-builder').AnimationCameraMotion,
  string
> = {
  static: 'A locked-off shot at eye level with the soft breath of a held phone.',
  subtle_handheld:
    'A handheld shot at eye level, the camera breathing gently with the operator.',
  slow_push_in:
    'The camera slowly pushes in over the duration of the clip, holding the subject centered.',
  slow_pull_back:
    'The camera slowly pulls back over the duration of the clip, opening up the frame.',
};

// V14+ — silent-talking-plate beats expressed in physics language. Each
// clause names the moving subject + a measured amount, so Kling/Grok
// both have something to simulate. Compare to the V13 prose version
// which leaned on vague verbs ("subtle facial movement").
const SILENT_TALKING_HEAD_TOKENS = [
  'creator looks at the lens, eyes hold soft focus',
  'small inhale, chest rises 1-2cm and shoulders settle on exhale',
  'lips part 2-3mm as if mid-word, jaw drops slightly, then closes',
  'one natural blink at mid-clip',
  'eyebrows raise 1-2mm for micro-emphasis',
  'one small chest-level hand gesture, returns to rest',
  'tiny chin-dip nod at the end, head returns to level',
].join(', ');

// V14+ — TRIMMED negatives. Per Kling community guides + research (May
// 2026), 6-10 targeted tokens outperform a 15+ token spray — the model
// loses per-token weight past ~12 items. Each entry is a distinct
// failure CLASS (not a synonym of another).
const TALKING_NEGATIVES_CORE = [
  'plastic skin',
  'beauty filter skin',
  'distorted mouth',
  'frozen face',
  'dead eyes',
  'side profile',
  'mouth covered',
  'blurry face',
].join(', ');

const NON_TALKING_NEGATIVES_CORE = [
  'face zoom',
  'talking selfie',
  'mouth speaking',
  'lips moving',
  'label warp',
  'product morph',
  'cropped product',
  'camera shake',
].join(', ');

// V14+ — primary entry point. Renders an AnimationPlan into a prompt
// pair tuned for the target provider. Callers should use this; the
// older buildKlingPromptFromPlan / buildKlingMotionPrompt are kept as
// thin aliases for back-compat.
export function buildPromptFromPlan(
  plan: import('./animation-plan-builder').AnimationPlan,
  opts: {
    /** Which i2v provider this prompt will be sent to. */
    provider: 'kling' | 'grok';
    /** Free-text camera direction from the script LLM — folded in as a
     *  hint, but the plan's cameraMotion enum still leads. */
    cameraDirection?: string | null;
  },
): KlingMotionPrompt {
  if (opts.provider === 'grok') {
    return renderForGrok(plan, opts);
  }
  return renderForKling(plan, opts);
}

// Back-compat alias — clip-impl currently imports this name. New code
// should use buildPromptFromPlan({ provider: 'kling', ... }).
export function buildKlingPromptFromPlan(
  plan: import('./animation-plan-builder').AnimationPlan,
  opts: {
    cameraDirection?: string | null;
  } = {},
): KlingMotionPrompt {
  return buildPromptFromPlan(plan, { provider: 'kling', ...opts });
}

/* ---------- Kling renderer ---------- */

function renderForKling(
  plan: import('./animation-plan-builder').AnimationPlan,
  opts: { cameraDirection?: string | null },
): KlingMotionPrompt {
  const cameraToken = KLING_CAMERA_TOKEN[plan.cameraMotion];
  const cameraHint =
    opts.cameraDirection && opts.cameraDirection.trim().length
      ? `${cameraToken}. ${opts.cameraDirection.trim()}`
      : cameraToken;

  // Order matters — Kling weights leading positive tokens highest.
  // Camera → primary action → physics anchors → ambient → preserve.
  // Anti-drift "DO NOT" lives in the negative_prompt, not here.
  const parts: string[] = [];

  parts.push(cameraHint);

  if (plan.speakingExpected) {
    parts.push(SILENT_TALKING_HEAD_TOKENS);
  } else {
    parts.push(plan.humanMotion);
    if (plan.objectMotion && plan.objectMotion !== plan.humanMotion) {
      parts.push(plan.objectMotion);
    }
  }

  if (plan.contactAnchors && plan.contactAnchors.length > 0) {
    parts.push(`Contact: ${plan.contactAnchors.join('; ')}`);
  }
  if (typeof plan.motionTimeframeSeconds === 'number' && plan.motionTimeframeSeconds > 0) {
    parts.push(`Action over ~${plan.motionTimeframeSeconds}s`);
  }
  if (plan.motionEndpoint) {
    parts.push(`End state: ${plan.motionEndpoint}`);
  }
  if (plan.preserveProductVisibility) {
    parts.push('Product remains in frame and readable from start to finish');
  }
  if (plan.emotionalTone) {
    parts.push(`Tone: ${plan.emotionalTone}`);
  }

  // Negative prompt — plan's forbiddenMotion (targeted) + a tight
  // baseline list. Cap at 10 to keep per-token weight high.
  const baselineNegatives = plan.speakingExpected
    ? TALKING_NEGATIVES_CORE
    : NON_TALKING_NEGATIVES_CORE;
  const negativeBuf = new Set<string>();
  for (const item of plan.forbiddenMotion) {
    if (item.trim().length) negativeBuf.add(item.trim());
  }
  for (const item of baselineNegatives.split(',').map((s) => s.trim())) {
    if (item.length) negativeBuf.add(item);
  }
  const negative = Array.from(negativeBuf).slice(0, 10).join(', ');

  return {
    positive: parts.filter((p) => p && p.trim().length).join('. ') + '.',
    negative,
    cfgScale: pickCfgScale(plan),
  };
}

/* ---------- Grok renderer ---------- */

function renderForGrok(
  plan: import('./animation-plan-builder').AnimationPlan,
  opts: { cameraDirection?: string | null },
): KlingMotionPrompt {
  const sentences: string[] = [];

  // 1. Camera as a full sentence.
  let cameraSentence = GROK_CAMERA_SENTENCE[plan.cameraMotion];
  if (opts.cameraDirection && opts.cameraDirection.trim().length) {
    cameraSentence = `${cameraSentence} ${capitalize(opts.cameraDirection.trim())}.`;
  }
  sentences.push(cameraSentence);

  // 2. Primary action.
  if (plan.speakingExpected) {
    sentences.push(
      'The creator looks into the lens and appears to speak silently — a small inhale, the lips part as if mid-word, the jaw drops a few millimeters and closes, a single natural blink at mid-clip, the eyebrows lift slightly for emphasis, and one small chest-level hand gesture comes and goes; the clip ends on a tiny chin-dip nod.',
    );
  } else {
    sentences.push(toGrokSentence(plan.humanMotion));
    if (plan.objectMotion && plan.objectMotion !== plan.humanMotion) {
      sentences.push(toGrokSentence(plan.objectMotion));
    }
  }

  // 3. Physics anchors woven in as natural prose.
  if (plan.contactAnchors && plan.contactAnchors.length > 0) {
    sentences.push(
      `The hands hold their grounded contact: ${plan.contactAnchors.join(', ')}.`,
    );
  }
  if (typeof plan.motionTimeframeSeconds === 'number' && plan.motionTimeframeSeconds > 0) {
    sentences.push(`The action takes about ${plan.motionTimeframeSeconds} seconds.`);
  }
  if (plan.motionEndpoint) {
    sentences.push(`At the end, ${lowerFirst(plan.motionEndpoint)}.`);
  }

  // 4. Preserve / avoid expressed POSITIVELY (Grok responds better to
  // positive framing than to "DO NOT").
  if (plan.preserveProductVisibility) {
    sentences.push(
      'The product remains in frame the entire time and stays sharp and readable.',
    );
  }
  if (plan.avoidFaceZoom) {
    sentences.push(
      'The composition stays exactly as in the source still; the face is never the subject.',
    );
  }
  if (plan.emotionalTone) {
    sentences.push(`The feel is ${plan.emotionalTone}.`);
  }

  // Grok still gets a negative list — the provider folds it as
  // "AVOID: …". Keep it short (8 items max) since it lives inside the
  // single prompt string and burns context.
  const baselineNegatives = plan.speakingExpected
    ? TALKING_NEGATIVES_CORE
    : NON_TALKING_NEGATIVES_CORE;
  const negativeBuf = new Set<string>();
  for (const item of plan.forbiddenMotion) {
    if (item.trim().length) negativeBuf.add(item.trim());
  }
  for (const item of baselineNegatives.split(',').map((s) => s.trim())) {
    if (item.length) negativeBuf.add(item);
  }
  const negative = Array.from(negativeBuf).slice(0, 8).join(', ');

  return {
    positive: sentences.filter((s) => s && s.trim().length).join(' '),
    negative,
    // Grok ignores cfgScale — leave undefined so the adapter sees no field.
  };
}

/* ---------- Helpers ---------- */

// Pick cfg_scale per plan type. Higher values lock the model harder to
// the prompt; recommended:
//   0.7 — product / hands / closeup / cta scenes (label integrity)
//   0.5 — talking-head plates (let it breathe for natural micro-motion)
function pickCfgScale(plan: import('./animation-plan-builder').AnimationPlan): number {
  if (plan.speakingExpected) return 0.5;
  if (plan.motionSubject === 'product' || plan.motionSubject === 'hands') return 0.7;
  if (plan.preserveProductVisibility || plan.avoidFaceZoom) return 0.65;
  return 0.5;
}

function toGrokSentence(rawMotion: string): string {
  const trimmed = rawMotion.trim();
  if (!trimmed) return '';
  const cap = capitalize(trimmed);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// V13 — kept exported but now thin: the V4 / motionAnalysis-aware
// builder used to live here. New callers should use buildPromptFromPlan
// with a fully-built AnimationPlan, which already contains every
// signal this function tried to fold in.
export function buildKlingMotionPrompt(input: {
  cameraDirection?: string | null;
  performanceNote?: string | null;
  sceneType?: string | null;
  requiresLipSync?: boolean;
  sceneGenerationType?: string;
  motionAnalysis?: import('./motion-analysis').MotionAnalysis | null;
  primarySubject?: string | null;
  mustShowProduct?: boolean | null;
  productVisibilityPriority?: string | null;
  cameraFocus?: string | null;
  showFace?: boolean | null;
}): KlingMotionPrompt {
  // Synthesize a minimal AnimationPlan from the legacy inputs and
  // delegate. Anything older that calls this still works.
  const speakingExpected =
    !!input.requiresLipSync ||
    input.sceneGenerationType === 'talking_head' ||
    input.sceneGenerationType === 'selfie_talking' ||
    input.sceneGenerationType === 'mirror_selfie_talking';
  const motionSubject: import('./animation-plan-builder').AnimationMotionSubject =
    input.primarySubject === 'product' || input.primarySubject === 'product_with_avatar'
      ? 'product'
      : input.primarySubject === 'product_in_use' || input.primarySubject === 'hands'
        ? 'hands'
        : speakingExpected
          ? 'person'
          : 'environment';
  const cameraMotion: import('./animation-plan-builder').AnimationCameraMotion =
    input.cameraFocus === 'product' ? 'static' : 'subtle_handheld';
  const plan: import('./animation-plan-builder').AnimationPlan = {
    animationGoal: speakingExpected
      ? 'silent talking plate'
      : 'show the product or action in motion',
    motionSubject,
    cameraMotion,
    humanMotion: speakingExpected
      ? 'silent speaking beat'
      : 'hands move with intent, smooth grip',
    objectMotion: 'product remains stable, no morphing, no warping',
    forbiddenMotion: [],
    preserveComposition: true,
    preserveProductVisibility: !!input.mustShowProduct,
    avoidFaceZoom: input.showFace === false,
    speakingExpected,
    contactAnchors: undefined,
    motionTimeframeSeconds: undefined,
    motionEndpoint: undefined,
    narrativeRole: undefined,
    emotionalTone: undefined,
  };
  return buildPromptFromPlan(plan, {
    provider: 'kling',
    cameraDirection: input.cameraDirection,
  });
}
