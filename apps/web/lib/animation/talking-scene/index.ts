// TalkingScene provider selection. Mirrors the LipSync abstraction but
// the input is (image + audio) instead of (video + audio).
//
// KLING_TALKING_SCENE_PROVIDER values:
//   "lipsync_v1"            → CURRENT DEFAULT. kling-v3-omni i2v +
//                             kling-lip-sync-v1. Works on every Kling
//                             account that has units; stable + tested.
//   "ai_avatar_v2_pro"      → Kling Avatar v2 Pro. ENDPOINT NEEDS
//                             VERIFICATION — our guess
//                             (/v1/videos/avatar) returned 404 on the
//                             official api-singapore.klingai.com.
//                             Override KLING_AVATAR_V2_PRO_ENDPOINT
//                             once you confirm the path with your
//                             reseller (302/PiAPI/KIE/...).
//   "ai_avatar_v2_standard" → Same caveat as Pro.
//   "advanced_lipsync"      → face_identify + advanced_lipsync chain.
//                             Same caveat.

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
  // Default → lipsync_v1 (the only path we've confirmed works on the
  // official Kling API). Switch to Avatar v2 / Advanced LipSync only
  // after verifying the endpoint with your reseller.
  const raw = (process.env.KLING_TALKING_SCENE_PROVIDER ?? 'lipsync_v1').toLowerCase();
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
