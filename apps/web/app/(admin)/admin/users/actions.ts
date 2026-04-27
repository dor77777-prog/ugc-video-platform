'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/sync-user';

export async function addCreditsAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get('userId'));
  const amount = parseInt(String(formData.get('amount') ?? '10'), 10);
  if (!userId || !Number.isFinite(amount)) return;

  await prisma.user.update({
    where: { id: userId },
    data: { creditsBalance: { increment: amount } },
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
