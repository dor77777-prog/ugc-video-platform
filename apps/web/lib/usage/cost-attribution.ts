// V13.2 — single source of truth for "what did this provider call cost?".
//
// Three rules, in order:
//   1. If the provider response exposes usage (tokens, characters,
//      credits) → compute cost from configured per-unit rate.
//   2. Else → use the configured per-operation estimate constant.
//   3. NEVER derive cost from balance-deltas (fetching live balance
//      before/after the call). That approach is broken under
//      concurrency (multiple in-flight calls bleed into each other),
//      creates rate-limit pressure on provider /balance APIs, and
//      makes tests non-deterministic. Live balances are observability
//      only — the dashboard reconciles aggregates against them.
//
// The "actual" path is preferred for billing reconciliation; the
// "estimate" path is the fallback so the system still attributes cost
// when a provider call returns a video but no usage block.

import {
  PROVIDER_COST_ESTIMATES_USD,
  PIXVERSE_COST_MODEL,
} from '@/lib/pricing/provider-costs';
import {
  priceOpenAiText,
  priceOpenAiImage,
  priceElevenLabsTts,
  priceKling,
  klingPricingKeyForModel,
  priceGeminiText,
  priceGrokVideo,
} from '@/lib/usage/pricing';

export type CostSource = 'actual_usage' | 'estimate' | 'observed_constant';

export interface AttributedCost {
  costUsd: number;
  estimatedCostUsd: number;
  actualCostUsd?: number;
  source: CostSource;
  /** Safe-to-store raw usage payload — merged into ApiCall.metadata. */
  metadata: Record<string, unknown>;
}

