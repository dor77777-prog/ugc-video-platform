// Kling advanced-lipsync — two-step pipeline some Kling resellers expose:
//   1. POST {KLING_FACE_IDENTIFY_ENDPOINT} with image_url → face_id
//   2. POST {KLING_ADVANCED_LIPSYNC_ENDPOINT} with face_id + audio_url → talking video
//
// Compared to Avatar v2, this path:
//   + works on a richer face latent (face_id) so identity is more stable
//   + advanced lipsync is tuned for phoneme accuracy on long audio
//   - 2 API calls per scene (latency + spend doubles)
//   - face_identify may not be available in every reseller account
//
// We treat it as ONE TalkingSceneProvider (the user passes image+audio,
// we hide the chain). If face_identify fails, the provider surfaces a
// clear "not_supported" error and the bakeoff endpoint marks it failed.

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

interface KlingFaceCreate { code: number; message: string; data?: { face_id: string } }
interface KlingAdvancedCreate { code: number; message: string; data?: { task_id: string } }
interface KlingAdvancedStatus {
  code: number;
  message: string;
  data?: {
    task_status: 'submitted' | 'processing' | 'succeed' | 'failed';
    task_status_msg?: string;
    task_result?: { videos?: Array<{ url: string; duration: string }> };
  };
}

function getBaseUrl(): string {
  return (process.env.KLING_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}
function faceIdentifyEndpoint(): string {
  return process.env.KLING_FACE_IDENTIFY_ENDPOINT ?? '/v1/face/identify';
}
function advancedLipsyncEndpoint(): string {
  return process.env.KLING_ADVANCED_LIPSYNC_ENDPOINT ?? '/v1/videos/advanced-lipsync';
}
function advancedLipsyncModel(): string {
  return process.env.KLING_ADVANCED_LIPSYNC_MODEL ?? 'kling-advanced-lipsync-v1';
}

function buildAuth(): string {
  if (process.env.KLING_API_KEY) return `Bearer ${process.env.KLING_API_KEY}`;
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) {
    throw new TalkingSceneConfigError(
      'Kling advanced-lipsync auth missing — set KLING_API_KEY or KLING_ACCESS_KEY+KLING_SECRET_KEY.',
      'kling-advanced-lipsync',
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = enc({ alg: 'HS256', typ: 'JWT' });
  const p = enc({ iss: ak, exp: now + 1800, nbf: now - 5 });
  const sig = crypto.createHmac('sha256', sk).update(`${h}.${p}`).digest('base64url');
  return `Bearer ${h}.${p}.${sig}`;
}

async function klingFetch<T>(path: string, init: RequestInit, providerName: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: buildAuth() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new TalkingSceneError(
      `${providerName} ${res.status}: ${body.slice(0, 300)}`,
      providerName,
      res.status,
    );
  }
  return (await res.json()) as T;
}

class KlingAdvancedLipSync implements TalkingSceneProvider {
  readonly name = 'kling-advanced-lipsync';

  // submit/getStatus expose only the second step (the advanced-lipsync
  // task). face_identify is run inline as part of generate(); if you
  // call submit() directly you must supply a pre-resolved face_id via
  // input.imageUrl (treat it as a prefixed face_id:xxxxx).
  async submit(input: TalkingSceneInput): Promise<TalkingSceneSubmitResult> {
    const faceId = input.imageUrl.startsWith('face_id:')
      ? input.imageUrl.slice('face_id:'.length)
      : await this.identifyFace(input.imageUrl);

    const body = {
      model_name: advancedLipsyncModel(),
      face_id: faceId,
      audio_url: input.audioUrl,
      aspect_ratio: input.aspectRatio ?? '9:16',
      duration: String(input.durationSeconds),
    };
    const res = await klingFetch<KlingAdvancedCreate>(
      advancedLipsyncEndpoint(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      this.name,
    );
    if (res.code !== 0 || !res.data?.task_id) {
      throw new TalkingSceneError(
        `${this.name} submit failed: ${res.message ?? 'unknown'} (code=${res.code})`,
        this.name,
      );
    }
    return { providerJobId: res.data.task_id, status: 'queued' };
  }

  async getStatus(providerJobId: string): Promise<TalkingSceneStatusResult> {
    const res = await klingFetch<KlingAdvancedStatus>(
      `${advancedLipsyncEndpoint()}/${encodeURIComponent(providerJobId)}`,
      { method: 'GET' },
      this.name,
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
          modelUsed: advancedLipsyncModel(),
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

  private async identifyFace(imageUrl: string): Promise<string> {
    const res = await klingFetch<KlingFaceCreate>(
      faceIdentifyEndpoint(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl }),
      },
      this.name,
    );
    if (res.code !== 0 || !res.data?.face_id) {
      throw new TalkingSceneError(
        `face-identify failed: ${res.message ?? 'unknown'} (code=${res.code})`,
        this.name,
      );
    }
    return res.data.face_id;
  }
}

export const klingAdvancedLipSync: TalkingSceneProvider = new KlingAdvancedLipSync();
