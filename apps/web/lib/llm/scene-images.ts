import OpenAI, { toFile } from 'openai';
import { promises as fs } from 'fs';
import path from 'path';
import {
  buildScenePrompt,
  type SceneImagePromptInput,
  sanitizeVisualBrief,
  safetyTokensFor,
} from '@ugc-video/prompts';
import { LlmConfigError } from './scripts';

export type ImageQuality = 'low' | 'medium' | 'high';
export type AspectRatio = '9:16' | '1:1' | '16:9';

// Resolution choices that satisfy gpt-image-2 constraints (multiples of 16,
// total pixels in the legal range). 1024x1792 is closest to true 9:16.
const SIZES: Record<AspectRatio, `${number}x${number}`> = {
  '9:16': '1024x1792',
  '1:1': '1024x1024',
  '16:9': '1792x1024',
};

// Hard ceiling on a single OpenAI image call. gpt-image-2 typically replies
// in 30–90s; anything past 3 minutes is an outage / hung connection. Without
// this, a stuck call would freeze the whole "Generate all" loop indefinitely.
const SINGLE_CALL_TIMEOUT_MS = 180_000;

export interface SceneImageInput {
  productImageUrl: string | null; // hero image URL from step 1 (optional)
  avatarImageUrl: string | null;  // selected avatar from step 2 (the identity anchor)
  promptInput: SceneImagePromptInput;
  quality?: ImageQuality;
  // Optional product category — used by the safety pre-processor to inject
  // category-aware modesty tokens (fashion / shapewear / fitness / etc).
  categoryId?: string | null;
}

export interface SceneImageResult {
  base64: string;
  promptUsed: string;
  model: string;
  quality: ImageQuality;
  size: string;
  durationMs: number;
  // Whether the wrapper had to fall back to the safety-retry path. The
  // server action records this so the UI can hint to the user that the
  // product image was dropped on this scene.
  safetyRetryApplied: boolean;
}

// User-facing error code so the action can return a friendly Hebrew message.
export class SceneImageSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SceneImageSafetyError';
  }
}
export class SceneImageTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SceneImageTimeoutError';
  }
}

// Architecture:
//   1. Avatar image (Image 1) anchors identity across all scenes.
//   2. The LLM-written brief carries setting/lighting/outfit.
//   3. Product image (Image 2 when present) keeps packaging accurate.
//
// Safety pipeline: the visual brief is sanitized (risky terms rewritten),
// per-category modesty tokens are appended, and the call is wrapped in a
// 3-minute timeout. If gpt-image-2 still rejects with safety_violations we
// auto-retry once: drop the product image (often the trigger), upgrade to
// the AGGRESSIVE_RETRY_TOKENS, and call again. This recovers most cases
// without user intervention. If the retry also fails we surface a clean
// SceneImageSafetyError that the action turns into a Hebrew explanation.
export async function generateSceneImage(input: SceneImageInput): Promise<SceneImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LlmConfigError(
      'OPENAI_API_KEY is not set. Add it to .env to enable scene image generation.',
    );
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  const quality: ImageQuality = input.quality ?? 'high';
  const size = SIZES[input.promptInput.aspectRatio];

  // Pre-load the avatar reference once — we keep it on retries.
  const avatarFile = input.avatarImageUrl
    ? await urlToFile(input.avatarImageUrl, 'avatar.png')
    : null;
  const productFile = input.productImageUrl
    ? await urlToFile(input.productImageUrl, 'product.png')
    : null;

  // Sanitize risky vocabulary in the visual brief (e.g. "bodysuit" → "fitted
  // base layer top") and pick a category-aware modesty appendage.
  const sanitized = sanitizeVisualBrief(input.promptInput.sceneVisualBrief);

  // First attempt: full reference set + category-aware safety tokens.
  try {
    return await callOpenAi({
      openai,
      model,
      quality,
      size,
      promptInput: {
        ...input.promptInput,
        sceneVisualBrief: sanitized.brief,
        productPresent: !!productFile,
        safetyTokens: safetyTokensFor(input.categoryId ?? null),
      },
      avatarFile,
      productFile,
      safetyRetryApplied: false,
    });
  } catch (err) {
    if (!isSafetyRejection(err)) throw err;

    // Retry once: drop the product image (most common trigger) and switch
    // to the aggressive modesty appendage. Avatar stays.
    try {
      return await callOpenAi({
        openai,
        model,
        quality,
        size,
        promptInput: {
          ...input.promptInput,
          sceneVisualBrief: sanitized.brief,
          productPresent: false,
          safetyTokens: safetyTokensFor(input.categoryId ?? null, { aggressive: true }),
        },
        avatarFile,
        productFile: null,
        safetyRetryApplied: true,
      });
    } catch (retryErr) {
      if (isSafetyRejection(retryErr)) {
        throw new SceneImageSafetyError(
          'OpenAI safety system rejected this scene twice (with and without the product image).',
        );
      }
      throw retryErr;
    }
  }
}

