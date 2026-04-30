// V13.2 — /api/admin/costs/summary
//
// Returns the KPI tiles (24h / 7d / 30d / all-time) + per-provider 30d
// breakdown + cost-per-finished-render aggregates. Cached in-memory
// for 15s so a dashboard polling at 15-30s cadence doesn't run the
// same aggregates every tick. ApiCall.costUsd is authoritative — see
// lib/usage/cost-attribution.ts.

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdminApi } from '@/lib/auth/admin-api';

export const dynamic = 'force-dynamic';

interface SummaryCache {
  data: unknown;
  expiresAt: number;
}
let cache: SummaryCache | null = null;
const CACHE_TTL_MS = 15 * 1000;

export async function GET(_req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return NextResponse.json({ ...(cache.data as object), cached: true });
  }

  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [today, week, month, allTime, byProvider, failedToday, rendersAllTime, renders30d] =
    await Promise.all([
      prisma.apiCall.aggregate({
        where: { success: true, createdAt: { gte: since24h } },
        _sum: { costUsd: true },
        _count: { _all: true },
      }),
      prisma.apiCall.aggregate({
        where: { success: true, createdAt: { gte: since7d } },
        _sum: { costUsd: true },
        _count: { _all: true },
      }),
      prisma.apiCall.aggregate({
        where: { success: true, createdAt: { gte: since30d } },
        _sum: { costUsd: true },
        _count: { _all: true },
      }),
      prisma.apiCall.aggregate({
        where: { success: true },
        _sum: { costUsd: true },
        _count: { _all: true },
      }),
      prisma.apiCall.groupBy({
        by: ['provider'],
        where: { success: true, createdAt: { gte: since30d } },
        _sum: { costUsd: true },
        _count: { _all: true },
        orderBy: { _sum: { costUsd: 'desc' } },
      }),
      prisma.apiCall.count({
        where: { success: false, createdAt: { gte: since24h } },
      }),
      prisma.renderJob.count({ where: { status: 'completed' } }),
      prisma.renderJob.count({
        where: { status: 'completed', completedAt: { gte: since30d } },
      }),
    ]);

  const data = {
    today: { sum: today._sum.costUsd ?? 0, count: today._count._all },
    week: { sum: week._sum.costUsd ?? 0, count: week._count._all },
    month: { sum: month._sum.costUsd ?? 0, count: month._count._all },
    allTime: { sum: allTime._sum.costUsd ?? 0, count: allTime._count._all },
    byProvider: byProvider.map((p) => ({
      provider: p.provider,
      sum: p._sum.costUsd ?? 0,
      count: p._count._all,
    })),
    failedToday,
    renders: { allTime: rendersAllTime, last30d: renders30d },
    fetchedAt: new Date().toISOString(),
    cached: false,
  };

  cache = { data, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(data);
}
