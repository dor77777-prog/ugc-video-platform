import Link from 'next/link';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PLAN_CONFIGS, type PlanSlug } from '@/lib/plans';
import { DensityScope } from '@/components/density/density-scope';
import { SectionKicker } from '@/components/ui/section-kicker';
import { Settings as SettingsIcon } from 'lucide-react';

export default async function SettingsPage() {
  const { authUser, dbUser } = await getOrCreateAppUser();
  const planConfig = PLAN_CONFIGS[dbUser.plan as PlanSlug] ?? PLAN_CONFIGS.free_trial;

  // V27 Vercel-mode: settings is functional chrome — dense.
  return (
    <DensityScope mode="dense" as="div" className="p-6 md:p-10 max-w-container-form mx-auto space-y-6">
      <div className="space-y-2 motion-fade-up">
        <SectionKicker variant="muted" text="הגדרות" english="Settings" icon={SettingsIcon} />
        <h1 className="text-3xl font-bold tracking-tight">החשבון שלכם</h1>
      </div>

      <Card className="tier-surface motion-fade-up">
        <CardHeader>
          <CardTitle className="text-xl">פרטים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="אימייל" value={authUser.email!} />
          <Field
            label="פלאן"
            value={`${planConfig.displayName}${planConfig.monthlyPriceUsd > 0 ? ` ($${planConfig.monthlyPriceUsd}/חודש)` : ''}`}
          />
          <Field label="קרדיטים" value={String(dbUser.creditsBalance)} />
          <Field
            label="תאריך הצטרפות"
            value={dbUser.createdAt.toLocaleDateString('he-IL')}
          />
          <div className="pt-3">
            <Link href="/pricing">
              <Button intent="action" className="w-full">
                {dbUser.plan === 'free_trial' ? 'שדרג לתוכנית בתשלום' : 'החלף תוכנית / שדרוג'}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="tier-surface motion-fade-up">
        <CardHeader>
          <CardTitle className="text-xl">בחנאי, יבוא בהמשך</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-fg-tertiary space-y-2">
          <ul className="list-disc list-inside space-y-1">
            <li>שינוי סיסמה</li>
            <li>חיובים ומסמכי חיוב</li>
            <li>צוותים ומשתמשים נוספים</li>
            <li>קישור לחנות שופיפיי / ווקומרס</li>
          </ul>
        </CardContent>
      </Card>
    </DensityScope>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-divider last:border-0">
      <span className="text-sm text-fg-tertiary">{label}</span>
      <span className="text-sm font-medium font-mono" dir="ltr">{value}</span>
    </div>
  );
}
