// Kling stale-task sweep job.
//
// Runs hourly. For each Scene with a clipMotionTaskId that's been
// "submitted/processing" for too long (no clipUrl persisted, motion
// generated > N minutes ago), we mark the scene's last attempt as failed
// in the ApiCall log so admin/usage shows it accurately. The Scene's
// own state stays intact — the user can retry, and the cache will
// (correctly) treat the task as expired.
//
// We do NOT cancel the Kling-side task — Kling charges on submit, so
// canceling doesn't refund. We just clean up our local accounting and
// surface the failure to admins.

import { prisma } from '../db';

const STUCK_THRESHOLD_MS = 15 * 60 * 1000; // 15 min

export async function runKlingSweep(): Promise<{ flagged: number }> {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

  // Scenes that started Stage A but never produced a clipUrl AND it's
  // been over 15 min since the motion task submitted. These are stuck.
  const stuck = await prisma.scene.findMany({
    where: {
      clipMotionTaskId: { not: null },
      clipUrl: null,
      clipMotionGeneratedAt: { lt: cutoff },
    },
    select: {
      id: true,
      clipMotionTaskId: true,
      clipMotionGeneratedAt: true,
      script: { select: { project: { select: { id: true, userId: true } } } },
    },
    take: 100,
  });

  if (stuck.length === 0) return { flagged: 0 };

  // Log a synthetic ApiCall row per stuck task so it shows up in
  // /admin/costs → "כשלונות אחרונים". We DON'T charge users — they
  // were never charged in the first place (the user-side credit
  // decrement happens in the same DB transaction that sets clipUrl).
  for (const s of stuck) {
    await prisma.apiCall.create({
      data: {
        provider: 'kling',
        operation: 'i2v',
        model: 'kling-v3-omni',
        success: false,
        errorMessage: `stuck:no_clip_after_15min:taskId=${s.clipMotionTaskId}`,
        userId: s.script.project.userId,
        projectId: s.script.project.id,
      },
    });

    // Clear the cached task_id so a retry is treated as a fresh attempt.
    // The task on Kling's side might still complete eventually, but we
    // can no longer rely on it.
    await prisma.scene.update({
      where: { id: s.id },
      data: {
        clipMotionTaskId: null,
        clipMotionGeneratedAt: null,
        clipMotionDurationSec: null,
      },
    });
  }

  console.log(`[kling-sweep] flagged ${stuck.length} stuck task(s)`);
  return { flagged: stuck.length };
}
