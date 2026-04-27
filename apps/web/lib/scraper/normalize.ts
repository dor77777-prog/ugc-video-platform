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

  const description = cleanDescription(
    input.shopify?.description ??
      input.jsonLd?.description ??
      input.og.description ??
      input.fallback.description ??
      '',
  );

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
    features: input.jsonLd?.features ?? [],
    images,
    heroImageUrl,
    sourcePlatform: platform,
    sourceUrl: input.url,
  };
}

function cleanDescription(s: string): string {
  // Strip excessive whitespace and HTML entities artifacts.
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
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
