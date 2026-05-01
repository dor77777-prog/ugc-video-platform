import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Film, AlertTriangle, Mic2 } from 'lucide-react';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { findVoicePreset } from '@/lib/voice/voice-presets';
import { Card, CardContent } from '@/components/ui/card';
import { Stepper } from '@/components/wizard/stepper';
import { ProjectHero } from '@/components/wizard/project-hero';
// V14.3-B — MusicPicker is exported from client-bits as a
// next/dynamic lazy wrapper (ssr: false). VoicePicker is no longer
// imported here — V14.7 moved all voice UI to step 4 (scenes page).
import {
  GenerateAllClipsButton,
  SceneClipCard,
  RenderFinalButton,
  CaptionPresetPicker,
  MusicPicker,
} from './client-bits';
import { DEFAULT_CAPTION_PRESET_ID, type CaptionPresetId } from '@ugc-video/shared';
import { deriveSceneRouting } from '@/lib/animation/scene-routing';

// Step 5 — "סצנות מונפשות": each scene gets a Hebrew voice-over (ElevenLabs)
// then an animated clip (Kling i2v + lipsync). The user can preview /
// regenerate each scene independently. Once every scene has a clip, the
// "Render final" button at the bottom enqueues the Creatomate composition
// job (Step 6, BullMQ).

