import type { BrollVideoProvider } from './interface';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockBrollProvider: BrollVideoProvider = {
  name: 'mock-broll',
  async generate(input) {
    console.log(`[mock-broll] generating ${input.durationSeconds}s clip`);
    await sleep(500);
    return {
      videoUrl: `mock://broll/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`,
      durationSeconds: input.durationSeconds,
      provider: 'mock-broll',
    };
  },
};
