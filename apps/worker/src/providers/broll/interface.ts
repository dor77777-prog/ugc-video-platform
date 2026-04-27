import type { AspectRatio } from '@ugc-video/shared';

export interface BrollGenerateInput {
  prompt: string;
  productImageUrl?: string;
  durationSeconds: number;
  aspectRatio: AspectRatio;
}

export interface BrollGenerateOutput {
  videoUrl: string;
  durationSeconds: number;
  provider: string;
}

export interface BrollVideoProvider {
  readonly name: string;
  generate(input: BrollGenerateInput): Promise<BrollGenerateOutput>;
}
