'use server';

import { revalidatePath } from 'next/cache';
import { renderQueue } from '@/lib/queue';
import { requireAdmin } from '@/lib/auth/sync-user';

export async function cleanFailedAction() {
  await requireAdmin();
  // Clean failed jobs older than 1 hour. Keeps recent failures visible.
  await renderQueue.clean(60 * 60 * 1000, 1000, 'failed');
  revalidatePath('/admin/queue');
}

export async function cleanCompletedAction() {
  await requireAdmin();
  // Clean completed jobs older than 1 day.
  await renderQueue.clean(24 * 60 * 60 * 1000, 1000, 'completed');
  revalidatePath('/admin/queue');
}

export async function pauseQueueAction() {
  await requireAdmin();
  await renderQueue.pause();
  revalidatePath('/admin/queue');
}

export async function resumeQueueAction() {
  await requireAdmin();
  await renderQueue.resume();
  revalidatePath('/admin/queue');
}