interface CallParams {
  openai: OpenAI;
  model: string;
  quality: ImageQuality;
  size: `${number}x${number}`;
  promptInput: SceneImagePromptInput;
  avatarFile: Awaited<ReturnType<typeof toFile>> | null;
  productFile: Awaited<ReturnType<typeof toFile>> | null;
  safetyRetryApplied: boolean;
}

async function callOpenAi(p: CallParams): Promise<SceneImageResult> {
  const prompt = buildScenePrompt(p.promptInput);
  const referenceFiles = [p.avatarFile, p.productFile].filter(
    (f): f is Awaited<ReturnType<typeof toFile>> => f !== null,
  );

  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), SINGLE_CALL_TIMEOUT_MS);
  const startedAt = Date.now();
  let result;
  try {
    if (referenceFiles.length === 0) {
      result = await p.openai.images.generate(
        { model: p.model, prompt, size: p.size as never, quality: p.quality },
        { signal: ac.signal },
      );
    } else {
      result = await p.openai.images.edit(
        {
          model: p.model,
          image: referenceFiles,
          prompt,
          size: p.size as never,
          quality: p.quality,
        },
        { signal: ac.signal },
      );
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError' || ac.signal.aborted) {
      throw new SceneImageTimeoutError(
        `gpt-image-2 did not respond within ${SINGLE_CALL_TIMEOUT_MS / 1000}s.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  const durationMs = Date.now() - startedAt;

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image API returned no base64 data');

  return {
    base64: b64,
    promptUsed: prompt,
    model: p.model,
    quality: p.quality,
    size: p.size,
    durationMs,
    safetyRetryApplied: p.safetyRetryApplied,
  };
}

function isSafetyRejection(err: unknown): boolean {
  const msg = (err as Error)?.message ?? '';
  return /safety system|safety_violations|content policy|moderation_blocked/i.test(msg);
}

// Helper: load a reference image as a File for the OpenAI SDK.
//
// Critical fix: when the URL is app-relative (e.g. "/avatars/yael.png" or
// "/uploads/scenes_xyz/abc.png"), read the file from disk instead of fetching
// it via HTTP. A server action that fetches its own dev server (localhost:3000)
// from inside Next.js can deadlock — the symptom we hit when "Generate all
// scenes" appeared stuck at 0/N for minutes with no log output.
//
// Remote URLs (Shopify CDN, image hosts, etc) still go through fetch().
async function urlToFile(
  url: string,
  fallbackName: string,
): Promise<Awaited<ReturnType<typeof toFile>>> {
  // App-relative URL → read from public/ on disk.
  if (url.startsWith('/')) {
    const filePath = path.join(process.cwd(), 'public', url.replace(/^\/+/, ''));
    const buf = await fs.readFile(filePath);
    const ct = guessMimeFromExt(filePath);
    return toFile(buf, fallbackName, { type: ct });
  }

  // Absolute URL → fetch over the network with its own timeout (60s).
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), 60_000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`Failed to fetch reference image: ${url} → HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') ?? 'image/png';
    return toFile(buf, fallbackName, { type: ct });
  } finally {
    clearTimeout(timeoutId);
  }
}

function guessMimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/png';
}
