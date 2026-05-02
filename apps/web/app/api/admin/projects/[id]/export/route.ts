// V27.11 — Full Project debug markdown export.
//
// GET /api/admin/projects/{id}/export.md → text/markdown attachment
// designed for human review AND Claude Code style AI tools.
//
// Includes EVERYTHING in /admin/projects/[id]/debug, plus dedicated
// "⚠ Failed Calls" detail section with full metadata for each
// failed ApiCall (so AI tools can debug without round-tripping).

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdminApi } from '@/lib/auth/admin-api';
import {
  formatProjectDebugReport,
  captureEnvSnapshot,
  safeFilename,
} from '@/lib/admin/export-report';
import {
  isIntelligenceFresh,
  intelligenceSourceHash,
  extractIntelligenceSourceFields,
} from '@/lib/product-intelligence/source-hash';
import { readPendingConcepts } from '@/lib/llm/concept-storage';

const SYSTEM_VERSION = 'V27.11';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  // V27.11 — fetch FULL Scene rows so the embedded scene partial
  // can render image brief + motion analysis + captions JSON +
  // generation log + lipsync state etc. The previous narrow `select`
  // was for the table view; the deep export needs every column.
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      user: true,
      scripts: {
        orderBy: { createdAt: 'asc' },
        include: {
          scenes: {
            orderBy: { sceneOrder: 'asc' },
          },
        },
      },
      renderJobs: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  const apiCalls = await prisma.apiCall.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  // V27.11 — bucket ApiCalls by sceneId so the embedded scene
  // partial can render full per-call detail (provider metadata
  // included) without hitting the DB again.
  const apiCallsByScene = new Map<string, typeof apiCalls>();
  for (const c of apiCalls) {
    if (!c.sceneId) continue;
    const bucket = apiCallsByScene.get(c.sceneId);
    if (bucket) bucket.push(c);
    else apiCallsByScene.set(c.sceneId, [c]);
  }

  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const cachedIntel = (data.intelligence ?? null) as
    | import('@/lib/product-intelligence').ProductIntelligence
    | null;
  const currentHash = intelligenceSourceHash(
    extractIntelligenceSourceFields({
      productName: project.productName ?? 'מוצר ללא שם',
      productData: data,
    }),
  );
  const intelligenceFresh = isIntelligenceFresh({
    intelligence: cachedIntel,
    currentHash,
  });
  const pendingConcepts = readPendingConcepts(data);

  const md = formatProjectDebugReport(
    {
      project,
      apiCalls,
      apiCallsByScene,
      pendingConcepts,
      intelligenceFresh,
      currentHash,
    },
    {
      reportTitle: `Tachles Project Debug Report — ${project.productName ?? project.id.slice(0, 8)}`,
      generatedAt: new Date(),
      systemVersion: SYSTEM_VERSION,
      envSnapshot: captureEnvSnapshot(),
    },
  );

  const filename = safeFilename([
    'project',
    project.productName ?? undefined,
    project.id.slice(0, 8),
    new Date().toISOString().slice(0, 10),
  ]) + '.md';

  return new NextResponse(md, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
