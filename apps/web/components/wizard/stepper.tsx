import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface WizardStep {
  num: number;
  label: string;
  href?: string;
}

export const WIZARD_STEPS: WizardStep[] = [
  { num: 1, label: 'מוצר ופרטים' },
  { num: 2, label: 'אווטאר' },
  { num: 3, label: 'תסריט' },
  { num: 4, label: 'סצנות תמונות' },
  { num: 5, label: 'סצנות וידאו' },
  { num: 6, label: 'סיום' },
];

export function Stepper({
  steps = WIZARD_STEPS,
  current,
  done = [],
}: {
  steps?: WizardStep[];
  current: number;
  done?: number[];
}) {
  return (
    <div dir="ltr" className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
      {steps.map((step, i) => {
        const isDone = done.includes(step.num) || step.num < current;
        const isActive = step.num === current;
        const node = (
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                isDone && 'bg-primary text-primary-foreground',
                isActive && !isDone && 'bg-accent text-accent-foreground ring-4 ring-accent/30',
                !isDone && !isActive && 'border-2 border-muted-foreground/30 text-muted-foreground',
              )}
            >
              {isDone ? '✓' : step.num}
            </div>
            <div
              className={cn(
                'text-xs whitespace-nowrap transition-colors',
                isActive ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
              dir="rtl"
            >
              {step.label}
            </div>
          </div>
        );
        return (
          <div key={step.num} className="flex items-center gap-2 flex-1 min-w-0">
            {step.href && isDone ? (
              <Link href={step.href} className="hover:opacity-80">
                {node}
              </Link>
            ) : (
              node
            )}
            {i < steps.length - 1 && (
              <div className={cn('h-0.5 flex-1 transition-colors', isDone ? 'bg-primary' : 'bg-muted')} />
            )}
          </div>
        );
      })}
    </div>
  );
}
