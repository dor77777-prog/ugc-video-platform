import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';

export const dynamic = 'force-dynamic';

// V26.SEC — Auth + ownership enforcement.
//
// Pre-V26.SEC this route looked up RenderJob by jobId without any
// authentication. RenderJob IDs are CUIDs (~20 chars, unguessable in
// practice), but if a job ID leaks (browser history, support ticket,
// shared URL) anyone could poll its status and read the eventual
// finalVideoUrl. Now we require an authenticated session AND verify
// the job belongs to the requester.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const job = await prisma.renderJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      progressPercent: true,
      errorMessage: true,
      finalVideoUrl: true,
      updatedAt: true,
      userId: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (job.userId !== dbUser.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
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
