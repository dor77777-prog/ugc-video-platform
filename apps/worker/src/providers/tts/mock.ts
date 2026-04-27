import type { TTSProvider } from './interface';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockTtsProvider: TTSProvider = {
  name: 'mock-tts',
  async generate(input) {
    console.log(`[mock-tts] synthesizing "${input.text.slice(0, 40)}…"`);
    await sleep(300);
    const estimatedDuration = Math.max(2, Math.min(10, input.text.length / 18));
    return {
      audioUrl: `mock://tts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`,
      durationSeconds: Number(estimatedDuration.toFixed(2)),
      provider: 'mock-tts',
    };
  },
};
