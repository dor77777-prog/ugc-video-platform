import type { CheerioAPI } from 'cheerio';

export interface JsonLdProduct {
  name?: string;
  description?: string;
  price?: string;
  compareAtPrice?: string;
  currency?: string;
  brand?: string;
  sku?: string;
  images: string[];
  features: string[];
}

// Extract Product from JSON-LD blocks. Handles:
// - direct {@type: "Product"}
// - arrays of objects
// - {@graph: [...]}
// - @type as string or array of strings
export function extractJsonLd($: CheerioAPI): JsonLdProduct | null {
  const products: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    collectProducts(parsed, products);
  });

  if (products.length === 0) return null;
  return normalize(products[0]!);
}

function collectProducts(node: unknown, out: Record<string, unknown>[]) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectProducts(item, out);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;

  const type = obj['@type'];
  const types = Array.isArray(type) ? type : type ? [type] : [];
  if (types.some((t) => typeof t === 'string' && t.toLowerCase().includes('product'))) {
    out.push(obj);
  }

  // Recurse into @graph and other nested arrays.
  if (Array.isArray(obj['@graph'])) {
    collectProducts(obj['@graph'], out);
  }
}

function normalize(p: Record<string, unknown>): JsonLdProduct {
  const offer = pickOffer(p['offers']);
  return {
    name: asString(p['name']),
    description: asString(p['description']),
    price: offer ? asString(offer['price']) ?? asString(offer['lowPrice']) : undefined,
    compareAtPrice: offer ? asString(offer['highPrice']) : undefined,
    currency: offer ? asString(offer['priceCurrency']) : undefined,
    brand: extractBrand(p['brand']),
    sku: asString(p['sku']),
    images: extractImages(p['image']),
    features: extractFeatures(p),
  };
}

function pickOffer(offers: unknown): Record<string, unknown> | null {
  if (!offers) return null;
  if (Array.isArray(offers)) return (offers[0] as Record<string, unknown>) ?? null;
  if (typeof offers === 'object') return offers as Record<string, unknown>;
  return null;
}

function extractBrand(brand: unknown): string | undefined {
  if (!brand) return undefined;
  if (typeof brand === 'string') return brand;
  if (typeof brand === 'object' && brand !== null) {
    const name = (brand as Record<string, unknown>)['name'];
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
}

function extractImages(image: unknown): string[] {
  if (!image) return [];
  if (typeof image === 'string') return [image];
  if (Array.isArray(image)) {
    return image
      .map((i) => (typeof i === 'string' ? i : (i as Record<string, unknown>)?.['url']))
      .filter((u): u is string => typeof u === 'string');
  }
  if (typeof image === 'object') {
    const url = (image as Record<string, unknown>)['url'];
    return typeof url === 'string' ? [url] : [];
  }
  return [];
}

function extractFeatures(p: Record<string, unknown>): string[] {
  // Some sites use additionalProperty or feature for highlights.
  const feature = p['feature'];
  if (Array.isArray(feature)) return feature.filter((f): f is string => typeof f === 'string');
  if (typeof feature === 'string') return [feature];
  return [];
}

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}
