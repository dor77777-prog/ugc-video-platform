import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { findAvatar } from '@/lib/avatars/catalog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/wizard/stepper';
import { SceneCard } from './client-bits';

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
        <Stepper current={4} done={[1, 2]} />
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

  // Determine the lock state for each scene (scene N is locked until N-1 has an image).
  const scenes = selected.scenes;
  const sceneStates = scenes.map((s, i) => {
    const prev = i === 0 ? null : scenes[i - 1];
    const locked = i > 0 && !prev?.imageUrl;
    return { scene: s, locked };
  });

  const allDone = scenes.length > 0 && scenes.every((s) => !!s.imageUrl);

  return (
    <div className="p-6 md:p-10 max-w-7xl space-y-8">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {project.productName}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">סצנות תמונות</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          לכל סצנה ייצור AI תמונה, על בסיס הפרומפט שאתה רואה. כדי לשמור על דמות עקבית לאורך
          הסרטון — סצנה <strong>N</strong> תפתח רק אחרי שסצנה <strong>N-1</strong> קיימת.
          אפשר לערוך פרומפט או להריץ מחדש.
        </p>
      </div>

      <Stepper current={4} done={[1, 2, 3]} />

      {/* Context strip: avatar + selected script summary */}
      <Card className="bg-accent/10 border-accent/30">
        <CardContent className="p-4 flex items-center gap-4">
          {avatar ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatar.imageUrl}
                alt={avatar.name}
                className="w-14 h-14 rounded-lg object-cover border border-border"
              />
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">דמות נבחרה</div>
                <div className="font-semibold">{avatar.name}</div>
              </div>
            </>
          ) : (
            <div className="flex-1 text-sm text-muted-foreground">
              לא נבחרה דמות —{' '}
              <Link href={`/projects/${projectId}/avatar`} className="text-primary underline">
                בחר דמות
              </Link>
            </div>
          )}
          <div className="border-s border-border ps-4">
            <div className="text-xs text-muted-foreground">תסריט</div>
            <div className="font-semibold text-sm line-clamp-1">{selected.hook}</div>
          </div>
        </CardContent>
      </Card>

      {/* Scene grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sceneStates.map(({ scene, locked }) => (
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
            locked={locked}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t border-border" dir="ltr">
        <div className="text-xs text-muted-foreground">
          קרדיטים: <span className="font-mono font-semibold">{dbUser.creditsBalance}</span>
        </div>
        <Button asChild size="lg" disabled={!allDone}>
          <Link href={`/projects/${projectId}/videos`} aria-disabled={!allDone}>
            המשך לקריינות + וידאו →
          </Link>
        </Button>
      </div>

      {/* Roadmap hint about voice + video */}
      <Card className="border-dashed">
        <CardContent className="p-5 text-sm text-muted-foreground space-y-1">
          <div className="font-semibold text-foreground">הצינור המלא</div>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>תמונה לכל סצנה — אנחנו כאן ✓</li>
            <li>קריינות לכל סצנה (ElevenLabs) — קומיט הבא</li>
            <li>אנימציה של התמונה לקליפ + סנכרון עם הקריינות (Kling/Runway + מיזוג)</li>
            <li>הרכבה סופית: כל הקליפים + מוזיקת רקע + כתוביות (Creatomate)</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
