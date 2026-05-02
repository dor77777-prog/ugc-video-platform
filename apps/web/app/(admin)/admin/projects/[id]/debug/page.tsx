// V27.11 — Comprehensive Project Debug Page.
//
// Single page that surfaces EVERY persisted artifact for a project,
// so debugging "why did X come out wrong?" doesn't require Prisma
// Studio.
//
// Sections (top → bottom, in execution order of the pipeline):
//   1. Project meta + ownership + status
//   2. Step-1 product data (URL, description, brand, category, hero)
//   3. Avatar + voice selection
//   4. Selected features (FEATURE FOCUS)
//   5. Product Intelligence (V11 dossier + visual + audience)
//      + sourceHash freshness
//   6. Pending concept cards (V27.11.PR6 concept_interactive)
//      + per-card details + regen history
//   7. Generated scripts (full rawJson + creative_strategy + scenes)
//   8. Scenes (link out to per-scene debug)
//   9. Render jobs
//   10. ApiCalls timeline (link out to per-call detail)
//   11. Credit transactions
//   12. Live wizard URLs (jump to any step as the user)
//
// This is admin-only (requireAdmin via /admin layout). Read-only.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  isIntelligenceFresh,
  intelligenceSourceHash,
  extractIntelligenceSourceFields,
} from '@/lib/product-intelligence/source-hash';
import { readPendingConcepts } from '@/lib/llm/concept-storage';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const FRAMEWORK_LABEL: Record<string, string> = {
  problem_agitation_solution: 'בעיה → הסלמה → פתרון',
  skeptical_testimonial: 'סקפטיקל מתהפך',
  demonstration_proof: 'הדגמה ויזואלית',
  price_alternative_anchor: 'עוגן מחיר',
  relatable_israeli_moment: 'רגע ישראלי',
  fast_direct_response: 'דיירקט מהיר',
};

