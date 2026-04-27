import { NextRequest, NextResponse } from 'next/server';
import { startRenderSchema } from '@ugc-video/shared';
import { prisma } from '@/lib/db';
import { renderQueue } from '@/lib/queue';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = startRenderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { projectId, scriptId, userId } = parsed.data;

  const script = await prisma.script.findFirst({
    where: { id: scriptId, projectId },
  });
  if (!script) {
    return NextResponse.json({ error: 'Script not found for project' }, { status: 404 });
  }

  const renderJob = await prisma.renderJob.create({
    data: { projectId, scriptId, userId },
  });

  await renderQueue.add('render-job', { renderJobId: renderJob.id });

  return NextResponse.json({
    jobId: renderJob.id,
    status: renderJob.status,
    progressPercent: renderJob.progressPercent,
  });
}
