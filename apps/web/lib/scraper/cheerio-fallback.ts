import type { CheerioAPI } from 'cheerio';

export interface CheerioFallback {
  title?: string;
  description?: string;
  images: string[];
  price?: string;
  currency?: string;
}

// Last-resort extraction from raw HTML when no structured data is found.
export function extractCheerioFallback($: CheerioAPI, baseUrl: string): CheerioFallback {
  const title = ($('h1').first().text().trim() ||
    $('title').text().trim() ||
    undefined) as string | undefined;

  // Pick the largest meaningful paragraph.
  let description: string | undefined;
  $('meta[name="description"]').each((_, el) => {
    description = $(el).attr('content')?.trim();
  });
  if (!description) {
    let longest = '';
    $('p').each((_, el) => {
      const t = $(el).text().trim();
      if (t.length > longest.length && t.length < 1500) longest = t;
    });
    if (longest.length > 50) description = longest;
  }

  // Images: collect <img src> > 200px hint, then resolve to absolute.
  const images: string[] = [];
  $('img').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src');
    if (!src) return;
    if (/(sprite|icon|logo|avatar|loader|spinner|placeholder|pixel|tracking)/i.test(src)) return;
    const w = parseInt($el.attr('width') ?? '0', 10);
    if (w && w < 200) return;
    const absolute = toAbsoluteUrl(src, baseUrl);
    if (absolute) images.push(absolute);
  });

  // Price + currency from visible text near a CTA-ish button.
  const priceMatch = findPriceInText($('body').text());

  return {
    title,
    description,
    images: dedupe(images).slice(0, 20),
    price: priceMatch?.amount,
    currency: priceMatch?.currency,
  };
}

function findPriceInText(text: string): { amount: string; currency?: string } | undefined {
  // Match common currency formats: $19.99, ₪199, 199 ₪, 199 ש"ח, 19.99 USD
  const patterns: { re: RegExp; cur?: string }[] = [
    { re: /\$\s*(\d{1,5}(?:[.,]\d{2})?)/, cur: 'USD' },
    { re: /€\s*(\d{1,5}(?:[.,]\d{2})?)/, cur: 'EUR' },
    { re: /£\s*(\d{1,5}(?:[.,]\d{2})?)/, cur: 'GBP' },
    { re: /₪\s*(\d{1,5}(?:[.,]\d{2})?)/, cur: 'ILS' },
    { re: /(\d{1,5}(?:[.,]\d{2})?)\s*₪/, cur: 'ILS' },
    { re: /(\d{1,5}(?:[.,]\d{2})?)\s*ש["׳']?ח/, cur: 'ILS' },
  ];
  for (const { re, cur } of patterns) {
    const m = text.match(re);
    if (m) return { amount: m[1]!.replace(',', '.'), currency: cur };
  }
  return undefined;
}

function toAbsoluteUrl(src: string, base: string): string | undefined {
  try {
    return new URL(src, base).toString();
  } catch {
    return undefined;
  }
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
