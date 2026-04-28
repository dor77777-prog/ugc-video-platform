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

export async function changePlanAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get('userId'));
  const plan = String(formData.get('plan'));
  if (!userId || !plan) return;
  await prisma.user.update({ where: { id: userId }, data: { plan } });
  revalidatePath('/admin/users');
}
