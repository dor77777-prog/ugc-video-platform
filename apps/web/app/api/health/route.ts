import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (err) {
    checks.database = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const pong = await redisConnection.ping();
    checks.redis = { ok: pong === 'PONG' };
  } catch (err) {
    checks.redis = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  // Expose the Vercel deploy SHA so we can verify the Web app is running
  // the same commit as origin/main. Vercel sets VERCEL_GIT_COMMIT_SHA
  // for every deployment automatically.
  const buildSha = (process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown').slice(0, 8);

  return NextResponse.json(
    { ok: allOk, buildSha, marker: 'V14-PR9.3', checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 },
  );
}
