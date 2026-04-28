'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';

// Permanently delete a project owned by the current user. Cascades
// (Prisma onDelete: Cascade) handle scripts → scenes, render jobs,
// assets. Storage files (uploads) are NOT removed in this version —
// they're cheap and may still be referenced by historical billing
// records. Add an optional storage-cleanup pass when we move off the
// local fs storage.
export async function deleteProjectAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { dbUser } = await getOrCreateAppUser();
  const projectId = String(formData.get('projectId') ?? '');
  if (!projectId) return { ok: false, error: 'missing project id' };

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    select: { id: true },
  });
  if (!project) return { ok: false, error: 'project not found or not yours' };

  await prisma.project.delete({ where: { id: project.id } });
  revalidatePath('/dashboard');
  revalidatePath('/library');
  return { ok: true };
}
