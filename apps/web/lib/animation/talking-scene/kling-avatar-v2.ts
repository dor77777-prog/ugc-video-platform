// Kling AI Avatar v2 — image + audio → talking-head video in one call.
//
// Two tiers exposed as separate providers (different env, different
// pricing). Both share the auth + polling helpers; only the endpoint
// path + model_name differ. Endpoints are configurable so we can point
// at the official Kling API or a wrapper (302/PiAPI/KIE) without
// touching code.
//
// Body shape we send (best-effort from Kling Avatar v2 docs as of
// April 2026 — may need tuning per provider; that's why every field
// of consequence is env-driven):
//
//   POST {KLING_API_BASE_URL}{KLING_AVATAR_V2_*_ENDPOINT}
//   {
//     "model_name": "<model id from KLING_AVATAR_V2_*_MODEL>",
//     "image_url": "...",          // public URL
//     "audio_url": "...",          // public URL
//     "aspect_ratio": "9:16",
//     "duration": "5"
//   }
//
// Returns: { code, message, data: { task_id, task_status } }
// Status:  GET {endpoint}/{task_id}
//          { ..., data: { task_status, task_result: { videos: [{url, duration}] } } }

import crypto from 'crypto';
import {
  TalkingSceneProvider,
  TalkingSceneInput,
  TalkingSceneSubmitResult,
  TalkingSceneStatusResult,
  TalkingSceneFinalResult,
  TalkingSceneError,
  TalkingSceneTimeoutError,
  TalkingSceneConfigError,
} from './types';

const DEFAULT_BASE_URL = 'https://api-singapore.klingai.com';
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

function buildAuth(): string {
  if (process.env.KLING_API_KEY) return `Bearer ${process.env.KLING_API_KEY}`;
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) {
    throw new TalkingSceneConfigError(
      'Kling avatar auth missing — set KLING_API_KEY or KLING_ACCESS_KEY+KLING_SECRET_KEY.',
      'kling-avatar',
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = enc({ alg: 'HS256', typ: 'JWT' });
  const p = enc({ iss: ak, exp: now + 1800, nbf: now - 5 });
  const sig = crypto.createHmac('sha256', sk).update(`${h}.${p}`).digest('base64url');
  return `Bearer ${h}.${p}.${sig}`;
}

class KlingAvatarV2 implements TalkingSceneProvider {
  constructor(
    public readonly name: string,
    private readonly endpointEnv: string,
    private readonly modelEnv: string,
    private readonly defaults: { endpoint: string; model: string },
  ) {}

  private endpoint(): string {
    return process.env[this.endpointEnv] ?? this.defaults.endpoint;
  }
  private model(): string {
    return process.env[this.modelEnv] ?? this.defaults.model;
  }

  private async fetch<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: buildAuth() },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '<no body>');
      throw new TalkingSceneError(
        `${this.name} ${res.status}: ${body.slice(0, 300)}`,
        this.name,
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  async submit(input: TalkingSceneInput): Promise<TalkingSceneSubmitResult> {
    const body = {
      model_name: this.model(),
      image_url: input.imageUrl,
      audio_url: input.audioUrl,
      aspect_ratio: input.aspectRatio ?? '9:16',
      duration: String(input.durationSeconds),
    };
    const res = await this.fetch<KlingCreate>(this.endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.code !== 0 || !res.data?.task_id) {
      throw new TalkingSceneError(
        `${this.name} submit failed: ${res.message ?? 'unknown'} (code=${res.code})`,
        this.name,
      );
    }
    return { providerJobId: res.data.task_id, status: 'queued' };
  }

  async getStatus(providerJobId: string): Promise<TalkingSceneStatusResult> {
    const res = await this.fetch<KlingStatus>(
      `${this.endpoint()}/${encodeURIComponent(providerJobId)}`,
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

  async generate(input: TalkingSceneInput): Promise<TalkingSceneFinalResult> {
    const submit = await this.submit(input);
    const startedAt = Date.now();
    while (true) {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new TalkingSceneTimeoutError(
          `${this.name} ${submit.providerJobId} did not finish within ${POLL_TIMEOUT_MS / 1000}s.`,
          this.name,
        );
      }
      const st = await this.getStatus(submit.providerJobId);
      if (st.status === 'completed' && st.videoUrl) {
        const res = await fetch(st.videoUrl);
        if (!res.ok) {
          throw new TalkingSceneError(
            `Failed to download ${this.name} result: HTTP ${res.status}`,
            this.name,
            res.status,
          );
        }
        return {
          providerJobId: submit.providerJobId,
          videoBytes: Buffer.from(await res.arrayBuffer()),
          videoUrl: st.videoUrl,
          durationSeconds: input.durationSeconds,
          modelUsed: this.model(),
          providerName: this.name,
        };
      }
      if (st.status === 'failed') {
        throw new TalkingSceneError(
          `${this.name} ${submit.providerJobId} failed: ${st.errorMessage ?? 'unknown'}`,
          this.name,
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

export const klingAvatarV2Standard: TalkingSceneProvider = new KlingAvatarV2(
  'kling-avatar-v2-standard',
  'KLING_AVATAR_V2_STANDARD_ENDPOINT',
  'KLING_AVATAR_V2_STANDARD_MODEL',
  { endpoint: '/v1/videos/avatar', model: 'kling-avatar-v2-master' },
);

export const klingAvatarV2Pro: TalkingSceneProvider = new KlingAvatarV2(
  'kling-avatar-v2-pro',
  'KLING_AVATAR_V2_PRO_ENDPOINT',
  'KLING_AVATAR_V2_PRO_MODEL',
  { endpoint: '/v1/videos/avatar', model: 'kling-avatar-v2-master-pro' },
);
