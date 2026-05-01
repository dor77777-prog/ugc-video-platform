// V21 — shared header for all project inner pages (scripts, scenes,
// videos). Gives the wizard a consistent "Studio" feel — meta info on
// the right, progress + back link in the middle, workspace actions on
// the left. Applied across `/projects/[id]/{scripts,scenes,videos}`.

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
        'relative rounded-3xl glass-strong overflow-hidden animate-fade-in-up',
        className,
      )}
    >
      {/* Soft gradient wash behind the hero content. */}
      <div
        className="absolute inset-0 -z-10 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 10% 0%, hsl(258 100% 65% / 0.35), transparent 55%), radial-gradient(circle at 90% 100%, hsl(73 95% 60% / 0.18), transparent 55%)',
        }}
      />

      <div className="px-6 md:px-10 py-8 md:py-10 flex flex-col md:flex-row items-start md:items-center gap-6">
        {/* Right column (RTL): kicker + back link + title + description */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center flex-wrap gap-3 text-xs">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
            {projectName && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="font-medium text-foreground/90 truncate max-w-[200px]">
                  {projectName}
                </span>
              </>
            )}
            {kicker && (
              <>
                <span className="text-muted-foreground">/</span>
                <span className="uppercase tracking-[0.25em] text-primary font-mono">
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
            <p className="text-sm md:text-base text-muted-foreground max-w-2xl leading-relaxed">
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
