// V27.11 — Per-Scene markdown debug export.
//
// GET /api/admin/scenes/{id}/export → text/markdown attachment with
// every persisted artifact for the scene, formatted for both human
// review and AI tools (Claude Code, etc.).
//
// Sections:
//   - Active env snapshot
//   - Scene summary (id, scriptId, sceneOrder, status, all routing flags)
//   - Project context (productName, owner, framework)
//   - Spoken text (textHebrew, textHebrewTts, on-screen caption)
//   - Image generation (URL, count, brief, full prompt)
//   - Voice generation (URL, provider, duration, count)
//   - Captions + word timings (full JSON)
//   - Clip generation + Kling i2v cache + PixVerse LipSync state
//   - Motion analysis (gpt-4o-mini vision JSON)
//   - Generation log buffer
//   - ApiCalls scoped to this scene
//   - ⚠ Failed Calls with full metadata blob
//
// Auth: requireAdminApi() returns 401/403 for non-admins.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdminApi } from '@/lib/auth/admin-api';
import {
  formatSceneDebugReport,
  captureEnvSnapshot,
  safeFilename,
} from '@/lib/admin/export-report';

const SYSTEM_VERSION = 'V27.11';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
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
              user: { select: { email: true, plan: true } },
            },
          },
        },
      },
    },
  });
  if (!scene) {
    return NextResponse.json({ error: 'scene not found' }, { status: 404 });
  }

  const apiCalls = await prisma.apiCall.findMany({
    where: { sceneId: id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const md = formatSceneDebugReport(
    {
      scene,
      script: {
        id: scene.script.id,
        framework: scene.script.framework,
        angle: scene.script.angle,
        rawJson: scene.script.rawJson,
      },
      project: {
        id: scene.script.project.id,
        productName: scene.script.project.productName,
        productData: scene.script.project.productData,
      },
      user: {
        email: scene.script.project.user.email,
        plan: scene.script.project.user.plan,
      },
      apiCalls,
    },
    {
      reportTitle: `Tachles Scene Debug Report — #${scene.sceneOrder} (${scene.sceneGenerationType ?? scene.sceneType})`,
      generatedAt: new Date(),
      systemVersion: SYSTEM_VERSION,
      envSnapshot: captureEnvSnapshot(),
    },
  );

  const filename = safeFilename([
    'scene',
    scene.script.project.productName ?? undefined,
    `s${scene.sceneOrder}`,
    scene.id.slice(0, 8),
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
