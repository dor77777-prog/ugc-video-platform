// Per-user rate limit for expensive provider operations.
//
// Why: a user double-clicking "regenerate" 30 times in 2 seconds will
// spam Kling/OpenAI 30 times — at $0.82 per Kling i2v that's $25 burned
// in seconds. Same for ElevenLabs / OpenAI.
//
// Storage: ApiCall table. Each call we make is logged there with userId
// + operation + createdAt. The rate-limit check is a count(*) query
// over the recent window. No Redis needed; the index on (userId,
// createdAt) keeps it cheap.
//
// Convention: failed and successful calls BOTH count toward the limit.
// The limit exists to prevent burst spending — not to be lenient with
// failed attempts. (If our code is the cause of the failures, the user
// shouldn't suffer; but if their network is flapping or they're
// double-clicking, throttling is the right move.)

import { prisma } from '@/lib/db';

export class RateLimitedError extends Error {
  constructor(message: string, public readonly retryAfterSeconds: number) {
    super(message);
    this.name = 'RateLimitedError';
  }
}

export interface RateLimitRule {
  /** Friendly name for logs. */
  name: string;
  /** Seconds in the rolling window. */
  windowSeconds: number;
  /** Max attempts allowed in the window. */
  maxAttempts: number;
}

// Defaults tuned for full-batch parallelism (all 5 scenes fire at once)
// + room for a regen or two without throttling. The cap is the user's
// safety net against runaway clicks, not a UX speed bump.
const DEFAULT_RULES: Record<string, RateLimitRule> = {
  i2v: { name: 'Kling i2v', windowSeconds: 300, maxAttempts: 20 },
  lipsync: { name: 'Kling lipsync', windowSeconds: 300, maxAttempts: 20 },
  tts: { name: 'ElevenLabs TTS', windowSeconds: 60, maxAttempts: 30 },
  image_gen: { name: 'OpenAI image', windowSeconds: 60, maxAttempts: 20 },
  // Vision per-scene motion analysis. Cheap and fast; the rate-limit
  // is just a sanity guard.
  motion_analysis: { name: 'Vision motion analysis', windowSeconds: 60, maxAttempts: 30 },
  script_gen: { name: 'OpenAI script', windowSeconds: 600, maxAttempts: 6 },
};

export async function checkRateLimit(
  userId: string,
  operation: string,
): Promise<void> {
  const rule = DEFAULT_RULES[operation];
  if (!rule) return; // unknown op → not rate-limited (fail open)

  const since = new Date(Date.now() - rule.windowSeconds * 1000);
  const count = await prisma.apiCall.count({
    where: {
      userId,
      operation,
      createdAt: { gte: since },
    },
  });

  if (count >= rule.maxAttempts) {
    throw new RateLimitedError(
      `הוגבל זמנית — יותר מדי ניסיונות של ${rule.name}. נסה שוב בעוד דקה.`,
      Math.ceil(rule.windowSeconds / 4),
    );
  }
}
