'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { findAvatar } from '@/lib/avatars/catalog';

export async function selectAvatarAction(formData: FormData) {
  const { dbUser } = await getOrCreateAppUser();
  const projectId = String(formData.get('projectId') ?? '');
  const avatarId = String(formData.get('avatarId') ?? '');
  if (!projectId || !avatarId) return;
  if (!findAvatar(avatarId)) return;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
  });
  if (!project) return;

  const data = (project.productData as Record<string, unknown> | null) ?? {};
  await prisma.project.update({
    where: { id: projectId },
    data: {
      productData: { ...data, selectedAvatarId: avatarId },
    },
  });
  revalidatePath(`/projects/${projectId}/avatar`);
}

export async function continueFromAvatarAction(formData: FormData) {
  const projectId = String(formData.get('projectId') ?? '');
  if (!projectId) return;
  redirect(`/projects/${projectId}/scripts`);
}
