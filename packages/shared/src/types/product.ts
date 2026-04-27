export type SourcePlatform = 'shopify' | 'woocommerce' | 'generic' | 'manual';

export interface ProductData {
  productName: string;
  description: string;
  price?: string;
  compareAtPrice?: string;
  currency?: string;
  images: string[];
  features: string[];
  sourcePlatform: SourcePlatform;
  sourceUrl?: string;
}
