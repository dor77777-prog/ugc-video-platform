// V27.11 — Per-ApiCall debug page.
//
// Drill-down from /admin/costs recent-calls table or /admin/projects/
// [id]/debug ApiCalls section. Shows the full row including metadata
// (the JSON blob carries provider-specific request/response context),
// linked project + scene + render job, and a related-calls panel for
// other calls in the same project's pipeline window.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
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

export default async function AdminApiCallDebugPage({ params }: PageProps) {
  const { id } = await params;
  const call = await prisma.apiCall.findUnique({
    where: { id },
  });
  if (!call) notFound();

  // Related context — load on demand
  const [project, scene, renderJob, user, sameOpRecentCalls] = await Promise.all([
    call.projectId
      ? prisma.project.findUnique({
          where: { id: call.projectId },
          select: { id: true, productName: true, userId: true, status: true },
        })
      : Promise.resolve(null),
    call.sceneId
      ? prisma.scene.findUnique({
          where: { id: call.sceneId },
          select: {
            id: true,
            sceneOrder: true,
            sceneGenerationType: true,
            status: true,
            scriptId: true,
          },
        })
      : Promise.resolve(null),
    call.renderJobId
      ? prisma.renderJob.findUnique({
          where: { id: call.renderJobId },
          select: { id: true, status: true, progressPercent: true },
        })
      : Promise.resolve(null),
    call.userId
      ? prisma.user.findUnique({
          where: { id: call.userId },
          select: { id: true, email: true, plan: true },
        })
      : Promise.resolve(null),
    // Other calls of the same operation in the last hour for this user
    call.userId
      ? prisma.apiCall.findMany({
          where: {
            userId: call.userId,
            operation: call.operation,
            id: { not: id },
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            status: true,
            costUsd: true,
            durationMs: true,
            createdAt: true,
            inputTokens: true,
            outputTokens: true,
          },
        })
      : Promise.resolve([] as never[]),
  ]);

  return (
    <div dir="rtl" className="container mx-auto space-y-6 p-6 max-w-5xl">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">דיבאג קריאת API</h1>
          <Badge variant="outline" className="font-mono text-xs">
            {call.id}
          </Badge>
          <StatusPill
            variant={
              call.status === 'success'
                ? 'success'
                : call.status === 'failed'
                  ? 'error'
                  : 'pending'
            }
          >
            {call.status}
          </StatusPill>
          <a
            href={`/api/admin/apicalls/${call.id}/export`}
            className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-mono text-blue-700 hover:bg-blue-100"
            download
            title="הורד דוח Markdown מלא של הקריאה — קריא ל-Claude Code"
          >
            📥 ייצוא דוח
          </a>
        </div>
        <p className="text-sm text-zinc-600">
          {call.provider} · {call.operation} · {call.model ?? 'no model'}
        </p>
      </header>

      {/* ── Core fields ──────────────────────────────────────────── */}
      <DebugSection
        title="פרטי הקריאה"
        info={{
          whatItIs:
            'השדות הבסיסיים של ה-ApiCall row: מי הספק, איזה operation, באיזה מודל, סטטוס (in_progress/success/failed), tokens (input/output), עלויות (estimated/actual/final), משך הקריאה, הודעת שגיאה. status=in_progress פירושו ש-recordApiCallStart נכתב אבל recordApiCallComplete עדיין לא — או שהקריאה תקועה או שהיא רצה כעת.',
          pipelineStage: 'נוצר ב-recordApiCallStart לפני שליחת הקריאה לספק; מתעדכן ב-recordApiCallComplete אחריה.',
          sourceFiles: [
            'apps/web/lib/usage/log.ts → recordApiCallStart, recordApiCallComplete',
            'prisma/schema.prisma → model ApiCall',
          ],
          notes: [
            'durationMs ניטרלי לכל ספק — נמדד ב-Date.now() דלתא',
            'cost = costUsd (final) = actualCostUsd ?? estimatedCostUsd ?? 0',
            'success הוא legacy boolean (V12 ומאז, status הוא ה-source of truth)',
          ],
        }}
      >
        <KeyValueGrid
          rows={[
            ['id', <code key="id">{call.id}</code>],
            ['provider', call.provider],
            ['operation', call.operation],
            ['model', call.model ?? '—'],
            ['status', call.status],
            ['success (legacy)', String(call.success)],
            ['createdAt', fmtRelative(call.createdAt)],
            ['completedAt', call.completedAt ? fmtRelative(call.completedAt) : '—'],
            ['durationMs', fmtDuration(call.durationMs)],
            ['units', call.units ?? '—'],
            ['inputTokens', call.inputTokens?.toLocaleString() ?? '—'],
            ['outputTokens', call.outputTokens?.toLocaleString() ?? '—'],
            ['costUsd (final)', fmtUSD(call.costUsd)],
            ['estimatedCostUsd', fmtUSD(call.estimatedCostUsd)],
            ['actualCostUsd', fmtUSD(call.actualCostUsd)],
            ['errorMessage', call.errorMessage ?? '—'],
          ]}
        />
      </DebugSection>

      {/* ── Provider metadata (request shape + usage payload) ────── */}
      <DebugSection
        title="provider metadata"
        description="ה־JSON blob שמכיל את ה־payload הספציפי לכל ספק (OpenAI usage, Anthropic cache_read tokens, Kling task ids וכו')"
        info={{
          whatItIs:
            'ה-metadata field של ApiCall — JSON unsanctioned-shape שלכל operation מחליטה מה להכניס. דוגמאות: OpenAI Responses → usage.input_tokens / output_tokens; Anthropic → cache_read_input_tokens / cache_creation_input_tokens; Kling i2v → task_id + state; PixVerse → request_id + face-gate verdict; concept_concept_regenerate_selected → replacedConceptIds + keptConceptIds. שימושי במיוחד לדיבאג של "למה לא עבד?".',
          pipelineStage: 'נכתב ב-recordApiCallStart (initial metadata) ו/או ב-recordApiCallComplete (post-call metadata).',
          sourceFiles: [
            'apps/web/app/(dashboard)/projects/[id]/scripts/concept-actions.ts (writes concept regen metadata)',
            'apps/web/lib/animation/* (writes Kling/PixVerse metadata)',
            'apps/web/lib/scenes/clip-impl.ts (writes face-gate verdict + lipsync status)',
          ],
          notes: [
            'אם הקריאה נכשלה — חפש כאן את השגיאה (לפעמים מפורטת יותר מ-errorMessage)',
            'בחקירת איכות: tokens.input ניתן להשוות ל-tokens.output כדי להבין כמה compute הלך לפלט',
            'בחקירת cache (Anthropic): cache_read_input_tokens / cache_creation_input_tokens מראים אם prompt-cache עבד',
          ],
        }}
      >
        <PrettyJson value={call.metadata} maxHeight="max-h-[600px]" />
      </DebugSection>

      {/* ── Linked entities ──────────────────────────────────────── */}
      <DebugSection title="קישורים" description="לחץ כדי לקפוץ ל־debug page של ה-entity המקושר">
        <div className="space-y-2 text-sm">
          {user && (
            <div>
              <span className="font-mono text-xs text-zinc-500">User: </span>
              <span>
                {user.email} ({user.plan})
              </span>
            </div>
          )}
          {project && (
            <div>
              <span className="font-mono text-xs text-zinc-500">Project: </span>
              <Link
                href={`/admin/projects/${project.id}/debug`}
                className="font-mono text-blue-700 hover:underline"
              >
                {project.productName} ({project.id.slice(0, 8)}...) →
              </Link>
              <Badge variant="outline" className="mr-2">
                {project.status}
              </Badge>
            </div>
          )}
          {scene && (
            <div>
              <span className="font-mono text-xs text-zinc-500">Scene: </span>
              <Link
                href={`/admin/scenes/${scene.id}/debug`}
                className="font-mono text-blue-700 hover:underline"
              >
                #{scene.sceneOrder} {scene.sceneGenerationType} ({scene.id.slice(0, 8)}...) →
              </Link>
              <Badge variant="outline" className="mr-2">
                {scene.status ?? 'pending'}
              </Badge>
            </div>
          )}
          {renderJob && (
            <div>
              <span className="font-mono text-xs text-zinc-500">RenderJob: </span>
              <span className="font-mono">
                {renderJob.id.slice(0, 8)}... · {renderJob.status} · {renderJob.progressPercent}%
              </span>
            </div>
          )}
          {!project && !scene && !renderJob && (
            <p className="text-xs text-zinc-500">— אין entity מקושר —</p>
          )}
        </div>
      </DebugSection>

      {/* ── Related calls (same operation, same user, last hour) ── */}
      <DebugSection
        title={`קריאות קשורות (אותו operation בשעה האחרונה — ${sameOpRecentCalls.length})`}
        description="כדי להעריך הקשר — האם הקריאה הזו חלק מ־batch או רטריי?"
        hidden={sameOpRecentCalls.length === 0}
      >
        <table className="w-full text-xs">
          <thead className="border-b text-zinc-500">
            <tr>
              <th className="px-2 py-1 text-right">When</th>
              <th className="px-2 py-1 text-right">Status</th>
              <th className="px-2 py-1 text-right">Tokens</th>
              <th className="px-2 py-1 text-right">Cost</th>
              <th className="px-2 py-1 text-right">Duration</th>
              <th className="px-2 py-1 text-right">→</th>
            </tr>
          </thead>
          <tbody>
            {sameOpRecentCalls.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="px-2 py-1 text-zinc-500">{fmtRelative(c.createdAt)}</td>
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
      </DebugSection>

      <div className="text-xs text-zinc-500">
        <Link href="/admin/costs" className="hover:underline">
          ← חזרה לעלויות
        </Link>
        {project && (
          <span>
            {' '}
            ·{' '}
            <Link
              href={`/admin/projects/${project.id}/debug`}
              className="hover:underline"
            >
              דיבאג פרויקט →
            </Link>
          </span>
        )}
      </div>
    </div>
  );
}
