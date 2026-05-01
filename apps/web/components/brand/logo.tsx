// V20.1 — refined brand logo. Replaces the wordmark+dot with a custom
// SVG mark + carefully kerned wordmark.
//
// Concept: the mark is a "play+frame" hybrid. A rounded square frame
// (representing the 9:16 video output) with an asymmetric gap on the
// right edge and an inner play triangle tilted slightly. The gap +
// accent dot at it suggests motion / generation — content emerging
// from the frame as it's being made. Built as pure SVG so it's crisp
// at any size and inherits currentColor for the wordmark when needed.

import { cn } from '@/lib/utils';

export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<LogoSize, { mark: string; text: string; gap: string }> = {
  sm: { mark: 'h-6 w-6', text: 'text-sm', gap: 'gap-2' },
  md: { mark: 'h-8 w-8', text: 'text-base', gap: 'gap-2.5' },
  lg: { mark: 'h-10 w-10', text: 'text-xl', gap: 'gap-3' },
  xl: { mark: 'h-14 w-14', text: 'text-3xl', gap: 'gap-4' },
};

export function Logo({
  size = 'md',
  withWordmark = true,
  className,
}: {
  size?: LogoSize;
  withWordmark?: boolean;
  className?: string;
}) {
  const cls = SIZE_CLASSES[size];
  return (
    <div className={cn('inline-flex items-center', cls.gap, className)} dir="ltr">
      <LogoMark className={cls.mark} />
      {withWordmark && (
        <span
          className={cn('font-black tracking-tight text-foreground', cls.text)}
          style={{ letterSpacing: '-0.04em' }}
        >
          tachles
        </span>
      )}
    </div>
  );
}

// The SVG mark itself — kept as a separate export so other components
// can render JUST the icon at smaller sizes without the wordmark.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        {/* Gradient for the frame stroke — single-tone primary with a
            slight diagonal shift. Avoids the rainbow-y feel by staying
            in one color family. */}
        <linearGradient id="tachles-frame-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(258 100% 75%)" />
          <stop offset="100%" stopColor="hsl(258 100% 55%)" />
        </linearGradient>
        {/* Inner play triangle — accent gradient, used as the only
            color contrast in the mark. */}
        <linearGradient id="tachles-play-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(0 0% 100%)" />
          <stop offset="100%" stopColor="hsl(258 100% 80%)" />
        </linearGradient>
        {/* Soft outer glow filter for the frame. */}
        <filter id="tachles-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer rounded-rectangle frame with an asymmetric gap on the
          right edge — the gap suggests "content emerging" / video
          generation. stroke=2.5 keeps it readable at h-6 sizes. */}
      <path
        d="
          M 9 4
          L 31 4
          A 5 5 0 0 1 36 9
          L 36 22
          M 36 30
          A 5 5 0 0 1 31 36
          L 9 36
          A 5 5 0 0 1 4 31
          L 4 9
          A 5 5 0 0 1 9 4
        "
        stroke="url(#tachles-frame-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter="url(#tachles-glow)"
      />

      {/* Inner play triangle — slightly off-center, tilted right
          (suggesting forward motion / playback). */}
      <path
        d="M 16 13 L 28 20 L 16 27 Z"
        fill="url(#tachles-play-grad)"
        opacity="0.95"
      />

      {/* Tiny accent dot at the gap — "live" / generation indicator. */}
      <circle cx="36" cy="26" r="1.6" fill="hsl(73 95% 60%)" />
    </svg>
  );
}
