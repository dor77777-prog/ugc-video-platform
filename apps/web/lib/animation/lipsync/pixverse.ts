// PixVerse LipSync provider — alternative to Kling Lip-Sync v1 for
// talking-scene lip syncing. Architecturally distinct from Kling: the
// PixVerse API is a 3-step flow (upload video → upload audio → start
// lipsync), so submit() does all three under the hood and returns
// PixVerse's task id for polling.
//
// Endpoints (Apr 2026):
//   POST /openapi/v2/media/upload         (multipart "file=@…")
//   POST /openapi/v2/video/lip_sync/generate
//        body: { video_media_id, audio_media_id }
//   GET  /openapi/v2/video/result/{video_id}
//
// Headers:
//   API-KEY:        from env
//   Ai-Trace-Id:    per-call uuid (PixVerse uses this for support traces)
//   Content-Type:   multipart/form-data for upload, application/json for the rest
//
// Constraints (per PixVerse docs):
//   - video duration ≤ 30s
//   - audio duration ≤ 30s
//   - file size       ≤ 50MB
//   - resolution      ≤ 1920px
// We reject upstream of the API call when any of these is exceeded so
// the user sees the cause + we don't burn an API call.

import crypto from 'crypto';
import {
  LipSyncProvider,
  LipSyncInput,
  LipSyncSubmitResult,
  LipSyncStatusResult,
  LipSyncFinalResult,
  LipSyncProviderError,
  LipSyncTimeoutError,
  LipSyncConfigError,
} from './types';

const DEFAULT_BASE_URL = 'https://app-api.pixverse.ai';
const DEFAULT_UPLOAD_ENDPOINT = '/openapi/v2/media/upload';
const DEFAULT_LIPSYNC_ENDPOINT = '/openapi/v2/video/lip_sync/generate';
const DEFAULT_RESULT_ENDPOINT = '/openapi/v2/video/result'; // append /{video_id}
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_DURATION_S = 30;

interface PixverseEnvelope<T> {
  ErrCode: number;
  ErrMsg: string;
  Resp?: T;
}

interface UploadResp {
  // PixVerse returns the new media's id under different keys depending
  // on the asset type — be liberal in what we accept.
  media_id?: number;
  id?: number;
  asset_id?: number;
}

interface LipSyncCreateResp {
  video_id?: number;
  task_id?: number;
  id?: number;
}

interface VideoResultResp {
  video_id?: number;
  status?: string | number;
  // Status numerics seen in PixVerse: 1=queued, 2=processing, 3=success
  // (sometimes called "completed"), 5=failed. Keep as string in our
  // mapping below for forward-compat.
  url?: string;
  video_url?: string;
  err_msg?: string;
}

