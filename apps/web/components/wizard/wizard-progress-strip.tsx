// V27 — wizard progress strip.
//
// 8-step flow rendered as a tile grid. Each tile uses tier-elevated
// for the current step (with glow-primary), tier-surface for done,
// tier-surface (muted) for future. Step numbers are Geist Mono via
// the global font stack. The current-step "PULSE" dot uses
// motion-pulse-ai (V27 motion namespace).
//
// V26.19 split voice generation into its own step (#6).

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
        // V27: tier-elevated for the active step (light blur, glow-primary
        // halo), tier-surface for done/future (no blur — chrome retreats).
        const tileClass = cn(
          'relative rounded-xl p-4 transition-all motion-press',
          isCurrent && 'tier-elevated glow-primary border-primary/50 cursor-pointer',
          isDone && !isCurrent &&
            'tier-surface border-success/30 hover:border-success/50 cursor-pointer motion-lift-hover',
          isFuture && 'tier-surface opacity-50 cursor-default',
        );
        const inner = (
          <>
            <div className="absolute top-2.5 right-3 text-[10px] font-mono text-fg-tertiary">
              {String(step.num).padStart(2, '0')}
            </div>
            <div
              className={cn(
                'h-10 w-10 rounded-md flex items-center justify-center mb-3',
                isCurrent &&
                  'bg-gradient-to-br from-primary/30 to-primary-soft/40 text-primary',
                isDone && !isCurrent && 'bg-success-soft/60 text-success',
                isFuture && 'bg-elevated/50 text-fg-tertiary border border-dashed border-divider',
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className={cn('text-xs font-bold tracking-tight', isFuture && 'text-fg-tertiary')}>
              {step.label}
            </div>
            {isCurrent && (
              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary motion-pulse-ai" />
                <span className="font-mono uppercase tracking-[0.18em]">פעיל</span>
              </div>
            )}
            {isDone && !isCurrent && (
              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-success">
                <CheckCircle2 className="h-3 w-3" />
                <span className="font-mono uppercase tracking-[0.18em]">בוצע</span>
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
