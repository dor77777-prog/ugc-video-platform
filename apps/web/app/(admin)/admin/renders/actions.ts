'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { renderQueue } from '@/lib/queue';
import { requireAdmin } from '@/lib/auth/sync-user';
import { RenderJobStatus } from '@prisma/client';

export async function retryRenderAction(formData: FormData) {
  await requireAdmin();
  const renderJobId = String(formData.get('renderJobId'));
  if (!renderJobId) return;

  await prisma.renderJob.update({
    where: { id: renderJobId },
    data: {
      status: RenderJobStatus.pending,
      progressPercent: 0,
      errorMessage: null,
    },
  });
  await renderQueue.add('render-job', { renderJobId });
  revalidatePath('/admin/renders');
}

export async function cancelRenderAction(formData: FormData) {
  await requireAdmin();
  const renderJobId = String(formData.get('renderJobId'));
  if (!renderJobId) return;

  await prisma.renderJob.update({
    where: { id: renderJobId },
    data: { status: RenderJobStatus.cancelled },
  });
  revalidatePath('/admin/renders');
}
