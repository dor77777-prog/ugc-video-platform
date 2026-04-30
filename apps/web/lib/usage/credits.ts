// Credit charge + audit helper.
//
// Every modification to User.creditsBalance MUST go through here so we
// also append a CreditTransaction row. That gives us:
//   - admin refund traceability ("who took my credits, when, for what?")
//   - first-regen-free accounting (free events still appear in the log
//     with amount=0 + reason="first_regen_free")
//   - dispute resolution for production support
//
// Convention for `amount`:
//   POSITIVE  → credits granted to user (admin grant, refund)
//   NEGATIVE  → credits spent by user
//   ZERO      → free event (audit only, no balance change)

import type { Prisma, PrismaClient } from '@prisma/client';

export interface CreditMutation {
  userId: string;
  /** Signed: +grant / -spend / 0 free event. */
  amount: number;
  /** Stable machine code: "scene_clip" / "refund:lipsync_failed" / "admin_grant" / "first_regen_free" / etc. */
  reason: string;
  /** Anything traceable: sceneId, projectId, apiCallId. */
  ref?: string | null;
  /** When an admin issued the change. NULL for auto-events. */
  adminId?: string | null;
  /** Extra context that makes future audits painless. */
  metadata?: Record<string, unknown> | null;
}

// Build the prisma operations to include inside an existing $transaction.
// Use this when you're already in a transaction and need atomicity with
// other writes (scene update, asset create) — avoids the double round-trip.
export function buildCreditMutationOps(
  prisma: PrismaClient,
  m: CreditMutation,
): Prisma.PrismaPromise<unknown>[] {
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  if (m.amount !== 0) {
    ops.push(
      prisma.user.update({
        where: { id: m.userId },
        // amount is user-facing signed; for User.creditsBalance we
        // increment by the same signed value (negative = spend).
        data: { creditsBalance: { increment: m.amount } },
      }),
    );
  }

  ops.push(
    prisma.creditTransaction.create({
      data: {
        userId: m.userId,
        amount: m.amount,
        reason: m.reason,
        ref: m.ref ?? null,
        adminId: m.adminId ?? null,
        ...(m.metadata
          ? { metadata: m.metadata as Prisma.InputJsonValue }
          : {}),
      },
    }),
  );

  return ops;
}

// Standalone version — for places where we just need to apply the change
// without bundling into a larger transaction.
export async function applyCreditMutation(
  prisma: PrismaClient,
  m: CreditMutation,
): Promise<void> {
  await prisma.$transaction(buildCreditMutationOps(prisma, m));
  // V14.2-A — drop the in-memory user cache so the next
  // getOrCreateAppUser() call refetches the (now-changed) creditsBalance.
  invalidateUserCacheAfterCreditMutation(m.userId);
}

// Callers that bundle credit ops into a larger $transaction (see
// buildCreditMutationOps) MUST call this after the transaction commits;
// otherwise the cached User row will keep the stale balance for up to
// 10s and the wizard will display it.
export function invalidateUserCacheAfterCreditMutation(userId: string): void {
  // Lazy-import to avoid pulling lib/auth into pure-helper files (e.g.
  // worker scripts that import credits.ts but never run a request).
  void import('@/lib/auth/user-cache').then((m) =>
    m.invalidateUserCacheById(userId),
  );
}
