// POST /api/scenes/[id]/voice — generate ElevenLabs Hebrew voice-over.
//
// Used by both the per-scene "Generate Voice" button (via the server
// action wrapper) and the "Generate all voices" batch loop (which calls
// this endpoint directly via fetch() to bypass Next.js's per-route
// serialization of Server Actions).

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { generateSceneVoiceImpl } from '@/lib/scenes/voice-impl';
import { prisma } from '@/lib/db';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const result = await generateSceneVoiceImpl(id, dbUser.id);

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
      /* best effort — client polls anyway */
    }
  }

  return NextResponse.json(result);
}
