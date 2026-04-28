// Video duration mode — 15s or 30s.
//
// Single source of truth for everything that has to BRANCH on the
// selected duration: scene-count blueprint, word budgets, lipsync caps,
// final-render tolerance windows, etc. Stored on the project as the
// freeform `productData.durationSeconds` integer (15 / 30 today, more
// later) and resolved through `resolveVideoMode` at the use site so
// every consumer sees the same canonical config.
//
// Why a helper instead of a Prisma enum: the wizard already saves
// `durationSeconds` as an integer + the legacy DB column. Wrapping it
// avoids a destructive migration while still letting downstream code
// read a typed enum + the per-mode constraints.

export type VideoDurationMode = '15s' | '30s';

export interface VideoModeConfig {
  mode: VideoDurationMode;
  /** Total target in milliseconds — what the script LLM should aim for. */
  targetTotalDurationMs: number;
  minTotalDurationMs: number;
  maxTotalDurationMs: number;
  /** Preferred number of scenes per script. */
  preferredSceneCount: number;
  /** Hard upper bound on scene count (don't generate more than this). */
  maxSceneCount: number;
  /** How many scenes may carry requires_lip_sync=true. */
  maxLipSyncScenes: number;
  /** Sum of all lipsync-scene durations may not exceed this. */
  maxTotalLipSyncDurationMs: number;
  /** Per-talking-scene hard cap. */
  maxTalkingSceneDurationMs: number;
  /** Hebrew word budget for the WHOLE script (TTS-friendly). */
  totalSpokenWordsTarget: number;
  totalSpokenWordsHardMax: number;
}

const FIFTEEN: VideoModeConfig = {
  mode: '15s',
  targetTotalDurationMs: 15_000,
  minTotalDurationMs: 14_500,
  maxTotalDurationMs: 16_500,
  preferredSceneCount: 4,
  maxSceneCount: 5,
  maxLipSyncScenes: 1,
  maxTotalLipSyncDurationMs: 4_000,
  maxTalkingSceneDurationMs: 4_000,
  totalSpokenWordsTarget: 40,
  totalSpokenWordsHardMax: 50,
};

const THIRTY: VideoModeConfig = {
  mode: '30s',
  targetTotalDurationMs: 30_000,
  minTotalDurationMs: 28_500,
  maxTotalDurationMs: 31_500,
  preferredSceneCount: 5,
  maxSceneCount: 6,
  maxLipSyncScenes: 2,
  maxTotalLipSyncDurationMs: 8_000,
  maxTalkingSceneDurationMs: 6_000,
  totalSpokenWordsTarget: 85,
  totalSpokenWordsHardMax: 110,
};

// Rule: anything 22s or shorter is treated as 15s pacing, anything
// longer is treated as 30s pacing. The threshold leaves room for
// projects that picked 18-22s in the past — they get the shorter
// pacing, which is what the user has consistently wanted.
const FIFTEEN_THIRTY_CUTOFF_S = 22;

export function resolveVideoMode(durationSeconds: number | null | undefined): VideoModeConfig {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds)) {
    return FIFTEEN;
  }
  return durationSeconds <= FIFTEEN_THIRTY_CUTOFF_S ? FIFTEEN : THIRTY;
}

export function videoModeFromProductData(
  productData: unknown,
): VideoModeConfig {
  const data = (productData as Record<string, unknown> | null) ?? {};
  const ds = typeof data.durationSeconds === 'number' ? data.durationSeconds : null;
  return resolveVideoMode(ds);
}
