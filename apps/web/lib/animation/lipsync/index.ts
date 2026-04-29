// LipSync — PixVerse only.
//
// Product decision (2026-04-29): PixVerse is the single LipSync
// provider. Kling LipSync v1, Sync.so, ElevenLabs Omnihuman, and the
// mock provider were all removed from the production path. There is
// NO provider selection — every scene that requires lipsync (decided
// automatically by the face-detection gate) goes through PixVerse.
//
// Fallback policy: if PixVerse fails, the scene's final clip falls
// back to the Kling i2v output + separate audio. We do NOT fall back
// to a different lipsync provider.

import { pixverseLipSyncProvider } from './pixverse';

export function getLipSyncProvider() {
  return pixverseLipSyncProvider;
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
