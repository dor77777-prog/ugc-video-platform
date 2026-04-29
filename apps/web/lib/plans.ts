// Subscription plans + per-operation credit pricing — single source of
// truth for the economics layer.
//
// Decisions baked into this file (signed off 2026-04-29):
//   - 1 credit = $0.10 LIST PRICE. Effective revenue per credit is
//     LOWER on subscription plans (you pay $49 for 500 credits =
//     $0.098/credit etc.) — see effectiveCreditValueUsd().
//   - Per-operation pricing differentiates by real provider cost,
//     so a Kling i2v clip ($0.79) doesn't cost the same as an
//     image regen ($0.06). Without this, the system loses money on
//     every clip generation (the original "1 credit per anything"
//     model).
//   - PixVerse LipSync is its OWN line item (2 credits / scene). It is
//     charged only if PixVerse actually ran. The Kling i2v charge is
//     billed independently of whether PixVerse ran later.
//   - First-regen-free: image + voice yes, clips NO. Clips are the
//     expensive Kling call; "free" regens drained margin in V5.
//   - Plan limits enforced at the API layer (per-plan max lipsync
//     scenes per video), not just the prompt — the LLM might
//     classify scene 3 as talking_head, but if user is on Creator
//     and 30s mode, only scene 0 keeps requires_lip_sync=true.
//
// No Stripe yet — admin grants credits + flips plan via /admin/users.
// See BUSINESS_MODEL.md for the full proposal + margin tables.

import {
  CREDIT_LIST_VALUE_USD,
  OPERATION_CREDIT_PRICING,
} from '@/lib/pricing/provider-costs';

export type PlanSlug = 'free_trial' | 'creator' | 'brand' | 'agency';

/**
 * 1 credit = $0.10 list price. The "real" per-credit value is lower
 * on subscription plans because the user prepays a fixed amount for
 * a credit pool — see effectiveCreditValueUsd().
 */
export const LIST_PRICE_PER_CREDIT_USD = CREDIT_LIST_VALUE_USD;

export interface PlanConfig {
  slug: PlanSlug;
  /** Hebrew display name for the picker. */
  displayName: string;
  /** Monthly price in USD (0 for free_trial). */
  monthlyPriceUsd: number;
  /** Credits granted per month (or one-time for free_trial). */
  monthlyCredits: number;
  /** Annual discount percentage (0-1). 0 = no discount. */
  annualDiscount: number;
  /** Whether monthly credits refresh on renewal date. False = one-time. */
  recurringCredits: boolean;
  /** Hard ceiling on lipsync scenes per video for this plan. */
  maxLipSyncScenesPerVideo: number;
  /**
   * Whether the user can render the FINAL composed video. Free trial
   * defaults to false — the user can play scene-level previews but
   * can't export until they upgrade. Override per user via admin if
   * the trial needs to demo the full flow.
   */
  allowFinalRender: boolean;
  /** Per-user concurrency cap on Kling clip generations. */
  maxConcurrentClipGenerations: number;
}

export const PLAN_CONFIGS: Record<PlanSlug, PlanConfig> = {
  free_trial: {
    slug: 'free_trial',
    displayName: 'Free Trial',
    monthlyPriceUsd: 0,
    monthlyCredits: 30,
    annualDiscount: 0,
    recurringCredits: false,
    maxLipSyncScenesPerVideo: 0, // no lipsync at all on trial
    allowFinalRender: false, // upgrade to export
    maxConcurrentClipGenerations: 1,
  },
  creator: {
    slug: 'creator',
    displayName: 'Creator',
    monthlyPriceUsd: 49,
    monthlyCredits: 500,
    annualDiscount: 0.1,
    recurringCredits: true,
    maxLipSyncScenesPerVideo: 1,
    allowFinalRender: true,
    maxConcurrentClipGenerations: 4,
  },
  brand: {
    slug: 'brand',
    displayName: 'Brand',
    monthlyPriceUsd: 149,
    monthlyCredits: 1800,
    annualDiscount: 0.15,
    recurringCredits: true,
    maxLipSyncScenesPerVideo: 2,
    allowFinalRender: true,
    maxConcurrentClipGenerations: 8,
  },
  agency: {
    slug: 'agency',
    displayName: 'Agency',
    monthlyPriceUsd: 499,
    monthlyCredits: 6000,
    // Capped at 15% until we secure Kling volume discount; bumping to
    // 20% would land negative-margin on heavy regen patterns.
    annualDiscount: 0.15,
    recurringCredits: true,
    maxLipSyncScenesPerVideo: 2, // future: 3 once Kling volume rebate is in
    allowFinalRender: true,
    maxConcurrentClipGenerations: 20,
  },
};

export function getPlanConfig(plan: string | null | undefined): PlanConfig {
  const slug = (plan ?? 'free_trial') as PlanSlug;
  return PLAN_CONFIGS[slug] ?? PLAN_CONFIGS.free_trial;
}

/**
 * Effective revenue per credit on a subscription plan, after the
 * monthly fee is amortized across the included credit pool. Used by
 * margin reporting in /admin/costs — DO NOT use $0.10 list price for
 * subscriber margin math.
 *
 * Free trial credits are "free" (acquisition cost), so we report 0.
 * Top-up packs (one-time) use list price ($0.10).
 */
export function effectiveCreditValueUsd(plan: string | null | undefined): number {
  const cfg = getPlanConfig(plan);
  if (!cfg.recurringCredits || cfg.monthlyCredits === 0) {
    // free_trial → effectively $0 revenue per credit (acquisition spend).
    return cfg.monthlyPriceUsd === 0 ? 0 : LIST_PRICE_PER_CREDIT_USD;
  }
  return cfg.monthlyPriceUsd / cfg.monthlyCredits;
}

