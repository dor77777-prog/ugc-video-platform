// V23 — wizard progress strip. Visual rendition of the 6-step user
// flow (URL → avatar → scripts → scenes → videos → finish). Used on
// the dashboard for in-progress projects to show "you're at step 3"
// at a glance, matching the landing's pipeline strip.
//
// Each cell: monospace step number (01..06) at top-right corner, a
// gradient icon tile, label, and a "current" accent ring. Past steps
// dim slightly; future steps stay muted with dashed icon outline.

import Link from 'next/link';
import {
  Globe,
  Users,
  Wand2,
  ImageIcon,
  Film,
  CheckCircle2,
  Target,
  Mic2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  num: number;
  label: string;
  icon: LucideIcon;
  href?: string;
}

// V26.19 — 8 steps. V26.18 added Feature Focus (#3); V26.19 splits
// voice selection + voice-over generation out of the scenes step into
// its own /voices step (#6) so users land on a single-purpose screen
// instead of juggling images + voices on the same grid.
const STEPS: Step[] = [
  { num: 1, label: 'URL מוצר', icon: Globe },
  { num: 2, label: 'אווטאר', icon: Users },
  { num: 3, label: 'תכונות מנצחות', icon: Target },
  { num: 4, label: 'תסריט', icon: Wand2 },
  { num: 5, label: 'סצנות', icon: ImageIcon },
  { num: 6, label: 'קולות', icon: Mic2 },
  { num: 7, label: 'קליפים', icon: Film },
  { num: 8, label: 'מוכן', icon: CheckCircle2 },
];

const STEP_ROUTES: Record<number, string> = {
  1: '/edit',
  2: '/avatar',
  3: '/features',
  4: '/scripts',
  5: '/scenes',
  6: '/voices',
  7: '/videos',
  8: '/videos',
};

export function WizardProgressStrip({
  projectId,
  currentStep,
  done = [],
  className,
}: {
  projectId: string;
  currentStep: number;
  /** Array of step numbers that are already complete. */
  done?: number[];
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2', className)}>
      {STEPS.map((step) => {
        const isCurrent = step.num === currentStep;
        const isDone = done.includes(step.num) || step.num < currentStep;
        const isFuture = !isCurrent && !isDone;
        const Icon = step.icon;
        const tileClass = cn(
          'relative rounded-2xl glass p-4 transition-all',
          isCurrent && 'border-primary/50 shadow-glow ring-1 ring-primary/30 cursor-pointer',
          isDone && !isCurrent && 'border-accent/30 hover:border-accent/50 cursor-pointer',
          isFuture && 'opacity-50 cursor-default',
        );
        const inner = (
          <>
            <div className="absolute top-2.5 right-3 text-[10px] font-mono text-muted-foreground/80">
              {String(step.num).padStart(2, '0')}
            </div>
            <div
              className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center mb-3',
                isCurrent &&
                  'bg-gradient-to-br from-primary/40 to-accent/20 text-primary shadow-glow',
                isDone && !isCurrent && 'bg-accent/20 text-accent',
                isFuture && 'bg-muted/30 text-muted-foreground border border-dashed border-border',
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className={cn('text-xs font-bold tracking-tight', isFuture && 'text-muted-foreground')}>
              {step.label}
            </div>
            {isCurrent && (
              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-soft-pulse" />
                <span className="font-mono uppercase tracking-widest">פעיל</span>
              </div>
            )}
            {isDone && !isCurrent && (
              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-accent">
                <CheckCircle2 className="h-3 w-3" />
                <span className="font-mono uppercase tracking-widest">בוצע</span>
              </div>
            )}
          </>
        );

        if (isFuture) {
          return (
            <div key={step.num} className={tileClass}>
              {inner}
            </div>
          );
        }
        return (
          <Link
            key={step.num}
            href={`/projects/${projectId}${STEP_ROUTES[step.num] ?? '/scripts'}`}
            className={tileClass}
          >
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
