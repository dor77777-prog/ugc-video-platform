export type RenderJobStatusSlug =
  | 'pending'
  | 'extracting_assets'
  | 'generating_voice'
  | 'generating_avatar_video'
  | 'generating_broll'
  | 'composing_video'
  | 'uploading_final'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AssetTypeSlug =
  | 'product_image'
  | 'voice_audio'
  | 'avatar_video'
  | 'broll_video'
  | 'composition'
  | 'final_video'
  | 'thumbnail'
  | 'background_music';

export type AspectRatio = '9:16' | '1:1' | '16:9';

export interface StartRenderInput {
  projectId: string;
  scriptId: string;
  userId: string;
  avatarId?: string;
  voiceId?: string;
  style?: string;
  aspectRatio?: AspectRatio;
}

export interface RenderJobStatusResponse {
  id: string;
  status: RenderJobStatusSlug;
  progressPercent: number;
  errorMessage: string | null;
  finalVideoUrl: string | null;
  updatedAt: string;
}
