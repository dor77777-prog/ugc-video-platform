'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { PLAN_CONFIGS, type PlanSlug } from '@/lib/plans';

export type SelectPlanState =
  | { error?: string; success?: boolean; newPlan?: string }
  | undefined;

// Self-service plan switch from /pricing. Until Stripe is wired, this
// flips the plan + grants the new plan's monthly credits immediately.
// In production this will be replaced by a Stripe checkout flow that
// calls a webhook handler — but the credit-grant + plan-change logic
// stays the same; only the trigger changes from form submit → webhook.
//
// Audit: every change is logged to creditTransaction with reason
// `plan_grant:<slug>` so /admin/users → user history shows the upgrade.
export async function selectPlanAction(
  _prev: SelectPlanState,
  formData: FormData,
): Promise<SelectPlanState> {
  const { dbUser } = await getOrCreateAppUser();
  const planRaw = String(formData.get('plan') ?? '');

  if (!(planRaw in PLAN_CONFIGS)) {
    return { error: `תוכנית לא חוקית: ${planRaw}` };
  }

  const cfg = PLAN_CONFIGS[planRaw as PlanSlug];
  const now = new Date();
  const renewsAt = cfg.recurringCredits
    ? new Date(now.getTime() + 30 * 24 * 3600 * 1000)
    : null;

  // Skip the no-op case so we don't double-grant credits if the user
  // re-clicks their current plan.
  if (dbUser.plan === planRaw) {
    return { error: 'אתה כבר על התוכנית הזו.' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: dbUser.id },
      data: {
        plan: planRaw,
        planStartedAt: now,
        planRenewsAt: renewsAt,
      },
    });
    if (cfg.monthlyCredits > 0) {
      await tx.user.update({
        where: { id: dbUser.id },
        data: { creditsBalance: { increment: cfg.monthlyCredits } },
      });
      await tx.creditTransaction.create({
        data: {
          userId: dbUser.id,
          amount: cfg.monthlyCredits,
          reason: `plan_grant:${planRaw}`,
          ref: planRaw,
          metadata: {
            triggered_by: 'self_service_pricing',
            monthlyPriceUsd: cfg.monthlyPriceUsd,
          },
        },
      });
    }
  });

  revalidatePath('/pricing');
  revalidatePath('/settings');
  revalidatePath('/dashboard');
  redirect('/dashboard?upgraded=' + planRaw);
}
