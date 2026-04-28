// POST /api/projects/[id]/render — enqueue the final composition job.
//
// At this point all scenes already have:
//   - imageUrl    (Step 4 — gpt-image-2)
//   - voiceUrl    (Step 5 — ElevenLabs)
//   - clipUrl     (Step 5 — Kling i2v + lipsync)
//
// The render-processor (BullMQ worker) takes the project's selected
// script + its scenes, concatenates the per-scene clips with Creatomate,
// adds optional background music + RTL Hebrew captions, saves the final
// MP4, and updates RenderJob.finalVideoUrl.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { renderQueue } from '@/lib/queue';

const COST_FINAL_RENDER = 1;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    include: {
      selectedScript: {
        include: { scenes: { orderBy: { sceneOrder: 'asc' } } },
      },
    },
  });
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }
  if (!project.selectedScript) {
    return NextResponse.json(
      { error: 'no script selected — pick a script in step 3 first' },
      { status: 400 },
    );
  }

  const scenes = project.selectedScript.scenes;
  const missingClips = scenes.filter((s) => !s.clipUrl);
  if (missingClips.length > 0) {
    return NextResponse.json(
      {
        error: `יש סצנות בלי קליפ מונפש: ${missingClips
          .map((s) => `סצנה ${s.sceneOrder + 1}`)
          .join(', ')}. צור קליפים לכולן לפני הרכבה סופית.`,
      },
      { status: 400 },
    );
  }

  if (dbUser.creditsBalance < COST_FINAL_RENDER) {
    return NextResponse.json(
      { error: 'אין מספיק קרדיטים להרכבה הסופית', needsCredits: true },
      { status: 402 },
    );
  }

  // Create the RenderJob and decrement credits in a single transaction so
  // the user can't get charged without a job, or vice versa.
  const renderJob = await prisma.$transaction(async (tx) => {
    const job = await tx.renderJob.create({
      data: {
        projectId: project.id,
        scriptId: project.selectedScript!.id,
        userId: dbUser.id,
      },
    });
    await tx.user.update({
      where: { id: dbUser.id },
      data: { creditsBalance: { decrement: COST_FINAL_RENDER } },
    });
    return job;
  });

  await renderQueue.add('render-job', { renderJobId: renderJob.id });

  return NextResponse.json({
    success: true,
    jobId: renderJob.id,
    status: renderJob.status,
    progressPercent: renderJob.progressPercent,
  });
}
