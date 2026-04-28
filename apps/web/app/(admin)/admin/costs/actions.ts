'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/sync-user';

// Mark a stuck in-progress ApiCall as cancelled. Useful when a row
// shows "in_progress" past its TTL (e.g. a Kling i2v call where our
// dev-server got killed mid-poll, leaving the DB row dangling forever).
//
// We DO NOT call Kling's cancel API — the provider may have already
// completed the work and billed us; cancelling our DB row just gets
// the admin/UI back to a sane state. The corresponding Scene.*InFlightAt
// flag is cleared too so the user can retry without hitting the
// in-flight guard.
export async function cancelApiCallAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { dbUser: actor } = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) return { ok: false, error: 'missing id' };

  const call = await prisma.apiCall.findUnique({
    where: { id },
    select: { id: true, status: true, operation: true, projectId: true },
  });
  if (!call) return { ok: false, error: 'call not found' };
  if (call.status !== 'in_progress') {
    return { ok: false, error: `call already ${call.status}` };
  }

  await prisma.apiCall.update({
    where: { id },
    data: {
      status: 'failed',
      success: false,
      completedAt: new Date(),
      errorMessage: `cancelled_by_admin:${actor.email}`,
    },
  });

  // Best-effort: clear the matching Scene.*InFlightAt so the user's
  // tile unfreezes. We don't know which scene/row to target without
  // the operation hint; clear all flags older than now for any scenes
  // in this project. Cheap and safe.
  if (call.projectId) {
    const inFlightUpdates: Record<string, null> = {};
    if (call.operation === 'i2v' || call.operation.startsWith('kling-avatar') || call.operation === 'lipsync')
      inFlightUpdates.clipInFlightAt = null;
    if (call.operation === 'tts') inFlightUpdates.voiceInFlightAt = null;
    if (call.operation === 'image_gen') inFlightUpdates.imageInFlightAt = null;

    if (Object.keys(inFlightUpdates).length > 0) {
      await prisma.scene
        .updateMany({
          where: { script: { projectId: call.projectId } },
          data: inFlightUpdates,
        })
        .catch(() => {/* best effort */});
    }
  }

  revalidatePath('/admin/costs');
  return { ok: true };
}

// Bulk cancel: nuke every in_progress row older than N minutes.
// Useful after a server crash to clean up dangling rows in one click.
export async function cancelAllStaleInProgressAction(formData: FormData): Promise<{ ok: boolean; cancelled: number }> {
  const { dbUser: actor } = await requireAdmin();
  const olderThanMinutes = parseInt(String(formData.get('olderThanMinutes') ?? '15'), 10);
  const cutoff = new Date(Date.now() - Math.max(1, olderThanMinutes) * 60 * 1000);

  const stale = await prisma.apiCall.findMany({
    where: { status: 'in_progress', createdAt: { lt: cutoff } },
    select: { id: true, projectId: true, operation: true },
  });
  if (stale.length === 0) {
    revalidatePath('/admin/costs');
    return { ok: true, cancelled: 0 };
  }

  await prisma.apiCall.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: {
      status: 'failed',
      success: false,
      completedAt: new Date(),
      errorMessage: `bulk_cancelled_by_admin:${actor.email}`,
    },
  });

  // Clear in-flight flags on any scenes whose projects had stale calls.
  const projectIds = Array.from(new Set(stale.map((s) => s.projectId).filter(Boolean) as string[]));
  if (projectIds.length > 0) {
    await prisma.scene
      .updateMany({
        where: { script: { projectId: { in: projectIds } } },
        data: { clipInFlightAt: null, voiceInFlightAt: null, imageInFlightAt: null },
      })
      .catch(() => {});
  }

  revalidatePath('/admin/costs');
  return { ok: true, cancelled: stale.length };
}
