// V27.11 — Single ApiCall markdown export.
//
// GET /api/admin/apicalls/{id}/export.md → text/markdown attachment
// designed for human review AND Claude Code style AI tools.
//
// Includes:
//   - Active environment snapshot (what was running when called)
//   - Full call shape (provider, operation, model, status, tokens,
//     cost, duration, errorMessage)
//   - Full provider metadata blob (the heavy JSON payload)
//   - Linked entities (project / scene / render job / user)
//   - Related calls in last hour for context
//
// Auth: requireAdminApi() returns 401/403 for non-admins.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdminApi } from '@/lib/auth/admin-api';
import {
  formatApiCallReport,
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

  const call = await prisma.apiCall.findUnique({ where: { id } });
  if (!call) {
    return NextResponse.json({ error: 'apicall not found' }, { status: 404 });
  }

  const [user, project, scene, renderJob, relatedCalls] = await Promise.all([
    call.userId
      ? prisma.user.findUnique({
          where: { id: call.userId },
          select: { id: true, email: true, plan: true },
        })
      : Promise.resolve(null),
    call.projectId
      ? prisma.project.findUnique({
          where: { id: call.projectId },
          select: { id: true, productName: true, status: true },
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

  const md = formatApiCallReport(
    {
      call,
      user,
      project,
      scene,
      renderJob,
      relatedCalls,
    },
    {
      reportTitle: `Tachles ApiCall Debug Report — ${call.provider}/${call.operation}`,
      generatedAt: new Date(),
      systemVersion: SYSTEM_VERSION,
      envSnapshot: captureEnvSnapshot(),
    },
  );

  const filename = safeFilename([
    'apicall',
    call.provider,
    call.operation,
    call.id.slice(0, 8),
    new Date(call.createdAt).toISOString().slice(0, 10),
  ]) + '.md';

  return new NextResponse(md, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
