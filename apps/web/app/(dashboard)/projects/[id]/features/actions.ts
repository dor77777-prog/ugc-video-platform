'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { findCategory } from '@/lib/categories';
import {
  isIntelligenceFresh,
  intelligenceSourceHash,
  extractIntelligenceSourceFields,
} from '@/lib/product-intelligence/source-hash';
import type { ProductFeature } from '@ugc-video/shared';

// V26.18 — persist the user's pick (LLM-suggested + custom additions)
// to Project.productData.selectedFeatures and route to the next
// wizard step. The script-gen pipeline reads selectedFeatures from
// productData and uses it as the FEATURE FOCUS anchor.

export async function saveFeaturesAction(
  projectId: string,
  features: ProductFeature[],
): Promise<{ ok: boolean; error?: string }> {
  const { dbUser } = await getOrCreateAppUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    select: { id: true, productData: true },
  });
  if (!project) {
    return { ok: false, error: 'project_not_found' };
  }

  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const merged = {
    ...data,
    selectedFeatures: features.map((f) => ({
      id: f.id,
      title: f.title.trim(),
      hook: f.hook.trim(),
      source: f.source,
    })),
  };

  await prisma.project.update({
    where: { id: project.id },
    data: { productData: merged as object },
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function continueToScriptsAction(
  projectId: string,
): Promise<void> {
  const { dbUser } = await getOrCreateAppUser();
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    select: { id: true, productName: true, productData: true },
  });
  if (!project) return;

  // V27.11.PR6 — second-chance Product Intelligence prebuild.
  //
  // The first prebuild ran during createProjectAction (step 1) with
  // the form data the user submitted. Between step 1 and here the
  // user may have edited features (step 3) or any other intelligence
  // input via /edit. This trigger is the LAST authoritative point
  // before the user lands on the scripts step where intelligence is
  // consumed — so we reconcile here.
  //
  // Hash check ensures we don't double-build when nothing changed:
  // - Step 1 prebuild persisted intelligence with sourceHash X.
  // - User does NOT edit anything → currentHash == X → isFresh
  //   returns true → after() block skips the rebuild.
  // - User edits description/features/category → currentHash != X
  //   → after() rebuilds with the corrected data and persists.
  //
  // Either way the redirect to /scripts happens immediately. The
  // build runs in background. By the time the user clicks "צור 6
  // כיוונים" on step 4, intelligence is fresh.
  //
  // Errors are non-fatal — concept-actions.ts has the same lazy
  // fallback that catches any miss.
  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const cachedIntel = (data.intelligence ?? null) as
    | import('@/lib/product-intelligence').ProductIntelligence
    | null;
  const currentHash = intelligenceSourceHash(
    extractIntelligenceSourceFields({
      productName: project.productName ?? 'מוצר ללא שם',
      productData: data,
    }),
  );
  const isFresh = isIntelligenceFresh({
    intelligence: cachedIntel,
    currentHash,
  });
  if (!isFresh) {
    const projectId_ = project.id;
    const productName = project.productName ?? 'מוצר ללא שם';
    const description = typeof data.description === 'string' ? data.description : '';
    const brand = typeof data.brand === 'string' ? data.brand : null;
    const features = Array.isArray(data.selectedFeatures)
      ? (data.selectedFeatures as Array<{ title?: string }>)
          .map((f) => (typeof f.title === 'string' ? f.title : ''))
          .filter((s) => s.length > 0)
      : [];
    const price = typeof data.price === 'string' ? data.price : null;
    const currency = typeof data.currency === 'string' ? data.currency : null;
    const sourceUrl = typeof data.sourceUrl === 'string' ? data.sourceUrl : null;
    const userNotes = typeof data.userNotes === 'string' ? data.userNotes : null;
    const categoryId = typeof data.category === 'string' ? data.category : null;
    const productCategory = findCategory(categoryId);
    const heroImageUrl = typeof data.heroImageUrl === 'string' ? data.heroImageUrl : null;

    after(async () => {
      try {
        console.log(
          `[after] features→scripts intelligence rebuild for project ${projectId_} (cached=${cachedIntel?.sourceHash?.slice(0, 8) ?? 'none'} → current=${currentHash.slice(0, 8)})`,
        );
        const startedAt = Date.now();
        const { buildProductIntelligence } = await import('@/lib/product-intelligence');
        const built = await buildProductIntelligence({
          productName,
          description,
          brand,
          features,
          price,
          currency,
          sourceUrl,
          userNotes,
          categoryGuess: productCategory?.labelEnglish ?? categoryId ?? null,
          heroImageUrl,
        });
        const fresh = await prisma.project.findUnique({
          where: { id: projectId_ },
          select: { productData: true },
        });
        const merged = {
          ...((fresh?.productData as Record<string, unknown>) ?? {}),
          intelligence: built.intelligence,
        };
        await prisma.project.update({
          where: { id: projectId_ },
          data: { productData: merged as object },
        });
        console.log(
          `[after] features→scripts intelligence rebuild for project ${projectId_} done in ${Date.now() - startedAt}ms`,
        );
      } catch (err) {
        console.error(
          `[after] features→scripts intelligence rebuild for project ${projectId_} failed:`,
          (err as Error).message,
        );
      }
    });
  }

  redirect(`/projects/${projectId}/scripts`);
}