// ── Per-operation credit pricing ─────────────────────────────────────────
//
// Differentiated by real provider cost. Each entry is in CREDITS, not
// USD — the USD math happens at /admin/costs via priceKling/priceOpenAi
// for the spend side, and at billing via plan.monthlyPriceUsd for the
// revenue side.
//
// Cost basis (USD) → markup → credits:
//   script batch:          $0.05  →  4x   →  2 credits  ($0.20 list)
//   image gen / regen:     $0.06  → ~3x   →  2 credits  ($0.20 list)
//   voice gen / regen:     $0.02  →  5x   →  1 credit   ($0.10 list)
//   motion analysis:       $0.005 → bundled into clip — 0 standalone credits
//   Kling i2v clip:        $0.79  → ~1.9x → 15 credits  ($1.50 list)
//   PixVerse lipsync:      $0.071 → ~28x  →  2 credits  ($0.20 list)
//   final render 15s:      ~ $0   (local ffmpeg) → 8 credits ($0.80 list,
//                          covers storage + bandwidth + worker compute)
//   final render 30s:      ~ $0   → 12 credits ($1.20 list)
//
// Important: PixVerse LipSync is its OWN charge. The clip pipeline
// charges 15 credits for the Kling i2v stage UNCONDITIONALLY, and an
// additional 2 credits ONLY IF PixVerse actually ran (face-gate passed
// + provider returned a synced clip).
//
// `clip_broll` / `clip_lipsync` below are kept as composite shortcuts
// for places that need the BUNDLED total at quote time (e.g. plan
// margin tables) — they sum the underlying line items.

export type Operation =
  | 'script_batch'
  | 'image'
  | 'voice'
  | 'motion_analysis'
  | 'clip_broll'        // composite: kling_i2v_clip
  | 'clip_lipsync'      // composite: kling_i2v_clip + pixverse_lipsync_scene
  | 'kling_i2v_clip'    // line item — Kling animation only
  | 'pixverse_lipsync_scene' // line item — PixVerse lip-sync only
  | 'lipsync_only'      // re-run PixVerse on an existing clip (no Kling)
  | 'final_render_15s'
  | 'final_render_30s';

const KLING_I2V_CLIP_CREDITS = OPERATION_CREDIT_PRICING.kling_i2v_clip;
const PIXVERSE_LIPSYNC_CREDITS = OPERATION_CREDIT_PRICING.pixverse_lipsync_scene;

export const PER_OPERATION_CREDITS: Record<Operation, number> = {
  script_batch: OPERATION_CREDIT_PRICING.script_batch,
  image: OPERATION_CREDIT_PRICING.scene_image_generate,
  voice: OPERATION_CREDIT_PRICING.voice_generate,
  motion_analysis: OPERATION_CREDIT_PRICING.motion_analysis,
  // Composite shortcuts — for "what does this whole flow cost?" quotes.
  // Real charging in clip-impl is split across kling_i2v_clip +
  // pixverse_lipsync_scene so face-gate skips don't burn the lipsync
  // line item.
  clip_broll: KLING_I2V_CLIP_CREDITS,
  clip_lipsync: KLING_I2V_CLIP_CREDITS + PIXVERSE_LIPSYNC_CREDITS,
  kling_i2v_clip: KLING_I2V_CLIP_CREDITS,
  pixverse_lipsync_scene: PIXVERSE_LIPSYNC_CREDITS,
  lipsync_only: OPERATION_CREDIT_PRICING.lipsync_only,
  final_render_15s: OPERATION_CREDIT_PRICING.final_export_15s,
  final_render_30s: OPERATION_CREDIT_PRICING.final_export_30s,
};

// First-regen-free policy. Indexed by Operation. The original
// motivation was "let the user retry once for free if the first
// attempt was bad" — a UX win on cheap operations. But on clips
// it became a margin sink, so we drop it there.
//
// Provider failures (timeouts, 5xx) are refunded SEPARATELY by the
// per-operation refund logic — those refunds happen regardless of
// this map.
export const FIRST_REGEN_FREE: Record<Operation, boolean> = {
  script_batch: true, // a single regen of the 6-batch is essentially free anyway ($0.05 cost)
  image: true,
  voice: true,
  motion_analysis: false,
  clip_broll: false,
  clip_lipsync: false,
  kling_i2v_clip: false,
  pixverse_lipsync_scene: false,
  // lipsync_only is itself the "regen of just the lipsync part" — never
  // free, always paid (it IS the cheap regen).
  lipsync_only: false,
  final_render_15s: false,
  final_render_30s: false,
};

// Clip credit cost helper — at QUOTE time (e.g. "do you have enough
// credits to attempt this clip?") we ask for the FULL bundled price so
// the user isn't surprised mid-flow. Actual charging is split across
// kling_i2v_clip and pixverse_lipsync_scene so PixVerse credits aren't
// burned when the face gate skips lipsync (see clip-impl.ts).
export function creditsForClip(requiresLipSync: boolean): number {
  return PER_OPERATION_CREDITS[requiresLipSync ? 'clip_lipsync' : 'clip_broll'];
}

// Granular charge helper. Use this in the actual charging step so
// each provider call has its own line item in CreditTransaction.
export function creditsForOperation(op: Operation): number {
  return PER_OPERATION_CREDITS[op];
}

// Final-render credit cost by selected duration mode.
export function creditsForFinalRender(durationSeconds: number): number {
  return PER_OPERATION_CREDITS[
    durationSeconds <= 22 ? 'final_render_15s' : 'final_render_30s'
  ];
}
