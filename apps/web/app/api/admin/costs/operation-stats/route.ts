// V13.2 — /api/admin/costs/operation-stats
//
// Per-operation aggregates over the last N days (default 30, max 90):
// count + sum cost + avg duration + worst duration. Used by the
// "פירוק לפי פעולה ומודל" + "זמני תגובה" sections.

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdminApi } from '@/lib/auth/admin-api';

export const dynamic = 'force-dynamic';

interface Cache {
  data: unknown;
  expiresAt: number;
  windowDays: number;
}
let cache: Cache | null = null;
const CACHE_TTL_MS = 30 * 1000;

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? 30)));

  const now = Date.now();
  if (cache && cache.windowDays === days && cache.expiresAt > now) {
    return NextResponse.json({ ...(cache.data as object), cached: true });
  }

  const since = new Date(now - days * 24 * 60 * 60 * 1000);

  const [byOperation, latencyByOp] = await Promise.all([
    prisma.apiCall.groupBy({
      by: ['provider', 'operation', 'model'],
      where: { success: true, createdAt: { gte: since } },
      _sum: { costUsd: true },
      _count: { _all: true },
      orderBy: { _sum: { costUsd: 'desc' } },
    }),
    prisma.apiCall.groupBy({
      by: ['provider', 'operation'],
      where: {
        success: true,
        createdAt: { gte: since },
        durationMs: { not: null },
      },
      _avg: { durationMs: true },
      _max: { durationMs: true },
      _count: { _all: true },
    }),
  ]);

  const data = {
    windowDays: days,
    byOperation: byOperation.map((r) => ({
      provider: r.provider,
      operation: r.operation,
      model: r.model,
      sum: r._sum.costUsd ?? 0,
      count: r._count._all,
    })),
    latencyByOp: latencyByOp.map((r) => ({
      provider: r.provider,
      operation: r.operation,
      avgMs: r._avg.durationMs,
      maxMs: r._max.durationMs,
      count: r._count._all,
    })),
    fetchedAt: new Date().toISOString(),
    cached: false,
  };

  cache = { data, expiresAt: now + CACHE_TTL_MS, windowDays: days };
  return NextResponse.json(data);
}
