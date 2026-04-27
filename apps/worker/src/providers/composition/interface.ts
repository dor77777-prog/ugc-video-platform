import type { AspectRatio } from '@ugc-video/shared';

export interface CompositionInput {
  avatarVideoUrl: string;
  voiceUrls: string[];
  brollUrls: string[];
  captions: string[];
  backgroundMusicUrl?: string;
  aspectRatio: AspectRatio;
}

export interface CompositionOutput {
  finalVideoUrl: string;
  durationSeconds: number;
  provider: string;
}

export interface CompositionProvider {
  readonly name: string;
  compose(input: CompositionInput): Promise<CompositionOutput>;
}
