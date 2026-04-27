export type SourcePlatform = 'shopify' | 'woocommerce' | 'generic' | 'unknown';

// Signals we collect from a page. Each contributes to confidence that the page
// is a real product page.
export type Signal =
  | 'json_ld_product'
  | 'og_product'
  | 'microdata_product'
  | 'product_meta_tags'
  | 'cta_button'
  | 'price_visible'
  | 'shopify_json_endpoint'
  | 'woocommerce_class';

export interface ScrapeData {
  productName: string;
  description: string;
  price?: string;
  compareAtPrice?: string;
  currency?: string;
  brand?: string;
  features: string[];
  images: string[];
  heroImageUrl?: string;
  sourcePlatform: SourcePlatform;
  sourceUrl: string;
}

export interface ScrapeResult {
  isProduct: boolean;
  confidence: number;
  signals: Signal[];
  data: ScrapeData;
  warnings: string[];
}
