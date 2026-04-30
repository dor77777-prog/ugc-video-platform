// V13.2 — provider balance snapshot persistence + cache.
//
// Provider balances are observability — they tell us "how much room is
// left in our Kling pack?", "are we about to hit ElevenLabs' character
// limit?". They are NOT how we attribute per-call cost. See
// lib/usage/cost-attribution.ts for that.
//
// Rules:
//   1. Fetched at most every 60s (cache TTL). The OpenAI organization/costs
//      endpoint and ElevenLabs subscription endpoint both rate-limit; the
//      pre-V13.2 dashboard hammered them on every page load and started
//      getting HTTP 429s on free tiers.
//   2. Per-provider failure is soft — one outage doesn't break the page.
//      The dashboard renders the last-known snapshot (if any) plus an
//      error banner.
//   3. Snapshots are persisted to ProviderBalanceSnapshot for trend
//      analysis + reconciliation against ApiCall.costUsd aggregates.

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import {
  fetchKlingBalance,
  fetchPixVerseBalance,
  fetchElevenLabsBalance,
  fetchOpenAIBalance,
} from '@/lib/providers/balance';

const CACHE_TTL_MS = 60 * 1000; // 60 seconds — never go below.

interface CachedBalances {
  fetchedAt: number;
  data: Awaited<ReturnType<typeof fetchAll>>;
}

let cache: CachedBalances | null = null;
let inflight: Promise<CachedBalances['data']> | null = null;

async function fetchAll() {
  // Run in parallel — each fetcher already times out after 8-20s.
  const [kling, pixverse, elevenlabs, openai] = await Promise.all([
    fetchKlingBalance().catch((err) => ({ ok: false as const, error: `kling: ${(err as Error).message}` })),
    fetchPixVerseBalance().catch((err) => ({ ok: false as const, error: `pixverse: ${(err as Error).message}` })),
    fetchElevenLabsBalance().catch((err) => ({ ok: false as const, error: `elevenlabs: ${(err as Error).message}` })),
    fetchOpenAIBalance().catch((err) => ({ ok: false as const, error: `openai: ${(err as Error).message}` })),
  ]);
  return { kling, pixverse, elevenlabs, openai, fetchedAt: new Date() };
}

// Returns the cached snapshot if fresh; otherwise refetches and persists.
// Concurrent calls coalesce on the same in-flight promise so a burst of
// admin page loads only triggers ONE provider fetch.
export async function getCachedProviderBalances(): Promise<CachedBalances['data']> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await fetchAll();
      cache = { fetchedAt: Date.now(), data };
      // Best-effort persist — never let snapshot writes break the page.
      await persistSnapshots(data).catch(() => {/* observability only */});
      return data;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Force-refresh (admin "↻ refresh" button). Bypasses TTL but still
// dedupes via inflight promise.
export async function forceRefreshProviderBalances(): Promise<CachedBalances['data']> {
  cache = null;
  return getCachedProviderBalances();
}

async function persistSnapshots(data: Awaited<ReturnType<typeof fetchAll>>) {
  const rows: Array<{
    provider: string;
    balanceType: string;
    balanceValue: number;
    balanceUnit: string;
    estimatedUsdValue: number | null;
    rawJson: object | null;
    status: string;
    errorMessage: string | null;
  }> = [];

  if (data.kling.ok) {
    rows.push({
      provider: 'kling',
      balanceType: 'units',
      balanceValue: data.kling.totalRemainingUnits,
      balanceUnit: 'kling_units',
      estimatedUsdValue: data.kling.estimatedUsdRemaining,
      rawJson: { packs: data.kling.packs.length, used: data.kling.totalUsedUnits },
      status: 'ok',
      errorMessage: null,
    });
  } else {
    rows.push({
      provider: 'kling',
      balanceType: 'units',
      balanceValue: 0,
      balanceUnit: 'kling_units',
      estimatedUsdValue: null,
      rawJson: null,
      status: 'error',
      errorMessage: data.kling.error.slice(0, 500),
    });
  }

  if (data.pixverse.ok) {
    rows.push({
      provider: 'pixverse',
      balanceType: 'credits',
      balanceValue: data.pixverse.totalCredits,
      balanceUnit: 'pixverse_credits',
      estimatedUsdValue: data.pixverse.estimatedUsdRemaining,
      rawJson: {
        creditMonthly: data.pixverse.creditMonthly,
        creditPackage: data.pixverse.creditPackage,
      },
      status: 'ok',
      errorMessage: null,
    });
  } else {
    rows.push({
      provider: 'pixverse',
      balanceType: 'credits',
      balanceValue: 0,
      balanceUnit: 'pixverse_credits',
      estimatedUsdValue: null,
      rawJson: null,
      status: 'error',
      errorMessage: data.pixverse.error.slice(0, 500),
    });
  }

  if (data.elevenlabs.ok) {
    rows.push({
      provider: 'elevenlabs',
      balanceType: 'characters',
      balanceValue: data.elevenlabs.charactersRemaining,
      balanceUnit: 'characters',
      estimatedUsdValue: data.elevenlabs.estimatedUsdRemaining,
      rawJson: {
        tier: data.elevenlabs.tier,
        used: data.elevenlabs.characterCount,
        limit: data.elevenlabs.characterLimit,
      },
      status: 'ok',
      errorMessage: null,
    });
  } else {
    rows.push({
      provider: 'elevenlabs',
      balanceType: 'characters',
      balanceValue: 0,
      balanceUnit: 'characters',
      estimatedUsdValue: null,
      rawJson: null,
      status: 'error',
      errorMessage: data.elevenlabs.error.slice(0, 500),
    });
  }

  if (data.openai.ok) {
    rows.push({
      provider: 'openai',
      balanceType: 'usd_spent',
      balanceValue: data.openai.totalSpentLast30dUsd,
      balanceUnit: 'usd',
      estimatedUsdValue: data.openai.totalSpentLast30dUsd,
      rawJson: {
        spent24h: data.openai.totalSpentLast24hUsd,
        spent7d: data.openai.totalSpentLast7dUsd,
        spent30d: data.openai.totalSpentLast30dUsd,
      },
      status: 'ok',
      errorMessage: null,
    });
  } else {
    rows.push({
      provider: 'openai',
      balanceType: 'usd_spent',
      balanceValue: 0,
      balanceUnit: 'usd',
      estimatedUsdValue: null,
      rawJson: null,
      status: 'error',
      errorMessage: data.openai.error.slice(0, 500),
    });
  }

  // createMany for efficiency. Failures here are non-fatal — a snapshot
  // write that fails just means the trend chart misses one data point.
  await prisma.providerBalanceSnapshot.createMany({
    data: rows.map((r) => ({
      ...r,
      rawJson: r.rawJson != null ? (r.rawJson as Prisma.InputJsonValue) : Prisma.JsonNull,
    })),
    skipDuplicates: true,
  });
}
