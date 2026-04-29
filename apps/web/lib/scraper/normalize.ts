import type { ScrapeData, Signal, SourcePlatform } from './types';
import type { JsonLdProduct } from './json-ld';
import type { OgData } from './open-graph';
import type { ShopifyProduct } from './shopify';
import type { CheerioFallback } from './cheerio-fallback';

interface CombineInput {
  url: string;
  jsonLd: JsonLdProduct | null;
  og: OgData;
  shopify: ShopifyProduct | null;
  fallback: CheerioFallback;
  signals: Signal[];
}

// Combine all sources into a single ScrapeData. Priority order:
// 1. Shopify JSON endpoint (richest, most accurate)
// 2. JSON-LD Product
// 3. OpenGraph
// 4. Cheerio fallback (HTML scraping)
export function combine(input: CombineInput): ScrapeData {
  const platform: SourcePlatform = input.shopify
    ? 'shopify'
    : input.signals.includes('woocommerce_class')
      ? 'woocommerce'
      : input.jsonLd || input.og.type === 'product'
        ? 'generic'
        : 'unknown';

  const productName =
    input.shopify?.name ??
    input.jsonLd?.name ??
    input.og.title ??
    input.fallback.title ??
    '';

  // Pick the RICHEST description across all sources (not the first
  // one). Why: Shopify's `/products/<handle>.json` and JSON-LD often
  // expose only the merchant's short admin description (one
  // sentence), even when the actual product page has 5-10x more text
  // in a rich-text body block that the cheerio fallback captures.
  // The previous "first non-empty source wins" rule throttled us to
  // the meta-style snippet and starved the V11 LLM dossier downstream.
  //
  // Strategy: clean each candidate, drop CSS/JS garbage and tiny
  // strings, then sort by length and take the longest. Ties break on
  // declared order (Shopify > JSON-LD > OG > body) so when two
  // sources have the same length the more "official" one wins.
  const rawCandidates: Array<{ src: string; text: string }> = [
    { src: 'shopify', text: input.shopify?.description ?? '' },
    { src: 'jsonLd', text: input.jsonLd?.description ?? '' },
    { src: 'og', text: input.og.description ?? '' },
    { src: 'fallback', text: input.fallback.description ?? '' },
  ];
  const cleanedCandidates = rawCandidates
    .map((c, i) => ({
      src: c.src,
      order: i,
      text: cleanDescription(c.text),
    }))
    .filter((c) => c.text.length >= 30 && !looksLikeCssOrJsGarbage(c.text));
  cleanedCandidates.sort((a, b) => {
    if (b.text.length !== a.text.length) return b.text.length - a.text.length;
    return a.order - b.order;
  });
  let description = cleanedCandidates[0]?.text ?? '';
  // If the winning candidate is the cheerio body (`fallback`) AND a
  // shorter "official" description (Shopify/JSON-LD) also exists,
  // PREPEND the official one — it's usually the merchant's curated
  // hook line, and pairing it with the rich body gives the dossier
  // both the headline + the depth.
  if (description && cleanedCandidates[0]?.src === 'fallback') {
    const official = cleanedCandidates.find(
      (c) => (c.src === 'shopify' || c.src === 'jsonLd') && c.text.length < description.length,
    );
    if (official && !description.toLowerCase().includes(official.text.slice(0, 60).toLowerCase())) {
      description = official.text + '\n\n' + description;
    }
  }

  const price =
    input.shopify?.price ?? input.jsonLd?.price ?? input.og.price ?? input.fallback.price;

  const compareAtPrice = input.shopify?.compareAtPrice ?? input.jsonLd?.compareAtPrice;

  const currency =
    input.shopify?.currency ?? input.jsonLd?.currency ?? input.og.currency ?? input.fallback.currency;

  const brand = input.shopify?.vendor ?? input.jsonLd?.brand;

  const images = pickImages(input);
  const heroImageUrl = images[0];

  return {
    productName: productName.trim(),
    description: description.trim(),
    price,
    compareAtPrice,
    currency,
    brand,
    // Features can come from JSON-LD (best, structured) OR from the
    // cheerio fallback's bullet-list extraction (the typical
    // <ul><li>...</li></ul> in a product description block). When
    // both are present we prefer JSON-LD but append unique cheerio
    // entries — sites often duplicate features in both places.
    features: mergeFeatures(input.jsonLd?.features ?? [], input.fallback.features ?? []),
    images,
    heroImageUrl,
    sourcePlatform: platform,
    sourceUrl: input.url,
  };
}

