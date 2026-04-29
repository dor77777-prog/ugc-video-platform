// POST /api/projects/[id]/lipsync-provider — set the project-level
// LipSync provider override. clip-impl.ts reads
// Project.productData.lipsyncProvider FIRST, falling back to the
// LIPSYNC_PROVIDER env var when unset. Lets us A/B kling vs pixverse
// vs sync per project without an env restart, and lets the user pick
// per project after the bakeoff.

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { ALL_LIPSYNC_PROVIDERS } from '@/lib/animation/lipsync';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const body = (await req.json().catch(() => ({}))) as { provider?: string };
  const provider = (body.provider ?? '').toLowerCase();
  // Empty string clears the override (back to env default).
  if (provider !== '' && !(provider in ALL_LIPSYNC_PROVIDERS)) {
    return NextResponse.json(
      {
        error: 'unknown_provider',
        valid: Object.keys(ALL_LIPSYNC_PROVIDERS),
      },
      { status: 400 },
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    select: { id: true, productData: true },
  });
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const nextData = { ...data };
  if (provider === '') {
    delete nextData.lipsyncProvider;
  } else {
    nextData.lipsyncProvider = provider;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { productData: nextData as object },
  });

  revalidatePath(`/projects/${projectId}/videos`);
  return NextResponse.json({
    success: true,
    lipsyncProvider: provider === '' ? null : provider,
  });
}