function getBaseUrl(): string {
  return (process.env.PIXVERSE_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}
function getUploadEndpoint(): string {
  return process.env.PIXVERSE_MEDIA_UPLOAD_ENDPOINT ?? DEFAULT_UPLOAD_ENDPOINT;
}
function getLipSyncEndpoint(): string {
  return process.env.PIXVERSE_LIPSYNC_ENDPOINT ?? DEFAULT_LIPSYNC_ENDPOINT;
}
function getResultEndpoint(): string {
  return process.env.PIXVERSE_RESULT_ENDPOINT ?? DEFAULT_RESULT_ENDPOINT;
}

function getApiKey(): string {
  const k = process.env.PIXVERSE_API_KEY;
  if (!k) {
    throw new LipSyncConfigError(
      'PIXVERSE_API_KEY is not set. Add it to .env to enable PixVerse lipsync.',
      'pixverse',
    );
  }
  return k;
}

function newTraceId(): string {
  return crypto.randomUUID();
}

// Resolve a URL to bytes + filename. Handles three input shapes:
//   1. "/uploads/..."           → local fs read
//   2. "https://<PUBLIC_BASE_URL>/uploads/..." → strip prefix, local fs read
//      (avoids a network round-trip back through our own cloudflared
//      tunnel, which is fragile in dev when the tunnel drops)
//   3. any other "https://..."  → fetch over network
//
// PixVerse uses multipart upload (the provider doesn't fetch from URLs
// itself), so for any URL that ultimately points back at our own server
// we read directly from disk. That's how we recover from "fetch failed"
// during a tunnel hiccup — the file is right there on disk.
async function resolveToBytes(url: string): Promise<{ bytes: Buffer; filename: string }> {
  const fs = await import('fs/promises');
  const path = await import('path');

  // Shape 2: same-host public URL → treat as local /uploads path.
  const publicBase = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  let effective = url;
  if (publicBase && url.startsWith(publicBase + '/')) {
    effective = url.slice(publicBase.length); // → "/uploads/..."
  }

  if (effective.startsWith('/')) {
    const filePath = path.join(process.cwd(), 'public', effective.replace(/^\/+/, ''));
    try {
      const bytes = await fs.readFile(filePath);
      return { bytes, filename: path.basename(filePath) };
    } catch (err) {
      throw new LipSyncProviderError(
        `Failed to read ${filePath}: ${(err as Error).message}`,
        'pixverse',
      );
    }
  }

  // Shape 3: external URL → fetch.
  let res: Response;
  try {
    res = await fetch(effective);
  } catch (err) {
    // Network-level failure (DNS, tunnel down, etc.). Surface a
    // clearer message than "fetch failed" so the user can act.
    throw new LipSyncProviderError(
      `Network fetch of ${effective} failed: ${(err as Error).message}. ` +
        `If the URL points to your cloudflared tunnel, check that it's still running.`,
      'pixverse',
    );
  }
  if (!res.ok) {
    throw new LipSyncProviderError(
      `Failed to fetch ${effective}: HTTP ${res.status}`,
      'pixverse',
      res.status,
    );
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const parsed = new URL(effective);
  const filename = parsed.pathname.split('/').filter(Boolean).pop() || 'media';
  return { bytes, filename };
}

async function uploadMedia(
  url: string,
  contentType: 'video/mp4' | 'audio/mpeg',
): Promise<number> {
  const { bytes, filename } = await resolveToBytes(url);
  if (bytes.length > MAX_FILE_SIZE_BYTES) {
    throw new LipSyncProviderError(
      `File ${filename} is ${(bytes.length / 1024 / 1024).toFixed(1)}MB, ` +
        `over PixVerse's 50MB limit.`,
      'pixverse',
    );
  }

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: contentType }), filename);

  const res = await fetch(`${getBaseUrl()}${getUploadEndpoint()}`, {
    method: 'POST',
    headers: {
      'API-KEY': getApiKey(),
      'Ai-Trace-Id': newTraceId(),
      // NOTE: do NOT set Content-Type here — fetch sets multipart boundary
      // automatically when body is FormData. Setting it manually breaks parsing.
    },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new LipSyncProviderError(
      `PixVerse upload ${res.status}: ${body.slice(0, 300)}`,
      'pixverse',
      res.status,
    );
  }
  const json = (await res.json()) as PixverseEnvelope<UploadResp>;
  if (json.ErrCode !== 0) {
    throw new LipSyncProviderError(
      `PixVerse upload failed: ${json.ErrMsg} (ErrCode=${json.ErrCode})`,
      'pixverse',
    );
  }
  const mediaId = json.Resp?.media_id ?? json.Resp?.id ?? json.Resp?.asset_id;
  if (typeof mediaId !== 'number') {
    throw new LipSyncProviderError(
      `PixVerse upload returned no media id (Resp=${JSON.stringify(json.Resp).slice(0, 200)})`,
      'pixverse',
    );
  }
  return mediaId;
}

class PixverseLipSync implements LipSyncProvider {
  readonly name = 'pixverse';

