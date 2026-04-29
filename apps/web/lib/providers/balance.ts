// Live balance fetchers for Kling + PixVerse, used by /admin/costs to
// show what's left in the user's resource pack. Soft fail — when a
// provider call returns an error or the env keys aren't set, we
// surface that to the page instead of throwing (so an unrelated
// outage at one provider doesn't break the whole admin dashboard).
//
// The functions are server-side only (call them from a Server
// Component or a Route Handler — never from a 'use client' file).

import crypto from 'crypto';
import {
  PROVIDER_COST_ESTIMATES_USD,
  PIXVERSE_COST_MODEL,
} from '@/lib/pricing/provider-costs';

const KLING_API_BASE =
  process.env.KLING_API_BASE_URL ?? 'https://api-singapore.klingai.com';
const PIXVERSE_API_BASE =
  process.env.PIXVERSE_API_BASE_URL ?? 'https://app-api.pixverse.ai';

// ── Kling ────────────────────────────────────────────────────────────────

export interface KlingResourcePack {
  name: string;
  totalUnits: number;
  remainingUnits: number;
  usedUnits: number;
  status: string; // online | runOut | expired
  purchasedAt: Date;
  expiresAt: Date;
  concurrencyCap?: number;
}

export interface KlingBalance {
  ok: true;
  packs: KlingResourcePack[];
  totalRemainingUnits: number;
  totalUsedUnits: number;
  estimatedClipsRemaining: number; // remaining / units-per-clip
  estimatedUsdRemaining: number; // remaining * unit price
  fetchedAt: Date;
}

export interface KlingBalanceError {
  ok: false;
  error: string;
}

// ~6.24 units per 5s i2v Omni clip (matches lib/usage/pricing.ts).
const KLING_UNITS_PER_CLIP = 6.24;
const KLING_USD_PER_UNIT = 0.126;

function signKlingJwt(): string | null {
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) return null;
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const headerB64 = enc({ alg: 'HS256', typ: 'JWT' });
  const payloadB64 = enc({ iss: ak, exp: now + 1800, nbf: now - 5 });
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', sk).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

export async function fetchKlingBalance(): Promise<KlingBalance | KlingBalanceError> {
  const token =
    process.env.KLING_API_KEY?.trim() ||
    signKlingJwt() ||
    null;
  if (!token) {
    return { ok: false, error: 'Kling auth not configured (KLING_API_KEY or KLING_ACCESS_KEY/SECRET_KEY)' };
  }

  // 30-day window — covers any active pack's lifetime activity.
  const end = Date.now();
  const start = end - 30 * 24 * 60 * 60 * 1000;

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(
      `${KLING_API_BASE}/account/costs?start_time=${start}&end_time=${end}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: ac.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, error: `Kling HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      data?: {
        resource_pack_subscribe_infos?: Array<{
          resource_pack_name: string;
          total_quantity: number;
          remaining_quantity: number;
          status: string;
          purchase_time: number;
          invalid_time: number;
        }>;
      };
    };
    const packs: KlingResourcePack[] = (
      json.data?.resource_pack_subscribe_infos ?? []
    ).map((p) => {
      // Concurrency cap is encoded in the name: "...100Units-5Con-1Months".
      const conMatch = p.resource_pack_name.match(/(\d+)Con/);
      return {
        name: p.resource_pack_name,
        totalUnits: p.total_quantity,
        remainingUnits: p.remaining_quantity,
        usedUnits: p.total_quantity - p.remaining_quantity,
        status: p.status,
        purchasedAt: new Date(p.purchase_time),
        expiresAt: new Date(p.invalid_time),
        concurrencyCap: conMatch ? Number(conMatch[1]) : undefined,
      };
    });

    const onlinePacks = packs.filter((p) => p.status === 'online');
    const totalRemainingUnits = onlinePacks.reduce(
      (sum, p) => sum + p.remainingUnits,
      0,
    );
    const totalUsedUnits = packs.reduce((sum, p) => sum + p.usedUnits, 0);

    return {
      ok: true,
      packs,
      totalRemainingUnits,
      totalUsedUnits,
      estimatedClipsRemaining: Math.floor(totalRemainingUnits / KLING_UNITS_PER_CLIP),
      estimatedUsdRemaining: Number((totalRemainingUnits * KLING_USD_PER_UNIT).toFixed(2)),
      fetchedAt: new Date(),
    };
  } catch (err) {
    return { ok: false, error: `Kling fetch failed: ${(err as Error).message}` };
  }
}

// ── PixVerse ─────────────────────────────────────────────────────────────

export interface PixVerseBalance {
  ok: true;
  creditMonthly: number;
  creditPackage: number;
  totalCredits: number;
  /** Computed: 16 credits per observed lip-sync scene. */
  estimatedScenesRemaining: number;
  /** Computed: $0.00444 per credit (from $10/2,250 pack). */
  estimatedUsdRemaining: number;
  fetchedAt: Date;
}

export interface PixVerseBalanceError {
  ok: false;
  error: string;
}

export async function fetchPixVerseBalance(): Promise<
  PixVerseBalance | PixVerseBalanceError
