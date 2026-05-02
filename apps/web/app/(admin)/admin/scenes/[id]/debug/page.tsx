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
import {
  DebugSection,
  KeyValueGrid,
  PrettyJson,
  StatusPill,
  fmtDuration,
  fmtUSD,
  fmtRelative,
} from '@/components/admin/debug-helpers';

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

  // V27.11 — load every ApiCall scoped to this scene + the project
  // so the per-scene debug surfaces full provider context.
  const sceneApiCalls = await prisma.apiCall.findMany({
    where: { sceneId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

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
          <a
            href={`/api/admin/scenes/${scene.id}/export`}
            className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-mono text-blue-700 hover:bg-blue-100"
            download
            title="הורד דוח Markdown מלא של הסצנה — כולל image brief, motion analysis, lipsync state, captions, ApiCalls, errors. קריא ל-Claude Code."
          >
            📥 ייצוא דוח
          </a>
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
      <DebugSection
        title="דגלי routing & rules"
        info={{
          whatItIs:
            'מטא־דאטה ברמת סצנה שה־LLM כתב ב-structured output (V3/V4): scene_generation_type (talking_head / product_demo / closeup_product / hands_only / etc.), face_visibility, requires_lip_sync, primary_subject (avatar / product / hands), must_show_product, product_visibility_priority (high/medium/low), camera_focus (face / product / action), show_face. שדות אלו מנותבים אל clip-impl, image-brief-builder, ו-PixVerse face-gate.',
          pipelineStage: 'נכתב ע"י ה-LLM בזמן script generation (legacy_full_batch או concept_interactive expansion). נקרא ע"י כל ה-pipeline downstream.',
          sourceFiles: [
            'packages/prompts/src/script-json-schema.ts → SCENE_ITEM_SCHEMA (V27.11.PR3 trim: 20 fields)',
            'apps/web/lib/animation/scene-routing.ts → deriveSceneRouting (legacy heuristic fallback)',
            'apps/web/lib/scenes/clip-impl.ts (reads requires_lip_sync)',
            'apps/web/lib/image-briefs/image-brief-builder.ts (reads primary_subject, camera_focus)',
          ],
          updatedWhen: 'ב-script generation. אם ה-LLM החזיר NULL או ערך לא חוקי → derivedSceneRouting מסתכל על cameraDirection.',
          notes: [
            'requires_lip_sync=true גורר PixVerse pass; אם face_visibility != clear_front_facing זה drift של ה-LLM',
            'must_show_product=false מצופה רק ב-pure_setup / pain frames',
            'primary_subject=avatar אסור ב-product_demo / hands_only / closeup_product / cta_visual (V27.11.PR4)',
          ],
        }}
      >
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
      <DebugSection
        title="V14 — frame techniques + scroll-stopper + outfit + genre"
        info={{
          whatItIs:
            'שכבת V14 PR1-PR5 שעוטפת את ה-image brief: israeli_setting_cue (cue ID מ-8 קנוניים, V14 PR5), frame technique snippets (mirror_selfie / selfie_handheld / product_hand_hold / safe_reflection / consistency_anchor — V14 PR2), lockedOutfit (project-level, V14 PR3), scrollStopper levers (V14 PR4 — סצנה אחת ב-ad מקבלת tight framing + saturated color), variationDiversity (V14 PR4 ledger), V6 fields (genre / voice_profile / hook_alternatives, V14 PR5).',
          pipelineStage: 'נכתב ע"י ה-script LLM (V14 PR5 schema fields) ונקרא + מיוצר ע"י ה-image-brief-builder (V14 PR1-4 snippets). הצירוף נכנס ל-finalImagePrompt שנשלח ל-gpt-image-2.',
          sourceFiles: [
            'apps/web/lib/scene-planning/israeli-realism-rules.ts → 51 cues × 10 categories (V14 PR1)',
            'apps/web/lib/image-briefs/frame-technique-snippets.ts → 5 snippet builders (V14 PR2)',
            'apps/web/lib/avatars/outfit.ts → computeLockedOutfit (V14 PR3)',
            'apps/web/lib/image-briefs/scene-variation-ledger.ts → SceneVariationLedger (V14 PR4)',
            'apps/web/lib/image-briefs/image-brief-builder.ts → buildImageBrief — הקומפוזיטור',
          ],
          updatedWhen: 'ב-buildImageBrief בכל קריאה ליצירת תמונת סצנה (generate-impl).',
          notes: [
            'frameTechniqueSnippetIds = רשימת ה-snippets שנדרו לפי scene_generation_type / cameraFocus / mustShowProduct',
            'scrollStopperApplied=true → סצנה אחת ב-ad מקבלת treatment שונה',
            'V14 PR5 fields nullable — תסריטים pre-V6 לא יכילו אותם',
          ],
        }}
      >
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
      <DebugSection
        title="V27.11 — anti-collage + schema state"
        info={{
          whatItIs:
            'מצב anti-collage שפותח ב-V27.11.PR1: comparisonGuardApplied (true אם ה-image-brief זיהה comparison/before-after/vs language ב-rawVisualBrief), comparisonGuardReasons (איזה signal הפעיל). + flags של legacy schema state — אילו מ-4 השדות שנמחקו ב-PR3 עדיין מופיעים ב-rawJson, ואם scene_generation_type/frame_strategy מכילים ערכים שהוסרו ב-PR4.',
          pipelineStage: 'comparisonGuard נקבע ב-buildImageBrief (PR1 detector). PR3/PR4 flags נקבעים בעמוד הדיבאג עצמו ע"י קריאה מ-script.rawJson.',
          sourceFiles: [
            'apps/web/lib/image-briefs/image-brief-builder.ts → detectComparisonGuard (PR1)',
            'packages/prompts/src/scene-image-prompts.ts → SINGLE_FRAME_RULE (PR1 universal)',
            'packages/prompts/src/script-json-schema.ts → SCENE_GENERATION_TYPES (PR4 trim)',
          ],
          updatedWhen: 'בכל buildImageBrief — נקבע מ-rawVisualBrief + sceneGenerationType.',
          notes: [
            'comparisonGuardApplied=true → COMPARISON_GUARD_RULE_BLOCK + 13 negatives נכנסו ל-finalImagePrompt; gpt-image-2 ידחה panels',
            'PR3 dropped fields ב-rawJson = legacy script (לפני PR3) — לא אמור לפגוע, info-only',
            'PR4 deprecated enum = scene_generation_type=before_after או frame_strategy=comparison_split. ה-PR1 bridge תופס אותם אוטומטית.',
          ],
        }}
      >
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

      {/* ── Voice generation (ElevenLabs) ────────────────────────── */}
      <DebugSection
        title={`קריינות (ElevenLabs Hebrew TTS) — ${scene.voiceUrl ? '✅ נוצרה' : '— לא נוצרה —'}`}
        info={{
          whatItIs:
            'מצב הקריינות העברית של הסצנה. voiceUrl הוא קובץ ה-MP3 שיורד ל-R2 (אחרי mux במקרה non-lipsync). voiceProvider נכון להיום תמיד elevenlabs. voiceDurationSeconds נמדד ע"י ffprobe על ה-MP3 הסופי. textHebrewTts הוא ה-Hebrew TEXT הנקי שנשלח ל-ElevenLabs (אחרי הסרה של niqqud / סימני פיסוק שעלולים לבלבל את המודל).',
          pipelineStage: 'step 6 (voices) — generateSceneVoiceImpl. נשלח ל-ElevenLabs eleven_v3 with-timestamps endpoint, מקבל MP3 + word_timings.',
          sourceFiles: [
            'apps/web/lib/scenes/voice-impl.ts → generateSceneVoiceImpl',
            'apps/web/lib/voice/elevenlabs.ts → ElevenLabs HTTP wrapper',
            'apps/web/lib/voice/voice-presets.ts → 30 קולות + sampleUrl',
          ],
          envVars: ['ELEVENLABS_API_KEY'],
          updatedWhen: 'בכל generateSceneVoice (פעולה ידנית או batch). voiceInFlightAt נקבע לפני, נמחק אחרי.',
          notes: [
            'אם voiceUrl חסר אבל voiceInFlightAt קיים — קריינות תקועה (ElevenLabs timeout / 5xx). נסה regenerate.',
            'voiceDurationSeconds משמש ב-render-processor לחישוב cumulativeMs של captions — אם NULL captions לא יסתנכרנו טוב.',
            'wordTimingsJson + captionChunksJson נכתבים אחרי החזרה מ-ElevenLabs — ראה section "כתוביות" למטה.',
          ],
        }}
      >
        <KeyValueGrid
          rows={[
            ['voiceUrl', scene.voiceUrl ? <a key="vu" href={scene.voiceUrl} target="_blank" rel="noreferrer" className="font-mono text-xs text-blue-700 hover:underline">{scene.voiceUrl.slice(0, 60)}...</a> : '—'],
            ['voiceProvider', scene.voiceProvider ?? '—'],
            ['voiceDurationSeconds', scene.voiceDurationSeconds ?? '—'],
            ['voiceGenerationCount', scene.voiceGenerationCount],
            ['voiceGeneratedAt', scene.voiceGeneratedAt ? fmtRelative(scene.voiceGeneratedAt) : '—'],
            ['voiceInFlightAt (in-flight if set)', scene.voiceInFlightAt ? fmtRelative(scene.voiceInFlightAt) : '—'],
            ['textHebrew (display)', scene.textHebrew?.slice(0, 100) + (scene.textHebrew && scene.textHebrew.length > 100 ? '...' : '')],
            ['textHebrewTts (cleaned for TTS)', scene.textHebrewTts?.slice(0, 100) ?? '— same as textHebrew —'],
          ]}
        />
      </DebugSection>

      {/* ── Clip generation (Kling i2v + PixVerse lipsync) ──────────── */}
      <DebugSection
        title={`קליפ (Kling i2v + PixVerse LipSync) — ${scene.clipUrl ? '✅ נוצר' : '— לא נוצר —'}`}
        info={{
          whatItIs:
            '2-stage video generation: Stage A (Kling i2v) הופך תמונה סטילית לאנימציה של ~5s — clipMotionTaskId הוא ה-Kling task id, clipMotionImageUrl הוא ה-image שעבר אנימציה (cache key — אם scene.imageUrl שונה ממנו, נריץ מחדש). Stage B (PixVerse LipSync) רץ רק על סצנות עם מצב פנים מתאים (face-gate verdict): pixverseVideoMediaId / pixverseAudioMediaId / pixverseVideoId הם IDs של PixVerse. אם אין lipsync → ffmpeg muxes voice MP3 על ה-Kling clip.',
          pipelineStage: 'step 7 (videos) — clip-impl. סדר: motion analysis → face-gate → Kling i2v → (אופציונלי) PixVerse LipSync → אם לא, ffmpeg mux.',
          sourceFiles: [
            'apps/web/lib/scenes/clip-impl.ts → orchestrator',
            'apps/web/lib/animation/kling.ts → Kling i2v provider',
            'apps/web/lib/animation/face-gate.ts → V7 face-detection gate (gpt-4o-mini vision)',
            'apps/web/lib/animation/lipsync.ts → PixVerse LipSync provider',
            'apps/web/lib/animation/grok-imagine.ts → V26 alternative engine',
          ],
          envVars: ['KLING_ACCESS_KEY', 'KLING_SECRET_KEY', 'PIXVERSE_API_KEY', 'XAI_API_KEY (V26 alt)'],
          updatedWhen: 'generateSceneClip (פעולה ידנית או batch). Kling motion cache משתמש כשרק lipsync נכשל ולא צריך לרוץ שוב.',
          notes: [
            'clipMotionTaskId קיים אך clipUrl חסר — סימן שה-i2v הצליח אבל ה-lipsync או ffmpeg mux נכשלו',
            'audioHandling=baked_into_video — PixVerse החזיר clip עם voice synced; אין צורך לעשות mux של voice MP3 ב-render',
            'audioHandling=separate_audio — ה-Kling clip שקט, voice מ-MP3 מועלה ב-render-processor',
            'clipProvider=grok — V26 alternative engine נבחר; lipsync תמיד pinned ל-Kling',
          ],
        }}
      >
        <KeyValueGrid
          rows={[
            ['clipUrl', scene.clipUrl ? <a key="cu" href={scene.clipUrl} target="_blank" rel="noreferrer" className="font-mono text-xs text-blue-700 hover:underline">{scene.clipUrl.slice(0, 60)}...</a> : '—'],
            ['clipProvider', scene.clipProvider ?? '—'],
            ['clipDurationSeconds', scene.clipDurationSeconds ?? '—'],
            ['clipGenerationCount', scene.clipGenerationCount],
            ['clipGeneratedAt', scene.clipGeneratedAt ? fmtRelative(scene.clipGeneratedAt) : '—'],
            ['clipInFlightAt (in-flight if set)', scene.clipInFlightAt ? fmtRelative(scene.clipInFlightAt) : '—'],
            ['audioHandling', scene.audioHandling ?? '—'],
            ['—', '— Kling i2v cache —'],
            ['clipMotionTaskId', scene.clipMotionTaskId ?? '—'],
            ['clipMotionImageUrl matches imageUrl?', scene.imageUrl && scene.clipMotionImageUrl ? (scene.imageUrl === scene.clipMotionImageUrl ? '✅ yes (cache hit)' : '⚠ no (will re-run i2v)') : '— no cache yet —'],
            ['clipMotionGeneratedAt', scene.clipMotionGeneratedAt ? fmtRelative(scene.clipMotionGeneratedAt) : '—'],
            ['—', '— PixVerse LipSync IDs —'],
            ['pixverseVideoMediaId', scene.pixverseVideoMediaId ?? '—'],
            ['pixverseAudioMediaId', scene.pixverseAudioMediaId ?? '—'],
            ['pixverseVideoId', scene.pixverseVideoId ?? '—'],
          ]}
        />
      </DebugSection>

      {/* ── Captions / word timings ─────────────────────────────────── */}
      <DebugSection
        title={`כתוביות + word timings ${scene.captionChunksJson ? '✅' : '— לא נכתבו —'}`}
        hidden={!scene.wordTimingsJson && !scene.captionChunksJson}
        info={{
          whatItIs:
            'תזמון ברמת מילה ועל-פי chunks הנבנים מ-ElevenLabs with-timestamps response. wordTimingsJson = [{ word, startMs, endMs }, ...] לכל המילים. captionChunksJson = [{ text, startMs, endMs, lineCount, wordCount }, ...] — chunks של 2-5 מילים, ≤2 שורות, 650-2200ms שכל אחד נטען ב-ASS Dialogue line נפרד. ה-render-processor עוטף את ה-chunks ב-cumulative offset (לפי probedDurationsMs של clips קודמים) לפני burning.',
          pipelineStage: 'step 6 — generateSceneVoiceImpl. אחרי שה-MP3 חוזר עם word_timings, charactersToWords + chunkCaptions מייצרים את ה-arrays.',
          sourceFiles: [
            'apps/web/lib/scenes/voice-impl.ts → calls chunkCaptions',
            'packages/shared/src/captions/chunker.ts → chunkCaptions (Hebrew RTL aware)',
            'packages/shared/src/captions/ass-builder.ts → buildAssFromChunks (used by worker)',
            'apps/worker/src/processors/render-processor.ts → cumulativeMs offset + burn',
          ],
          updatedWhen: 'בכל generateSceneVoice — נכתב יחד עם voiceUrl. אם NULL → ה-renderer מדלג על captions לסצנה.',
          notes: [
            'אם wordTimingsJson NULL אבל voiceUrl קיים — ElevenLabs response חסר timestamps (קרה ל-eleven_v2; eleven_v3 with-timestamps אמין)',
            'V26.13 fix: render-processor משתמש ב-probedDurationsMs דרך ffprobe על ה-clips המנורמלים, לא ב-clipDurationSeconds',
            'ב-ASS, כל chunk = Dialogue line נפרד עם start/end time',
          ],
        }}
      >
        <KeyValueGrid
          rows={[
            ['captionsGeneratedAt', scene.captionsGeneratedAt ? fmtRelative(scene.captionsGeneratedAt) : '—'],
            [
              'wordTimings count',
              Array.isArray(scene.wordTimingsJson) ? scene.wordTimingsJson.length : '—',
            ],
            [
              'captionChunks count',
              Array.isArray(scene.captionChunksJson) ? scene.captionChunksJson.length : '—',
            ],
          ]}
        />
        {scene.captionChunksJson && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-zinc-600">
              📝 captionChunks ({Array.isArray(scene.captionChunksJson) ? scene.captionChunksJson.length : 0}) ↓
            </summary>
            <PrettyJson value={scene.captionChunksJson} maxHeight="max-h-[400px]" />
          </details>
        )}
        {scene.wordTimingsJson && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-zinc-600">
              ⏱ wordTimings ({Array.isArray(scene.wordTimingsJson) ? scene.wordTimingsJson.length : 0}) ↓
            </summary>
            <PrettyJson value={scene.wordTimingsJson} maxHeight="max-h-[400px]" />
          </details>
        )}
      </DebugSection>

      {/* ── Scene-level ApiCalls timeline ───────────────────────────── */}
      <DebugSection
        title={`קריאות API לסצנה (${sceneApiCalls.length})`}
        info={{
          whatItIs:
            'כל ה-ApiCalls שמכילות sceneId=ה-scene הזה. כולל: gpt-image-2 (image_gen), gpt-4o-mini vision (motion_analysis, face_gate, product_visual_analysis), ElevenLabs (tts), Kling (i2v), PixVerse (pixverse_media_upload, lipsync), ffmpeg (mux). מסודר לפי createdAt יורד.',
          pipelineStage: 'בכל פעולה שעוברת דרך recordApiCallStart עם sceneId.',
          sourceFiles: [
            'apps/web/lib/usage/log.ts → recordApiCallStart (sceneId param)',
            'apps/web/lib/scenes/{generate,voice,clip}-impl.ts (כותבים sceneId לכל קריאה)',
          ],
          notes: [
            'אם פעולה צפויה חסרה — סימן ש-recordApiCallStart לא נקרא (early-fail before logging)',
            'metadata blob של כל call מכיל ה-payload הספציפי (Kling task_id, PixVerse face-gate verdict, וכו\')',
            'לחיצה על → פותחת עמוד דיבאג מלא של אותה קריאה',
          ],
        }}
      >
        {sceneApiCalls.length === 0 ? (
          <p className="text-xs text-zinc-500">— אין קריאות API משויכות לסצנה הזו —</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b text-zinc-500">
              <tr>
                <th className="px-2 py-1 text-right">When</th>
                <th className="px-2 py-1 text-right">Provider</th>
                <th className="px-2 py-1 text-right">Operation</th>
                <th className="px-2 py-1 text-right">Status</th>
                <th className="px-2 py-1 text-right">Tokens (in/out)</th>
                <th className="px-2 py-1 text-right">Cost</th>
                <th className="px-2 py-1 text-right">Duration</th>
                <th className="px-2 py-1 text-right">→</th>
              </tr>
            </thead>
            <tbody>
              {sceneApiCalls.map((c) => (
                <tr key={c.id} className="border-b hover:bg-zinc-50">
                  <td className="px-2 py-1 text-zinc-500">{fmtRelative(c.createdAt)}</td>
                  <td className="px-2 py-1 font-mono">{c.provider}</td>
                  <td className="px-2 py-1 font-mono">{c.operation}</td>
                  <td className="px-2 py-1">
                    <StatusPill
                      variant={
                        c.status === 'success'
                          ? 'success'
                          : c.status === 'failed'
                            ? 'error'
                            : 'pending'
                      }
                    >
                      {c.status}
                    </StatusPill>
                  </td>
                  <td className="px-2 py-1 text-right font-mono">
                    {c.inputTokens != null && c.outputTokens != null
                      ? `${c.inputTokens.toLocaleString()} / ${c.outputTokens.toLocaleString()}`
                      : '—'}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">{fmtUSD(c.costUsd)}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmtDuration(c.durationMs)}</td>
                  <td className="px-2 py-1 text-right">
                    <Link
                      href={`/admin/apicalls/${c.id}`}
                      className="font-mono text-blue-700 hover:underline"
                    >
                      →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

// V27.11 — DebugSection / KeyValueGrid / PrettyJson now imported from
// @/components/admin/debug-helpers (shared across admin debug pages).
// The inline copies were removed; the shared versions support the
// `info` prop (SectionInfo panel) and `maxHeight` on PrettyJson.
