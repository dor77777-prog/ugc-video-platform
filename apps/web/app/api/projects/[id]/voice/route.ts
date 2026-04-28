// POST /api/projects/[id]/voice — set the project-level voice id.
//
// Project.productData.voiceId is the persistent reference; per-scene voice
// generation reads it via voice-impl.ts. Switching voices doesn't auto-regen
// existing voice MP3s — the UI surfaces this and offers a batch regen.

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { findVoicePreset } from '@/lib/voice/voice-presets';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const body = (await req.json().catch(() => ({}))) as { voiceId?: string };
  const voicePresetId = body.voiceId;
  if (!voicePresetId) {
    return NextResponse.json({ error: 'voiceId is required' }, { status: 400 });
  }
  const preset = findVoicePreset(voicePresetId);
  if (!preset) {
    return NextResponse.json({ error: 'unknown voiceId' }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    select: { id: true, productData: true },
  });
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const nextData = {
    ...data,
    voiceId: preset.id,
    voiceName: preset.displayName,
  };

  await prisma.project.update({
    where: { id: projectId },
    data: { productData: nextData },
  });

  revalidatePath(`/projects/${projectId}/videos`);
  return NextResponse.json({ success: true, voiceId: preset.id, voiceName: preset.displayName });
}
