// V13.2 — /api/admin/costs/in-flight
//
// Returns currently-running ApiCall rows (status='in_progress').
// Polled every 3-5s by the admin dashboard; light query — covered by
// (status, createdAt) composite index. Heavy `metadata` is excluded
// to keep this fast.

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdminApi } from '@/lib/auth/admin-api';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const rows = await prisma.apiCall.findMany({
    where: { status: 'in_progress' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      provider: true,
      operation: true,
      model: true,
      createdAt: true,
      estimatedCostUsd: true,
      userId: true,
      projectId: true,
      renderJobId: true,
      sceneId: true,
      user: { select: { email: true } },
    },
  });

  return NextResponse.json({
    rows,
    count: rows.length,
    fetchedAt: new Date().toISOString(),
  });
}
