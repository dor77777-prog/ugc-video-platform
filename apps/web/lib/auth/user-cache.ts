// V14.2-A — short-lived in-memory cache for the App User row.
//
// `getOrCreateAppUser()` is called by every Server Component page render
// AND every API route. On hot polling endpoints (/api/scenes/[id],
// /api/render/[jobId]/status) it gets called ~24×/min per scene during
// generation. Every call hits Supabase Auth + Prisma user.findUnique
// = 100-300ms of cumulative latency before the actual route work begins.
//
// We cache the full User row keyed by Supabase auth user id with a 10s
// TTL. Over 10s the user can't realistically change roles or spend
// caps; what CAN change is `creditsBalance` (every scene/voice/clip
// generation deducts credits) and `banned` (admin toggle). For both we
// expose `invalidateUserCacheById(id)` — credit mutation helpers and
// the admin ban action call it so the next read goes back to DB.
//
// In-memory means: per Node.js process, NOT shared across Vercel
// function instances. That's a feature — the cache helps when a hot
// function gets several requests in a row (typical polling pattern),
// and it's safe even on multi-instance fanout because TTL caps
// staleness regardless of where the write happened. For shared
// invalidation across instances, V14.4 (SSE) will pubsub through
// Redis; until then the 10s ceiling is the hard guarantee.

import type { User } from '@prisma/client';

interface Entry {
  user: User;
  expiresAt: number;
}

const cache = new Map<string, Entry>();
const TTL_MS = 10_000;

/** Look up a cached User row by Supabase auth id. Returns null on miss
 *  or when the entry is past its TTL. */
export function getCachedUser(authId: string): User | null {
  const entry = cache.get(authId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(authId);
    return null;
  }
  return entry.user;
}

/** Store a User row in the cache. Replaces any existing entry. */
export function setCachedUser(authId: string, user: User): void {
  cache.set(authId, { user, expiresAt: Date.now() + TTL_MS });
}

/** Invalidate by Supabase auth id (called from sync-user when auth user
 *  is known). */
export function invalidateUserCache(authId: string): void {
  cache.delete(authId);
}

/** Invalidate by app User id (called from credit mutations and admin
 *  actions, which only have the dbUser.id, not the auth id). Walks the
 *  cache because we don't keep a reverse index. Cost is O(n) but the
 *  cache is small (tens of entries even on a busy box). */
export function invalidateUserCacheById(userId: string): void {
  for (const [key, entry] of cache.entries()) {
    if (entry.user.id === userId) {
      cache.delete(key);
      return;
    }
  }
}

/** Test helper — drop everything. */
export function clearUserCache(): void {
  cache.clear();
}
