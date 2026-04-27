export interface AvatarGenerateInput {
  avatarId: string;
  audioUrl: string;
}

export interface AvatarGenerateOutput {
  videoUrl: string;
  durationSeconds?: number;
  provider: string;
}

export interface AvatarVideoProvider {
  readonly name: string;
  generate(input: AvatarGenerateInput): Promise<AvatarGenerateOutput>;
}
