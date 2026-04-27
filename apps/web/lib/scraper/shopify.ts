import { safeFetch } from './fetch';

export interface ShopifyProduct {
  name?: string;
  description?: string;
  price?: string;
  compareAtPrice?: string;
  currency?: string;
  vendor?: string;
  images: string[];
}

// If the page is on Shopify and has /products/{handle} in the path, fetch the
// {handle}.js endpoint for perfect structured data.
export async function tryShopifyJsonEndpoint(
  pageUrl: string,
  pageHtml: string,
): Promise<ShopifyProduct | null> {
  const looksLikeShopify =
    pageHtml.includes('Shopify.shop') ||
    pageHtml.includes('cdn.shopify.com') ||
    pageHtml.includes('Shopify.routes') ||
    pageHtml.includes('window.Shopify');
  if (!looksLikeShopify) return null;

  let u: URL;
  try {
    u = new URL(pageUrl);
  } catch {
    return null;
  }
  const m = u.pathname.match(/^\/products\/([^/?]+)/);
  if (!m) return null;
  const handle = m[1];
  const jsonUrl = `${u.origin}/products/${handle}.js`;

  let body: string;
  try {
    const result = await safeFetch(jsonUrl);
    body = result.body;
  } catch {
    return null;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }

  const priceCents = data['price'];
  const compareCents = data['compare_at_price'];
  const currency = data['currency'] ?? extractCurrencyFromHtml(pageHtml);

  const rawImages = (data['images'] as unknown[] | undefined) ?? [];
  const images = rawImages
    .filter((i): i is string => typeof i === 'string')
    .map((i) => (i.startsWith('http') ? i : `https:${i}`));

  return {
    name: typeof data['title'] === 'string' ? data['title'] : undefined,
    description: typeof data['description'] === 'string' ? stripHtml(data['description']) : undefined,
    price: typeof priceCents === 'number' ? (priceCents / 100).toFixed(2) : undefined,
    compareAtPrice:
      typeof compareCents === 'number' ? (compareCents / 100).toFixed(2) : undefined,
    currency: typeof currency === 'string' ? currency : undefined,
    vendor: typeof data['vendor'] === 'string' ? data['vendor'] : undefined,
    images,
  };
}

function extractCurrencyFromHtml(html: string): string | undefined {
  const m = html.match(/"currency"\s*:\s*"([A-Z]{3})"/);
  return m?.[1];
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