export default async function AdminProjectDebugPage({ params }: PageProps) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, plan: true, creditsBalance: true } },
      scripts: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          framework: true,
          angle: true,
          hook: true,
          selectedHookReason: true,
          qualityScoreOverall: true,
          cta: true,
          targetAudience: true,
          estimatedDurationSeconds: true,
          rawJson: true,
          createdAt: true,
          scenes: {
            orderBy: { sceneOrder: 'asc' },
            select: {
              id: true,
              sceneOrder: true,
              sceneType: true,
              sceneGoal: true,
              sceneGenerationType: true,
              status: true,
              imageUrl: true,
              voiceUrl: true,
              clipUrl: true,
              durationSeconds: true,
              textHebrew: true,
              lastErrorCode: true,
              lastErrorMessage: true,
            },
          },
        },
      },
      renderJobs: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });
  if (!project) notFound();

  const data = (project.productData as Record<string, unknown> | null) ?? {};

  // Intelligence freshness check
  const cachedIntel = (data.intelligence ?? null) as
    | import('@/lib/product-intelligence').ProductIntelligence
    | null;
  const currentHash = intelligenceSourceHash(
    extractIntelligenceSourceFields({
      productName: project.productName ?? 'מוצר ללא שם',
      productData: data,
    }),
  );
  const intelFresh = isIntelligenceFresh({
    intelligence: cachedIntel,
    currentHash,
  });

  // Pending concepts
  const pendingConcepts = readPendingConcepts(data);

  // ApiCalls — last 50 for this project
  const apiCalls = await prisma.apiCall.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Credit transactions for this project
  const creditTxs = await prisma.creditTransaction.findMany({
    where: { ref: id, refType: 'project' },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const totalCost = apiCalls.reduce((acc, c) => acc + (c.costUsd ?? 0), 0);

  return (
    <div dir="rtl" className="container mx-auto space-y-6 p-6 max-w-6xl">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">דיבאג פרויקט</h1>
          <Badge variant="outline" className="font-mono text-xs">
            {project.id}
          </Badge>
          <StatusPill
            variant={
              project.status === 'completed'
                ? 'success'
                : project.status === 'failed'
                  ? 'error'
                  : 'pending'
            }
          >
            {project.status}
          </StatusPill>
        </div>
        <p className="text-sm text-zinc-600">
          {project.productName} · {project.user.email} ({project.user.plan})
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            href={`/projects/${project.id}/edit`}
            className="rounded bg-zinc-100 px-2 py-1 font-mono hover:bg-zinc-200"
          >
            /edit
          </Link>
          <Link
            href={`/projects/${project.id}/avatar`}
            className="rounded bg-zinc-100 px-2 py-1 font-mono hover:bg-zinc-200"
          >
            /avatar
          </Link>
          <Link
            href={`/projects/${project.id}/features`}
            className="rounded bg-zinc-100 px-2 py-1 font-mono hover:bg-zinc-200"
          >
            /features
          </Link>
          <Link
            href={`/projects/${project.id}/scripts`}
            className="rounded bg-zinc-100 px-2 py-1 font-mono hover:bg-zinc-200"
          >
            /scripts
          </Link>
          <Link
            href={`/projects/${project.id}/scenes`}
            className="rounded bg-zinc-100 px-2 py-1 font-mono hover:bg-zinc-200"
          >
            /scenes
          </Link>
          <Link
            href={`/projects/${project.id}/voices`}
            className="rounded bg-zinc-100 px-2 py-1 font-mono hover:bg-zinc-200"
          >
            /voices
          </Link>
          <Link
            href={`/projects/${project.id}/videos`}
            className="rounded bg-zinc-100 px-2 py-1 font-mono hover:bg-zinc-200"
          >
            /videos
          </Link>
          <Link
            href={`/admin/projects/${project.id}/diagnostic`}
            className="rounded bg-blue-100 px-2 py-1 font-mono text-blue-800 hover:bg-blue-200"
          >
            diagnostic
          </Link>
        </div>
      </header>

      {/* ── Section 1: Project meta ───────────────────────────────── */}
      <DebugSection title="מטא־פרויקט">
        <KeyValueGrid
          rows={[
            ['id', <code key="id">{project.id}</code>],
            ['userId', <code key="uid">{project.userId}</code>],
            ['email', project.user.email],
            ['plan', project.user.plan],
            ['credits', project.user.creditsBalance],
            ['status', project.status],
            ['productName', project.productName],
            ['productUrl', project.productUrl ?? '—'],
            ['selectedScriptId', project.selectedScriptId ?? '—'],
            ['createdAt', fmtRelative(project.createdAt)],
            ['updatedAt', fmtRelative(project.updatedAt)],
          ]}
        />
      </DebugSection>

      {/* ── Section 2: Step-1 product data ───────────────────────── */}
      <DebugSection
        title="שלב 1 — נתוני מוצר"
        description="מה שהמשתמש הזין/ערך ב־wizard step 1"
      >
        <KeyValueGrid
          rows={[
            ['description', String(data.description ?? '—').slice(0, 200) + (String(data.description ?? '').length > 200 ? '...' : '')],
            ['brand', String(data.brand ?? '—')],
            ['targetAudience', String(data.targetAudience ?? '—')],
            ['category', String(data.category ?? '—')],
            ['durationSeconds', String(data.durationSeconds ?? '—')],
            ['aspectRatio', String(data.aspectRatio ?? '—')],
            ['heroImageUrl', data.heroImageUrl ? <a key="h" href={data.heroImageUrl as string} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-mono text-xs">{(data.heroImageUrl as string).slice(0, 60)}...</a> : '—'],
            ['additionalImages', Array.isArray(data.additionalImages) ? `${(data.additionalImages as unknown[]).length} images` : '—'],
            ['captions', String(data.captions ?? '—')],
            ['backgroundMusic', String(data.backgroundMusic ?? '—')],
          ]}
        />
        {typeof data.description === 'string' && data.description.length > 0 ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-zinc-600">תיאור מלא ↓</summary>
            <p className="mt-2 whitespace-pre-wrap rounded bg-zinc-50 p-3 text-xs">
              {data.description}
            </p>
          </details>
        ) : null}
      </DebugSection>

      {/* ── Section 3: Avatar + voice ────────────────────────────── */}
      <DebugSection title="אווטאר וקול">
        <KeyValueGrid
          rows={[
            ['selectedAvatarId', String(data.selectedAvatarId ?? '— לא נבחר —')],
            ['voiceId', String(data.voiceId ?? '— לא נבחר —')],
            ['lockedOutfit', data.lockedOutfit ? String(data.lockedOutfit) : '— לא ננעל —'],
          ]}
        />
      </DebugSection>

      {/* ── Section 4: Selected features ─────────────────────────── */}
      <DebugSection
        title="שלב 3 — תכונות נבחרות (FEATURE FOCUS)"
        description="האנגלים שהתסריט חייב לעגן בהם"
      >
        {Array.isArray(data.selectedFeatures) && (data.selectedFeatures as unknown[]).length > 0 ? (
          <ol className="list-decimal space-y-2 pr-5 text-sm">
            {(data.selectedFeatures as Array<{ id: string; title: string; hook: string; source: string }>).map((f, i) => (
              <li key={f.id ?? i}>
                <strong>{f.title}</strong>
                {f.hook && <p className="text-xs text-zinc-600">"{f.hook}"</p>}
                <span className="text-xs text-zinc-500">
                  source: <code>{f.source}</code>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-zinc-500">— אין תכונות נבחרות —</p>
        )}
      </DebugSection>

      {/* ── Section 5: Product Intelligence ──────────────────────── */}
      <DebugSection
        title={`Product Intelligence (V11) ${cachedIntel ? (intelFresh ? '✅ fresh' : '⚠ stale') : '— missing —'}`}
        description="dossier + visual analysis + audience inference. הבסיס שכל ה-pipeline מתבסס עליו."
      >
        {cachedIntel ? (
          <>
            <KeyValueGrid
              rows={[
                ['generatedAt', fmtRelative(cachedIntel.generatedAt)],
                ['schemaVersion', cachedIntel.schemaVersion],
                ['sourceHash (cached)', cachedIntel.sourceHash?.slice(0, 12) ?? '— pre-PR6 —'],
                ['currentHash', currentHash.slice(0, 12)],
                ['fresh?', intelFresh ? 'YES' : 'NO (will rebuild on next concept-gen)'],
                ['models.dossier', cachedIntel.models.dossier],
                ['models.visualAnalysis', cachedIntel.models.visualAnalysis],
                ['models.audience', cachedIntel.models.audience],
              ]}
            />
            {!intelFresh && cachedIntel.sourceHash && (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                ⚠ Intelligence stale — המשתמש ערך משהו אחרי שהבילד רץ. ה־concept-actions ירענן בקריאה הבאה.
              </div>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                📦 dossier ({Object.keys(cachedIntel.dossier).length} fields) ↓
              </summary>
              <PrettyJson value={cachedIntel.dossier} maxHeight="max-h-[600px]" />
            </details>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                🎥 visualAnalysis ↓
              </summary>
              <PrettyJson value={cachedIntel.visualAnalysis} maxHeight="max-h-[400px]" />
            </details>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                👥 audience inference ↓
              </summary>
              <PrettyJson value={cachedIntel.audience} maxHeight="max-h-[400px]" />
            </details>
          </>
        ) : (
          <p className="text-xs text-zinc-500">— intelligence עדיין לא נבנה. ירוץ ב־concept_interactive או ב־legacy generateScripts —</p>
        )}
      </DebugSection>

      {/* ── Section 6: Pending concept cards (PR6) ───────────────── */}
      {pendingConcepts && (
        <DebugSection
          title={`קונספטים זמניים (V27.11.PR6) — ${pendingConcepts.status} (${pendingConcepts.concepts.length} cards)`}
          description={`generated ${fmtRelative(pendingConcepts.generatedAt)} · last update ${fmtRelative(pendingConcepts.lastUpdatedAt)} · selected ${pendingConcepts.selectedConceptIds.length} · expanded ${pendingConcepts.expandedConceptIds.length}`}
        >
          <div className="space-y-3">
            {pendingConcepts.concepts.map((c) => (
              <details key={c.concept_id} className="rounded border p-3">
                <summary className="cursor-pointer space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      slot {c.slot_index}
                    </Badge>
                    <Badge variant={c.estimated_quality >= 8 ? 'default' : 'secondary'}>
                      איכות {c.estimated_quality}/10
                    </Badge>
                    <span className="text-sm font-mono text-zinc-600">{c.framework}</span>
                    {pendingConcepts.selectedConceptIds.includes(c.concept_id) && (
                      <Badge>בחור להרחבה</Badge>
                    )}
                    {pendingConcepts.expandedConceptIds.includes(c.concept_id) && (
                      <Badge variant="secondary">הורחב</Badge>
                    )}
                    {c.regenerationCount > 0 && (
                      <Badge variant="outline">רוענן ×{c.regenerationCount}</Badge>
                    )}
                  </div>
                  <p className="text-sm font-semibold">{c.big_idea}</p>
                </summary>
                <div className="mt-3 space-y-2 text-xs">
                  <KeyValueGrid
                    rows={[
                      ['concept_id', <code key="cid">{c.concept_id.slice(0, 8)}...</code>],
                      ['hook_direction', c.hook_direction],
                      ['emotional_trigger', c.emotional_trigger],
                      ['selected_hook', `"${c.selected_hook}"`],
                      ['target_audience_moment', c.target_audience_moment],
                      ['product_proof_moment', c.product_proof_moment],
                      ['why_it_fits_product', c.why_it_fits_product],
                      ['why_it_fits_audience', c.why_it_fits_audience],
                      ['risk_notes', c.risk_notes ?? '— null —'],
                      [
                        'regeneratedFromConceptId',
                        c.regeneratedFromConceptId ? c.regeneratedFromConceptId.slice(0, 8) + '...' : '— first batch —',
                      ],
                    ]}
                  />
                  <div>
                    <p className="font-semibold text-zinc-700">scene_outline:</p>
                    <ol className="list-decimal pr-5">
                      {c.scene_outline.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </DebugSection>
      )}

      {/* ── Section 7: Generated scripts ─────────────────────────── */}
      <DebugSection
        title={`תסריטים שנוצרו (${project.scripts.length})`}
        description="כל תסריט עם ה-rawJson המלא + creative_strategy + scenes"
      >
        {project.scripts.length === 0 ? (
          <p className="text-xs text-zinc-500">— עדיין לא נוצרו תסריטים —</p>
        ) : (
          <div className="space-y-3">
            {project.scripts.map((s) => {
              const isSelected = s.id === project.selectedScriptId;
              return (
                <details
                  key={s.id}
                  className={`rounded border p-3 ${
                    isSelected ? 'border-primary bg-primary/[0.05]' : 'border-zinc-200'
                  }`}
                >
                  <summary className="cursor-pointer space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={isSelected ? 'default' : 'outline'}>
                        {FRAMEWORK_LABEL[s.framework ?? ''] ?? s.framework ?? s.angle}
                      </Badge>
                      {s.qualityScoreOverall != null && (
                        <Badge variant="secondary">
                          איכות {s.qualityScoreOverall.toFixed(1)}/10
                        </Badge>
                      )}
                      <span className="font-mono text-xs text-zinc-500">
                        {s.scenes.length} scenes · {s.estimatedDurationSeconds}s
                      </span>
                      {isSelected && <Badge>נבחר</Badge>}
                    </div>
                    <p className="text-sm font-semibold">"{s.hook}"</p>
                    <p className="text-xs text-zinc-600">CTA: {s.cta ?? '—'}</p>
                  </summary>
                  <div className="mt-3 space-y-3">
                    <KeyValueGrid
                      rows={[
                        ['id', <code key="id">{s.id.slice(0, 8)}...</code>],
                        ['framework', s.framework ?? '—'],
                        ['angle (legacy)', s.angle],
                        ['createdAt', fmtRelative(s.createdAt)],
                        ['hookReason', s.selectedHookReason ?? '—'],
                        ['targetAudience', s.targetAudience],
                      ]}
                    />
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                        📜 rawJson (creative_strategy + scenes + qualityScore + musicProfile) ↓
                      </summary>
                      <PrettyJson value={s.rawJson} maxHeight="max-h-[600px]" />
                    </details>
                    <div>
                      <p className="mb-2 text-xs font-semibold text-zinc-700">
                        סצנות ({s.scenes.length}):
                      </p>
                      <div className="space-y-1">
                        {s.scenes.map((sc) => (
                          <Link
                            key={sc.id}
                            href={`/admin/scenes/${sc.id}/debug`}
                            className="flex items-center justify-between rounded border bg-white p-2 text-xs hover:bg-zinc-50"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">
                                #{sc.sceneOrder}
                              </Badge>
                              <span className="font-mono text-zinc-500">{sc.sceneGenerationType ?? sc.sceneType}</span>
                              <StatusPill
                                variant={
                                  sc.status === 'completed' || sc.status === 'clip_ready'
                                    ? 'success'
                                    : sc.status === 'failed'
                                      ? 'error'
                                      : 'pending'
                                }
                              >
                                {sc.status ?? 'pending'}
                              </StatusPill>
                              <span className="truncate max-w-md">{sc.textHebrew?.slice(0, 60)}...</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {sc.imageUrl && <span title="image">🖼</span>}
                              {sc.voiceUrl && <span title="voice">🔊</span>}
                              {sc.clipUrl && <span title="clip">🎬</span>}
                              {sc.lastErrorCode && <span title={sc.lastErrorMessage ?? ''}>⚠</span>}
                              <span className="text-zinc-400">→</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </DebugSection>

      {/* ── Section 8: Render jobs ───────────────────────────────── */}
      <DebugSection
        title={`ג׳ובי רינדור (${project.renderJobs.length})`}
        description="ffmpeg composition jobs — completed, in-flight, or failed"
        hidden={project.renderJobs.length === 0}
      >
        <div className="space-y-2">
          {project.renderJobs.map((rj) => (
            <div
              key={rj.id}
              className="rounded border p-3 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono">
                  {rj.id.slice(0, 8)}...
                </Badge>
                <StatusPill
                  variant={
                    rj.status === 'completed'
                      ? 'success'
                      : rj.status === 'failed' || rj.status === 'cancelled'
                        ? 'error'
                        : 'pending'
                  }
                >
                  {rj.status}
                </StatusPill>
                <span className="text-zinc-500">{rj.progressPercent}%</span>
                <span className="text-zinc-500">{fmtRelative(rj.createdAt)}</span>
                {rj.finalVideoUrl && (
                  <a
                    href={rj.finalVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-blue-700 hover:underline"
                  >
                    final.mp4 →
                  </a>
                )}
              </div>
              {rj.errorMessage && (
                <p className="mt-1 text-red-700">⚠ {rj.errorMessage}</p>
              )}
            </div>
          ))}
        </div>
      </DebugSection>

      {/* ── Section 9: ApiCalls timeline ─────────────────────────── */}
      <DebugSection
        title={`קריאות API (${apiCalls.length} most recent)`}
        description={`סך עלות: ${fmtUSD(totalCost)}`}
      >
        {apiCalls.length === 0 ? (
          <p className="text-xs text-zinc-500">— אין קריאות —</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b text-zinc-500">
              <tr>
                <th className="px-2 py-1 text-right">Provider</th>
                <th className="px-2 py-1 text-right">Operation</th>
                <th className="px-2 py-1 text-right">Status</th>
                <th className="px-2 py-1 text-right">Tokens</th>
                <th className="px-2 py-1 text-right">Cost</th>
                <th className="px-2 py-1 text-right">Duration</th>
                <th className="px-2 py-1 text-right">When</th>
                <th className="px-2 py-1 text-right">Detail</th>
              </tr>
            </thead>
            <tbody>
              {apiCalls.map((c) => (
                <tr key={c.id} className="border-b hover:bg-zinc-50">
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
                  <td className="px-2 py-1 text-right text-zinc-500">{fmtRelative(c.createdAt)}</td>
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

      {/* ── Section 10: Credit transactions ──────────────────────── */}
      <DebugSection
        title={`תנועות קרדיטים (${creditTxs.length})`}
        description="חיובים / החזרים שקשורים לפרויקט הזה"
        hidden={creditTxs.length === 0}
      >
        <table className="w-full text-xs">
          <thead className="border-b text-zinc-500">
            <tr>
              <th className="px-2 py-1 text-right">Reason</th>
              <th className="px-2 py-1 text-right">Amount</th>
              <th className="px-2 py-1 text-right">When</th>
            </tr>
          </thead>
          <tbody>
            {creditTxs.map((tx) => (
              <tr key={tx.id} className="border-b">
                <td className="px-2 py-1 font-mono">{tx.reason}</td>
                <td
                  className={`px-2 py-1 text-right font-mono ${tx.amount > 0 ? 'text-green-700' : 'text-red-700'}`}
                >
                  {tx.amount > 0 ? '+' : ''}
                  {tx.amount}
                </td>
                <td className="px-2 py-1 text-right text-zinc-500">{fmtRelative(tx.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DebugSection>

      {/* ── Section 11: Raw productData (last resort) ────────────── */}
      <DebugSection
        title="raw productData (כל ה־JSON)"
        description="חוץ ממה שמופיע למעלה. השאר כאן ל-rare debugging."
      >
        <details>
          <summary className="cursor-pointer text-xs text-zinc-600">לחץ להצגת ה־JSON המלא ↓</summary>
          <PrettyJson value={data} maxHeight="max-h-[600px]" />
        </details>
      </DebugSection>
    </div>
  );
}
