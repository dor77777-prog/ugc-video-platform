import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getStepHref } from '@/lib/wizard/current-step';

export interface WizardStep {
  num: number;
  label: string;
}

// V26.19 — 8 steps now. V26.18 added "תכונות מנצחות" (#3) between
// avatar and script; V26.19 added "קולות" (#6) between scenes and
// clips. Numbering propagates to STEP_PATH + getCurrentStepNumber.
export const WIZARD_STEPS: WizardStep[] = [
  { num: 1, label: 'מוצר ופרטים' },
  { num: 2, label: 'אווטאר' },
  { num: 3, label: 'תכונות מנצחות' },
  { num: 4, label: 'תסריט' },
  { num: 5, label: 'סצנות תמונות' },
  { num: 6, label: 'קולות' },
  { num: 7, label: 'סצנות מונפשות' },
  { num: 8, label: 'הרכבה סופית' },
];

interface StepperProps {
  steps?: WizardStep[];
  current: number;
  done?: number[];
  // When projectId is provided, completed steps become clickable links
  // (the user can jump back to any earlier step to change something).
  projectId?: string;
}

export function Stepper({ steps = WIZARD_STEPS, current, done = [], projectId }: StepperProps) {
  return (
    <div dir="ltr" className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
      {steps.map((step, i) => {
        const isDone = done.includes(step.num) || step.num < current;
        const isActive = step.num === current;
        const clickable = (isDone || isActive) && step.num !== current;
        const href = projectId ? getStepHref(step.num, projectId) : undefined;

        const node = (
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                isDone && !isActive && 'bg-primary text-primary-foreground',
                isActive && 'bg-ai text-ai-foreground ring-4 ring-ai/30',
                !isDone && !isActive && 'border-2 border-muted-foreground/30 text-muted-foreground',
              )}
            >
              {isDone && !isActive ? '✓' : step.num}
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
            {clickable && href ? (
              <Link
                href={href}
                className="hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                title={`לחזרה ל${step.label}`}
              >
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
