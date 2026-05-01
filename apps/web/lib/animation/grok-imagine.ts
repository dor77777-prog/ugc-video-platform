// xAI / Grok video-generation provider — implements VideoGenerationProvider.
//
// Image-to-video via grok-imagine-video. Async submit-then-poll, like
// Kling, but a different request shape and response envelope:
//
//   POST https://api.x.ai/v1/videos/generations
//     { model, prompt, image, duration, aspect_ratio, resolution }
//   → { request_id }
//
//   GET  https://api.x.ai/v1/videos/{request_id}
//   → { status: pending|done|expired|failed, video?: { url, duration } }
//
// Auth header: Authorization: Bearer {XAI_API_KEY}
//
// The xAI URL in the `done` response is EPHEMERAL — we download bytes
// inside generateImageToVideo() and hand them up to clip-impl, which
// uploads to R2. Never persist the xAI URL long-term.
//
// Configuration (env):
//   XAI_API_KEY                                  Bearer token. Required.
//   XAI_API_BASE_URL                             default https://api.x.ai/v1
//   XAI_VIDEO_MODEL                              default grok-imagine-video
//   XAI_VIDEO_RESOLUTION                         default 720p
//   XAI_VIDEO_PRICE_PER_SEC_480P_USD             default 0.08
//   XAI_VIDEO_PRICE_PER_SEC_720P_USD             default 0.15
//
// Reference doc: .claude/skills/xai-video-api.md.

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

const DEFAULT_BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_MODEL = 'grok-imagine-video';
const DEFAULT_RESOLUTION = '720p';
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — xAI's own SDK default.

function getBaseUrl(): string {
  return (process.env.XAI_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function getApiKey(): string {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) {
    throw new VideoProviderConfigError(
      'xAI auth missing. Set XAI_API_KEY (Bearer token from console.x.ai).',
    );
  }
  return key;
}

async function xaiFetch<T>(
  path: string,
  init: RequestInit,
  stage: 'i2v' | 'lipsync',
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new VideoProviderApiError(
      `xAI ${stage} ${res.status}: ${body.slice(0, 300)}`,
      stage,
      res.status,
    );
  }
  return (await res.json()) as T;
}

async function imageToPayload(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  if (imageUrl.startsWith('/')) {
    const { readPublicAsset } = await import('@/lib/storage/read-public-asset');
    const { bytes, contentType } = await readPublicAsset(imageUrl);
    return `data:${contentType ?? 'image/png'};base64,${bytes.toString('base64')}`;
  }
  // Already a data URI / base64 — pass through.
  return imageUrl;
}

interface XaiGenerationsCreateResponse {
  request_id: string;
}

interface XaiVideoStatusResponse {
  status: 'pending' | 'done' | 'expired' | 'failed';
  model?: string;
  video?: {
    url: string;
    duration?: number;
    respect_moderation?: boolean;
  };
  error?: string;
  message?: string;
}

function parseXaiStatus(payload: XaiVideoStatusResponse): StatusResult {
  switch (payload.status) {
    case 'pending':
      return { status: 'processing' };
    case 'done': {
      const url = payload.video?.url;
      if (!url) {
        return { status: 'failed', errorMessage: 'xAI returned done without video.url' };
      }
      return { status: 'completed', videoUrl: url };
    }
    case 'expired':
      return { status: 'failed', errorMessage: 'xAI request expired' };
    case 'failed':
      return {
        status: 'failed',
        errorMessage: payload.error ?? payload.message ?? 'xAI generation failed',
      };
    default:
      return { status: 'queued' };
  }
}

function getResolution(): '480p' | '720p' {
  const raw = (process.env.XAI_VIDEO_RESOLUTION ?? DEFAULT_RESOLUTION).toLowerCase();
  return raw === '480p' ? '480p' : '720p';
}

function clampDuration(seconds: number): number {
  // xAI accepts 1-15s for generation. Our pipeline only emits 3-10s, but
  // clamp defensively in case a caller hands us something out of range.
  if (!Number.isFinite(seconds) || seconds < 1) return 5;
  if (seconds > 15) return 15;
  return Math.round(seconds);
}

