// Provider pricing — kept here as a single source of truth so admin/usage
// shows accurate cost numbers. Prices are per 1M tokens for text models,
// per-image for image models. Pulled from each provider's pricing page on
// the dates noted; revisit periodically.

// OpenAI text models — $/1M tokens. (As of 2026-04 pricing page.)
const OPENAI_TEXT_PRICING: Record<string, { input: number; output: number }> = {
  // gpt-5.4 family — only mini's exact prices are confirmed in the screenshot.
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'gpt-5.4': { input: 2.5, output: 10 },
  'gpt-5.4-nano': { input: 0.2, output: 0.8 },
  'gpt-5.4-pro': { input: 7.5, output: 30 }, // estimate, refine when confirmed
  // Older models still around for fallback.
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  // Vision pricing matches the regular text rates (gpt-4o-mini does
  // image inputs at the same per-token rate as text).
};

export function priceOpenAiText(model: string, inputTokens: number, outputTokens: number): number {
  const base = stripVersionSuffix(model);
  const p = OPENAI_TEXT_PRICING[base] ?? OPENAI_TEXT_PRICING['gpt-5.4-mini']!;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

// gpt-image-2 — per-image $ from OpenAI cookbook calculator (Apr 2026).
// 1024x1792 (true 9:16) interpolated from 1024x1024 / 1024x1536 columns.
const OPENAI_IMAGE_PRICING: Record<
  string,
  Record<'low' | 'medium' | 'high', Record<string, number>>
> = {
  'gpt-image-2': {
    low:    { '1024x1024': 0.006, '1024x1536': 0.005, '1024x1792': 0.006, '1536x1024': 0.005, '1792x1024': 0.006 },
    medium: { '1024x1024': 0.053, '1024x1536': 0.041, '1024x1792': 0.048, '1536x1024': 0.041, '1792x1024': 0.048 },
    high:   { '1024x1024': 0.211, '1024x1536': 0.165, '1024x1792': 0.190, '1536x1024': 0.165, '1792x1024': 0.190 },
  },
  'gpt-image-1.5': {
    low:    { '1024x1024': 0.009, '1024x1536': 0.013, '1536x1024': 0.013 },
    medium: { '1024x1024': 0.034, '1024x1536': 0.05, '1536x1024': 0.05 },
    high:   { '1024x1024': 0.133, '1024x1536': 0.2, '1536x1024': 0.2 },
  },
};

export function priceOpenAiImage(
  model: string,
  quality: 'low' | 'medium' | 'high',
  size: string,
): number {
  const base = stripVersionSuffix(model);
  const m = OPENAI_IMAGE_PRICING[base];
  if (!m) return 0;
  return m[quality]?.[size] ?? m[quality]?.['1024x1024'] ?? 0;
}

// ElevenLabs TTS — pay-as-you-go pricing per 1K characters synthesized,
// from elevenlabs.io/pricing (ElevenAPI tab):
//   Flash / Turbo            $0.05 / 1K chars  (ultra-low latency ~75ms)
//   Multilingual v2 / v3     $0.10 / 1K chars  (low latency ~250-300ms)
const ELEVENLABS_PRICING_PER_1K_CHARS: Record<string, number> = {
  // Flash / Turbo tier
  eleven_turbo_v2: 0.05,
  eleven_turbo_v2_5: 0.05,
  eleven_flash_v2: 0.05,
  eleven_flash_v2_5: 0.05,
  // Multilingual / v3 tier (the one we use for Hebrew)
  eleven_multilingual_v2: 0.1,
  eleven_v3: 0.1,
};
export function priceElevenLabsTts(model: string, charCount: number): number {
  const rate = ELEVENLABS_PRICING_PER_1K_CHARS[model] ?? 0.1;
  return (charCount / 1000) * rate;
}

// Kling AI — empirical token-based pricing (Apr 2026 console reading).
//
// Kling's actual billing unit is the "token", priced at:
//
//   $160 plan  /  293 tokens  =  $0.546 / token
//
// Empirical token consumption from the user's account log:
//
//   5 tokens → 5 clips    (1.00 tok/clip = $0.55/clip)
//   5 tokens → 4 clips    (1.25 tok/clip = $0.68/clip)
//   8 tokens → 5 clips    (1.60 tok/clip = $0.87/clip)
//   8 tokens → 4 clips    (2.00 tok/clip = $1.09/clip)
//
//   Average: 6.5 tokens / 4.5 clips = 1.44 tok/clip ≈ $0.79/clip
//
// Lip-Sync v1 charges +1 additional token per call = +$0.546.
//
// We keep the legacy `units × $0.126 = USD` shape so existing call sites
// don't change, but the v3-omni + lipsync per-second rates are tuned so
// the typical 5s call lands on the empirical token cost. Not perfectly
// linear in seconds (Kling charges in tokens, not seconds) but accurate
// for the 3-10s range our pipeline uses.
//
// Standard pack tiers (lower-tier models we no longer use as the default):
//   std × 1s × no audio = 0.6 units = $0.084 / sec
//   pro × 1s × no audio = 0.8 units = $0.112 / sec
//   4k                  = 3.0 units = $0.420 / sec
const KLING_UNIT_PRICE_USD = 0.126;
const KLING_UNITS_PER_SECOND: Record<string, number> = {
  i2v_std_no_audio: 0.6,
  i2v_std_with_audio: 0.8,
  i2v_pro_no_audio: 0.8,
  i2v_pro_with_audio: 1.0,
  i2v_pro_with_video_no_audio: 1.2,
  i2v_4k_with_audio: 3.0,
  i2v_4k_with_video_no_audio: 3.0,
  // v3-omni: 1.44 tokens × $0.546 = $0.7862 per typical clip.
  // For a 5s clip → rate = $0.7862 / 5 / $0.126 = 1.248 units/sec.
  i2v_v3_omni: 1.248,
  // Lip-Sync v1: 1 token × $0.546 = $0.546 per call.
  // For a 5s call → rate = $0.546 / 5 / $0.126 = 0.867 units/sec.
  lipsync: 0.867,
};
const KLING_FIXED_DURATION_5S: Record<string, number> = {
  i2v_std_5s_no_audio: KLING_UNITS_PER_SECOND.i2v_std_no_audio! * 5,
  i2v_std_5s_with_audio: KLING_UNITS_PER_SECOND.i2v_std_with_audio! * 5,
  i2v_pro_5s_no_audio: KLING_UNITS_PER_SECOND.i2v_pro_no_audio! * 5,
  i2v_pro_5s_with_audio: KLING_UNITS_PER_SECOND.i2v_pro_with_audio! * 5,
  i2v_v3_omni_5s: KLING_UNITS_PER_SECOND.i2v_v3_omni! * 5, // ~$0.79
  lipsync_5s: KLING_UNITS_PER_SECOND.lipsync! * 5, // ~$0.55
};
export function priceKling(operation: string, durationSeconds = 5): number {
  const units =
    KLING_FIXED_DURATION_5S[operation] ??
    (KLING_UNITS_PER_SECOND[operation] ?? 0) * durationSeconds;
  return units * KLING_UNIT_PRICE_USD;
}

// Pick the right pricing key for a given Kling model id. The effective
// rate depends on which model the request used, so the call sites pass
// the model_used returned by the API and let us route to the right cost.
export function klingPricingKeyForModel(modelId: string | undefined): string {
  if (!modelId) return 'i2v_std_5s_no_audio';
  if (/v3.?omni|video.?o1/i.test(modelId)) return 'i2v_v3_omni_5s';
  if (/4k/i.test(modelId)) return 'i2v_4k_with_audio';
  if (/pro/i.test(modelId)) return 'i2v_pro_5s_no_audio';
  return 'i2v_std_5s_no_audio';
}

// Creatomate — flat per-render fee for short videos. Their pricing model
// is per-credit; ~$0.05 covers a sub-60s 1080p export at our usage tier.
export function priceCreatomate(): number {
  return 0.05;
}

function stripVersionSuffix(model: string): string {
  // "gpt-5.4-mini-2026-03-17" → "gpt-5.4-mini"
  return model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
}
