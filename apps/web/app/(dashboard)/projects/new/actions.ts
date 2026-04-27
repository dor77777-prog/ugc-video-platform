'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';

const inputSchema = z.object({
  productUrl: z.string().url().optional().or(z.literal('')),
  productName: z.string().min(1, 'נדרש שם מוצר'),
  brand: z.string().optional(),
  targetAudience: z.string().optional(),
  description: z.string().min(1, 'נדרש תיאור'),
  heroImageUrl: z.string().url().optional().or(z.literal('')),
  additionalImages: z.array(z.string().url()).default([]),
  aspectRatio: z.enum(['9:16', '1:1', '16:9']).default('9:16'),
  durationSeconds: z.coerce.number().int().min(5).max(120).default(15),
  backgroundMusic: z.boolean().default(true),
  captions: z.boolean().default(true),
  category: z.string().default('other'),
  // Raw scraper output preserved verbatim for audit / regeneration.
  rawScrape: z.unknown().optional(),
});

export type CreateProjectState =
  | { error?: string; fieldErrors?: Record<string, string[]> }
  | undefined;

export async function createProjectAction(
  _prev: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const { dbUser } = await getOrCreateAppUser();

  const additionalImages = formData
    .getAll('additionalImages')
    .map((v) => String(v))
    .filter((v) => v.length > 0);

  const raw = {
    productUrl: String(formData.get('productUrl') ?? ''),
    productName: String(formData.get('productName') ?? '').trim(),
    brand: String(formData.get('brand') ?? '').trim() || undefined,
    targetAudience: String(formData.get('targetAudience') ?? '').trim() || undefined,
    description: String(formData.get('description') ?? '').trim(),
    heroImageUrl: String(formData.get('heroImageUrl') ?? ''),
    additionalImages,
    aspectRatio: String(formData.get('aspectRatio') ?? '9:16'),
    durationSeconds: String(formData.get('durationSeconds') ?? '15'),
    backgroundMusic: formData.get('backgroundMusic') === 'on',
    captions: formData.get('captions') === 'on',
    category: String(formData.get('category') ?? 'other'),
    rawScrape: formData.get('rawScrape')
      ? JSON.parse(String(formData.get('rawScrape')))
      : undefined,
  };

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const d = parsed.data;
  const project = await prisma.project.create({
    data: {
      userId: dbUser.id,
      productUrl: d.productUrl || null,
      productName: d.productName,
      status: ProjectStatus.product_extracted,
      productData: {
        brand: d.brand,
        targetAudience: d.targetAudience,
        description: d.description,
        heroImageUrl: d.heroImageUrl || null,
        additionalImages: d.additionalImages,
        aspectRatio: d.aspectRatio,
        durationSeconds: d.durationSeconds,
        backgroundMusic: d.backgroundMusic,
        captions: d.captions,
        category: d.category,
        rawScrape: d.rawScrape ?? null,
      },
    },
  });

  redirect(`/projects/${project.id}/avatar`);
}
