// Per-user daily provider-spend cap.
//
// Hard ceiling on how much money a single user can burn in our paid
// providers (Kling / OpenAI / ElevenLabs) within a UTC day. Defaults
// to a reasonable "budget user" amount; admins can raise it per-user
// via User.spendCapUsd for paid customers.
//
// The check runs BEFORE we issue a provider call and looks at the sum
// of successful ApiCall.costUsd for the day. Failed calls don't count
// (since they cost us $0 in most cases — provider validation rejected
// pre-compute). This is what we want: a cap that protects us from
// runaway spending, not from harmless retries.

import { prisma } from '@/lib/db';

export class SpendCapExceededError extends Error {
  constructor(
    message: string,
    public readonly capUsd: number,
    public readonly spentUsd: number,
  ) {
    super(message);
    this.name = 'SpendCapExceededError';
  }
}

// Global default if User.spendCapUsd is null. Tuned to comfortably
// allow ~10 finished videos/day at our current cost mix:
//   per-video cost ≈ $4.40 (5 scenes × ($0.04 image + $0.01 voice +
//   $0.79 Kling i2v + $0.55 lipsync × 1-2 scenes) + $0.02 script).
//   Default $10/day → ~2 finished videos at the new pricing — bump
//   per-user via User.spendCapUsd for higher-volume customers.
const DEFAULT_CAP_USD = 10;

export async function checkSpendCap(userId: string): Promise<{ capUsd: number; spentUsd: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { spendCapUsd: true, role: true },
  });
  if (!user) {
    throw new SpendCapExceededError('משתמש לא נמצא', 0, 0);
  }
  // Admins are exempt — useful for ops & internal testing.
  if (user.role === 'admin') return { capUsd: Infinity, spentUsd: 0 };

  const cap = user.spendCapUsd ?? DEFAULT_CAP_USD;

  // UTC day window. Simpler than locale-aware day boundaries and good
  // enough for an internal control. Admin can refund easily.
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const result = await prisma.apiCall.aggregate({
    where: {
      userId,
      success: true,
      createdAt: { gte: start },
    },
    _sum: { costUsd: true },
  });
  const spent = result._sum.costUsd ?? 0;

  if (spent >= cap) {
    throw new SpendCapExceededError(
      `חרגת מתקציב היומי שלך ($${cap.toFixed(2)}). נסה שוב מחר או פנה לתמיכה להגדלת התקציב.`,
      cap,
      spent,
    );
  }
  return { capUsd: cap, spentUsd: spent };
}
