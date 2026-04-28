// Sync.so LipSync provider — scaffold matching their public REST API.
// Reference: https://docs.sync.so (model: sync-3 default).
//
// Sync's API is a simple POST /v2/generate that takes JSON with
// `input` array (videoUrl + audioUrl) + `model`. Returns a job id, and
// you poll /v2/generate/{id} until status is "COMPLETED". The mp4 URL
// comes back in the response. We keep the field names isolated here so
// pipeline code doesn't need to know about it.
//
// This is a scaffold — the exact endpoint/body may shift as Sync.so
// iterates. SYNC_API_BASE_URL + SYNC_API_KEY + SYNC_LIPSYNC_MODEL env
// vars let you swap details without code changes.

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

const DEFAULT_BASE_URL = 'https://api.sync.so';
const DEFAULT_MODEL = 'sync-3';
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

interface SyncCreate {
  id: string;
  status: string;
}
interface SyncStatus {
  id: string;
  status: string; // PENDING / PROCESSING / COMPLETED / FAILED / ...
  outputUrl?: string;
  error?: string;
}

function baseUrl(): string {
  return (process.env.SYNC_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}
function model(): string {
  return process.env.SYNC_LIPSYNC_MODEL ?? DEFAULT_MODEL;
}
function authHeader(): string {
  const key = process.env.SYNC_API_KEY;
  if (!key) {
    throw new LipSyncConfigError(
      'Sync.so lipsync requires SYNC_API_KEY. Get one at https://app.sync.so/settings/api-keys.',
      'sync',
    );
  }
  return `Bearer ${key}`;
}

async function syncFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      'Content-Type': 'application/json',
      Authorization: authHeader(),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new LipSyncProviderError(
      `Sync.so ${res.status}: ${body.slice(0, 300)}`,
      'sync',
      res.status,
    );
  }
  return (await res.json()) as T;
}

class SyncLipSync implements LipSyncProvider {
  readonly name = 'sync';

  async submit(input: LipSyncInput): Promise<LipSyncSubmitResult> {
    const body = {
      model: model(),
      input: [
        { type: 'video', url: input.videoUrl },
        { type: 'audio', url: input.audioUrl },
      ],
    };
    const res = await syncFetch<SyncCreate>('/v2/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!res.id) {
      throw new LipSyncProviderError(
        `Sync.so submit failed — no id in response`,
        'sync',
      );
    }
    return { providerJobId: res.id, status: mapStatus(res.status) };
  }

  async getStatus(providerJobId: string): Promise<LipSyncStatusResult> {
    const res = await syncFetch<SyncStatus>(
      `/v2/generate/${encodeURIComponent(providerJobId)}`,
      { method: 'GET' },
    );
    const status = mapStatus(res.status);
    if (status === 'completed') {
      if (!res.outputUrl) return { status: 'failed', errorMessage: 'completed without outputUrl' };
      return { status: 'completed', videoUrl: res.outputUrl };
    }
    if (status === 'failed') {
      return { status: 'failed', errorMessage: res.error ?? 'unknown' };
    }
    return { status };
  }

  async generate(input: LipSyncInput): Promise<LipSyncFinalResult> {
    const submit = await this.submit(input);
    const startedAt = Date.now();
    while (true) {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new LipSyncTimeoutError(
          `Sync.so job ${submit.providerJobId} did not finish within ${POLL_TIMEOUT_MS / 1000}s.`,
          'sync',
        );
      }
      const st = await this.getStatus(submit.providerJobId);
      if (st.status === 'completed' && st.videoUrl) {
        const res = await fetch(st.videoUrl);
        if (!res.ok) {
          throw new LipSyncProviderError(
            `Failed to download Sync.so result: HTTP ${res.status}`,
            'sync',
            res.status,
          );
        }
        return {
          providerJobId: submit.providerJobId,
          videoBytes: Buffer.from(await res.arrayBuffer()),
          videoUrl: st.videoUrl,
          durationSeconds: input.durationSeconds,
          modelUsed: model(),
          providerName: this.name,
        };
      }
      if (st.status === 'failed') {
        throw new LipSyncProviderError(
          `Sync.so job ${submit.providerJobId} failed: ${st.errorMessage ?? 'unknown'}`,
          'sync',
        );
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

function mapStatus(s: string): LipSyncStatusResult['status'] {
  const u = (s ?? '').toUpperCase();
  if (u === 'COMPLETED' || u === 'COMPLETE' || u === 'SUCCESS') return 'completed';
  if (u === 'FAILED' || u === 'ERROR' || u === 'CANCELLED') return 'failed';
  if (u === 'PROCESSING' || u === 'RUNNING') return 'processing';
  return 'queued';
}

export const syncLipSyncProvider: LipSyncProvider = new SyncLipSync();
