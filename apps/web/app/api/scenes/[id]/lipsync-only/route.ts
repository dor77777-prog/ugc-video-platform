// POST /api/scenes/[id]/lipsync-only — re-run only the PixVerse lipsync
// pass on the existing silent clip + voice MP3, skipping the expensive
// Kling i2v step. Used by the per-scene "👄 רק lipsync" button.
//
// V26.10 — exists as a route handler (not just a Server Action) so
// multiple clicks on different scenes can run in parallel. Next.js
// serializes Server Actions per route; route handlers are plain Vercel
// function invocations and fan out concurrently up to the per-user
// rate limit (lib/usage/rate-limit).

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { regenLipSyncOnlyImpl } from '@/lib/scenes/clip-impl';
import { prisma } from '@/lib/db';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const result = await regenLipSyncOnlyImpl(id, dbUser.id);

  if (result.success) {
    try {
      const projectId = await prisma.scene
        .findUnique({
          where: { id },
          select: { script: { select: { projectId: true } } },
        })
        .then((s) => s?.script.projectId);
      if (projectId) revalidatePath(`/projects/${projectId}/videos`);
    } catch {
      /* best effort */
    }
  }

  return NextResponse.json(result);
}
