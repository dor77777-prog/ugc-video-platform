// V27.11 — Filtered ApiCalls list markdown export.
//
// GET /api/admin/apicalls/export.md?from=...&to=...&provider=...&operation=...&status=...&take=...
// → text/markdown attachment
//
// Filters mirror /admin/apicalls page. Date range via from/to (ISO).
// take clamped [1, 2000] (higher than the UI's 500 cap because
// exports are designed for offline analysis).
//
// Output (markdown):
//   - Active env snapshot
//   - Filter summary
//   - Aggregate stats (cost, success rate, tokens, avg duration)
//   - Per-operation + per-provider breakdowns
//   - ⚠ Failures section (highlighted; quick-pull list of failed
//     IDs you can fetch individually via /apicalls/{id}/export)
//   - Detailed table of every row in the result set
//
// Auth: requireAdminApi() returns 401/403 for non-admins.

import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireAdminApi } from '@/lib/auth/admin-api';
import {
  formatApiCallsListReport,
  captureEnvSnapshot,
  safeFilename,
} from '@/lib/admin/export-report';

const SYSTEM_VERSION = 'V27.11';

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const provider = url.searchParams.get('provider')?.trim() || undefined;
  const operation = url.searchParams.get('operation')?.trim() || undefined;
  const status = url.searchParams.get('status')?.trim() || undefined;
  const fromStr = url.searchParams.get('from')?.trim();
  const toStr = url.searchParams.get('to')?.trim();
  const takeStr = url.searchParams.get('take')?.trim();

  const from = fromStr ? new Date(fromStr) : undefined;
  const to = toStr ? new Date(toStr) : undefined;
  if (from && Number.isNaN(from.getTime())) {
    return NextResponse.json({ error: 'invalid from date' }, { status: 400 });
  }
  if (to && Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: 'invalid to date' }, { status: 400 });
  }
  const takeRaw = takeStr ? parseInt(takeStr, 10) : 200;
  const take = Math.min(Math.max(Number.isFinite(takeRaw) ? takeRaw : 200, 1), 2000);

  const where: Prisma.ApiCallWhereInput = {};
  if (provider) where.provider = provider;
  if (operation) where.operation = operation;
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lte = to;
  }

  const callsRaw = await prisma.apiCall.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      user: { select: { email: true } },
    },
  });

  // V27.11 — project relation isn't declared on ApiCall, so fetch
  // unique projectIds + look them up in one query and map back.
  const projectIds = [
    ...new Set(callsRaw.map((c) => c.projectId).filter((x): x is string => !!x)),
  ];
  const projects = projectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, productName: true },
      })
    : [];
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const calls = callsRaw.map((c) => ({
    ...c,
    project: c.projectId ? projectById.get(c.projectId) ?? null : null,
  }));

  const md = formatApiCallsListReport(
    {
      filters: { provider, operation, status, from, to, take },
      calls,
    },
    {
      reportTitle: 'Tachles ApiCalls Debug Report',
      generatedAt: new Date(),
      systemVersion: SYSTEM_VERSION,
      envSnapshot: captureEnvSnapshot(),
    },
  );

  const dateLabel = from ? from.toISOString().slice(0, 10) : 'all';
  const dateLabelTo = to ? to.toISOString().slice(0, 10) : 'now';
  const filename = safeFilename([
    'apicalls',
    provider,
    operation,
    status,
    dateLabel,
    'to',
    dateLabelTo,
  ]) + '.md';

  return new NextResponse(md, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
