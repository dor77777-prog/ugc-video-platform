// V26.19 — Voice step. Sits between Scenes (images) and Videos
// (clips). The user picks a voice preset and generates one Hebrew
// voice-over per scene before moving on to clip animation.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Mic2, AlertTriangle } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { findVoicePreset } from '@/lib/voice/voice-presets';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/wizard/stepper';
import { ProjectHero } from '@/components/wizard/project-hero';
import {
  VoicePicker,
  GenerateAllVoicesButton,
  SceneVoiceCard,
} from './client-bits';

export default async function VoicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    select: {
      id: true,
      productName: true,
      productData: true,
      selectedScript: {
        select: {
          id: true,
          scenes: {
            orderBy: { sceneOrder: 'asc' },
            select: {
              id: true,
              sceneOrder: true,
              textHebrew: true,
              imageUrl: true,
              voiceUrl: true,
              voiceDurationSeconds: true,
              voiceGenerationCount: true,
              voiceInFlightAt: true,
            },
          },
        },
      },
    },
  });
  if (!project) notFound();

  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const voiceId = typeof data.voiceId === 'string' ? data.voiceId : null;
  const voicePreset = findVoicePreset(voiceId);

  if (!project.selectedScript) {
    return (
      <div className="relative bg-mesh-soft bg-noise min-h-screen">
        <div className="relative px-6 md:px-10 py-8 md:py-10 max-w-5xl mx-auto space-y-6">
          <ProjectHero
            kicker="קולות"
            title="קריינות"
            projectName={project.productName}
            step={6}
            totalSteps={8}
            icon={Mic2}
            backHref={`/projects/${projectId}/scripts`}
            backLabel="חזרה לתסריטים"
          />
          <Stepper current={6} done={[1, 2, 3, 4, 5]} projectId={projectId} />
          <Card className="glass border-amber-500/30">
            <CardContent className="p-6 text-sm text-muted-foreground flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <div>
                עדיין לא נבחר תסריט.{' '}
                <Link href={`/projects/${projectId}/scripts`} className="text-primary underline">
                  חזור לבחירת תסריט →
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const scenes = project.selectedScript.scenes;
  const sceneInfos = scenes.map((s) => ({
    id: s.id,
    sceneOrder: s.sceneOrder,
    hasVoice: !!s.voiceUrl,
  }));
  const allVoicesReady = sceneInfos.length > 0 && sceneInfos.every((s) => s.hasVoice);
  const missingImages = scenes.filter((s) => !s.imageUrl).length;

  return (
    <div className="relative bg-mesh-soft bg-noise min-h-screen">
      <div className="relative px-6 md:px-10 py-8 md:py-10 max-w-7xl mx-auto space-y-8">
        <ProjectHero
          kicker="קולות"
          title="קריינות עברית לכל סצנה"
          description="בחר את הקול שילווה את הסרטון, ואז צור voice-over עברי לכל אחת מהסצנות. הקריינויות יתסנכרנו אוטומטית לסצנות המונפשות בשלב הבא."
          projectName={project.productName}
          step={6}
          totalSteps={8}
          icon={Mic2}
          backHref={`/projects/${projectId}/scenes`}
          backLabel="חזרה לסצנות"
          meta={
            voicePreset ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass max-w-fit">
                <Mic2 className="h-3.5 w-3.5 text-accent" />
                <div className="text-xs">
                  <span className="text-muted-foreground">קול:</span>{' '}
                  <span className="font-semibold">{voicePreset.displayName}</span>
                  <span className="text-muted-foreground ms-1">
                    ({voicePreset.gender === 'female' ? 'אישה' : 'גבר'} · {voicePreset.ageRange})
                  </span>
                </div>
              </div>
            ) : null
          }
        />

        <Stepper current={6} done={[1, 2, 3, 4, 5]} projectId={projectId} />

        {missingImages > 0 && (
          <Card className="glass border-amber-500/30">
            <CardContent className="p-4 text-sm flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <div>
                ל-{missingImages} סצנות אין תמונה עדיין.{' '}
                <Link
                  href={`/projects/${projectId}/scenes`}
                  className="font-semibold text-primary underline"
                >
                  חזור לשלב הסצנות וצור אותן →
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Voice picker */}
        {!voicePreset ? (
          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold">בחירת קול</div>
                <div className="text-xs text-muted-foreground">
                  הקשב לדוגמאות ובחר את הקול שילווה את הסרטון. אפשר להחליף בכל שלב.
                </div>
              </div>
              <VoicePicker projectId={projectId} initialVoiceId={null} />
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-accent/10 border-accent/30">
            <CardContent className="p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">קול נבחר</div>
                <div className="font-semibold">{voicePreset.displayName}</div>
                <div className="text-[11px] text-muted-foreground">
                  {voicePreset.gender === 'female' ? 'אישה' : 'גבר'} ·{' '}
                  {voicePreset.ageRange} · {voicePreset.energy}
                </div>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  החלף קול
                </summary>
                <div className="mt-3 min-w-[300px] md:min-w-[600px]">
                  <VoicePicker projectId={projectId} initialVoiceId={voicePreset.id} />
                  <p className="text-[11px] text-muted-foreground mt-2">
                    ⚠ אחרי החלפה — תצטרך לרגנר את ה-voice-overs.
                  </p>
                </div>
              </details>
            </CardContent>
          </Card>
        )}

        <GenerateAllVoicesButton
          scenes={sceneInfos}
          creditsBalance={dbUser.creditsBalance}
          voiceSelected={!!voicePreset}
        />

        {/* Per-scene voice grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenes.map((scene) => (
            <SceneVoiceCard
              key={scene.id}
              sceneId={scene.id}
              sceneOrder={scene.sceneOrder}
              totalScenes={scenes.length}
              textHebrew={scene.textHebrew}
              voiceUrl={scene.voiceUrl}
              voiceDurationSeconds={scene.voiceDurationSeconds}
              voiceGenerationCount={scene.voiceGenerationCount}
              voiceInFlightAt={scene.voiceInFlightAt?.toISOString() ?? null}
              voiceSelected={!!voicePreset}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-border" dir="ltr">
          <div className="text-xs text-muted-foreground">
            קרדיטים: <span className="font-mono font-semibold">{dbUser.creditsBalance}</span>
          </div>
          <Button asChild size="lg" disabled={!allVoicesReady}>
            <Link href={`/projects/${projectId}/videos`} aria-disabled={!allVoicesReady}>
              המשך לקליפים מונפשים →
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
