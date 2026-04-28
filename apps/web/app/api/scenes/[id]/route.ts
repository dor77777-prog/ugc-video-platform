// GET /api/scenes/[id] — lightweight scene-state endpoint for live polling.
//
// The scenes page is a server component. While "Generate all" runs we want
// each scene tile to show its image the moment it's persisted to the DB,
// without waiting for router.refresh() to commit (which Next.js
// deprioritizes when many refreshes fire in rapid succession). Each
// SceneCard polls this endpoint every few seconds while a generation pass
// is in flight; once it sees an imageUrl appear, it swaps it in locally
// without requiring a full route re-render.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const scene = await prisma.scene.findUnique({
    where: { id },
    select: {
      id: true,
      imageUrl: true,
      imageGenerationCount: true,
      imageGeneratedAt: true,
      imageInFlightAt: true,
      voiceUrl: true,
      voiceGenerationCount: true,
      voiceGeneratedAt: true,
      voiceDurationSeconds: true,
      voiceInFlightAt: true,
      clipUrl: true,
      clipGenerationCount: true,
      clipGeneratedAt: true,
      clipDurationSeconds: true,
      clipInFlightAt: true,
      script: { select: { project: { select: { userId: true } } } },
    },
  });

  if (!scene) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (scene.script.project.userId !== dbUser.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    id: scene.id,
    imageUrl: scene.imageUrl,
    imageGenerationCount: scene.imageGenerationCount,
    imageGeneratedAt: scene.imageGeneratedAt?.toISOString() ?? null,
    imageInFlightAt: scene.imageInFlightAt?.toISOString() ?? null,
    voiceUrl: scene.voiceUrl,
    voiceGenerationCount: scene.voiceGenerationCount,
    voiceGeneratedAt: scene.voiceGeneratedAt?.toISOString() ?? null,
    voiceDurationSeconds: scene.voiceDurationSeconds,
    voiceInFlightAt: scene.voiceInFlightAt?.toISOString() ?? null,
    clipUrl: scene.clipUrl,
    clipGenerationCount: scene.clipGenerationCount,
    clipGeneratedAt: scene.clipGeneratedAt?.toISOString() ?? null,
    clipDurationSeconds: scene.clipDurationSeconds,
    clipInFlightAt: scene.clipInFlightAt?.toISOString() ?? null,
  });
}
