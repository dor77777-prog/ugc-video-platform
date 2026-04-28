// POST /api/scenes/[id]/clip — animate the scene image (Kling i2v + lipsync).
//
// Same pattern as the voice route handler. Server Actions are serialized
// per-route by Next.js, so the parallel-friendly batch loop calls this
// Route Handler directly via fetch().

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { generateSceneClipImpl } from '@/lib/scenes/clip-impl';
import { prisma } from '@/lib/db';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const result = await generateSceneClipImpl(id, dbUser.id);

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
