import { z } from 'zod';

export const productDataSchema = z.object({
  productName: z.string().min(1),
  description: z.string().default(''),
  price: z.string().optional(),
  compareAtPrice: z.string().optional(),
  currency: z.string().optional(),
  images: z.array(z.string().url()).default([]),
  features: z.array(z.string()).default([]),
  sourcePlatform: z.enum(['shopify', 'woocommerce', 'generic', 'manual']),
  sourceUrl: z.string().url().optional(),
});

export type ProductDataParsed = z.infer<typeof productDataSchema>;
