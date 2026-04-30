// V13.2 — /api/admin/costs/provider-balances
//
// Returns the cached provider balances. TTL is 60s (see
// lib/providers/balance-snapshot.ts). Pass ?refresh=1 to force a refetch.
// Soft-fails per provider — one outage doesn't break the page.

import { NextResponse, type NextRequest } from 'next/server';
import { requireAdminApi } from '@/lib/auth/admin-api';
import {
  getCachedProviderBalances,
  forceRefreshProviderBalances,
} from '@/lib/providers/balance-snapshot';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const refresh = url.searchParams.get('refresh') === '1';
  try {
    const data = refresh
      ? await forceRefreshProviderBalances()
      : await getCachedProviderBalances();
    return NextResponse.json({ ...data, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: `balance fetch failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
