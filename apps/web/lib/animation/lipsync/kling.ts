// Kling LipSync provider — extracts the existing Kling lipsync logic
// out of kling.ts and conforms it to the LipSyncProvider interface.
// Auth + base URL + endpoint are configurable via env (same vars as
// before). For Hebrew + UGC voices the model has been observed to look
// somewhat artificial on dead-still bases, which is why we (a) seed the
// base video with silent-talking-head language in clip-impl and (b)
// expose the LIPSYNC_PROVIDER env so users can swap to Sync.so etc.

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

const DEFAULT_BASE_URL = 'https://api-singapore.klingai.com';
const DEFAULT_ENDPOINT = '/v1/videos/lip-sync';
const DEFAULT_MODEL = 'kling-lip-sync-v1';
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

interface KlingCreate {
  code: number;
  message: string;
  data?: { task_id: string };
}
interface KlingStatus {
  code: number;
  message: string;
  data?: {
    task_id: string;
    task_status: 'submitted' | 'processing' | 'succeed' | 'failed';
    task_status_msg?: string;
    task_result?: { videos?: Array<{ url: string; duration: string }> };
  };
}

function getBaseUrl(): string {
  return (process.env.KLING_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}
function getEndpoint(): string {
  return process.env.KLING_LIPSYNC_ENDPOINT ?? DEFAULT_ENDPOINT;
}
// Lip-Sync is an ENDPOINT, not a model — Kling doesn't accept
// `model_name` in the request body. We keep this label only for
// logging / cost-attribution rows, not for sending to the API.
function getModelLabel(): string {
  return process.env.KLING_LIPSYNC_MODEL ?? DEFAULT_MODEL;
}

function buildAuth(): string {
  if (process.env.KLING_API_KEY) return `Bearer ${process.env.KLING_API_KEY}`;
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) {
    throw new LipSyncConfigError(
      'Kling lipsync auth missing — set KLING_API_KEY or KLING_ACCESS_KEY+KLING_SECRET_KEY.',
      'kling',
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = enc({ alg: 'HS256', typ: 'JWT' });
  const p = enc({ iss: ak, exp: now + 1800, nbf: now - 5 });
  const sig = crypto.createHmac('sha256', sk).update(`${h}.${p}`).digest('base64url');
  return `Bearer ${h}.${p}.${sig}`;
}

async function klingFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: buildAuth() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new LipSyncProviderError(
      `Kling lipsync ${res.status}: ${body.slice(0, 300)}`,
      'kling',
      res.status,
    );
  }
  return (await res.json()) as T;
}

class KlingLipSync implements LipSyncProvider {
  readonly name = 'kling';

  async submit(input: LipSyncInput): Promise<LipSyncSubmitResult> {
    // Official KlingAI Lip-Sync API: endpoint, not a model. Do NOT
    // include `model_name` in the body — only the `input` block. See:
    //   https://app.klingai.com/global/dev/document-api/apiReference/model/videoLipSync
    const body = {
      input: {
        mode: 'audio2video',
        video_url: input.videoUrl,
        audio_type: 'url',
        audio_url: input.audioUrl,
      },
    };
    const res = await klingFetch<KlingCreate>(getEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.code !== 0 || !res.data?.task_id) {
      throw new LipSyncProviderError(
        `Kling lipsync submit failed: ${res.message ?? 'unknown'} (code=${res.code})`,
        'kling',
      );
    }
    return { providerJobId: res.data.task_id, status: 'queued' };
  }

  async getStatus(providerJobId: string): Promise<LipSyncStatusResult> {
    const res = await klingFetch<KlingStatus>(
      `${getEndpoint()}/${encodeURIComponent(providerJobId)}`,
      { method: 'GET' },
    );
    if (res.code !== 0 || !res.data) {
      return { status: 'failed', errorMessage: res.message ?? `code=${res.code}` };
    }
    switch (res.data.task_status) {
      case 'submitted':
        return { status: 'queued' };
      case 'processing':
        return { status: 'processing' };
      case 'succeed': {
        const v = res.data.task_result?.videos?.[0];
        if (!v?.url) return { status: 'failed', errorMessage: 'succeed without video URL' };
        return { status: 'completed', videoUrl: v.url };
      }
      case 'failed':
        return { status: 'failed', errorMessage: res.data.task_status_msg ?? 'unknown' };
      default:
        return { status: 'queued' };
    }
  }

  async generate(input: LipSyncInput): Promise<LipSyncFinalResult> {
    const submit = await this.submit(input);
    const startedAt = Date.now();
    while (true) {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new LipSyncTimeoutError(
          `Kling lipsync ${submit.providerJobId} did not finish within ${POLL_TIMEOUT_MS / 1000}s.`,
          'kling',
        );
      }
      const st = await this.getStatus(submit.providerJobId);
      if (st.status === 'completed' && st.videoUrl) {
        const res = await fetch(st.videoUrl);
        if (!res.ok) {
          throw new LipSyncProviderError(
            `Failed to download Kling lipsync result: HTTP ${res.status}`,
            'kling',
            res.status,
          );
        }
        const videoBytes = Buffer.from(await res.arrayBuffer());
        return {
          providerJobId: submit.providerJobId,
          videoBytes,
          videoUrl: st.videoUrl,
          durationSeconds: input.durationSeconds,
          modelUsed: getModelLabel(),
          providerName: this.name,
        };
      }
      if (st.status === 'failed') {
        throw new LipSyncProviderError(
          `Kling lipsync ${submit.providerJobId} failed: ${st.errorMessage ?? 'unknown'}`,
          'kling',
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

export const klingLipSyncProvider: LipSyncProvider = new KlingLipSync();
