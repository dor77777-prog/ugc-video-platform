// Admin project diagnostic — V14 PR6.
//
// One per-project view that surfaces the V14 diversity story across all
// the scripts + scenes belonging to a project. Answers the question
// "why did all 5 scenes end up in the kitchen" by computing the
// SceneVariationLedger summary for each script and rendering a per-field
// distinct-count grid alongside the ledger's per-scene records.
//
// The (admin) layout already gates auth via requireAdmin().

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import {
  SceneVariationLedger,
  type SceneRecord,
} from '@/lib/image-briefs/scene-variation-ledger';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminProjectDiagnosticPage({ params }: PageProps) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      productName: true,
      productData: true,
      userId: true,
      user: { select: { email: true } },
      scripts: {
        select: {
          id: true,
          framework: true,
          rawJson: true,
          scenes: {
            select: {
              id: true,
              sceneOrder: true,
              cameraFocus: true,
              sceneGenerationType: true,
              primarySubject: true,
              faceVisibility: true,
              sceneGoal: true,
              imageUrl: true,
              imageBriefJson: true,
            },
            orderBy: { sceneOrder: 'asc' },
          },
        },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!project) notFound();

  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const lockedOutfit =
    typeof (data as { lockedOutfit?: unknown }).lockedOutfit === 'string'
      ? ((data as { lockedOutfit: string }).lockedOutfit)
      : null;

  return (
    <div dir="rtl" className="container mx-auto space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">דיאגנוסטיקה לפרויקט</h1>
        <p className="text-sm text-zinc-600">
          <Link
            href={`/projects/${project.id}`}
            className="text-blue-700 hover:underline"
          >
            {project.productName ?? 'פרויקט'}
          </Link>{' '}
          · project_id <span className="font-mono">{project.id}</span> · משתמש{' '}
          <span className="font-mono">{project.user?.email ?? '—'}</span>
        </p>
      </header>

      {/* ── V14 PR3 — locked outfit ────────────────────────────────── */}
      <DebugSection title="V14 PR3 — locked outfit (project-level)">
        {lockedOutfit ? (
          <p className="text-sm text-zinc-800">{lockedOutfit}</p>
        ) : (
          <p className="text-sm text-zinc-500">
            — לא ננעל עדיין (יחושב על ייצור הסצנה הראשונה עם אווטאר נבחר)
          </p>
        )}
      </DebugSection>

      {/* ── Per-script diversity diagnostic ─────────────────────────── */}
      {project.scripts.map((script) => {
        const records: SceneRecord[] = script.scenes.map((s) => ({
          sceneOrder: s.sceneOrder,
          cameraFocus: s.cameraFocus,
          sceneGenerationType: s.sceneGenerationType,
          primarySubject: s.primarySubject,
          faceVisibility: s.faceVisibility,
        }));
        const ledger = SceneVariationLedger.fromRecords(records);
        const summary = ledger.summary();
        const scriptRaw =
          (script as { rawJson?: Record<string, unknown> | null }).rawJson ?? null;
        const genre =
          (scriptRaw as { genre?: string | null } | null)?.genre ?? null;
        const voiceProfile =
          (scriptRaw as { voice_profile?: string | null } | null)?.voice_profile ??
          null;
        const lowDiversityFlag =
          summary.cameraFocus.distinct <= 2 ||
          summary.sceneGenerationType.distinct <= 2;
        return (
          <DebugSection
            key={script.id}
            title={`Script · ${script.framework}${genre ? ` · genre=${genre}` : ''}${voiceProfile ? ` · voice=${voiceProfile}` : ''}`}
          >
            {lowDiversityFlag && records.length >= 4 && (
              <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ⚠ Low diversity across scenes — same camera-focus or
                generation-type repeats. The ad may read flat on a TikTok
                feed.
              </p>
            )}

            {/* Diversity grid */}
            <div className="mb-3">
              <p className="mb-1 text-xs font-semibold text-zinc-600">
                SceneVariationLedger.summary()
              </p>
              <KeyValueGrid
                rows={(
                  [
                    'cameraFocus',
                    'sceneGenerationType',
                    'primarySubject',
                    'faceVisibility',
                  ] as const
                ).map((f) => [
                  f,
                  `${summary[f].distinct} distinct / ${summary[f].total} scenes`,
                ])}
              />
            </div>

            {/* Per-scene records */}
            <div>
              <p className="mb-1 text-xs font-semibold text-zinc-600">
                Per-scene records
              </p>
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 text-zinc-600">
                  <tr>
                    <th className="px-2 py-1 text-right">scene_order</th>
                    <th className="px-2 py-1 text-right">cameraFocus</th>
                    <th className="px-2 py-1 text-right">sceneGenType</th>
                    <th className="px-2 py-1 text-right">primarySubject</th>
                    <th className="px-2 py-1 text-right">scrollStopper</th>
                    <th className="px-2 py-1 text-right">snippets</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {script.scenes.map((s) => {
                    const brief =
                      s.imageBriefJson && typeof s.imageBriefJson === 'object'
                        ? (s.imageBriefJson as Record<string, unknown>)
                        : null;
                    const scrollStopper =
                      brief && typeof brief.scrollStopperApplied === 'boolean'
                        ? brief.scrollStopperApplied
                        : null;
                    const snippetIds = Array.isArray(brief?.frameTechniqueSnippetIds)
                      ? (brief?.frameTechniqueSnippetIds as string[])
                      : [];
                    return (
                      <tr key={s.id}>
                        <td className="px-2 py-1 text-right">{s.sceneOrder}</td>
                        <td className="px-2 py-1 text-right font-mono">
                          {s.cameraFocus ?? '—'}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {s.sceneGenerationType ?? '—'}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {s.primarySubject ?? '—'}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {scrollStopper == null ? '—' : scrollStopper ? '✓' : '·'}
                        </td>
                        <td className="px-2 py-1 text-right text-[10px] text-zinc-600">
                          {snippetIds.length
                            ? snippetIds.map((id) => id.replace('frame-technique.', '')).join(', ')
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DebugSection>
        );
      })}
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────

function DebugSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
