import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Users } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { Card, CardContent } from '@/components/ui/card';
import { Stepper } from '@/components/wizard/stepper';
import { ProjectHero } from '@/components/wizard/project-hero';
import { AvatarPicker } from './client-bits';
import { selectAvatarAction, continueFromAvatarAction } from './actions';

export default async function AvatarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const { dbUser } = await getOrCreateAppUser();
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
  });
  if (!project) notFound();

  const productData = (project.productData as Record<string, unknown> | null) ?? {};
  const initialSelectedId =
    typeof productData.selectedAvatarId === 'string' ? productData.selectedAvatarId : null;

  return (
    <div className="relative bg-mesh-soft bg-noise min-h-screen">
      <div className="relative px-6 md:px-10 py-8 md:py-10 max-w-6xl mx-auto space-y-8">
        <ProjectHero
          kicker="אווטאר"
          title="בחר את הדמות שלך"
          description="בחר את הדמות שתופיע בכל הסצנות. ה-AI ישמור על אותה דמות לאורך כל הסרטון — אותו מראה, אותם מאפיינים. תוכל לסנן לפי מגדר וטווח גיל."
          projectName={project.productName}
          step={2}
          totalSteps={8}
          icon={Users}
          backHref={`/projects/${projectId}/edit`}
          backLabel="חזרה לפרטי המוצר"
        />

        <Stepper current={2} done={[1]} projectId={projectId} />

        <Card className="tier-elevated">
          <CardContent className="p-6">
            <AvatarPicker
              projectId={projectId}
              initialSelectedId={initialSelectedId}
              selectAction={selectAvatarAction}
              continueAction={continueFromAvatarAction}
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border-subtle pt-4">
          <Link href={`/projects/${projectId}/edit`} className="hover:text-foreground transition-colors">
            ← חזרה לפרטי המוצר
          </Link>
          <div className="text-[10px] font-mono">
            25 אווטארים בקטלוג · נוצרו עבורנו
          </div>
        </div>
      </div>
    </div>
  );
}
