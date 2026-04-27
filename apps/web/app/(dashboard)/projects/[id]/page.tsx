import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { getResumeUrl } from '@/lib/wizard/current-step';

// Top-level project URL: drop the user back wherever they left off.
// This is what the dashboard "Resume" button (and any old bookmark) points at.
export default async function ProjectResumeRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { dbUser } = await getOrCreateAppUser();
  const project = await prisma.project.findFirst({
    where: { id, userId: dbUser.id },
    select: {
      id: true,
      selectedScriptId: true,
      productData: true,
      scripts: {
        select: {
          id: true,
          scenes: { select: { id: true, imageUrl: true } },
        },
      },
    },
  });
  if (!project) notFound();
  redirect(getResumeUrl(project));
}
