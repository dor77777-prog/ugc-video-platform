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
    const model = process.env.KLING_IMAGE_TO_VIDEO_MODEL ?? DEFAULT_I2V_MODEL;
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

    const res = await klingFetch<KlingCreateResponse>(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      'i2v',
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
      modelUsed: process.env.KLING_IMAGE_TO_VIDEO_MODEL ?? DEFAULT_I2V_MODEL,
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

// Build a Kling-flavored motion prompt from the script's per-scene fields.
// Kling responds best to its own Camera Movement vocabulary (Horizontal /
// Pan / Zoom / Tilt / Master Shot variants). Keep camera + subject motion
// CONSERVATIVE for talking-head clips — the lipsync stage does the lip
// work, and aggressive camera motion ruins the result.
//
// CRITICAL — pre-lipsync rule for talking-head scenes:
// "Silent talking plate" strategy. The base video must already look
// like a frame from a real UGC selfie video where the creator is
// speaking calmly — NOT a studio portrait that we then try to "fix"
// with lipsync (which produces uncanny patch-on-frozen-face artifacts).
//
// Structure mirrors the production-quality prompt from the Apr 2026
// spec: small breath → subtle mouth motion → natural blink → eyebrow
// engagement → one small hand gesture → tiny nod, all under handheld
// phone framing.
const SILENT_TALKING_HEAD_TOKENS = [
  'Realistic vertical UGC selfie video',
  'the Israeli creator looks into the phone camera and appears to speak silently in a calm natural way',
  'starts with a small breath',
  'mouth moves subtly as if forming words (visible mouth, mid-sentence expression, mouth slightly open)',
  'blinks naturally',
  'slightly raises eyebrows for micro-emphasis',
  'one small hand gesture near the chest',
  'finishes with a tiny nod',
  'camera mostly stable with very slight handheld movement',
  'clear front-facing face',
  'authentic apartment lighting',
  'natural micro-expressions',
  'no dramatic acting',
  'no exaggerated mouth movement',
].join(', ');

// Negative prompt — forbidden artifacts that ruin lipsync downstream.
// On Omni-Video this is sent as `negative_prompt`; on legacy i2v it's
// folded into the main prompt with a "NEGATIVE:" tag.
const SILENT_TALKING_HEAD_NEGATIVES = [
  'frozen face',
  'dead eyes',
  'robotic movement',
  'stiff portrait',
  'plastic skin',
  'beauty filter',
  'exaggerated mouth',
  'cartoon lips',
  'distorted mouth',
  'warped teeth',
  'face melting',
  'unstable jaw',
  'excessive head movement',
  'dramatic camera movement',
  'side profile',
  'mouth covered',
  'blurry face',
  'uncanny smile',
].join(', ');

// For PRODUCT / HANDS / LIFESTYLE scenes — the most common drift mode
// is "Kling forgets the product and zooms into the avatar's face for a
// silent talking shot". These negatives explicitly forbid that
// behavior; they get sent as Omni's native `negative_prompt`, which
// Kling weights more heavily than inline "NEGATIVE:" text.
const NON_TALKING_NEGATIVES = [
  'face zoom',
  'talking selfie',
  'cropped product',
  'product disappearing',
  'product out of frame',
  'mouth speaking',
  'lips moving',
  'mouth opening',
  'exaggerated facial movement',
  'face-dominant framing',
  'ignoring product',
  'unstable composition',
  'avatar staring at camera',
  'dramatic head turn',
  'crop-in to face',
  'losing scene context',
].join(', ');

// Anti-drift block prepended to the positive prompt for non-talking
// scenes. Omni respects positive prompt structure strongly — repeating
// the "do not turn this into talking selfie" intent in plain English
// here, in addition to the negative_prompt list, gives us belt + braces.
const NON_TALKING_GUARD = [
  'The creator is NOT speaking to the camera',
  'mouth stays relaxed and closed throughout the clip',
  'do not turn this into a selfie talking shot',
  'do not zoom into the face',
  'preserve the prepared composition exactly as shown in the reference image',
  'the product must remain clearly visible from start to finish',
  'the focus is the product and the action — not facial performance',
].join(', ');

// Motion vocabulary per scene type. The default (talking-head) used to
// be applied to everything which made product/hands/lifestyle scenes
// feel wrong (Kling animated the subject's face instead of the action).
// Now we pick a motionToken that matches what's IN the frame.
function pickMotionToken(
  sceneGenerationType: string | undefined,
  performanceNote: string | null | undefined,
): string {
  switch (sceneGenerationType) {
    case 'product_demo':
      return 'Hands move naturally with intent, the product is held steady and rotates slightly so the label catches the light, smooth purposeful motion, no head/face emphasis';
    case 'hands_only':
      return 'Hands perform the action smoothly and confidently, gentle wrist movement, fingers grip the object as a real person would, no jerky motion, subtle environmental motion (steam/liquid/cloth) where appropriate';
    case 'closeup_product':
      return 'Very slow drift, surface highlights shift across packaging, subtle lighting change reveals texture, no human movement';
    case 'before_after':
      return 'Slow reveal of the change, subtle wipe or push-in between states, no dramatic transition';
    case 'lifestyle':
    case 'broll':
      return 'Natural environmental motion, ambient feel, gentle handheld breathing, soft light shifts, minimal subject movement';
    case 'talking_head':
    case 'selfie_talking':
    case 'mirror_selfie_talking':
    default: {
      // Talking-head defaults — but allow performance-note overrides
      // (whisper/punchy/tired/confident) to flavor the delivery.
      const note = (performanceNote ?? '').toLowerCase();
      if (/לוחש|רך|אישי/.test(note))
        return 'Almost still, slow blinks, very gentle breath';
      if (/פאנץ|חד|אנרגי|נמרץ/.test(note))
        return 'Slight forward lean, alert eyes, occasional small gesture';
      if (/עייף|חוש|הודה/.test(note))
        return 'Slow blinks, gentle head tilt, soft sigh';
      if (/בטח|חזק|מומל/.test(note))
        return 'Steady gaze, occasional confident nod, small hand gesture';
      return 'Natural breath, occasional blink, subtle head turns';
    }
  }
}

export interface KlingMotionPrompt {
  /** Goes into the Omni `prompt` field. */
  positive: string;
  /** Goes into the Omni `negative_prompt` field (or appended to prompt
   * with a NEGATIVE: tag on the legacy endpoint). */
  negative: string;
}

export function buildKlingMotionPrompt(input: {
  cameraDirection?: string | null;
  performanceNote?: string | null;
  sceneType?: string | null;
  /** When true, append the silent-talking-head performance block. */
  requiresLipSync?: boolean;
  /** Routing-derived scene type (talking_head / product_demo / hands_only / ...). */
  sceneGenerationType?: string;
  /**
   * Vision-grounded analysis of the actual scene image. When present,
   * its primaryAction + preserveElements override the generic motion
   * vocabulary so Kling animates what's REALLY in the frame.
   */
  motionAnalysis?: import('./motion-analysis').MotionAnalysis | null;
  /**
   * V4 product-first metadata, populated by the script LLM via
   * structured output. When present, takes priority over heuristics
   * derived from sceneGenerationType — the LLM committed to a frame
   * intent and we should honor it. cameraFocus drives camera vocab,
   * mustShowProduct + productVisibilityPriority strengthen the
   * product-presence guard, showFace=false suppresses face-zoom.
   */
  primarySubject?: string | null;
  mustShowProduct?: boolean | null;
  productVisibilityPriority?: string | null;
  cameraFocus?: string | null;
  showFace?: boolean | null;
}): KlingMotionPrompt {
  const cd = (input.cameraDirection ?? '').toLowerCase();

  let cameraToken = 'Static camera, eye-level, gentle handheld feel';
  if (/mirror selfie/.test(cd)) cameraToken = 'Static frame, mirror selfie composition holds steady';
  else if (/selfie/.test(cd)) cameraToken = 'Static frame, slight handheld breathing';
  else if (/over[- ]?the[- ]?shoulder|over.?shoulder/.test(cd))
    cameraToken = 'Subtle over-the-shoulder push-in, very slow';
  else if (/zoom in/.test(cd)) cameraToken = 'Slow Zoom In';
  else if (/zoom out|pull back/.test(cd)) cameraToken = 'Slow Zoom Out';
  else if (/pan/.test(cd)) cameraToken = 'Subtle Horizontal Pan';
  else if (/tilt/.test(cd)) cameraToken = 'Subtle Tilt';
  else if (/close[- ]?up/.test(cd)) cameraToken = 'Tight close-up, very slow push-in';

  const motionToken = pickMotionToken(input.sceneGenerationType, input.performanceNote);

  const parts: string[] = [
    cameraToken,
    motionToken,
    'High realism, natural skin micro-detail, no exaggerated movement, preserve everything visible in the input image (product, hands, environment) — do NOT crop in to the face or remove props',
  ];

  // Vision-grounded analysis takes precedence — it knows what's actually
  // in the frame. We OVERRIDE the generic motionToken with the analysis-
  // derived primaryAction + secondary motions, and append the analysis-
  // derived preserve/avoid hints.
  if (input.motionAnalysis) {
    const a = input.motionAnalysis;
    parts[1] = `${a.primaryAction}${a.secondaryMotions.length > 0 ? ` (also: ${a.secondaryMotions.join(', ')})` : ''}`;
    if (a.cameraIntent && a.cameraIntent.length > 5) {
      parts[0] = `${cameraToken}. ${a.cameraIntent}`;
    }
    if (a.preserveElements.length > 0) {
      parts.push(`MUST preserve through animation: ${a.preserveElements.join('; ')}`);
    }
    if (a.framingRisks.length > 0) {
      parts.push(`AVOID: ${a.framingRisks.join('; ')}`);
    }
  }

  // V4 metadata-driven adjustments. These only fire when the LLM
  // explicitly committed to a value (the structured-output schema
  // makes them required for new generations). Older scenes without
  // metadata fall back to the heuristic path below.
  if (input.cameraFocus === 'product') {
    parts[0] = 'Product-led framing — camera holds steady on the product, no panning to the face';
  } else if (input.cameraFocus === 'action') {
    parts[0] = 'Action-led framing — camera follows the hands and the product, eye-level with the work surface';
  }
  if (input.mustShowProduct) {
    parts.push(
      'PRODUCT VISIBILITY GATE: the product must remain in the frame from start to finish — never crop it out, never let it leave the frame',
    );
  }
  if (input.productVisibilityPriority === 'high') {
    parts.push(
      'The product fills 30-60% of the frame area and is sharp + readable throughout the clip',
    );
  }
  if (input.showFace === false) {
    parts.push("The creator's face is OUT OF FRAME — do not pan to it, do not crop in to it");
  }

  // Talking vs non-talking: each gets its own positive guard block AND
  // its own negative list. Non-talking is the more common drift mode
  // (Kling collapses product scenes into face-talking selfies), so we
  // front-load the anti-drift guard before the camera/motion tokens.
  if (input.requiresLipSync) {
    parts.push(SILENT_TALKING_HEAD_TOKENS);
    return {
      positive: parts.join('. ') + '.',
      negative: SILENT_TALKING_HEAD_NEGATIVES,
    };
  }
  // Non-talking: prepend the anti-face-zoom guard so it leads the prompt.
  parts.unshift(NON_TALKING_GUARD);
  return {
    positive: parts.join('. ') + '.',
    negative: NON_TALKING_NEGATIVES,
  };
}
