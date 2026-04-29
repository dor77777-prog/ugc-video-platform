// Subscription plans + per-operation credit pricing — single source of
// truth for the economics layer.
//
// Decisions baked into this file (signed off 2026-04-29):
//   - 1 credit = $0.10 LIST PRICE. Effective revenue per credit is
//     LOWER on subscription plans (you pay $49 for 500 credits =
//     $0.098/credit etc.) — see effectiveCreditValueUsd().
//   - Per-operation pricing differentiates by real provider cost,
//     so a Kling i2v clip ($0.79) doesn't cost the same as an
//     image regen ($0.04). Without this, the system loses money on
//     every clip generation (the original "1 credit per anything"
//     model).
//   - First-regen-free: image + voice yes, clips NO. Clips are the
//     expensive Kling call; "free" regens drained margin in V5.
//   - Plan limits enforced at the API layer (per-plan max lipsync
//     scenes per video), not just the prompt — the LLM might
//     classify scene 3 as talking_head, but if user is on Creator
//     and 30s mode, only scene 0 keeps requires_lip_sync=true.
//
// No Stripe yet — admin grants credits + flips plan via /admin/users.
// See BUSINESS_MODEL.md for the full proposal + margin tables.

export type PlanSlug = 'free_trial' | 'creator' | 'brand' | 'agency';

/**
 * 1 credit = $0.10 list price. The "real" per-credit value is lower
 * on subscription plans because the user prepays a fixed amount for
 * a credit pool — see effectiveCreditValueUsd().
 */
export const LIST_PRICE_PER_CREDIT_USD = 0.1;

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
//   script batch:          $0.02 → 10x → 2 credits ($0.20 list)
//   image gen / regen:     $0.04 →  5x → 2 credits ($0.20 list)
//   voice gen / regen:     $0.02 →  5x → 1 credit  ($0.10 list)
//   clip b-roll:           $0.86 →  2x → 18 credits ($1.80 list)
//   clip + lipsync:        $1.41 → 2.1x → 30 credits ($3.00 list)
//   final render 15s:      ~ $0  (local ffmpeg) → 8 credits ($0.80 list,
//                          covers storage + bandwidth + worker compute)
//   final render 30s:      ~ $0  → 12 credits ($1.20 list)
//
// The "clip" charges are the meaningful ones — that's where margin lives.

export type Operation =
  | 'script_batch'
  | 'image'
  | 'voice'
  | 'clip_broll'
  | 'clip_lipsync'
  | 'final_render_15s'
  | 'final_render_30s';

export const PER_OPERATION_CREDITS: Record<Operation, number> = {
  script_batch: 2,
  image: 2,
  voice: 1,
  clip_broll: 18,
  clip_lipsync: 30,
  final_render_15s: 8,
  final_render_30s: 12,
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
  script_batch: true, // a single regen of the 6-batch is essentially free anyway ($0.02 cost)
  image: true,
  voice: true,
  clip_broll: false,
  clip_lipsync: false,
  final_render_15s: false,
  final_render_30s: false,
};

// Clip credit cost helper — the call sites pass requiresLipSync, we
// pick the right entry. Used by clip-impl.
export function creditsForClip(requiresLipSync: boolean): number {
  return PER_OPERATION_CREDITS[requiresLipSync ? 'clip_lipsync' : 'clip_broll'];
}

// Final-render credit cost by selected duration mode.
export function creditsForFinalRender(durationSeconds: number): number {
  return PER_OPERATION_CREDITS[
    durationSeconds <= 22 ? 'final_render_15s' : 'final_render_30s'
  ];
}
