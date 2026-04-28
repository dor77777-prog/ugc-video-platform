// Provider selection — single source of truth for "which lipsync
// provider is active". Pipeline code calls getActiveLipSyncProvider();
// the bakeoff endpoint resolves by name via getLipSyncProviderByName().
//
// LIPSYNC_PROVIDER env values:
//   "kling"      → KlingLipSync (default)
//   "sync"       → Sync.so / sync-3
//   "elevenlabs" → ElevenLabs Omnihuman (preview, throws until wired)
//   "mock"       → passthrough (silent video unchanged)

import { LipSyncProvider } from './types';
import { klingLipSyncProvider } from './kling';
import { syncLipSyncProvider } from './sync';
import { elevenLabsLipSyncProvider } from './elevenlabs';
import { mockLipSyncProvider } from './mock';

export type LipSyncProviderName = 'kling' | 'sync' | 'elevenlabs' | 'mock';

export const ALL_LIPSYNC_PROVIDERS: Record<LipSyncProviderName, LipSyncProvider> = {
  kling: klingLipSyncProvider,
  sync: syncLipSyncProvider,
  elevenlabs: elevenLabsLipSyncProvider,
  mock: mockLipSyncProvider,
};

export function getActiveLipSyncProvider(): LipSyncProvider {
  // Backwards-compat: KLING_LIPSYNC_MOCK=1 maps to mock provider.
  if (process.env.KLING_LIPSYNC_MOCK === '1') return mockLipSyncProvider;
  const raw = (process.env.LIPSYNC_PROVIDER ?? 'kling').toLowerCase();
  return getLipSyncProviderByName(raw);
}

export function getLipSyncProviderByName(name: string): LipSyncProvider {
  const normalized = (name ?? '').toLowerCase() as LipSyncProviderName;
  const found = ALL_LIPSYNC_PROVIDERS[normalized];
  if (!found) {
    throw new Error(
      `Unknown lipsync provider "${name}". Use one of: ${Object.keys(ALL_LIPSYNC_PROVIDERS).join(', ')}.`,
    );
  }
  return found;
}

export type {
  LipSyncProvider,
  LipSyncInput,
  LipSyncFinalResult,
  LipSyncSubmitResult,
  LipSyncStatusResult,
  LipSyncJobStatus,
  LipSyncFaceVisibility,
} from './types';
export {
  LipSyncProviderError,
  LipSyncTimeoutError,
  LipSyncConfigError,
} from './types';
