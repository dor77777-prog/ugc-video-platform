import Link from 'next/link';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PLAN_CONFIGS, type PlanSlug } from '@/lib/plans';
import { SelectPlanButton } from './client-bits';

const PLAN_FEATURES: Record<PlanSlug, string[]> = {
  free_trial: [
    '30 קרדיטים חד-פעמיים',
    'יצירת תסריטים + תמונות + קולות',
    'תצוגה מקדימה של סצנות',
    '⚠ לא ניתן לייצא סרטון סופי',
    '⚠ לא ניתן ליצור קליפים מונפשים',
  ],
  creator: [
    '500 קרדיטים בחודש',
    'יוצר ~6 סרטוני 15s או 5 סרטוני 30s',
    'עד סצנת lipsync אחת לסרטון',
    'יצוא MP4 (1080p)',
    'גישה ל-30 קולות + 25 אווטארים',
    'הסרת קליפ ב-fast mode',
  ],
  brand: [
    '1,800 קרדיטים בחודש',
    'יוצר ~22 סרטוני 15s או 18 סרטוני 30s',
    'עד 2 סצנות lipsync לסרטון',
    'יצוא MP4 (1080p)',
    'בחירת brand-style נשמרת בין פרויקטים',
    '8 generations במקביל',
  ],
  agency: [
    '6,000 קרדיטים בחודש',
    'יוצר ~80 סרטוני 15s או 65 סרטוני 30s',
    'עד 2 סצנות lipsync לסרטון (3 בקרוב)',
    'יצוא MP4 (1080p)',
    'multi-seat: עד 5 משתמשים',
    'priority generation queue',
    '20 generations במקביל',
  ],
};

const PLAN_ORDER: PlanSlug[] = ['free_trial', 'creator', 'brand', 'agency'];

export default async function PricingPage() {
  const { dbUser } = await getOrCreateAppUser();
  const currentPlan = dbUser.plan as PlanSlug;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="space-y-2 text-center">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          תוכניות + מחירים
        </div>
        <h1 className="text-4xl font-bold tracking-tight">בחר את התוכנית שלך</h1>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
          1 קרדיט = $0.10. יוצרי קליפים מונפשים ועריכה מלאה — תוכנית{' '}
          <strong>Creator</strong> ומעלה. עכשיו אתה על:{' '}
          <Badge variant="default">{PLAN_CONFIGS[currentPlan].displayName}</Badge>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {PLAN_ORDER.map((slug) => {
          const cfg = PLAN_CONFIGS[slug];
          const features = PLAN_FEATURES[slug];
          const isCurrent = currentPlan === slug;
          const isFree = cfg.monthlyPriceUsd === 0;
          const isPopular = slug === 'creator';

          return (
            <Card
              key={slug}
              className={
                isPopular
                  ? 'border-primary border-2 shadow-lg relative'
                  : isCurrent
                    ? 'border-ai border-2'
                    : 'border-border'
              }
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                  פופולרי
                </div>
              )}
              <CardContent className="p-6 space-y-5">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">
                    {slug}
                  </div>
                  <h2 className="text-2xl font-bold">{cfg.displayName}</h2>
                </div>

                <div className="space-y-1">
                  {isFree ? (
                    <div className="text-4xl font-bold">חינם</div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold">
                          ${cfg.monthlyPriceUsd}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          /חודש
                        </span>
                      </div>
                      {cfg.annualDiscount > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {Math.round(cfg.annualDiscount * 100)}% הנחה בתשלום שנתי
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="text-sm font-mono text-muted-foreground">
                  {cfg.monthlyCredits} credits
                  {cfg.recurringCredits ? '/חודש' : ' חד-פעמיים'}
                </div>

                <ul className="space-y-1.5 text-xs leading-relaxed">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <span className="text-primary shrink-0">•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="pt-2">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full h-11 rounded-md border border-ai bg-ai/10 text-ai font-semibold text-sm"
                    >
                      ✓ התוכנית הנוכחית שלך
                    </button>
                  ) : (
                    <SelectPlanButton
                      plan={slug}
                      label={
                        isFree
                          ? 'התחל ניסיון'
                          : `שדרג ל-${cfg.displayName}`
                      }
                      isPopular={isPopular}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-dashed">
        <CardContent className="p-6 space-y-2">
          <div className="text-sm font-semibold">FAQ</div>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>
              <strong>איך נמדדים הקרדיטים?</strong> קליפ מונפש (b-roll) = 18 קרדיטים. קליפ
              עם lipsync = 30 קרדיטים. תמונה / רגן = 2 קרדיטים. voice = 1 קרדיט. סרטון
              סופי 15s = 8, 30s = 12.
            </p>
            <p>
              <strong>מה קורה אם נגמרו לי קרדיטים?</strong> אפשר לרכוש top-up pack בכל זמן
              (החל מ-$19 ל-200 credits) או לשדרג תוכנית. הקרדיטים שלא נוצלו לא מתגלגלים
              לחודש הבא.
            </p>
            <p>
              <strong>אפשר לבטל בכל זמן?</strong> כן. הביטול נכנס לתוקף בסוף החודש החיובי
              הנוכחי, והקרדיטים שנותרו ניתנים לשימוש עד הביטול.
            </p>
            <p className="text-[10px] opacity-70">
              💡 התשלום עוד לא חובר — בשלב הזה השדרוג הוא לצרכי בדיקות ופיתוח. ברגע שStripe
              יוטמע, השדרוג ידרוש כרטיס אשראי. אם תרצה לחזור לתוכנית קודמת, פנה למנהל.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="text-center">
        <Link
          href="/dashboard"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← חזרה לדאשבורד
        </Link>
      </div>
    </div>
  );
}
