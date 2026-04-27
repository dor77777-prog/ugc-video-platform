import type { CompositionProvider } from './interface';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockCompositionProvider: CompositionProvider = {
  name: 'mock-composition',
  async compose(input) {
    console.log(
      `[mock-composition] stitching avatar + ${input.brollUrls.length} b-roll + ${input.captions.length} captions`,
    );
    await sleep(1200);
    return {
      finalVideoUrl: `mock://final/${Date.now()}.mp4`,
      durationSeconds: 28,
      provider: 'mock-composition',
    };
  },
};
