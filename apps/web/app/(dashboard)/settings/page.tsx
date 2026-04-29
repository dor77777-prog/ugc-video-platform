import Link from 'next/link';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PLAN_CONFIGS, type PlanSlug } from '@/lib/plans';

export default async function SettingsPage() {
  const { authUser, dbUser } = await getOrCreateAppUser();
  const planConfig = PLAN_CONFIGS[dbUser.plan as PlanSlug] ?? PLAN_CONFIGS.free_trial;

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-6">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">הגדרות</div>
        <h1 className="text-3xl font-bold tracking-tight">החשבון שלכם</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>פרטים</CardTitle>
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
              <Button variant="default" className="w-full">
                {dbUser.plan === 'free_trial' ? 'שדרג לתוכנית בתשלום' : 'החלף תוכנית / שדרוג'}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>בחנאי, יבוא בהמשך</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <ul className="list-disc list-inside space-y-1">
            <li>שינוי סיסמה</li>
            <li>חיובים ומסמכי חיוב</li>
            <li>צוותים ומשתמשים נוספים</li>
            <li>קישור לחנות שופיפיי / ווקומרס</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium" dir="ltr">{value}</span>
    </div>
  );
}
