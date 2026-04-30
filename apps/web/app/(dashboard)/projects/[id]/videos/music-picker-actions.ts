'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { MUSIC_LIBRARY } from '@ugc-video/shared';
import { revalidatePath } from 'next/cache';

// V14 PR9 — persist the user's per-project music selection (track id +
// start offset in seconds) onto Project.productData. The render-processor
// honors selectedMusicId by overriding the auto-select path; the offset
// is passed to ffmpeg.ts where the music filter chain trims from
// `start=<offset>` before looping to the final video duration.

export interface SetProjectMusicResult {
  ok: boolean;
  error?: 'unauthorized' | 'not_found' | 'invalid_track' | 'invalid_offset';
}

const VALID_TRACK_IDS = new Set(MUSIC_LIBRARY.map((t) => t.id));

export async function setProjectMusicSelection(
  projectId: string,
  trackId: string | null,
  startOffsetSec: number,
): Promise<SetProjectMusicResult> {
  const { dbUser } = await getOrCreateAppUser();
  if (!dbUser) return { ok: false, error: 'unauthorized' };

  if (trackId !== null && !VALID_TRACK_IDS.has(trackId)) {
    return { ok: false, error: 'invalid_track' };
  }
  if (
    !Number.isFinite(startOffsetSec) ||
    startOffsetSec < 0 ||
    startOffsetSec > 600
  ) {
    return { ok: false, error: 'invalid_offset' };
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    select: { id: true, productData: true },
  });
  if (!project) return { ok: false, error: 'not_found' };

  const data =
    (project.productData as Record<string, unknown> | null) ?? {};
  const next = {
    ...data,
    selectedMusicId: trackId,
    musicStartOffsetSec: Math.round(startOffsetSec * 100) / 100,
  } as Prisma.InputJsonValue;

  await prisma.project.update({
    where: { id: projectId },
    data: { productData: next },
  });

  // Revalidate the videos page so the next render picks up the new
  // selection on the server side without a hard reload.
  revalidatePath(`/projects/${projectId}/videos`);
  return { ok: true };
}
