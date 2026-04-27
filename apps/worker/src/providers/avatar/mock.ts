import type { AvatarVideoProvider } from './interface';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockAvatarProvider: AvatarVideoProvider = {
  name: 'mock-avatar',
  async generate(input) {
    console.log(`[mock-avatar] rendering avatar ${input.avatarId}`);
    await sleep(800);
    return {
      videoUrl: `mock://avatar/${Date.now()}.mp4`,
      durationSeconds: 15,
      provider: 'mock-avatar',
    };
  },
};
