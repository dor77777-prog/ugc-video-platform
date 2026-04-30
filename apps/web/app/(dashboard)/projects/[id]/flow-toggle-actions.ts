'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';

export type FlowToggleKey = 'captions' | 'backgroundMusic';

const ALLOWED_KEYS: ReadonlySet<FlowToggleKey> = new Set([
  'captions',
  'backgroundMusic',
]);

// Live toggle for productData.captions / productData.backgroundMusic.
// Wired to the flow toggle bar that renders in the project layout, so
// the user can flip captions/music on or off from any wizard step right
// up to final render. The render-processor reads productData on each
// render-job pickup, so any flip before the user hits "render final"
// takes effect.
export async function setProjectFlowToggle(
  projectId: string,
  key: FlowToggleKey,
  value: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ALLOWED_KEYS.has(key)) {
    return { ok: false, error: 'invalid_key' };
  }
  if (typeof value !== 'boolean') {
    return { ok: false, error: 'invalid_value' };
  }

  const { dbUser } = await getOrCreateAppUser();
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    select: { id: true, productData: true },
  });
  if (!project) {
    return { ok: false, error: 'not_found' };
  }

  const current =
    (project.productData as Record<string, unknown> | null) ?? {};
  const next = { ...current, [key]: value };

  await prisma.project.update({
    where: { id: project.id },
    data: { productData: next as never },
  });

  revalidatePath(`/projects/${projectId}`, 'layout');
  return { ok: true };
}
