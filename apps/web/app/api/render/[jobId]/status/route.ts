import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const job = await prisma.renderJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      progressPercent: true,
      errorMessage: true,
      finalVideoUrl: true,
      updatedAt: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progressPercent: job.progressPercent,
    errorMessage: job.errorMessage,
    finalVideoUrl: job.finalVideoUrl,
    updatedAt: job.updatedAt.toISOString(),
  });
}
