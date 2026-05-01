import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ImageIcon, ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { findAvatar } from '@/lib/avatars/catalog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/wizard/stepper';
import { ProjectHero } from '@/components/wizard/project-hero';
import { SceneCard, GenerateAllButton } from './client-bits';

export default async function ScenesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
  if (!project) notFound();

  const selected = project.selectedScript;
  const productData = (project.productData as Record<string, unknown> | null) ?? {};
  const avatar = findAvatar(typeof productData.selectedAvatarId === 'string' ? productData.selectedAvatarId : null);

  if (!selected) {
    return (
      <div className="p-6 md:p-10 max-w-5xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">סצנות תמונות</h1>
        <Stepper current={5} done={[1, 2, 3, 4]} projectId={projectId} />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            עדיין לא נבחר תסריט.{' '}
            <Link href={`/projects/${projectId}/scripts`} className="text-primary underline">
              חזור לבחירת תסריט →
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const scenes = selected.scenes;
  const allDone = scenes.length > 0 && scenes.every((s) => !!s.imageUrl);

  return (
    <div className="relative bg-mesh-soft bg-noise min-h-screen">
      <div className="relative px-6 md:px-10 py-8 md:py-10 max-w-7xl mx-auto space-y-8">
        {/* V21 — unified ProjectHero. Replaces the previous header
            block + accent context strip with a single glass-strong
            hero panel that surfaces avatar + script + step. */}
        <ProjectHero
          kicker="סצנות"
          title="סצנות תמונות"
          description="לחץ על 'צור את כל הסצנות' כדי להריץ את כולן בלחיצה אחת. הן ייוצרו במקביל ויופיעו למטה אחת אחרי השנייה. אפשר לערוך פרומפט של סצנה ולהריץ אותה מחדש בנפרד."
          projectName={project.productName}
          step={5}
          totalSteps={8}
          icon={ImageIcon}
          backHref={`/projects/${projectId}/scripts`}
          backLabel="חזרה לתסריטים"
          meta={
            <div className="flex items-center gap-3 flex-wrap">
              {avatar && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass">
                  <Image
                    src={avatar.imageUrl}
                    alt={avatar.name}
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded-md object-cover"
                  />
                  <div className="text-xs">
                    <div className="text-muted-foreground text-[10px] uppercase tracking-widest">
                      דמות
                    </div>
                    <div className="font-semibold leading-none mt-0.5">
                      {avatar.name}
                    </div>
                  </div>
                </div>
              )}
              <div className="px-3 py-1.5 rounded-xl glass max-w-[280px]">
                <div className="text-muted-foreground text-[10px] uppercase tracking-widest">
                  תסריט נבחר
                </div>
                <div className="font-semibold text-xs leading-tight mt-0.5 line-clamp-1">
                  {selected.hook}
                </div>
              </div>
              {!avatar && (
                <Link
                  href={`/projects/${projectId}/avatar`}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  בחר דמות
                  <ArrowLeft className="h-3 w-3" />
                </Link>
              )}
            </div>
          }
        />

        <Stepper current={5} done={[1, 2, 3, 4]} projectId={projectId} />

      {/* V26.19 — voice picker + voice-gen moved to /voices step. The
          scenes page is image-only now: pick prompts, generate images,
          continue to voice. */}
      <GenerateAllButton
        scenes={scenes.map((s) => ({
          id: s.id,
          sceneOrder: s.sceneOrder,
          hasImage: !!s.imageUrl,
        }))}
        creditsBalance={dbUser.creditsBalance}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scenes.map((scene) => (
          <SceneCard
            key={scene.id}
            sceneId={scene.id}
            sceneOrder={scene.sceneOrder}
            totalScenes={scenes.length}
            sceneType={scene.sceneType}
            textHebrew={scene.textHebrew}
            visualPromptEnglish={scene.visualPromptEnglish}
            durationSeconds={scene.durationSeconds}
            imageUrl={scene.imageUrl}
            imageGenerationCount={scene.imageGenerationCount}
            imageInFlightAt={scene.imageInFlightAt ? scene.imageInFlightAt.toISOString() : null}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-4 border-t border-border" dir="ltr">
        <div className="text-xs text-muted-foreground">
          קרדיטים: <span className="font-mono font-semibold">{dbUser.creditsBalance}</span>
        </div>
        <Button asChild size="lg" disabled={!allDone}>
          <Link href={`/projects/${projectId}/voices`} aria-disabled={!allDone}>
            המשך לקריינות →
          </Link>
        </Button>
      </div>
      </div>
    </div>
  );
}