function cleanDescription(s: string): string {
  // CRITICAL: strip <style>...</style> and <script>...</script> blocks
  // ENTIRELY before doing the simple tag strip. The previous
  // /<[^>]+>/g pattern only matched the open/close tags and left the
  // CSS/JS content as plain text — which then poisoned the LLM
  // downstream with rules like ".product { color: red; padding: 20px }".
  // Many Shopify / JSON-LD product descriptions inline a <style>
  // block at the top of the description field, so this fix is
  // load-bearing.
  return s
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
}

// Detect when a "description" is actually CSS/JS leakage. Triggers a
// fallback to the next-best source. Patterns we look for:
//   - high density of CSS-rule punctuation (`{`, `}`, `;`, `:`)
//   - common CSS keywords AT WORD BOUNDARIES (`color:`, `background-`,
//     `padding:`, `font-family:`, etc.)
//   - JS function/var keywords
// If the cleaned text contains any of those AND the share of CSS
// punctuation chars is unusually high vs. natural language, reject it.
export function looksLikeCssOrJsGarbage(s: string): boolean {
  if (!s) return true;
  const len = s.length;
  if (len < 8) return false;
  // Count CSS-rule punctuation. Natural Hebrew/English copy almost
  // never has more than a couple of these per ~100 chars.
  let punct = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{' || c === '}' || c === ';') punct++;
  }
  const density = punct / len;
  if (density > 0.04) return true;
  // CSS-rule patterns (property: value; or selector { ... }).
  if (/\s(color|background|font-family|font-size|padding|margin|display|position|width|height|line-height|border|opacity|z-index|flex|grid|transition|transform|box-shadow)\s*:/i.test(
    s,
  )) {
    return true;
  }
  if (/\.[a-z][\w-]*\s*\{/.test(s)) return true;
  if (/#[a-z][\w-]*\s*\{/.test(s)) return true;
  if (/@(media|keyframes|font-face|import)\b/i.test(s)) return true;
  // JS function/var blocks.
  if (/\bfunction\s*\(/i.test(s) && /\}\s*$/.test(s)) return true;
  if (/\bvar\s+\w+\s*=/.test(s) && /\;\s*\w/.test(s)) return true;
  return false;
}

function pickImages(input: CombineInput): string[] {
  // Prefer Shopify > JSON-LD > OG > fallback. Dedupe + cap at 12.
  const ordered: string[] = [];
  if (input.shopify) ordered.push(...input.shopify.images);
  if (input.jsonLd) ordered.push(...input.jsonLd.images);
  ordered.push(...input.og.images);
  ordered.push(...input.fallback.images);
  return dedupe(ordered).slice(0, 12);
}

function mergeFeatures(primary: string[], secondary: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of [primary, secondary]) {
    for (const f of list) {
      const norm = f.trim();
      if (!norm) continue;
      const key = norm.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(norm);
    }
  }
  return out.slice(0, 25);
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (!x) continue;
    const norm = x.split('?')[0]; // dedupe ignoring query strings
    if (seen.has(norm!)) continue;
    seen.add(norm!);
    out.push(x);
  }
  return out;
}

const SIGNAL_WEIGHTS: Record<Signal, number> = {
  shopify_json_endpoint: 60,
  json_ld_product: 50,
  microdata_product: 30,
  og_product: 25,
  product_meta_tags: 20,
  cta_button: 20,
  woocommerce_class: 30,
  price_visible: 15,
};

export function scoreConfidence(signals: Signal[]): {
  isProduct: boolean;
  confidence: number;
} {
  let score = 0;
  for (const s of signals) score += SIGNAL_WEIGHTS[s] ?? 0;
  const confidence = Math.min(score / 100, 1);
  return { isProduct: confidence >= 0.3, confidence: Number(confidence.toFixed(2)) };
}
