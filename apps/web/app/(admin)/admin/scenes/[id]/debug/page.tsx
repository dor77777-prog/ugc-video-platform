// Admin scene debug panel — V13 PR8.
//
// Surfaces every persisted artifact the V13 pipeline writes for a
// scene, so creative drift is diagnosable without firing up Prisma
// Studio. Layout is one collapsible section per data shape; each
// section pretty-prints whatever is on the row, or shows a "not yet
// captured" hint when null.
//
// The (admin) layout already gates auth via requireAdmin() — this
// page just relies on that.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SceneCardStatusBadge } from '@/components/wizard/scene-card-status-badge';
import { SceneLogViewer } from '@/components/wizard/scene-log-viewer';
import { isSceneStatus, type SceneStatus } from '@/lib/scenes/scene-status';
import { getSceneErrorMessage } from '@/lib/errors/scene-error-messages';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminSceneDebugPage({ params }: PageProps) {
  const { id } = await params;
  const scene = await prisma.scene.findUnique({
    where: { id },
    include: {
      script: {
        include: {
          project: {
            select: {
              id: true,
              productName: true,
              productData: true,
              userId: true,
              user: { select: { email: true } },
            },
          },
        },
      },
    },
  });
  if (!scene) notFound();

  const project = scene.script.project;
  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const intelligence =
    (data as { intelligence?: unknown }).intelligence ?? null;
  // V14 PR3 — project-level locked outfit (computed once on first scene gen).
  const lockedOutfit =
    typeof (data as { lockedOutfit?: unknown }).lockedOutfit === 'string'
      ? ((data as { lockedOutfit: string }).lockedOutfit)
      : null;
  // V14 PR5 — script-level genre / voice_profile / hook_alternatives lifted
  // from script.rawJson if present (V5 scripts have rawJson but no V6 keys —
  // safe optional-chain).
  const scriptRaw =
    (scene.script as { rawJson?: Record<string, unknown> | null }).rawJson ??
    null;
  const v14Genre = (scriptRaw as { genre?: string | null } | null)?.genre ?? null;
  const v14VoiceProfile =
    (scriptRaw as { voice_profile?: string | null } | null)?.voice_profile ?? null;
  const v14HookAlternatives =
    (scriptRaw as { hook_alternatives?: string[] } | null)?.hook_alternatives ??
    null;
  // V14 PR5 — per-scene israeli_setting_cue persisted on the scene's slot in
  // the script's rawJson scenes array (matching scene.sceneOrder).
  const v14SceneCue = (() => {
    const scenes =
      (scriptRaw as { scenes?: Array<{ scene_order?: number; israeli_setting_cue?: string | null }> } | null)
        ?.scenes;
    if (!Array.isArray(scenes)) return null;
    const match = scenes.find((s) => s.scene_order === scene.sceneOrder);
    return match?.israeli_setting_cue ?? null;
  })();
  // V14 PR2/PR4 — pull the V14 brief fields from imageBriefJson when persisted.
  // V27.11.PR1 — also pull comparisonGuardApplied + comparisonGuardReasons so
  // the admin can see whether the universal SINGLE-FRAME RULE bridge fired
  // on this scene's brief.
  const briefV14 = (() => {
    if (!scene.imageBriefJson || typeof scene.imageBriefJson !== 'object') return null;
    const b = scene.imageBriefJson as Record<string, unknown>;
    return {
      frameTechniqueSnippetIds: Array.isArray(b.frameTechniqueSnippetIds)
        ? (b.frameTechniqueSnippetIds as string[])
        : null,
      scrollStopperApplied:
        typeof b.scrollStopperApplied === 'boolean' ? b.scrollStopperApplied : null,
      scrollStopperReason:
        typeof b.scrollStopperReason === 'string' ? b.scrollStopperReason : null,
      variationDiversity:
        b.variationDiversity && typeof b.variationDiversity === 'object'
          ? (b.variationDiversity as Record<string, { distinct: number; total: number }>)
          : null,
      // V27.11.PR1 — comparison-guard surface. Null when the brief
      // pre-dates PR1 (older scenes don't have these keys).
      comparisonGuardApplied:
        typeof b.comparisonGuardApplied === 'boolean'
          ? b.comparisonGuardApplied
          : null,
      comparisonGuardReasons: Array.isArray(b.comparisonGuardReasons)
        ? (b.comparisonGuardReasons as string[])
        : null,
    };
  })();

  // V27.11.PR3 — detect "legacy schema" rawJson: scripts saved before
  // PR3 still carry the 4 dropped meta-fields (israeli_environment_required,
  // local_realism_notes, why_this_scene_exists, narrative_link_from_previous).
  // Surface a small banner so the admin sees this is pre-PR3 data.
  // V27.11.PR4 — also detect deprecated enum values: scene_generation_type=
  // 'before_after' or frame_strategy='comparison_split'. Same purpose.
  const v2711LegacyFlags = (() => {
    const scenes =
      (scriptRaw as {
        scenes?: Array<{
          scene_order?: number;
          scene_generation_type?: string;
          frame_strategy?: string;
          israeli_environment_required?: unknown;
          local_realism_notes?: unknown;
          why_this_scene_exists?: unknown;
          narrative_link_from_previous?: unknown;
        }>;
      } | null)?.scenes;
    if (!Array.isArray(scenes)) return null;
    const match = scenes.find((s) => s.scene_order === scene.sceneOrder);
    if (!match) return null;
    const droppedFieldsPresent: string[] = [];
    if (match.israeli_environment_required != null)
      droppedFieldsPresent.push('israeli_environment_required');
    if (match.local_realism_notes != null)
      droppedFieldsPresent.push('local_realism_notes');
    if (match.why_this_scene_exists != null)
      droppedFieldsPresent.push('why_this_scene_exists');
    if (match.narrative_link_from_previous != null)
      droppedFieldsPresent.push('narrative_link_from_previous');
    const deprecatedValues: string[] = [];
    if (match.scene_generation_type === 'before_after')
      deprecatedValues.push("scene_generation_type='before_after'");
    if (match.frame_strategy === 'comparison_split')
      deprecatedValues.push("frame_strategy='comparison_split'");
    return {
      hasPr3DroppedFields: droppedFieldsPresent.length > 0,
      pr3DroppedFields: droppedFieldsPresent,
      hasPr4DeprecatedEnum: deprecatedValues.length > 0,
      pr4DeprecatedEnum: deprecatedValues,
    };
  })();

  const status: SceneStatus = isSceneStatus(scene.status) ? scene.status : 'pending';
  const errorEntry =
    scene.lastErrorCode != null
      ? getSceneErrorMessage(scene.lastErrorCode, scene.lastErrorMessage ?? undefined)
      : null;

  const logEntries = Array.isArray(scene.generationLogJson)
    ? (scene.generationLogJson as unknown as Array<{
        stage: string;
        level: 'debug' | 'info' | 'warn' | 'error';
        message: string;
        data?: Record<string, unknown>;
        ts: string;
      }>)
    : [];

  return (
    <div dir="rtl" className="container mx-auto space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">דיבאג סצנה</h1>
          <SceneCardStatusBadge status={status} />
          {scene.needsManualReview && (
            <Badge className="bg-amber-100 text-amber-800">דורש בדיקה ידנית</Badge>
          )}
        </div>
        <p className="text-sm text-zinc-600">
          <Link
            href={`/projects/${project.id}/scenes/${scene.id}`}
            className="text-blue-700 hover:underline"
          >
            {project.productName ?? 'פרויקט'}
          </Link>{' '}
          · סצנה {scene.sceneOrder + 1}/{(scene as { totalScenes?: number }).totalScenes ?? '?'}{' '}
          · scene_id <span className="font-mono">{scene.id}</span> · משתמש{' '}
          <span className="font-mono">{project.user?.email ?? '—'}</span>
          {' · '}
          <Link
            href={`/admin/projects/${project.id}/debug`}
            className="text-blue-700 hover:underline"
          >
            דיבאג פרויקט →
          </Link>
        </p>
        {scene.imageUrl && (
          <Link
            href={`/admin/scenes/${scene.id}/compare`}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-700"
            title="הנפש את התמונה ב-3 מנועים במקביל והשווה ביניהם (Kling Omni v3 / Kling video-o1 / Grok)"
          >
            🎬 השווה הנפשה ב-3 מנועים →
          </Link>
        )}
      </header>

      {/* ── Last error ─────────────────────────────────────────────── */}
      <DebugSection title="שגיאה אחרונה" hidden={!errorEntry}>
        {errorEntry && (
          <div className="space-y-2 text-sm">
            <p className="font-medium">{errorEntry.hebrew}</p>
            <p className="text-xs text-zinc-500">
              קוד: <span className="font-mono">{errorEntry.code}</span>
              {errorEntry.isFallback && (
                <span className="ml-2 text-amber-700">(לא מתועד)</span>
              )}
            </p>
            {errorEntry.raw && (
              <pre
                dir="ltr"
                className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-100 p-2 font-mono text-[11px] text-zinc-700"
              >
                {errorEntry.raw}
              </pre>
            )}
          </div>
        )}
      </DebugSection>

      {/* ── Generation log ────────────────────────────────────────── */}
      <DebugSection title={`לוג ייצור (${logEntries.length})`}>
        <SceneLogViewer entries={logEntries} />
      </DebugSection>

      {/* ── Routing flags / rule flags ────────────────────────────── */}
      <DebugSection title="דגלי routing & rules">
        <KeyValueGrid
          rows={[
            ['sceneType', scene.sceneType],
            ['sceneGenerationType', scene.sceneGenerationType ?? '—'],
            ['sceneGoal', scene.sceneGoal ?? '—'],
            ['faceVisibility', scene.faceVisibility ?? '—'],
            ['requiresLipSync', scene.requiresLipSync == null ? '—' : String(scene.requiresLipSync)],
            ['primarySubject', (scene as { primarySubject?: string | null }).primarySubject ?? '—'],
            ['mustShowProduct', String((scene as { mustShowProduct?: boolean | null }).mustShowProduct ?? '—')],
            ['productVisibilityPriority', (scene as { productVisibilityPriority?: string | null }).productVisibilityPriority ?? '—'],
            ['cameraFocus', (scene as { cameraFocus?: string | null }).cameraFocus ?? '—'],
            ['showFace', String((scene as { showFace?: boolean | null }).showFace ?? '—')],
          ]}
        />
      </DebugSection>

      {/* ── V14 — frame techniques, scroll-stopper, outfit lock, genre ── */}
      <DebugSection title="V14 — frame techniques + scroll-stopper + outfit + genre">
        <KeyValueGrid
          rows={[
            ['V14 PR1 israeli_setting_cue (per scene, from script.rawJson)', v14SceneCue ?? '—'],
            [
              'V14 PR2 frameTechniqueSnippetIds (brief)',
              briefV14?.frameTechniqueSnippetIds?.length
                ? briefV14.frameTechniqueSnippetIds.join(', ')
                : '—',
            ],
            ['V14 PR3 lockedOutfit (project)', lockedOutfit ?? '— not yet locked —'],
            [
              'V14 PR4 scrollStopperApplied',
              briefV14?.scrollStopperApplied == null
                ? '—'
                : String(briefV14.scrollStopperApplied),
            ],
            ['V14 PR4 scrollStopperReason', briefV14?.scrollStopperReason ?? '—'],
            ['V14 PR5 genre (script)', v14Genre ?? '—'],
            ['V14 PR5 voice_profile (script)', v14VoiceProfile ?? '—'],
            [
              'V14 PR5 hook_alternatives count',
              v14HookAlternatives ? String(v14HookAlternatives.length) : '—',
            ],
          ]}
        />
        {briefV14?.variationDiversity && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold text-zinc-600">
              V14 PR4 variationDiversity (across earlier scenes in this script)
            </p>
            <PrettyJson value={briefV14.variationDiversity} />
          </div>
        )}
      </DebugSection>

      {/* ── V27.11 — anti-collage + schema state ───────────────────── */}
      <DebugSection title="V27.11 — anti-collage + schema state">
        <KeyValueGrid
          rows={[
            // PR1 — comparison-guard bridge
            [
              'V27.11.PR1 comparisonGuardApplied',
              briefV14?.comparisonGuardApplied == null
                ? '— (brief pre-PR1)'
                : String(briefV14.comparisonGuardApplied),
            ],
            [
              'V27.11.PR1 comparisonGuardReasons',
              briefV14?.comparisonGuardReasons?.length
                ? briefV14.comparisonGuardReasons.join('; ')
                : '—',
            ],
            // PR3 — legacy meta fields detection
            [
              'V27.11.PR3 legacy meta fields in rawJson',
              v2711LegacyFlags?.hasPr3DroppedFields
                ? v2711LegacyFlags.pr3DroppedFields.join(', ')
                : '—',
            ],
            // PR4 — deprecated enum values detection
            [
              'V27.11.PR4 deprecated enum values in rawJson',
              v2711LegacyFlags?.hasPr4DeprecatedEnum
                ? v2711LegacyFlags.pr4DeprecatedEnum.join(', ')
                : '—',
            ],
          ]}
        />
        {briefV14?.comparisonGuardApplied === true && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">
              ⚠ V27.11.PR1 comparison-guard fired
            </p>
            <p className="mt-1 text-xs text-amber-800">
              ה-image-brief זיהה signal של comparison/before-after בסצנה הזו והוסיף את
              ה-COMPARISON_GUARD_RULE_BLOCK ו-13 collage-specific negatives ל-finalImagePrompt.
              ה-SINGLE-FRAME RULE ב-scene-image-prompts.ts ידחה layout של panels בכל מקרה.
            </p>
          </div>
        )}
        {v2711LegacyFlags?.hasPr3DroppedFields && (
          <div className="mt-3 rounded border border-zinc-300 bg-zinc-50 p-3">
            <p className="text-xs font-semibold text-zinc-700">
              ℹ legacy script (pre-V27.11.PR3)
            </p>
            <p className="mt-1 text-xs text-zinc-600">
              התסריט הזה נוצר לפני PR3 ועדיין מחזיק meta-fields שנמחקו מהסכמה
              ({v2711LegacyFlags.pr3DroppedFields.join(', ')}). ה-runtime mapper
              לא קורא אותם — תסריטים חדשים לא יכילו אותם, parsing של תסריטים
              ישנים עדיין עובד.
            </p>
          </div>
        )}
        {v2711LegacyFlags?.hasPr4DeprecatedEnum && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">
              ⚠ V27.11.PR4 deprecated enum values present
            </p>
            <p className="mt-1 text-xs text-amber-800">
              סצנה זו מכילה {v2711LegacyFlags.pr4DeprecatedEnum.join(', ')}. NEW
              scripts לא יכולים לבחור את הערכים האלה (הסכמה דחתה אותם), אבל
              legacy DB scripts כן. ה-PR1 bridge מפעיל COMPARISON GUARD על
              סצנות עם scene_generation_type='before_after' אוטומטית — ראה את
              comparisonGuardApplied למעלה.
            </p>
          </div>
        )}
      </DebugSection>

      {/* ── Image brief (full JSON) ────────────────────────────────── */}
      <DebugSection title="Image Brief" hidden={!scene.imageBriefJson}>
        <PrettyJson value={scene.imageBriefJson} />
      </DebugSection>

      {/* ── Final image prompt ────────────────────────────────────── */}
      <DebugSection title="פרומט סופי לתמונה" hidden={!scene.imagePromptUsed}>
        {scene.imagePromptUsed && (
          <pre
            dir="ltr"
            className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-50 p-3 font-mono text-[11px] text-zinc-700"
          >
            {scene.imagePromptUsed}
          </pre>
        )}
      </DebugSection>

      {/* ── Motion analysis ──────────────────────────────────────── */}
      <DebugSection
        title={`ניתוח תנועה (${process.env.OPENAI_MOTION_VISION_MODEL ?? 'gpt-5.4-mini'})`}
        hidden={!scene.motionAnalysisJson}
      >
        <PrettyJson value={scene.motionAnalysisJson} />
        {scene.motionAnalysisImageUrl && (
          <p className="mt-2 text-xs text-zinc-500">
            cached for imageUrl:{' '}
            <a
              href={scene.motionAnalysisImageUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-blue-700 hover:underline"
            >
              {scene.motionAnalysisImageUrl}
            </a>
          </p>
        )}
      </DebugSection>

      {/* ── Lipsync state (V27.10.20) ────────────────────────────── */}
      <DebugSection
        title={`מצב Lipsync — face-gate (${process.env.OPENAI_FACE_GATE_MODEL ?? 'gpt-5.4-mini'})`}
        hidden={
          scene.requiresLipSync == null &&
          scene.lipSyncStatus == null &&
          scene.faceGateImageUrl == null
        }
      >
        <KeyValueGrid
          rows={[
            ['requiresLipSync', String(scene.requiresLipSync ?? '—')],
            ['lipSyncStatus', scene.lipSyncStatus ?? '—'],
            ['lipSyncErrorMessage', scene.lipSyncErrorMessage ?? '—'],
            ['fullFaceDetected', String(scene.fullFaceDetected ?? '—')],
            ['mouthVisible', String(scene.mouthVisible ?? '—')],
            [
              'faceDetectionConfidence',
              scene.faceDetectionConfidence != null
                ? scene.faceDetectionConfidence.toFixed(2)
                : '—',
            ],
            ['faceGateReason', scene.faceGateReason ?? '—'],
            ['faceGateImageUrl', scene.faceGateImageUrl ?? '—'],
            ['pixverseVideoId', scene.pixverseVideoId ?? '—'],
            ['audioHandling', scene.audioHandling ?? '—'],
          ]}
        />
        {scene.lipSyncStatus === 'skipped_face_gate_error' && (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            <strong>face-gate נכשל ב-API.</strong> ה-clip חזר עם קול
            mux'd (לא lipsynced). צילום הסצנה שלם, אבל השפתיים לא
            מסונכרנות. בדוק שה-env <code>OPENAI_FACE_GATE_MODEL</code> תואם
            למודל שתומך ב-Responses API + reasoning params (gpt-5.4-mini /
            gpt-5.4 / o1 / o3) — או שהקוד מוריד את ה-reasoning param אם
            המודל הוא gpt-4o (V27.10.20). אם הסטטוס הזה חוזר על מודל gpt-5
            פתוח את <code>lipSyncErrorMessage</code> למעלה.
          </p>
        )}
      </DebugSection>

      {/* ── Image QA legacy ──────────────────────────────────────── */}
      <DebugSection
        title="Image QA (V11 — legacy, V13 PR1 הסיר את הלולאה)"
        hidden={!scene.imageQaJson}
      >
        <p className="mb-2 text-xs text-amber-700">
          הנתון הזה היסטורי — ה-QA loop הוסר ב-V13 PR1. מוצג כאן רק לצורכי
          forensics על סצנות ישנות.
        </p>
        <PrettyJson value={scene.imageQaJson} />
      </DebugSection>

      {/* ── Generation history ───────────────────────────────────── */}
      <DebugSection title="היסטוריית ייצור">
        <KeyValueGrid
          rows={[
            ['imageGenerationCount', scene.imageGenerationCount],
            ['imageRegenAttempts', scene.imageRegenAttempts],
            ['voiceGenerationCount', scene.voiceGenerationCount],
            ['clipGenerationCount', scene.clipGenerationCount],
            ['needsManualReview', String(scene.needsManualReview)],
            ['imageGeneratedAt', scene.imageGeneratedAt?.toISOString() ?? '—'],
            ['voiceGeneratedAt', scene.voiceGeneratedAt?.toISOString() ?? '—'],
            ['clipGeneratedAt', scene.clipGeneratedAt?.toISOString() ?? '—'],
            ['captionsGeneratedAt', scene.captionsGeneratedAt?.toISOString() ?? '—'],
          ]}
        />
      </DebugSection>

      {/* ── Project Product Intelligence ─────────────────────────── */}
      <DebugSection title="Product Intelligence (פרויקט)" hidden={!intelligence}>
        <PrettyJson value={intelligence} />
      </DebugSection>
    </div>
  );
}

// ── Small presentational helpers ────────────────────────────────────

function DebugSection({
  title,
  children,
  hidden,
}: {
  title: string;
  children: React.ReactNode;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h2 className="text-sm font-semibold text-zinc-700">{title}</h2>
        <div className="text-sm">{children}</div>
      </CardContent>
    </Card>
  );
}

function KeyValueGrid({
  rows,
}: {
  rows: ReadonlyArray<readonly [string, React.ReactNode]>;
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm md:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-2">
          <dt className="shrink-0 font-mono text-xs text-zinc-500">{k}</dt>
          <dd className="break-all text-zinc-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function PrettyJson({ value }: { value: unknown }) {
  if (value == null) {
    return <p className="text-xs text-zinc-500">— אין נתון —</p>;
  }
  return (
    <pre
      dir="ltr"
      className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-50 p-3 font-mono text-[11px] text-zinc-700"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
