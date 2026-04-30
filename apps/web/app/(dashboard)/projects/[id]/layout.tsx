import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { ProjectFlowToggles } from './flow-toggles';

// Wraps every /projects/[id]/* page (overview, scripts, avatar, scenes,
// videos, finish) with a persistent flow-toggle bar so the user can
// flip captions / background music on or off at any wizard step right
// up to the final render. The legacy /edit route lives under this layout
// too — that's fine, it just redirects.
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { dbUser } = await getOrCreateAppUser();
  const project = await prisma.project.findFirst({
    where: { id, userId: dbUser.id },
    select: { id: true, productData: true },
  });
  if (!project) notFound();

  const productData =
    (project.productData as Record<string, unknown> | null) ?? {};
  const initialCaptions = productData.captions === true;
  const initialBackgroundMusic = productData.backgroundMusic === true;

  return (
    <div>
      <div className="px-6 md:px-10 pt-4 md:pt-6 max-w-5xl">
        <ProjectFlowToggles
          projectId={id}
          initialCaptions={initialCaptions}
          initialBackgroundMusic={initialBackgroundMusic}
        />
      </div>
      {children}
    </div>
  );
}
