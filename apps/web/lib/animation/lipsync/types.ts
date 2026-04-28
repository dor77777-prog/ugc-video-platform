// Generic LipSync provider interface — keeps the rest of the pipeline
// provider-agnostic. Swap implementations via env (LIPSYNC_PROVIDER) or
// run a few in parallel via /api/dev/lipsync-bakeoff for A/B comparison.
//
// Any new provider (Kling / Sync.so / ElevenLabs Omnihuman / ...) plugs
// in by implementing this interface. clip-impl.ts asks getLipSyncProvider()
// for the active one and treats them all the same.

export type LipSyncJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type LipSyncFaceVisibility =
  | 'clear_front_facing'
  | 'partial_face'
  | 'profile'
  | 'no_face';

export interface LipSyncInput {
  /** PUBLIC URL of the silent input video (provider's server fetches it). */
  videoUrl: string;
  /** PUBLIC URL of the audio MP3. */
  audioUrl: string;
  /** Used for budget logging; provider may ignore. */
  durationSeconds: number;
  /** Caller correlation id. Used by /api/dev/lipsync-bakeoff for naming. */
  sceneId: string;
  /** Hint for providers that score quality differently across visibility. */
  faceVisibility?: LipSyncFaceVisibility;
}

export interface LipSyncSubmitResult {
  providerJobId: string;
  status: LipSyncJobStatus;
}

export interface LipSyncStatusResult {
  status: LipSyncJobStatus;
  videoUrl?: string;
  errorMessage?: string;
}

// Convenience wrapper — submit + poll + download bytes, returned in one
// call. clip-impl uses this to keep the existing synchronous-from-caller
// shape. Providers built around long-running async webhooks expose
// submit + getStatus separately and let the caller orchestrate.
export interface LipSyncFinalResult {
  providerJobId: string;
  videoBytes: Buffer;
  videoUrl: string;
  durationSeconds: number;
  modelUsed: string;
  providerName: string;
}

export interface LipSyncProvider {
  /** Identifier used in logs / bakeoff comparisons. */
  readonly name: string;
  /** Submit a lip-sync job. */
  submit(input: LipSyncInput): Promise<LipSyncSubmitResult>;
  /** Poll a previously submitted job. */
  getStatus(providerJobId: string): Promise<LipSyncStatusResult>;
  /** Convenience: submit + poll + download bytes. */
  generate(input: LipSyncInput): Promise<LipSyncFinalResult>;
}

export class LipSyncProviderError extends Error {
  constructor(
    message: string,
    public readonly providerName: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'LipSyncProviderError';
  }
}

export class LipSyncTimeoutError extends Error {
  constructor(message: string, public readonly providerName: string) {
    super(message);
    this.name = 'LipSyncTimeoutError';
  }
}

export class LipSyncConfigError extends Error {
  constructor(message: string, public readonly providerName: string) {
    super(message);
    this.name = 'LipSyncConfigError';
  }
}
