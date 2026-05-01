// V27 — shared header for all project inner pages.
//
// Uses tier-atmosphere (28px blur, edge-pearl on top edge) for a
// hero that reads as "this is a chapter heading," not a stat card.
// Applied across /projects/[id]/{scripts,scenes,videos,...}.
// Soft mesh wash kept (radial gradient) — landing-only ambient
// pattern brought to the wizard heading because the hero is
// genuinely the chapter spread.

import Link from 'next/link';
import { ArrowRight, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectHeroProps {
  /** Optional kicker label above the title (uppercase tracking-widest). */
  kicker?: string;
  title: string;
  description?: string;
  projectName?: string | null;
  step?: number;
  totalSteps?: number;
  /** Lucide icon for the step indicator. */
  icon?: LucideIcon;
  /** Right-side meta (e.g. credits, voice picked badge). */
  meta?: React.ReactNode;
  /** Left-side action area (e.g. "Generate all" button). */
  actions?: React.ReactNode;
  /** Back-link target (default /dashboard). */
  backHref?: string;
  backLabel?: string;
  className?: string;
}

export function ProjectHero({
  kicker,
  title,
  description,
  projectName,
  step,
  totalSteps,
  icon: Icon = Sparkles,
  meta,
  actions,
  backHref = '/dashboard',
  backLabel = 'דאשבורד',
  className,
}: ProjectHeroProps) {
  return (
    <div
      className={cn(
        'relative rounded-2xl tier-atmosphere overflow-hidden motion-fade-up',
        className,
      )}
    >
      {/* Soft gradient wash behind the hero content. */}
      <div
        className="absolute inset-0 -z-10 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 10% 0%, hsl(var(--primary) / 0.32), transparent 55%), radial-gradient(circle at 90% 100%, hsl(var(--ai) / 0.14), transparent 55%)',
        }}
      />

      <div className="px-6 md:px-10 py-8 md:py-10 flex flex-col md:flex-row items-start md:items-center gap-6">
        {/* Right column (RTL): kicker + back link + title + description */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center flex-wrap gap-3 text-xs">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 text-fg-tertiary hover:text-fg transition-colors motion-press"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
            {projectName && (
              <>
                <span className="text-fg-tertiary">/</span>
                <span className="font-medium text-fg-secondary truncate max-w-[200px]">
                  {projectName}
                </span>
              </>
            )}
            {kicker && (
              <>
                <span className="text-fg-tertiary">/</span>
                <span className="kicker-loud font-mono text-[11px] uppercase">
                  {kicker}
                </span>
              </>
            )}
            {typeof step === 'number' && typeof totalSteps === 'number' && (
              <span className="ms-auto inline-flex items-center gap-1.5 px-2.5 h-6 rounded-md bg-primary/10 border border-primary/30 text-primary font-mono text-[11px]">
                <Icon className="h-3 w-3" />
                שלב {step}/{totalSteps}
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-[1.05]">
            {title}
          </h1>

          {description && (
            <p className="text-sm md:text-base text-fg-secondary max-w-2xl leading-relaxed">
              {description}
            </p>
          )}

          {meta && <div className="pt-2">{meta}</div>}
        </div>

        {/* Left column (RTL): actions */}
        {actions && (
          <div className="flex-shrink-0 flex flex-col gap-2 items-stretch md:items-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
