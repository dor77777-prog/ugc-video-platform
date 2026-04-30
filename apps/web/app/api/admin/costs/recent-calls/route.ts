// V13.2 — /api/admin/costs/recent-calls
//
// Returns the last N completed/failed ApiCalls (default 50, max 200)
// with optional filters: provider, operation, status, since/until.
// Heavy `metadata` JSON is OPT-IN via ?expand=metadata to keep the
// table fast (the Postgres query payload was 100KB+ when metadata
// was selected by default). Drilldown rows can re-query with expand
// to get the raw provider payload.

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdminApi } from '@/lib/auth/admin-api';

export const dynamic = 'force-dynamic';

const ALLOWED_PROVIDERS = new Set([
  'openai',
  'elevenlabs',
  'kling',
  'pixverse',
  'ffmpeg',
  'runway',
  'creatomate',
]);
const ALLOWED_STATUS = new Set(['in_progress', 'success', 'failed']);

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
  const provider = url.searchParams.get('provider');
  const operation = url.searchParams.get('operation');
  const status = url.searchParams.get('status');
  const since = url.searchParams.get('since');
  const until = url.searchParams.get('until');
  const expand = url.searchParams.get('expand') ?? '';
  const includeMetadata = expand.split(',').includes('metadata');

  const where: Record<string, unknown> = {};
  if (provider && ALLOWED_PROVIDERS.has(provider)) where.provider = provider;
  if (operation) where.operation = operation;
  if (status && ALLOWED_STATUS.has(status)) where.status = status;
  if (since || until) {
    const range: Record<string, Date> = {};
    if (since) range.gte = new Date(since);
    if (until) range.lte = new Date(until);
    where.createdAt = range;
  }

  const select: Record<string, boolean | object> = {
    id: true,
    provider: true,
    operation: true,
    model: true,
    status: true,
    success: true,
    costUsd: true,
    estimatedCostUsd: true,
    actualCostUsd: true,
    inputTokens: true,
    outputTokens: true,
    units: true,
    durationMs: true,
    errorMessage: true,
    createdAt: true,
    completedAt: true,
    userId: true,
    projectId: true,
    renderJobId: true,
    sceneId: true,
    user: { select: { email: true } },
  };
  if (includeMetadata) select.metadata = true;

  const rows = await prisma.apiCall.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select,
  });

  return NextResponse.json({
    rows,
    count: rows.length,
    filters: { provider, operation, status, since, until, limit, expand },
    fetchedAt: new Date().toISOString(),
  });
}
