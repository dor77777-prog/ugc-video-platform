import { PrismaClient } from '@prisma/client';

// Slow-query threshold. Anything above this gets logged with [SLOW QUERY] marker.
// Tuned for 500ms because that's roughly one round-trip Vercel iad1 → Supabase
// ap-south-1 — anything above suggests the query itself is slow, not just network.
const SLOW_QUERY_MS = 500;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
  });

  // Log every query with its duration. In production this lights up the
  // serverless function logs with one line per query, so you can see
  // exactly where time is going (network round-trip vs query execution).
  client.$on('query' as never, (e: { query: string; duration: number; params: string }) => {
    const slow = e.duration >= SLOW_QUERY_MS;
    const tag = slow ? '[SLOW QUERY]' : '[query]';
    const truncated =
      e.query.length > 200 ? e.query.slice(0, 200) + '…' : e.query;
    console.log(`${tag} ${e.duration}ms — ${truncated}`);
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