function aspectRatioToXai(ar: AspectRatio): string {
  // xAI supports 1:1 | 16:9 | 9:16 | 4:3 | 3:4 | 3:2 | 2:3. Our internal
  // type only emits 9:16 / 1:1 / 16:9 — pass through.
  return ar;
}

class GrokImagineProvider implements VideoGenerationProvider {
  async submitImageToVideo(input: ImageToVideoInput): Promise<SubmitResult> {
    const model = process.env.XAI_VIDEO_MODEL ?? DEFAULT_MODEL;
    const image = await imageToPayload(input.imageUrl);

    // Single-image i2v body. We deliberately do NOT thread reference
    // images through here — xAI's "reference-to-video" mode replaces
    // image-to-video (the docs are explicit: image + reference_images
    // is a 400). For now this provider is image-to-video only; if we
    // need reference-to-video we'll add a second submit method.
    const body: Record<string, unknown> = {
      model,
      prompt: input.prompt,
      image,
      duration: clampDuration(input.durationSeconds),
      aspect_ratio: aspectRatioToXai(input.aspectRatio),
      resolution: getResolution(),
    };

    // Negative prompt isn't a documented field on xAI's video API, but
    // we keep the signature parity with Kling. Append as a hint.
    if (input.negativePrompt && input.negativePrompt.trim().length > 0) {
      body.prompt = `${input.prompt}. AVOID: ${input.negativePrompt}`;
    }

    const bodyShape: Record<string, string> = {
      model,
      duration: String(body.duration),
      aspect_ratio: String(body.aspect_ratio),
      resolution: String(body.resolution),
      promptChars: String((body.prompt as string).length),
      imageType: image.startsWith('data:') ? 'data-uri' : 'url',
    };
    console.log(
      `[grok-imagine i2v] scene=${input.sceneId} model=${model} body=${JSON.stringify(bodyShape)}`,
    );

    const res = await xaiFetch<XaiGenerationsCreateResponse>(
      '/videos/generations',
      { method: 'POST', body: JSON.stringify(body) },
      'i2v',
    );

    if (!res.request_id) {
      throw new VideoProviderApiError(
        'xAI submit response missing request_id',
        'i2v',
      );
    }
    return { providerJobId: res.request_id, status: 'queued' };
  }

  async getStatus(providerJobId: string): Promise<StatusResult> {
    const res = await xaiFetch<XaiVideoStatusResponse>(
      `/videos/${encodeURIComponent(providerJobId)}`,
      { method: 'GET' },
      'i2v',
    );
    return parseXaiStatus(res);
  }

  async generateImageToVideo(input: ImageToVideoInput): Promise<FinalVideoResult> {
    const submitted = await this.submitImageToVideo(input);
    const startedAt = Date.now();
    while (true) {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new VideoProviderTimeoutError(
          `xAI poll exceeded ${Math.round(POLL_TIMEOUT_MS / 60000)} min for request ${submitted.providerJobId}`,
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const status = await this.getStatus(submitted.providerJobId);
      if (status.status === 'completed' && status.videoUrl) {
        // xAI URLs are ephemeral — download bytes immediately.
        const dl = await fetch(status.videoUrl);
        if (!dl.ok) {
          throw new VideoProviderApiError(
            `xAI video download ${dl.status}: ${(await dl.text()).slice(0, 200)}`,
            'i2v',
            dl.status,
          );
        }
        const ab = await dl.arrayBuffer();
        const videoBytes = Buffer.from(ab);
        return {
          providerJobId: submitted.providerJobId,
          videoBytes,
          videoUrl: status.videoUrl,
          durationSeconds: clampDuration(input.durationSeconds),
          modelUsed: process.env.XAI_VIDEO_MODEL ?? DEFAULT_MODEL,
        };
      }
      if (status.status === 'failed') {
        throw new VideoProviderApiError(
          status.errorMessage ?? 'xAI video generation failed',
          'i2v',
        );
      }
      // queued / processing → keep polling.
    }
  }
}

export const grokImagineProvider = new GrokImagineProvider();

// Re-exports so call sites can catch errors uniformly with the Kling adapter.
export {
  VideoProviderApiError as GrokApiError,
  VideoProviderConfigError as GrokConfigError,
  VideoProviderTimeoutError as GrokTimeoutError,
} from './types';
