// TalkingSceneProvider — image + audio → talking video, in ONE step.
//
// Critically different from LipSyncProvider:
//   LipSyncProvider takes (silent VIDEO + audio) → lip-synced video.
//     Used to be our flow: kling-v3-omni i2v first, then kling-lip-sync-v1.
//     Issue: the base i2v video is dead-still + the lipsync model patches
//     mouths onto a frozen face. Looks artificial.
//   TalkingSceneProvider takes (still IMAGE + audio) → talking video.
//     One model handles motion + lip-sync together (Kling Avatar v2 etc).
//     Generally produces a more natural talking-head than i2v + post lipsync.
//
// We keep both interfaces so b-roll scenes (no face) can still use the
// LipSyncProvider path / skip lip-sync entirely.

export type TalkingSceneJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface TalkingSceneInput {
  /** PUBLIC URL of the still scene image (Kling fetches it). */
  imageUrl: string;
  /** PUBLIC URL of the audio MP3. */
  audioUrl: string;
  /** Used for budget logging; provider may ignore. */
  durationSeconds: number;
  /** Caller correlation id. */
  sceneId: string;
  /** 9:16 / 1:1 / 16:9. Default 9:16. */
  aspectRatio?: '9:16' | '1:1' | '16:9';
}

export interface TalkingSceneSubmitResult {
  providerJobId: string;
  status: TalkingSceneJobStatus;
}

export interface TalkingSceneStatusResult {
  status: TalkingSceneJobStatus;
  videoUrl?: string;
  errorMessage?: string;
}

export interface TalkingSceneFinalResult {
  providerJobId: string;
  videoBytes: Buffer;
  videoUrl: string;
  durationSeconds: number;
  modelUsed: string;
  /** Stable provider name used in logs / bakeoff results. */
  providerName: string;
}

export interface TalkingSceneProvider {
  /** Identifier used in logs / bakeoff comparisons. */
  readonly name: string;
  /** Submit a talking-scene job. */
  submit(input: TalkingSceneInput): Promise<TalkingSceneSubmitResult>;
  /** Poll a previously submitted job. */
  getStatus(providerJobId: string): Promise<TalkingSceneStatusResult>;
  /** Convenience: submit + poll + download bytes. */
  generate(input: TalkingSceneInput): Promise<TalkingSceneFinalResult>;
}

export class TalkingSceneError extends Error {
  constructor(
    message: string,
    public readonly providerName: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'TalkingSceneError';
  }
}
export class TalkingSceneTimeoutError extends Error {
  constructor(message: string, public readonly providerName: string) {
    super(message);
    this.name = 'TalkingSceneTimeoutError';
  }
}
export class TalkingSceneConfigError extends Error {
  constructor(message: string, public readonly providerName: string) {
    super(message);
    this.name = 'TalkingSceneConfigError';
  }
}
