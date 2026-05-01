import { cn } from '@/lib/utils';

// V27 — ProgressBar with semantic variants.
//
// Three V27 variants + 1 legacy alias:
//   primary   — generic "something is loading" (sweeping shimmer rail)
//   ai        — AI process running (lime shimmer rail; matches the
//               --ai 78° hue used inside [data-ai-active] containers)
//   success   — STATIC filled rail (process completed). No animation.
//               This is the V27 contract: ai = motion, success = static.
//   accent    — @deprecated alias for `ai`. Wave 4 sweep removes it.
//
// active=false renders an empty track (no fill, no animation).

export type ProgressBarVariant = 'primary' | 'ai' | 'success' | 'accent';

export function ProgressBar({
  active = true,
  variant = 'primary',
  className,
}: {
  active?: boolean;
  variant?: ProgressBarVariant;
  className?: string;
}) {
  // V27 success is the only variant that doesn't shimmer — the bar is
  // a fully-filled static rail that holds for the consumer's lifecycle.
  if (variant === 'success') {
    return (
      <div className={cn('relative h-1 w-full overflow-hidden rounded-full bg-elevated', className)}>
        {active && (
          <div className="absolute inset-y-0 inset-x-0 rounded-full bg-success" />
        )}
      </div>
    );
  }

  const railClasses =
    variant === 'ai' || variant === 'accent'
      ? 'bg-gradient-to-r from-transparent via-ai to-transparent'
      : 'bg-gradient-to-r from-transparent via-primary to-transparent';

  return (
    <div className={cn('relative h-1 w-full overflow-hidden rounded-full bg-elevated', className)}>
      {active && (
        <div className={cn('absolute inset-y-0 w-1/2 motion-shimmer', railClasses)} />
      )}
    </div>
  );
}
