// Central provider cost + economics constants.
//
// Single source of truth for "how much does each paid provider call cost
// us, in USD?" + "how many Tachles credits do we charge for each
// operation?". Every cost-aware module (priceKling, pricePixverse, the
// admin /admin/costs page, plan margin reporting, video-cost estimates)
// reads from here.
//
// All numbers in USD per call unless noted. Override via env when needed
// (e.g. when a provider repacks their tier and we need to bump a number
// before redeploying app code).

const num = (envKey: string, fallback: number): number => {
  const raw = process.env[envKey];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

// 1 Tachles credit = $0.10 LIST PRICE.
// Effective per-credit revenue on a subscription is LOWER (you prepay $49
// for 500 credits = $0.098/credit, etc.). For margin math always use
// `effectiveCreditValueUsd(plan)` from lib/plans.ts.
export const CREDIT_LIST_VALUE_USD = num('CREDIT_LIST_VALUE_USD', 0.10);

// ── Per-provider operation costs (USD) ────────────────────────────────────
//
// OpenAI:
//   Script batch — full 6-script batch through gpt-5.4-mini ≈ $0.05.
//   Scene image — gpt-image-2 medium 1024x1792 ≈ $0.06 (latest pricing).
//   Motion analysis — gpt-4o-mini vision pass ≈ $0.005 / scene.
//
// ElevenLabs:
//   Hebrew voice — Multilingual v2 @ $0.10 / 1K chars × ~200 chars
//   per scene ≈ $0.02 / scene.
//
// Kling:
//   Image-to-video — token economics from the user's account log:
//     $160 plan / 293 tokens = $0.546 / token
//     observed avg 1.44 tok/clip → ≈ $0.79 / clip.
//
// PixVerse (sole LipSync provider as of V7):
//   Pricing pack: $10 = 2,250 PixVerse credits → $0.00444 / credit.
//   Observed lip-sync usage: 16 PixVerse credits / scene → $0.071 / scene.
//   Per-second equivalent at 4s: $0.071 / 4 ≈ $0.0178 → round to $0.018.
//   Conservative 2-cent figure for budgeting.
//   PixVerse media upload: no separate observed billing today; logged
//   so we can revisit if they start charging for it.
export const PROVIDER_COST_ESTIMATES_USD = {
  // V26.7 — script batch defaults to Gemini 3 Pro with thinkingLevel
  // `low`. Estimated cost: 6 calls × (~5k input × $2/M + ~3-4k output
  // incl thoughts × $12/M) ≈ $0.25-0.35/batch. Baseline pinned at
  // $0.30. We ran V26.3-V26.6 on Flash for cost reasons; live use
  // showed Flash produces shallower English visual specs in
  // `visualPromptEnglish`, which propagates to weaker downstream
  // image prompts. Pro brings the visual-prose quality back at ~3×
  // the cost — still half of the original V26.2 thinking:high
  // baseline. The actual_usage path (token-based) is accurate
  // regardless of this constant; the legacy COST_OPENAI_SCRIPT_BATCH_USD
  // env is read as a final fallback for back-compat.
  gemini_script_batch: num(
    'COST_GEMINI_SCRIPT_BATCH_USD',
    num('COST_OPENAI_SCRIPT_BATCH_USD', 0.3),
  ),
  // Kept for back-compat references; alias for gemini_script_batch
  // post-V25.
  openai_script_batch: num('COST_OPENAI_SCRIPT_BATCH_USD', 0.04),
  openai_scene_image: num('COST_OPENAI_SCENE_IMAGE_USD', 0.06),
  openai_motion_analysis_scene: num('COST_OPENAI_MOTION_ANALYSIS_SCENE_USD', 0.005),

  elevenlabs_voice_scene: num('COST_ELEVENLABS_VOICE_SCENE_USD', 0.02),

  kling_i2v_clip: num('COST_KLING_I2V_CLIP_USD', 0.79),

  // V26 — xAI / Grok video provider. Per-second pricing (xAI publishes
  // per-second rates, not per-clip). Default tuned so a 5s 720p clip
  // ≈ $0.75, comparable to Kling's $0.79. Override via env once you
  // confirm exact numbers in the xAI Console → Billing.
  xai_video_per_sec_480p: num('XAI_VIDEO_PRICE_PER_SEC_480P_USD', 0.08),
  xai_video_per_sec_720p: num('XAI_VIDEO_PRICE_PER_SEC_720P_USD', 0.15),
  // 5s 720p clip baseline used as the "no actual usage" fallback.
  xai_video_clip: num('COST_XAI_VIDEO_CLIP_USD', 0.75),

  pixverse_lipsync_scene: num('COST_PIXVERSE_LIPSYNC_SCENE_USD', 0.071),
  pixverse_lipsync_second: num('COST_PIXVERSE_LIPSYNC_SECOND_USD', 0.018),
  pixverse_lipsync_second_conservative: num('COST_PIXVERSE_LIPSYNC_SECOND_CONSERVATIVE_USD', 0.02),
  pixverse_media_upload: num('COST_PIXVERSE_MEDIA_UPLOAD_USD', 0.0),
} as const;

export type ProviderCostKey = keyof typeof PROVIDER_COST_ESTIMATES_USD;

// PixVerse pack-based cost model. Used for the admin display + as the
// formula behind PROVIDER_COST_ESTIMATES_USD.pixverse_lipsync_scene.
const PIXVERSE_PACKAGE_PRICE_USD = num('PIXVERSE_PACKAGE_PRICE_USD', 10);
const PIXVERSE_PACKAGE_CREDITS = num('PIXVERSE_PACKAGE_CREDITS', 2250);
const PIXVERSE_OBSERVED_LIPSYNC_CREDITS_PER_SCENE = num(
  'PIXVERSE_OBSERVED_LIPSYNC_CREDITS_PER_SCENE',
  16,
);

export const PIXVERSE_COST_MODEL = {
  packagePriceUsd: PIXVERSE_PACKAGE_PRICE_USD,
  packageCredits: PIXVERSE_PACKAGE_CREDITS,
  usdPerPixverseCredit: PIXVERSE_PACKAGE_PRICE_USD / PIXVERSE_PACKAGE_CREDITS,
  observedCreditsPerLipSyncScene: PIXVERSE_OBSERVED_LIPSYNC_CREDITS_PER_SCENE,
  observedUsdPerLipSyncScene:
    (PIXVERSE_PACKAGE_PRICE_USD / PIXVERSE_PACKAGE_CREDITS) *
    PIXVERSE_OBSERVED_LIPSYNC_CREDITS_PER_SCENE,
} as const;

// ── Estimated finished-video cost (provider $) ────────────────────────────
//
// Useful for the admin dashboard "expected cost / video" tile and for
// margin warnings on a plan whose effective credit value can't cover
// the worst-case video. The 15s/30s blueprints come from
// lib/video-mode.ts: 15s → 4 scenes, 1 lipsync; 30s → 5 scenes, 2
// lipsync.

export interface VideoCostEstimate {
  mode: '15s' | '30s';
  sceneCount: number;
  lipSyncSceneCount: number;
  scriptBatchUsd: number;
  imagesUsd: number;
  voicesUsd: number;
  motionAnalysisUsd: number;
  klingI2vUsd: number;
  pixverseLipSyncUsd: number;
  totalUsd: number;
}

function estimateVideoCost(
  mode: '15s' | '30s',
  sceneCount: number,
  lipSyncSceneCount: number,
): VideoCostEstimate {
  const c = PROVIDER_COST_ESTIMATES_USD;
  // V26.8 — back to OpenAI gpt-5.4-mini for script gen (default
  // LLM_SCRIPT_PROVIDER=openai). The Gemini experiment (V25-V26.7)
  // ran more expensive AND produced shallower visual prose; reverted.
  // openai_script_batch baseline ~$0.05/batch.
  const scriptBatchUsd = c.openai_script_batch;
  const imagesUsd = sceneCount * c.openai_scene_image;
  const voicesUsd = sceneCount * c.elevenlabs_voice_scene;
  const motionAnalysisUsd = sceneCount * c.openai_motion_analysis_scene;
  const klingI2vUsd = sceneCount * c.kling_i2v_clip;
  const pixverseLipSyncUsd = lipSyncSceneCount * c.pixverse_lipsync_scene;
  return {
    mode,
    sceneCount,
    lipSyncSceneCount,
    scriptBatchUsd,
    imagesUsd,
    voicesUsd,
    motionAnalysisUsd,
    klingI2vUsd,
    pixverseLipSyncUsd,
    totalUsd:
      scriptBatchUsd +
      imagesUsd +
      voicesUsd +
      motionAnalysisUsd +
      klingI2vUsd +
      pixverseLipSyncUsd,
  };
}

export const VIDEO_COST_ESTIMATES = {
  fifteenSec: estimateVideoCost('15s', 4, 1), // ~$3.62
  thirtySec: estimateVideoCost('30s', 5, 2), // ~$4.57
} as const;

export { estimateVideoCost };

// ── Operation credit pricing (Tachles credits) ────────────────────────────
//
// Differentiated by real provider cost so the system doesn't lose money
// on Kling clips. The "PER_OPERATION_CREDITS" map in lib/plans.ts uses
// these constants — see there for the per-operation accounting.
//
// Cost basis (USD)        → markup → credits  → list revenue
//   script batch  $0.05   → 4x   →  2 credits → $0.20
//   scene image   $0.06   → ~3x  →  2 credits → $0.20
//   voice scene   $0.02   → 5x   →  1 credit  → $0.10
//   motion        $0.005  → bundled into clip — 0 standalone credits
//   Kling i2v     $0.79   → ~1.9x → 15 credits → $1.50
//   PixVerse lip  $0.071  → ~28x →  2 credits → $0.20
//   final 15s     ~$0     → covers compute/storage → 8 credits → $0.80
//   final 30s     ~$0     → covers compute/storage → 12 credits → $1.20
//
// The Kling i2v charge is the meaningful margin driver — on a 15s video
// (4 clips) we charge 60 credits = $6.00 list, provider cost $3.16,
// gross margin $2.84 / 47%.
export const OPERATION_CREDIT_PRICING = {
  script_batch: 2,

  scene_image_generate: 2,
  scene_image_regenerate: 2,

  voice_generate: 1,
  voice_regenerate: 1,

  // Motion analysis is folded into the Kling clip charge; we never charge
  // it standalone (the user shouldn't see a separate line item for a
  // $0.005 helper call).
  motion_analysis: 0,

  kling_i2v_clip: 15,

  pixverse_lipsync_scene: 2,

  // Lipsync-only retry: skip Kling, just rerun PixVerse on the existing
  // silent clip + voice. Provider cost ≈ $0.071, but we charge a higher
  // 12 credits because there's also our own compute + storage and
  // because lipsync_only is offered as a "cheap regen" that already
  // saves the user $1.50 vs a full clip regen.
  lipsync_only: 12,

  final_export_15s: 8,
  final_export_30s: 12,
} as const;

export type OperationKey = keyof typeof OPERATION_CREDIT_PRICING;