// ── OpenAI text (scripts, motion analysis) ─────────────────────────────
export function attributeOpenAiTextCost(args: {
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): AttributedCost {
  const { model } = args;
  const inputTokens = args.inputTokens ?? null;
  const outputTokens = args.outputTokens ?? null;
  // Estimate: same formula but with a token-based fallback (assume
  // small batch when usage missing).
  const estimatedCostUsd =
    inputTokens != null && outputTokens != null
      ? priceOpenAiText(model, inputTokens, outputTokens)
      : PROVIDER_COST_ESTIMATES_USD.openai_script_batch;
  if (inputTokens != null && outputTokens != null) {
    const actual = priceOpenAiText(model, inputTokens, outputTokens);
    return {
      costUsd: actual,
      estimatedCostUsd,
      actualCostUsd: actual,
      source: 'actual_usage',
      metadata: { inputTokens, outputTokens, model },
    };
  }
  return {
    costUsd: estimatedCostUsd,
    estimatedCostUsd,
    source: 'estimate',
    metadata: { model, note: 'no usage reported by provider' },
  };
}

// ── Google Gemini text (V25 — script generation) ───────────────────────
// Mirrors attributeOpenAiTextCost. Used by the script generation
// path post-V25 (apps/web/app/(dashboard)/projects/[id]/scripts/actions.ts).
export function attributeGeminiTextCost(args: {
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): AttributedCost {
  const { model } = args;
  const inputTokens = args.inputTokens ?? null;
  const outputTokens = args.outputTokens ?? null;
  const estimatedCostUsd =
    inputTokens != null && outputTokens != null
      ? priceGeminiText(model, inputTokens, outputTokens)
      : PROVIDER_COST_ESTIMATES_USD.gemini_script_batch;
  if (inputTokens != null && outputTokens != null) {
    const actual = priceGeminiText(model, inputTokens, outputTokens);
    return {
      costUsd: actual,
      estimatedCostUsd,
      actualCostUsd: actual,
      source: 'actual_usage',
      metadata: { inputTokens, outputTokens, model, provider: 'gemini' },
    };
  }
  return {
    costUsd: estimatedCostUsd,
    estimatedCostUsd,
    source: 'estimate',
    metadata: { model, provider: 'gemini', note: 'no usage reported by provider' },
  };
}

// ── OpenAI image (gpt-image-2) ─────────────────────────────────────────
export function attributeOpenAiImageCost(args: {
  model: string;
  quality: 'low' | 'medium' | 'high';
  size: string;
}): AttributedCost {
  // OpenAI doesn't expose per-image usage — we use the published
  // per-quality/per-size price. That is the "actual" rate, not an
  // estimate, so we mark it observed_constant.
  const cost = priceOpenAiImage(args.model, args.quality, args.size);
  const fallback = PROVIDER_COST_ESTIMATES_USD.openai_scene_image;
  // If lookup misses, fall back to the constant.
  const final = cost > 0 ? cost : fallback;
  return {
    costUsd: final,
    estimatedCostUsd: fallback,
    actualCostUsd: cost > 0 ? cost : undefined,
    source: cost > 0 ? 'observed_constant' : 'estimate',
    metadata: { model: args.model, quality: args.quality, size: args.size },
  };
}

// ── ElevenLabs TTS ─────────────────────────────────────────────────────
export function attributeElevenLabsTtsCost(args: {
  model: string;
  characters: number;
}): AttributedCost {
  // Characters × $/1K is the published rate — that IS the actual bill,
  // so it's not an estimate. We still record an estimatedCostUsd
  // (the per-scene fallback) for visibility on rows where character
  // count was missing or zero.
  if (args.characters > 0) {
    const actual = priceElevenLabsTts(args.model, args.characters);
    return {
      costUsd: actual,
      estimatedCostUsd: PROVIDER_COST_ESTIMATES_USD.elevenlabs_voice_scene,
      actualCostUsd: actual,
      source: 'actual_usage',
      metadata: {
        model: args.model,
        characters: args.characters,
      },
    };
  }
  return {
    costUsd: PROVIDER_COST_ESTIMATES_USD.elevenlabs_voice_scene,
    estimatedCostUsd: PROVIDER_COST_ESTIMATES_USD.elevenlabs_voice_scene,
    source: 'estimate',
    metadata: { model: args.model, note: 'no character count' },
  };
}

// ── Kling i2v ──────────────────────────────────────────────────────────
//
// Kling's API doesn't return token counts on the i2v completion —
// `KLING_UNITS_PER_CLIP` (6.24) is the empirically observed average.
// If the provider ever exposes a token_count on completion, callers
// can pass it as args.tokensUsed and we'll switch to actual.
export function attributeKlingI2vCost(args: {
  modelUsed?: string | null;
  durationSeconds?: number | null;
  tokensUsed?: number | null;
}): AttributedCost {
  const pricingKey = klingPricingKeyForModel(args.modelUsed ?? undefined);
  const estimateBase = priceKling(pricingKey, args.durationSeconds ?? 5);
  const fallback = PROVIDER_COST_ESTIMATES_USD.kling_i2v_clip;
  const estimatedCostUsd = estimateBase > 0 ? estimateBase : fallback;
  // If the provider response carries tokens, compute actual.
  if (args.tokensUsed != null && args.tokensUsed > 0) {
    // $0.546 / token — the empirical Kling rate (see lib/usage/pricing.ts).
    const actual = args.tokensUsed * 0.546;
    return {
      costUsd: actual,
      estimatedCostUsd,
      actualCostUsd: actual,
      source: 'actual_usage',
      metadata: {
        model: args.modelUsed,
        tokensUsed: args.tokensUsed,
        durationSeconds: args.durationSeconds,
      },
    };
  }
  return {
    costUsd: estimatedCostUsd,
    estimatedCostUsd,
    source: 'estimate',
    metadata: {
      model: args.modelUsed,
      durationSeconds: args.durationSeconds,
      note: 'kling token count not exposed; using observed estimate',
    },
  };
}

// ── xAI / Grok video (V26 — image-to-video alternative to Kling) ───────
//
// xAI doesn't expose token usage on the video status response — pricing
// is per-second by resolution. We compute estimated/actual from the
// returned `video.duration` (when known) at the configured per-sec
// rate. If neither is known, fall back to the configured per-clip
// constant. Future: if xAI starts returning a `usage` block on the
// done payload, pass it via args.tokensUsed and we'll switch to that.
export function attributeGrokVideoCost(args: {
  resolution?: '480p' | '720p' | string | null;
  durationSeconds?: number | null;
  tokensUsed?: number | null;
}): AttributedCost {
  const fallback = PROVIDER_COST_ESTIMATES_USD.xai_video_clip;
  if (args.durationSeconds && args.durationSeconds > 0) {
    const perSec = priceGrokVideo({
      resolution: args.resolution ?? '720p',
      durationSeconds: args.durationSeconds,
    });
    return {
      costUsd: perSec,
      estimatedCostUsd: perSec,
      actualCostUsd: perSec,
      source: 'observed_constant',
      metadata: {
        provider: 'xai',
        resolution: args.resolution ?? '720p',
        durationSeconds: args.durationSeconds,
        ratePerSecondUsd: perSec / args.durationSeconds,
      },
    };
  }
  return {
    costUsd: fallback,
    estimatedCostUsd: fallback,
    source: 'estimate',
    metadata: {
      provider: 'xai',
      note: 'no duration reported — using xai_video_clip baseline',
    },
  };
}

// ── PixVerse LipSync ───────────────────────────────────────────────────
//
// PixVerse's submit/result endpoints don't return credit_consumed today.
// If they ever do, callers pass args.pixverseCreditsConsumed and we
// compute $/credit × consumed. Otherwise we fall back to the observed
// 16 credits / lipsync scene model.
export function attributePixVerseLipSyncCost(args: {
  durationSeconds?: number | null;
  pixverseCreditsConsumed?: number | null;
}): AttributedCost {
  const fallback = PROVIDER_COST_ESTIMATES_USD.pixverse_lipsync_scene;
  if (args.pixverseCreditsConsumed != null && args.pixverseCreditsConsumed > 0) {
    const actual =
      args.pixverseCreditsConsumed * PIXVERSE_COST_MODEL.usdPerPixverseCredit;
    return {
      costUsd: actual,
      estimatedCostUsd: fallback,
      actualCostUsd: actual,
      source: 'actual_usage',
      metadata: {
        pixverseCreditsConsumed: args.pixverseCreditsConsumed,
        usdPerPixverseCredit: PIXVERSE_COST_MODEL.usdPerPixverseCredit,
        durationSeconds: args.durationSeconds,
      },
    };
  }
  // Per-second fallback when duration is known and !=5; otherwise
  // observed per-scene constant.
  if (args.durationSeconds != null && args.durationSeconds > 0 && args.durationSeconds !== 5) {
    const perSec =
      args.durationSeconds * PROVIDER_COST_ESTIMATES_USD.pixverse_lipsync_second;
    return {
      costUsd: perSec,
      estimatedCostUsd: perSec,
      source: 'estimate',
      metadata: {
        durationSeconds: args.durationSeconds,
        note: 'per-second pixverse estimate; credit_consumed not exposed',
      },
    };
  }
  return {
    costUsd: fallback,
    estimatedCostUsd: fallback,
    source: 'estimate',
    metadata: {
      durationSeconds: args.durationSeconds ?? 5,
      observedCreditsPerLipSyncScene:
        PIXVERSE_COST_MODEL.observedCreditsPerLipSyncScene,
      note: 'per-scene pixverse estimate (credit_consumed not exposed)',
    },
  };
}

// ── PixVerse media upload (no observed billing) ────────────────────────
export function attributePixVerseMediaUploadCost(): AttributedCost {
  return {
    costUsd: PROVIDER_COST_ESTIMATES_USD.pixverse_media_upload,
    estimatedCostUsd: PROVIDER_COST_ESTIMATES_USD.pixverse_media_upload,
    source: 'observed_constant',
    metadata: { note: 'no observed pixverse upload billing' },
  };
}

// ── ffmpeg / local compose (no provider cost) ──────────────────────────
export function attributeLocalComposeCost(args: {
  operation: 'mux' | 'compose' | string;
  durationMs?: number | null;
}): AttributedCost {
  return {
    costUsd: 0,
    estimatedCostUsd: 0,
    source: 'observed_constant',
    metadata: {
      operation: args.operation,
      durationMs: args.durationMs ?? null,
      note: 'local compute — no provider cost',
    },
  };
}

// ── Sanity: explicitly forbid balance-delta attribution ────────────────
//
// This function exists ONLY to be imported by tests verifying that no
// production code path uses balance deltas to compute per-call cost.
// Calling it throws — that's the point. If you find yourself reaching
// for "fetch balance before; fetch balance after; subtract", stop and
// use one of the attribute*Cost helpers above.
export function FORBIDDEN_balanceDeltaAttribution(): never {
  throw new Error(
    'V13.2 invariant: per-call cost must NEVER be derived from provider balance deltas. ' +
      'Use attributeOpenAi*/attributeElevenLabsTts/attributeKlingI2v/attributePixVerseLipSync.',
  );
}
