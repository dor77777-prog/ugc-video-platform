export interface TtsGenerateInput {
  text: string;
  voiceId: string;
  language: 'he' | 'en';
}

export interface TtsGenerateOutput {
  audioUrl: string;
  durationSeconds: number;
  provider: string;
}

export interface TTSProvider {
  readonly name: string;
  generate(input: TtsGenerateInput): Promise<TtsGenerateOutput>;
}
