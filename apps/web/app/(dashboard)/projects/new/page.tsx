import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const STEPS = [
  { num: 1, label: 'מוצר' },
  { num: 2, label: 'פרטים' },
  { num: 3, label: 'יוצרי תוכן' },
  { num: 4, label: 'תסריט' },
  { num: 5, label: 'סצנות תמונות' },
  { num: 6, label: 'סצנות וידאו' },
  { num: 7, label: 'סיום' },
];

export default function NewProjectWizard() {
  const currentStep = 1;

  return (
    <div className="p-6 md:p-10 max-w-6xl space-y-8">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">צור סרטון מוצר</div>
        <h1 className="text-3xl font-bold tracking-tight">בניית מודעת UGC חדשה</h1>
      </div>

      {/* Stepper */}
      <div dir="ltr" className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
        {STEPS.map((step, i) => {
          const done = step.num < currentStep;
          const active = step.num === currentStep;
          return (
            <div key={step.num} className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex flex-col items-center gap-2 flex-shrink-0">
                <div
                  className={
                    done
                      ? 'w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold'
                      : active
                        ? 'w-9 h-9 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-bold ring-4 ring-accent/30'
                        : 'w-9 h-9 rounded-full border-2 border-muted-foreground/30 text-muted-foreground flex items-center justify-center text-sm font-bold'
                  }
                >
                  {done ? '✓' : step.num}
                </div>
                <div
                  className={
                    active
                      ? 'text-xs font-semibold text-foreground whitespace-nowrap'
                      : 'text-xs text-muted-foreground whitespace-nowrap'
                  }
                  dir="rtl"
                >
                  {step.label}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 ${done ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content placeholder */}
      <Card>
        <CardContent className="p-8 space-y-6">
          <div className="space-y-2 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold">שלב 1 — פרטי המוצר</h2>
            <p className="text-muted-foreground text-sm">
              כאן יהיה הטופס: כתובת מוצר (סקרייפר אוטומטי), שם, קהל יעד, תיאור, תמונה, יחס מסך
              וכו׳. בקומיט הזה הנחנו את שלד ה-Wizard. הטופס עצמו יבוא בקומיט הבא יחד עם
              הסקרייפר.
            </p>
          </div>

          <div className="border-2 border-dashed border-border rounded-lg p-12 text-center text-sm text-muted-foreground">
            🚧 שלב 1 בבנייה — חוזרים אליו אחרי שהסקרייפר וה־LLM מחוברים
          </div>

          <div className="flex justify-between gap-3" dir="ltr">
            <Button variant="outline" disabled>
              ← הקודם
            </Button>
            <Button disabled>הבא →</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
