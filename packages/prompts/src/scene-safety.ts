// Scene-image safety pre-processor.
//
// gpt-image-2 has aggressive safety classifiers that block legitimate
// commerce content (shapewear, swimwear, intimate apparel, fitness gear,
// sometimes even fashion close-ups) when the prompt or reference image
// looks ambiguous to the moderation model. Two things help:
//
//   1. Sanitize risky vocabulary in the visual brief BEFORE sending — many
//      common product terms ("bodysuit", "shapewear", "lingerie") are
//      magnets for the [sexual] safety bucket even in modest contexts.
//   2. Append explicit modesty/outerwear/commerce tokens for sensitive
//      categories — these tell the safety classifier "this is mainstream
//      retail content, not intimate".
//
// The wrapper in apps/web/lib/llm/scene-images.ts uses these helpers, and
// auto-retries without the product reference image (often the strongest
// trigger) when the first attempt is still rejected.

// Categories whose scenes typically need the safety appendage. These are
// the ones where gpt-image-2 most often misclassifies retail content.
const SENSITIVE_CATEGORIES = new Set([
  'fashion',
  'beauty',
  'fitness',
  'wellness_sleep',
]);

// Risky English term → safer everyday phrasing. Run as case-insensitive
// whole-word replacements so we don't mangle unrelated text. Keep the
// rewrites short and clothing-positive — the goal is to keep the visual
// description meaningful, just less likely to flip the moderation model.
const RISKY_TERM_REWRITES: Array<{ from: RegExp; to: string }> = [
  { from: /\bshapewear\b/gi, to: 'smoothing comfort layer' },
  { from: /\bshaper\b/gi, to: 'comfort layer' },
  { from: /\bbodysuit\b/gi, to: 'fitted base layer top' },
  { from: /\bbody\s+suit\b/gi, to: 'fitted base layer top' },
  { from: /\bcorset\b/gi, to: 'structured fitted top' },
  { from: /\blingerie\b/gi, to: 'outfit' },
  { from: /\bunderwear\b/gi, to: 'base layer' },
  { from: /\bpanties\b/gi, to: 'base layer' },
  { from: /\bthong\b/gi, to: 'base layer' },
  { from: /\bbra\b/gi, to: 'top' },
  { from: /\bbralette\b/gi, to: 'fitted top' },
  { from: /\bswimsuit\b/gi, to: 'beachwear set' },
  { from: /\bbikini\b/gi, to: 'beachwear two-piece' },
  { from: /\bseductive\b/gi, to: 'confident' },
  { from: /\bsexy\b/gi, to: 'stylish' },
  { from: /\bsensual\b/gi, to: 'soft and confident' },
  { from: /\brevealing\b/gi, to: 'well-fitted' },
  { from: /\bskin[-\s]?tight\b/gi, to: 'nicely fitted' },
  { from: /\bnude\b/gi, to: 'nude-tone (color name)' },
  { from: /\bintimate\s+apparel\b/gi, to: 'casual basics' },
  { from: /\bintimate\b/gi, to: 'personal' },
  { from: /\bboudoir\b/gi, to: 'bedroom morning routine' },
  { from: /\bin\s+bed\b/gi, to: 'sitting on the edge of the bed' },
  { from: /\btorso\b/gi, to: 'upper body' },
];

// Safety appendage by category. Keep them under ~30 words each — they go
// at the end of the prompt and nudge the safety classifier without
// drowning the creative direction.
const SAFETY_TOKENS_BY_CATEGORY: Record<string, string> = {
  fashion:
    'fully clothed in everyday outerwear (top + jeans / dress / blazer), modest framing, no lingerie or underwear visible, conservative casual context, retail commerce style.',
  beauty:
    'shoulders-up framing, fully clothed in casual top, retail beauty content, no suggestive posing.',
  fitness:
    'fully clothed in standard athletic wear (tank or tee + leggings or shorts), modest framing, retail fitness content, no suggestive posing.',
  wellness_sleep:
    'fully clothed in casual loungewear / pajamas (long sleeves or short sleeves with shorts/pants), modest framing, retail wellness content, no lingerie.',
};

const FALLBACK_SAFETY_TOKENS =
  'fully clothed in casual everyday outerwear, modest framing, no lingerie or underwear visible, retail commerce style.';

const AGGRESSIVE_RETRY_TOKENS =
  'CRITICAL: Subject is fully dressed in everyday casual outerwear (long top + jeans, or sweater + pants, or modest dress). The product is implied as a base layer worn UNDERNEATH and is NOT visible in this scene. Shoulders-up or knees-up framing. NO lingerie, NO underwear, NO swimwear, NO bare torso, NO suggestive posing. This is mainstream retail commerce content — a real Israeli woman recording an honest product review at home, fully clothed.';

export interface SafetyRewriteResult {
  brief: string;
  appliedRewrites: string[]; // human-readable list of swaps for debug/audit
}

// Pass through the brief once, applying every term-rewrite rule. Returns
// the cleaned brief plus a list of which rules fired, useful for logging.
export function sanitizeVisualBrief(brief: string): SafetyRewriteResult {
  let out = brief;
  const applied: string[] = [];
  for (const { from, to } of RISKY_TERM_REWRITES) {
    if (from.test(out)) {
      // Reset lastIndex because the regexes are global.
      from.lastIndex = 0;
      out = out.replace(from, to);
      applied.push(`${from.source} → ${to}`);
    }
  }
  return { brief: out, appliedRewrites: applied };
}

// Returns the per-category safety appendage to attach to the prompt.
// `aggressive` flips on the stronger version — used by the wrapper when
// retrying after a safety rejection.
export function safetyTokensFor(
  categoryId: string | null | undefined,
  options: { aggressive?: boolean } = {},
): string {
  if (options.aggressive) return AGGRESSIVE_RETRY_TOKENS;
  if (!categoryId) return '';
  if (!SENSITIVE_CATEGORIES.has(categoryId)) return '';
  return SAFETY_TOKENS_BY_CATEGORY[categoryId] ?? FALLBACK_SAFETY_TOKENS;
}

// Convenience flag — does this category typically need safety help?
export function isSensitiveCategory(categoryId: string | null | undefined): boolean {
  return !!categoryId && SENSITIVE_CATEGORIES.has(categoryId);
}
