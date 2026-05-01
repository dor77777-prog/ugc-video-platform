// V27 — Section kicker label.
//
// The small uppercase mono tag above every major section. Two variants,
// EXPLICIT (no context-aware magic):
//
//   variant="loud"  → tracking-[0.24em] + text-primary
//                     Use in: landing, dashboard hero, Krea-mode scene
//                     cards, video reveal — anywhere we want the kicker
//                     to register as a present voice.
//
//   variant="muted" → tracking-[0.18em] + text-fg-tertiary
//                     Use in: admin tables, settings, sidebar, library
//                     list — anywhere chrome should retreat.
//
// When an ancestor declares [data-ai-active], a muted kicker auto-
// promotes to loud-lime via globals.css (the only "magic" allowed —
// it's the AI breathing contract, not context guesswork).
//
// Source of truth: .design/design-language-v27/DESIGN_TOKENS.md §2.3

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export type SectionKickerVariant = 'loud' | 'muted';

export function SectionKicker({
  text,
  english,
  icon: Icon,
  variant,
  className,
}: {
  text: string;
  /** Optional secondary English label, rendered after a middot. */
  english?: string;
  icon?: LucideIcon;
  variant: SectionKickerVariant;
  className?: string;
}) {
  const variantClass =
    variant === 'loud' ? 'kicker-loud' : 'kicker-muted';

  // Trailing English meta-label fades a tier below the kicker word.
  const englishClass =
    variant === 'loud' ? 'text-fg-secondary' : 'text-fg-disabled';
  const sepClass =
    variant === 'loud' ? 'text-fg-tertiary/70' : 'text-fg-disabled/70';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 text-[11px] uppercase font-mono',
        variantClass,
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span>{text}</span>
      {english && (
        <>
          <span className={sepClass}>·</span>
          <span className={englishClass}>{english}</span>
        </>
      )}
    </div>
  );
}
