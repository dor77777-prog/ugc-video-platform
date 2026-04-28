// Generic video-generation provider interface.
//
// The pipeline (clip-impl.ts, render-processor.ts) talks to providers
// only through this interface. Provider-specific field names like
// `model_name`, `image_list`, `task_id`, `task_status`, `audio_file`
// MUST stay inside the adapter implementation — leaking them into the
// pipeline locks us into one vendor.
//
// Two distinct operations:
//   1. generateImageToVideo  — image → silent motion clip
//   2. generateLipSync       — silent video + audio → lip-synced clip
//
// Both are submit-then-poll. We expose convenience wrappers in each
// adapter that combine submit + poll + download for callers that just
// want the bytes (matches our current synchronous-from-caller pattern).

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type AspectRatio = '9:16' | '1:1' | '16:9';

// Kling omni-video duration enum: 3,4,5,6,7,8,9,10,11,12,13,14,15. We
// expose 3-10 (the practical range for UGC ads). Talking-head scenes
// cap at 6s to avoid stretching a tight script into a frozen tail.
export type ClipDurationSeconds = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface ImageToVideoInput {
  /** Public URL or app-relative /uploads/... path. Primary scene image. */
  imageUrl: string;
  /** Free-text motion direction (camera + subtle action). */
  prompt: string;
  /**
   * Negative prompt — explicit don'ts. On Omni-Video this is sent as the
   * native `negative_prompt` field; on legacy image2video it's appended to
   * `prompt` with a "NEGATIVE:" tag (best-effort, weaker enforcement).
   */
  negativePrompt?: string;
  /**
   * Additional reference images (e.g. the product photo for a product-demo
   * scene). Sent to Omni-Video as extra entries in `image_list` so Kling
   * preserves the product's identity. Ignored on the legacy image2video
   * endpoint (single-image only). Order matters: refs should be listed
   * after `imageUrl` since Kling weights the first entry highest.
   */
  referenceImageUrls?: string[];
  /** Clip length in seconds (3-10; Kling supports the broader range too). */
  durationSeconds: ClipDurationSeconds;
  aspectRatio: AspectRatio;
  /** Caller-provided correlation id (for logs / mock cache key). */
  sceneId: string;
}

export interface LipSyncInput {
  /** PUBLIC URL of the silent input video (Kling's server fetches it). */
  videoUrl: string;
  /** PUBLIC URL of the audio MP3 (Kling's server fetches it). */
  audioUrl: string;
  /** Used for logging/budget; provider may ignore. */
  durationSeconds: number;
  sceneId: string;
}

export interface SubmitResult {
  providerJobId: string;
  status: JobStatus;
}

export interface StatusResult {
  status: JobStatus;
  videoUrl?: string;
  errorMessage?: string;
}

// High-level convenience result — bytes downloaded after polling completes.
export interface FinalVideoResult {
  providerJobId: string;
  videoBytes: Buffer;
  videoUrl: string; // Provider URL (may expire)
  durationSeconds: number;
  modelUsed: string;
}

export interface VideoGenerationProvider {
  /** Submit an image-to-video job. */
  submitImageToVideo(input: ImageToVideoInput): Promise<SubmitResult>;
  /** Submit a lip-sync job (video + audio → lip-synced video). */
  submitLipSync(input: LipSyncInput): Promise<SubmitResult>;
  /** Poll status of a previously submitted job. */
  getStatus(providerJobId: string): Promise<StatusResult>;
  /** Convenience: submit + poll + download bytes for image-to-video. */
  generateImageToVideo(input: ImageToVideoInput): Promise<FinalVideoResult>;
  /** Convenience: submit + poll + download bytes for lip-sync. */
  generateLipSync(input: LipSyncInput): Promise<FinalVideoResult>;
}

/* ---------- Common error classes ---------- */

export class VideoProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoProviderConfigError';
  }
}
export class VideoProviderTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoProviderTimeoutError';
  }
}
export class VideoProviderApiError extends Error {
  constructor(
    message: string,
    public readonly stage: 'i2v' | 'lipsync',
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'VideoProviderApiError';
  }
}