> {
  const apiKey = process.env.PIXVERSE_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: 'PIXVERSE_API_KEY not configured' };

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(`${PIXVERSE_API_BASE}/openapi/v2/account/balance`, {
      headers: {
        'API-KEY': apiKey,
        'Ai-Trace-Id': crypto.randomUUID(),
        'Content-Type': 'application/json',
      },
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, error: `PixVerse HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      ErrCode: number;
      ErrMsg?: string;
      Resp?: { credit_monthly?: number; credit_package?: number };
    };
    if (json.ErrCode !== 0) {
      return { ok: false, error: `PixVerse ErrCode ${json.ErrCode}: ${json.ErrMsg ?? '?'}` };
    }
    const monthly = json.Resp?.credit_monthly ?? 0;
    const pack = json.Resp?.credit_package ?? 0;
    const total = monthly + pack;

    return {
      ok: true,
      creditMonthly: monthly,
      creditPackage: pack,
      totalCredits: total,
      estimatedScenesRemaining: Math.floor(
        total / PIXVERSE_COST_MODEL.observedCreditsPerLipSyncScene,
      ),
      estimatedUsdRemaining: Number(
        (total * PIXVERSE_COST_MODEL.usdPerPixverseCredit).toFixed(2),
      ),
      fetchedAt: new Date(),
    };
  } catch (err) {
    return { ok: false, error: `PixVerse fetch failed: ${(err as Error).message}` };
  }
}

// ── ElevenLabs ───────────────────────────────────────────────────────────

export interface ElevenLabsBalance {
  ok: true;
  tier: string; // free / starter / creator / pro / scale / business / etc.
  characterCount: number; // chars used this period
  characterLimit: number; // chars allowed this period
  charactersRemaining: number;
  resetAt: Date | null;
  /** Estimated USD value of remaining chars at $0.10/1K (Hebrew on eleven_v3). */
  estimatedUsdRemaining: number;
  fetchedAt: Date;
}

export interface ElevenLabsBalanceError {
  ok: false;
  error: string;
}

export async function fetchElevenLabsBalance(): Promise<
  ElevenLabsBalance | ElevenLabsBalanceError
> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: 'ELEVENLABS_API_KEY not configured' };

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': apiKey },
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, error: `ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      tier?: string;
      character_count?: number;
      character_limit?: number;
      next_character_count_reset_unix?: number;
    };
    const used = json.character_count ?? 0;
    const limit = json.character_limit ?? 0;
    const remaining = Math.max(0, limit - used);
    return {
      ok: true,
      tier: json.tier ?? 'unknown',
      characterCount: used,
      characterLimit: limit,
      charactersRemaining: remaining,
      resetAt: json.next_character_count_reset_unix
        ? new Date(json.next_character_count_reset_unix * 1000)
        : null,
      // eleven_v3 (the Hebrew model) is $0.10 per 1K chars.
      estimatedUsdRemaining: Number(((remaining / 1000) * 0.1).toFixed(2)),
      fetchedAt: new Date(),
    };
  } catch (err) {
    return { ok: false, error: `ElevenLabs fetch failed: ${(err as Error).message}` };
  }
}

// ── OpenAI ───────────────────────────────────────────────────────────────
//
// OpenAI doesn't expose a "remaining credit" endpoint anymore (the old
// /dashboard/billing/credit_grants is deprecated). What it DOES expose
// (with an admin-scoped key, which sk-svcacct-... usually has) is
// `/organization/costs` — daily-aggregated USD spend. We sum the last
// 30 days as a "lifetime spend on this key" proxy. Doesn't show
// remaining $$ but does show actual burn.

export interface OpenAIBalance {
  ok: true;
  totalSpentLast30dUsd: number;
  totalSpentLast7dUsd: number;
  totalSpentLast24hUsd: number;
  fetchedAt: Date;
}

export interface OpenAIBalanceError {
  ok: false;
  error: string;
}

export async function fetchOpenAIBalance(): Promise<
  OpenAIBalance | OpenAIBalanceError
> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY not configured' };

  // OpenAI's costs API takes Unix-seconds start_time + bucket_width.
  const now = Math.floor(Date.now() / 1000);
  const start30d = now - 30 * 24 * 60 * 60;

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(
      `https://api.openai.com/v1/organization/costs?start_time=${start30d}&bucket_width=1d&limit=31`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: ac.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      return {
        ok: false,
        error: `OpenAI costs HTTP ${res.status} (likely needs admin-scope key): ${body}`,
      };
    }
    const json = (await res.json()) as {
      data?: Array<{
        start_time: number;
        end_time: number;
        results?: Array<{ amount?: { value?: number; currency?: string } }>;
      }>;
    };
    let total30 = 0;
    let total7 = 0;
    let total24 = 0;
    const cutoff7 = now - 7 * 24 * 60 * 60;
    const cutoff24 = now - 24 * 60 * 60;
    for (const bucket of json.data ?? []) {
      const dayUsd = (bucket.results ?? []).reduce(
        (sum, r) => sum + (r.amount?.value ?? 0),
        0,
      );
      total30 += dayUsd;
      if (bucket.start_time >= cutoff7) total7 += dayUsd;
      if (bucket.start_time >= cutoff24) total24 += dayUsd;
    }

    return {
      ok: true,
      totalSpentLast30dUsd: Number(total30.toFixed(2)),
      totalSpentLast7dUsd: Number(total7.toFixed(2)),
      totalSpentLast24hUsd: Number(total24.toFixed(2)),
      fetchedAt: new Date(),
    };
  } catch (err) {
    return { ok: false, error: `OpenAI fetch failed: ${(err as Error).message}` };
  }
}

// ── Convenience: fetch all in parallel ──────────────────────────────────

export async function fetchAllProviderBalances() {
  const [kling, pixverse, elevenlabs, openai] = await Promise.all([
    fetchKlingBalance(),
    fetchPixVerseBalance(),
    fetchElevenLabsBalance(),
    fetchOpenAIBalance(),
  ]);
  return { kling, pixverse, elevenlabs, openai };
}

// Re-export for the admin page so it doesn't need two separate imports.
export { PROVIDER_COST_ESTIMATES_USD };
