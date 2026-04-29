'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/sync-user';

export async function addCreditsAction(formData: FormData) {
  const { dbUser: actor } = await requireAdmin();
  const userId = String(formData.get('userId'));
  const amount = parseInt(String(formData.get('amount') ?? '10'), 10);
  if (!userId || !Number.isFinite(amount)) return;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { creditsBalance: { increment: amount } },
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        amount, // signed positive — admin grant
        reason: 'admin_grant',
        adminId: actor.id,
      },
    }),
  ]);
  revalidatePath('/admin/users');
}

// Refund: positive `amount` is added back to the user's balance and a
// CreditTransaction row records who/why. Use this when our pipeline
// failed to deliver something the user paid for (e.g. lipsync skipped,
// scene came back unusable, complaint resolved by support).
export async function refundCreditsAction(formData: FormData) {
  const { dbUser: actor } = await requireAdmin();
  const userId = String(formData.get('userId'));
  const amount = parseInt(String(formData.get('amount') ?? '1'), 10);
  const note = String(formData.get('note') ?? '').slice(0, 200);
  if (!userId || !Number.isFinite(amount) || amount <= 0) return;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { creditsBalance: { increment: amount } },
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        amount,
        reason: note ? `admin_refund:${note}` : 'admin_refund',
        adminId: actor.id,
      },
    }),
  ]);
  revalidatePath('/admin/users');
}

// Set a per-user override on the daily provider-spend cap (USD). Admin
// uses this for paid users who need more than the $10/day default.
// Pass empty string to clear the override.
export async function setSpendCapAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get('userId'));
  const raw = String(formData.get('spendCapUsd') ?? '').trim();
  if (!userId) return;

  const cap = raw === '' ? null : parseFloat(raw);
  if (cap !== null && (!Number.isFinite(cap) || cap < 0)) return;

  await prisma.user.update({
    where: { id: userId },
    data: { spendCapUsd: cap },
  });
  revalidatePath('/admin/users');
}

export async function toggleBanAction(formData: FormData) {
  const { dbUser: actor } = await requireAdmin();
  const userId = String(formData.get('userId'));
  if (!userId || userId === actor.id) return; // can't ban yourself

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return;

  await prisma.user.update({
    where: { id: userId },
    data: { banned: !target.banned },
  });
  revalidatePath('/admin/users');
}

// Change a user's plan. Validates the slug against PLAN_CONFIGS,
// grants the new plan's monthly credits as a separate ledger entry
// (so /admin/users history is auditable), and timestamps planStartedAt
// + planRenewsAt for analytics + the eventual Stripe sync. Used by
// admin to manually upgrade/downgrade until billing is wired.
export async function changePlanAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get('userId'));
  const planRaw = String(formData.get('plan'));
  const grantCredits = String(formData.get('grantCredits') ?? 'true') === 'true';
  if (!userId || !planRaw) return;

  const { PLAN_CONFIGS } = await import('@/lib/plans');
  if (!(planRaw in PLAN_CONFIGS)) return; // ignore invalid slug

  const cfg = PLAN_CONFIGS[planRaw as keyof typeof PLAN_CONFIGS];
  const now = new Date();
  // Monthly renewal in 30 days. For free_trial, planRenewsAt stays NULL
  // (no auto-refill) so the one-time 30 credits behave correctly.
  const renewsAt = cfg.recurringCredits
    ? new Date(now.getTime() + 30 * 24 * 3600 * 1000)
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        plan: planRaw,
        planStartedAt: now,
        planRenewsAt: renewsAt,
      },
    });
    if (grantCredits && cfg.monthlyCredits > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { creditsBalance: { increment: cfg.monthlyCredits } },
      });
      await tx.creditTransaction.create({
        data: {
          userId,
          amount: cfg.monthlyCredits,
          reason: `plan_grant:${planRaw}`,
          ref: planRaw,
          metadata: {
            triggered_by: 'admin_change_plan',
            monthlyPriceUsd: cfg.monthlyPriceUsd,
          },
        },
      });
    }
  });
  revalidatePath('/admin/users');
}
