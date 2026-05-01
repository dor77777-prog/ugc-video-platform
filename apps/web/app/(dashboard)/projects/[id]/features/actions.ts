'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
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
    select: { id: true },
  });
  if (!project) return;
  redirect(`/projects/${projectId}/scripts`);
}