  async submit(input: LipSyncInput): Promise<LipSyncSubmitResult> {
    if (input.durationSeconds > MAX_DURATION_S) {
      throw new LipSyncProviderError(
        `Scene duration ${input.durationSeconds}s exceeds PixVerse's ${MAX_DURATION_S}s limit.`,
        'pixverse',
      );
    }

    // Step 1+2 — upload video + audio in parallel. PixVerse holds them
    // by media_id internally; the lipsync call only references the ids.
    const [videoMediaId, audioMediaId] = await Promise.all([
      uploadMedia(input.videoUrl, 'video/mp4'),
      uploadMedia(input.audioUrl, 'audio/mpeg'),
    ]);

    // Step 3 — kick off the lipsync.
    const body = {
      video_media_id: videoMediaId,
      audio_media_id: audioMediaId,
    };
    const res = await fetch(`${getBaseUrl()}${getLipSyncEndpoint()}`, {
      method: 'POST',
      headers: {
        'API-KEY': getApiKey(),
        'Ai-Trace-Id': newTraceId(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new LipSyncProviderError(
        `PixVerse lipsync submit ${res.status}: ${text.slice(0, 300)}`,
        'pixverse',
        res.status,
      );
    }
    const json = (await res.json()) as PixverseEnvelope<LipSyncCreateResp>;
    if (json.ErrCode !== 0) {
      // 500020 = "user not authorized for this functionality" — surface
      // the message verbatim so the user can flip the feature on their
      // PixVerse dashboard.
      throw new LipSyncProviderError(
        `PixVerse lipsync submit failed: ${json.ErrMsg} (ErrCode=${json.ErrCode})`,
        'pixverse',
      );
    }
    const taskId = json.Resp?.video_id ?? json.Resp?.task_id ?? json.Resp?.id;
    if (typeof taskId !== 'number') {
      throw new LipSyncProviderError(
        `PixVerse lipsync submit returned no video_id (Resp=${JSON.stringify(json.Resp).slice(0, 200)})`,
        'pixverse',
      );
    }
    return { providerJobId: String(taskId), status: 'queued' };
  }

  async getStatus(providerJobId: string): Promise<LipSyncStatusResult> {
    const res = await fetch(
      `${getBaseUrl()}${getResultEndpoint()}/${encodeURIComponent(providerJobId)}`,
      {
        method: 'GET',
        headers: {
          'API-KEY': getApiKey(),
          'Ai-Trace-Id': newTraceId(),
        },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '<no body>');
      throw new LipSyncProviderError(
        `PixVerse result ${res.status}: ${text.slice(0, 300)}`,
        'pixverse',
        res.status,
      );
    }
    const json = (await res.json()) as PixverseEnvelope<VideoResultResp>;
    if (json.ErrCode !== 0 || !json.Resp) {
      return { status: 'failed', errorMessage: json.ErrMsg ?? `ErrCode=${json.ErrCode}` };
    }
    const r = json.Resp;
    // PixVerse status mapping (observed): 1 queued, 2 processing,
    // 3 success, 5 failed. Strings come back as "Success" / "Processing"
    // sometimes — handle both.
    const statusRaw = String(r.status ?? '').toLowerCase();
    const isSuccess = r.status === 3 || statusRaw === 'success' || statusRaw === 'completed';
    const isFailed = r.status === 5 || statusRaw === 'failed' || statusRaw === 'error';
    const isProcessing =
      r.status === 2 || statusRaw === 'processing' || statusRaw === 'running';

    if (isSuccess) {
      const url = r.url ?? r.video_url;
      if (!url) return { status: 'failed', errorMessage: 'success without video URL' };
      return { status: 'completed', videoUrl: url };
    }
    if (isFailed) {
      return { status: 'failed', errorMessage: r.err_msg ?? 'pixverse reported failed' };
    }
    return { status: isProcessing ? 'processing' : 'queued' };
  }

  async generate(input: LipSyncInput): Promise<LipSyncFinalResult> {
    const submit = await this.submit(input);
    const startedAt = Date.now();
    while (true) {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new LipSyncTimeoutError(
          `PixVerse lipsync ${submit.providerJobId} did not finish within ${POLL_TIMEOUT_MS / 1000}s.`,
          'pixverse',
        );
      }
      const st = await this.getStatus(submit.providerJobId);
      if (st.status === 'completed' && st.videoUrl) {
        const dl = await fetch(st.videoUrl);
        if (!dl.ok) {
          throw new LipSyncProviderError(
            `Failed to download PixVerse output: HTTP ${dl.status}`,
            'pixverse',
            dl.status,
          );
        }
        const videoBytes = Buffer.from(await dl.arrayBuffer());
        return {
          providerJobId: submit.providerJobId,
          videoBytes,
          videoUrl: st.videoUrl,
          durationSeconds: input.durationSeconds,
          modelUsed: 'pixverse-lip-sync',
          providerName: this.name,
        };
      }
      if (st.status === 'failed') {
        throw new LipSyncProviderError(
          `PixVerse lipsync ${submit.providerJobId} failed: ${st.errorMessage ?? 'unknown'}`,
          'pixverse',
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

export const pixverseLipSyncProvider: LipSyncProvider = new PixverseLipSync();
