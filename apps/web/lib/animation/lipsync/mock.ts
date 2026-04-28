// Mock LipSync provider — returns the silent input video unchanged.
// Lets us run the full pipeline (and the bakeoff endpoint) without
// burning real provider quota. Selected via LIPSYNC_PROVIDER=mock.

import {
  LipSyncProvider,
  LipSyncInput,
  LipSyncSubmitResult,
  LipSyncStatusResult,
  LipSyncFinalResult,
  LipSyncProviderError,
} from './types';

class MockLipSync implements LipSyncProvider {
  readonly name = 'mock';

  async submit(_input: LipSyncInput): Promise<LipSyncSubmitResult> {
    return { providerJobId: `mock-${Date.now()}`, status: 'completed' };
  }
  async getStatus(_providerJobId: string): Promise<LipSyncStatusResult> {
    return { status: 'completed', videoUrl: undefined };
  }
  async generate(input: LipSyncInput): Promise<LipSyncFinalResult> {
    const res = await fetch(input.videoUrl);
    if (!res.ok) {
      throw new LipSyncProviderError(
        `Mock lipsync: failed to fetch input video ${input.videoUrl} (HTTP ${res.status})`,
        'mock',
        res.status,
      );
    }
    return {
      providerJobId: `mock-${Date.now()}`,
      videoBytes: Buffer.from(await res.arrayBuffer()),
      videoUrl: input.videoUrl,
      durationSeconds: input.durationSeconds,
      modelUsed: 'mock-passthrough',
      providerName: this.name,
    };
  }
}

export const mockLipSyncProvider: LipSyncProvider = new MockLipSync();