export default async function VideosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    // V14.1b — explicit select. The Scene model has 60+ columns (heavy
    // JSON: motionAnalysisJson / generationLogJson / wordTimingsJson /
    // captionChunksJson / briefJson / imageBriefJson, plus dozens of
    // tracking timestamps); this page renders only 14 of them. Pulling
    // the full row was shipping ~150KB per 6-scene project on every
    // load. The trimmed select takes ~5KB.
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
              sceneGoal: true,
              sceneType: true,
              cameraDirection: true,
              sceneGenerationType: true,
              requiresLipSync: true,
              textHebrew: true,
              imageUrl: true,
              voiceUrl: true,
              voiceDurationSeconds: true,
              voiceGenerationCount: true,
              voiceInFlightAt: true,
              clipUrl: true,
              clipDurationSeconds: true,
              clipGenerationCount: true,
              clipInFlightAt: true,
              clipProvider: true,
            },
          },
        },
      },
    },
  });
  if (!project) notFound();

  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const voicePresetId = typeof data.voiceId === 'string' ? data.voiceId : null;
  const voicePreset = findVoicePreset(voicePresetId);

  if (!project.selectedScript) {
    return (
      <div className="relative bg-mesh-soft bg-noise min-h-screen">
        <div className="relative px-6 md:px-10 py-8 md:py-10 max-w-5xl mx-auto space-y-6">
          <ProjectHero
            kicker="קליפים"
            title="סצנות מונפשות"
            projectName={project.productName}
            step={7}
            totalSteps={8}
            icon={Film}
            backHref={`/projects/${projectId}/scripts`}
            backLabel="חזרה לתסריטים"
          />
          <Stepper current={7} done={[1, 2, 3, 4, 5, 6]} projectId={projectId} />
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
    hasImage: !!s.imageUrl,
    hasVoice: !!s.voiceUrl,
    hasClip: !!s.clipUrl,
  }));
  const allClipsReady =
    sceneInfos.length > 0 && sceneInfos.every((s) => s.hasClip);
  const missingImages = sceneInfos.filter((s) => !s.hasImage).length;

  return (
    <div className="relative bg-mesh-soft bg-noise min-h-screen">
      <div className="relative px-6 md:px-10 py-8 md:py-10 max-w-7xl mx-auto space-y-8">
        <ProjectHero
          kicker="קליפים"
          title="סצנות מונפשות"
          description="לכל סצנה — קליפ מונפש עם lip-sync על voice-over שיצרת בשלב הסצנות. תוכל לרגנר כל קליפ בנפרד. כשכל הסצנות מוכנות, לחץ 'הרכב סרטון סופי' למטה."
          projectName={project.productName}
          step={7}
          totalSteps={8}
          icon={Film}
          backHref={`/projects/${projectId}/voices`}
          backLabel="חזרה לקריינות"
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
                <Link
                  href={`/projects/${projectId}/voices`}
                  className="text-[10px] text-primary hover:underline ms-1"
                >
                  שנה
                </Link>
              </div>
            ) : null
          }
        />

        <Stepper current={7} done={[1, 2, 3, 4, 5, 6]} projectId={projectId} />

        {/* Block clearly when prerequisites are missing */}
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
                  חזור לשלב 4 וצור אותן →
                </Link>{' '}
                תוצאות הקליפים תלויות בתמונות הסצנה.
              </div>
            </CardContent>
          </Card>
        )}

      {/* V26.19 — voice picker lives at /voices (step 6). The hero meta
          shows the picked voice; this banner only fires when the user
          hasn't picked yet. */}
      {!voicePreset && (
        <Card className="glass border-amber-500/30">
          <CardContent className="p-4 text-sm">
            ⚠ עדיין לא נבחר קול.{' '}
            <Link
              href={`/projects/${projectId}/voices`}
              className="font-semibold text-primary underline"
            >
              חזור לשלב הקריינות וסמן קול →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* V7: lipsync provider picker removed — PixVerse is the sole
          lipsync route, decided automatically by the face-detection
          gate. There is no user-facing choice. */}

      {/* V14.7 — voice batch removed; only the clip batch remains. */}
      <GenerateAllClipsButton scenes={sceneInfos} creditsBalance={dbUser.creditsBalance} />

      {/* Per-scene grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scenes.map((scene) => {
          // requiresLipSync from DB takes precedence; otherwise derive from
          // cameraDirection so the user always sees a sensible default.
          const derived = deriveSceneRouting({
            cameraDirection: scene.cameraDirection,
            sceneGoal: scene.sceneGoal,
            sceneType: scene.sceneType,
          });
          const effectiveRequiresLipSync =
            scene.requiresLipSync ?? derived.requiresLipSync;
          return (
            <SceneClipCard
              key={scene.id}
              sceneId={scene.id}
              projectId={projectId}
              sceneOrder={scene.sceneOrder}
              totalScenes={scenes.length}
              sceneGoal={scene.sceneGoal ?? null}
              textHebrew={scene.textHebrew}
              imageUrl={scene.imageUrl}
              voiceUrl={scene.voiceUrl}
              voiceDurationSeconds={scene.voiceDurationSeconds}
              voiceGenerationCount={scene.voiceGenerationCount}
              voiceInFlightAt={scene.voiceInFlightAt?.toISOString() ?? null}
              clipUrl={scene.clipUrl}
              clipDurationSeconds={scene.clipDurationSeconds}
              clipGenerationCount={scene.clipGenerationCount}
              clipInFlightAt={scene.clipInFlightAt?.toISOString() ?? null}
              voiceSelected={!!voicePreset}
              requiresLipSync={effectiveRequiresLipSync}
              requiresLipSyncIsExplicit={scene.requiresLipSync != null}
              sceneGenerationType={
                scene.sceneGenerationType ?? derived.sceneGenerationType
              }
              clipProvider={scene.clipProvider ?? null}
            />
          );
        })}
      </div>

      {/* Footer — caption-style + music pickers + final render */}
      {(() => {
        const productData =
          (project.productData as Record<string, unknown> | null) ?? {};
        const captionsEnabled = productData.captions === true;
        const musicEnabled = productData.backgroundMusic === true;
        const initialPreset =
          (productData.captionsPreset as CaptionPresetId | undefined) ??
          DEFAULT_CAPTION_PRESET_ID;
        const initialMusicId =
          typeof productData.selectedMusicId === 'string'
            ? (productData.selectedMusicId as string)
            : null;
        const initialMusicOffset =
          typeof productData.musicStartOffsetSec === 'number'
            ? (productData.musicStartOffsetSec as number)
            : 0;
        return (
          <div className="space-y-6 pt-4 border-t border-border">
            {captionsEnabled && (
              <CaptionPresetPicker
                projectId={projectId}
                initialPresetId={initialPreset}
              />
            )}
            {musicEnabled && (
              <MusicPicker
                projectId={projectId}
                initialSelectedTrackId={initialMusicId}
                initialStartOffsetSec={initialMusicOffset}
              />
            )}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <Link
                href={`/projects/${projectId}/voices`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← חזרה לקריינות
              </Link>
              <RenderFinalButton
                projectId={projectId}
                allClipsReady={allClipsReady}
                creditsBalance={dbUser.creditsBalance}
                initialPresetId={initialPreset}
                captionsEnabled={captionsEnabled}
              />
            </div>
          </div>
        );
      })()}
      </div>
    </div>
  );
}
