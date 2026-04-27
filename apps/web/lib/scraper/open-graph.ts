import type { CheerioAPI } from 'cheerio';

export interface OgData {
  type?: string;
  title?: string;
  description?: string;
  image?: string;
  images: string[];
  price?: string;
  currency?: string;
  siteName?: string;
}

export function extractOpenGraph($: CheerioAPI): OgData {
  const get = (prop: string) => $(`meta[property="${prop}"]`).attr('content')?.trim();
  const getName = (name: string) => $(`meta[name="${name}"]`).attr('content')?.trim();

  const images: string[] = [];
  $('meta[property="og:image"], meta[property="og:image:url"], meta[property="og:image:secure_url"]').each((_, el) => {
    const c = $(el).attr('content')?.trim();
    if (c) images.push(c);
  });

  return {
    type: get('og:type'),
    title: get('og:title'),
    description: get('og:description') ?? getName('description'),
    image: get('og:image'),
    images: dedupe(images),
    price: get('product:price:amount') ?? get('og:price:amount'),
    currency: get('product:price:currency') ?? get('og:price:currency'),
    siteName: get('og:site_name'),
  };
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
