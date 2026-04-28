// TalkingScene provider selection. Mirrors the LipSync abstraction but
// the input is (image + audio) instead of (video + audio).
//
// KLING_TALKING_SCENE_PROVIDER values:
//   "ai_avatar_v2_pro"      → Kling Avatar v2 Pro (recommended default)
//   "ai_avatar_v2_standard" → Kling Avatar v2 Standard
//   "advanced_lipsync"      → face_identify + advanced_lipsync chain
//   "lipsync_v1"            → legacy 2-step (kling-v3-omni i2v + lipsync v1)

import { TalkingSceneProvider } from './types';
import { klingAvatarV2Standard, klingAvatarV2Pro } from './kling-avatar-v2';
import { klingAdvancedLipSync } from './kling-advanced-lipsync';
import { lipSyncV1Adapter } from './lipsync-v1-adapter';

export type TalkingSceneProviderName =
  | 'ai_avatar_v2_pro'
  | 'ai_avatar_v2_standard'
  | 'advanced_lipsync'
  | 'lipsync_v1';

export const ALL_TALKING_SCENE_PROVIDERS: Record<TalkingSceneProviderName, TalkingSceneProvider> = {
  ai_avatar_v2_pro: klingAvatarV2Pro,
  ai_avatar_v2_standard: klingAvatarV2Standard,
  advanced_lipsync: klingAdvancedLipSync,
  lipsync_v1: lipSyncV1Adapter,
};

export function getActiveTalkingSceneProvider(): TalkingSceneProvider {
  const raw = (process.env.KLING_TALKING_SCENE_PROVIDER ?? 'ai_avatar_v2_pro').toLowerCase();
  return getTalkingSceneProviderByName(raw);
}

export function getTalkingSceneProviderByName(name: string): TalkingSceneProvider {
  const normalized = (name ?? '').toLowerCase() as TalkingSceneProviderName;
  const found = ALL_TALKING_SCENE_PROVIDERS[normalized];
  if (!found) {
    throw new Error(
      `Unknown talking-scene provider "${name}". Use one of: ${Object.keys(
        ALL_TALKING_SCENE_PROVIDERS,
      ).join(', ')}.`,
    );
  }
  return found;
}

export type {
  TalkingSceneProvider,
  TalkingSceneInput,
  TalkingSceneFinalResult,
  TalkingSceneSubmitResult,
  TalkingSceneStatusResult,
  TalkingSceneJobStatus,
} from './types';
export { TalkingSceneError, TalkingSceneTimeoutError, TalkingSceneConfigError } from './types';
