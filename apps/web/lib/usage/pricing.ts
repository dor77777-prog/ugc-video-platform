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

// ElevenLabs — pricing is by characters synthesized for most plans, but the
// Pay-as-you-go API costs roughly $0.30 per 1k characters at standard models.
// Refine when the actual key tier is known.
export function priceElevenLabsTts(charCount: number): number {
  return (charCount / 1000) * 0.3;
}

function stripVersionSuffix(model: string): string {
  // "gpt-5.4-mini-2026-03-17" → "gpt-5.4-mini"
  return model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
}
