'use server';

import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { z } from 'zod';
import { ProjectStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { findCategory } from '@/lib/categories';

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
  // Both default OFF — bg music library hasn't been curated and the
  // Hebrew RTL caption styling isn't production-ready. Wizard form
  // mirrors these defaults. Will flip to true once both are fixed.
  backgroundMusic: z.boolean().default(false),
  captions: z.boolean().default(false),
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

  // V27.11.PR6 — eager Product Intelligence prebuild via Next.js
  // unstable_after. Runs AFTER the redirect response is sent to the
  // user, so step 1 → step 2 navigation is unaffected. By the time
  // the user reaches step 4 (concepts) — typically 30-180s of
  // avatar+features picking later — intelligence is already cached
  // in productData.intelligence.
  //
  // Quality safeguard: the persisted intelligence carries a
  // sourceHash of the input fields (description / features /
  // brand / category / heroImageUrl). If the user edits any of
  // those between step 1 and step 4, concept-actions.ts detects
  // the hash mismatch via isIntelligenceFresh() and rebuilds
  // lazily — so eager prebuild never serves stale intelligence
  // to the script engine.
  //
  // Errors are non-fatal: the lazy fallback in concept-actions
  // catches any failure here. We log loudly so production
  // observability can surface chronic failures.
  const projectId = project.id;
  const productCategory = findCategory(d.category);
  after(async () => {
    try {
      console.log(`[after] eager intelligence prebuild starting for project ${projectId}`);
      const startedAt = Date.now();
      const { buildProductIntelligence } = await import('@/lib/product-intelligence');
      const built = await buildProductIntelligence({
        productName: d.productName,
        description: d.description ?? null,
        brand: d.brand ?? null,
        features: [],
        price: null,
        currency: null,
        sourceUrl: d.productUrl || null,
        userNotes: null,
        categoryGuess: productCategory?.labelEnglish ?? d.category ?? null,
        heroImageUrl: d.heroImageUrl || null,
      });

      // Re-read productData so a concurrent user edit isn't clobbered.
      const fresh = await prisma.project.findUnique({
        where: { id: projectId },
        select: { productData: true },
      });
      const merged = {
        ...((fresh?.productData as Record<string, unknown>) ?? {}),
        intelligence: built.intelligence,
      };
      await prisma.project.update({
        where: { id: projectId },
        data: { productData: merged as object },
      });
      console.log(
        `[after] intelligence prebuild for project ${projectId} done in ${Date.now() - startedAt}ms`,
      );
    } catch (err) {
      console.error(
        `[after] eager intelligence prebuild for project ${projectId} failed:`,
        (err as Error).message,
      );
      // Lazy fallback in concept-actions will rebuild on next
      // generateConceptsAction call.
    }
  });

  redirect(`/projects/${projectId}/avatar`);
}
