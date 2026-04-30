import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { findVoicePreset } from '@/lib/voice/voice-presets';
import { Card, CardContent } from '@/components/ui/card';
import { Stepper } from '@/components/wizard/stepper';
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
      <div className="p-6 md:p-10 max-w-5xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">סצנות מונפשות</h1>
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
    <div className="p-6 md:p-10 max-w-7xl space-y-8">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {project.productName}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">סצנות מונפשות</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          לכל סצנה — voice-over בעברית + קליפ מונפש עם lip-sync. תוכל לערוך, להאזין,
          ולרגנר כל אחד בנפרד. כשכל הסצנות מוכנות, לחץ "הרכב סרטון סופי" למטה.
        </p>
      </div>

      <Stepper current={5} done={[1, 2, 3, 4]} projectId={projectId} />

      {/* Block clearly when prerequisites are missing */}
      {missingImages > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm">
            ⚠ ל-{missingImages} סצנות אין תמונה עדיין.{' '}
            <Link
              href={`/projects/${projectId}/scenes`}
              className="font-semibold text-primary underline"
            >
              חזור לשלב 4 וצור אותן →
            </Link>{' '}
            תוצאות הקליפים תלויות בתמונות הסצנה.
          </CardContent>
        </Card>
      )}

      {/* V14.7 — voice picker + voice batch button moved to step 4
          (scenes page). This page only shows clip generation and final
          render. The voice-pick state is read-only here for context. */}
      {voicePreset && (
        <Card className="bg-accent/10 border-accent/30">
          <CardContent className="p-3 flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">קול נבחר:</span>
            <span className="font-semibold">{voicePreset.displayName}</span>
            <span className="text-muted-foreground">
              ({voicePreset.gender === 'female' ? 'אישה' : 'גבר'} · {voicePreset.ageRange}
              )
            </span>
            <Link
              href={`/projects/${projectId}/scenes`}
              className="ms-auto text-primary underline"
            >
              שנה קול בשלב הסצנות →
            </Link>
          </CardContent>
        </Card>
      )}
      {!voicePreset && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 text-sm">
            ⚠ עדיין לא נבחר קול.{' '}
            <Link
              href={`/projects/${projectId}/scenes`}
              className="font-semibold text-primary underline"
            >
              חזור לשלב הסצנות וסמן קול →
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
                href={`/projects/${projectId}/scenes`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← חזרה לסצנות (תמונות)
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
  );
}
