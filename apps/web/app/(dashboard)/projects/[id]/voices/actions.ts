'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { findVoicePreset } from '@/lib/voice/voice-presets';

// V26.19 — voice picker writes here. Same shape as the previous
// /scenes voice picker but lives under /voices now.
export async function selectVoiceAction(formData: FormData) {
  const { dbUser } = await getOrCreateAppUser();
  const projectId = String(formData.get('projectId') ?? '');
  const voiceId = String(formData.get('voiceId') ?? '');
  if (!projectId || !voiceId) return;
  if (!findVoicePreset(voiceId)) return;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    select: { id: true, productData: true },
  });
  if (!project) return;

  const data = (project.productData as Record<string, unknown> | null) ?? {};
  await prisma.project.update({
    where: { id: projectId },
    data: { productData: { ...data, voiceId } },
  });
  revalidatePath(`/projects/${projectId}/voices`);
}

export async function continueFromVoicesAction(formData: FormData) {
  const projectId = String(formData.get('projectId') ?? '');
  if (!projectId) return;
  redirect(`/projects/${projectId}/videos`);
}
