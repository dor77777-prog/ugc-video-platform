// Scene card status badge — V13 PR7.3.
//
// Server-component-friendly visual badge driven entirely by PR6's
// SceneStatus enum. Renders a colored dot + Hebrew label that the
// wizard surfaces on every scene card. Pure / stateless — no client
// hydration overhead.
//
// Color mapping mirrors V13 §14.1:
//   gray    — pending
//   blue    — in-flight (planning / brief_built / generating_*)
//   green   — *_ready (terminal success)
//   yellow  — needs_review
//   red     — failed

import { cn } from '@/lib/utils';
import type { SceneStatus } from '@/lib/scenes/scene-status';
import { isInFlightSceneStatus } from '@/lib/scenes/scene-status';

const HEBREW_LABELS: Record<SceneStatus, string> = {
  pending: 'ממתין',
  planning: 'מתכנן את הסצנה',
  brief_built: 'בנה brief',
  generating_image: 'מייצר תמונה',
  image_ready: 'תמונה מוכנה',
  generating_voice: 'מייצר קול',
  voice_ready: 'קול מוכן',
  generating_clip: 'מייצר אנימציה',
  clip_ready: 'אנימציה מוכנה',
  needs_review: 'דורש בדיקה',
  failed: 'נכשל',
};

interface SceneCardStatusBadgeProps {
  status: SceneStatus;
  /** Show only the dot (compact strip) instead of dot + label. */
  compact?: boolean;
  className?: string;
}

function statusColorClass(status: SceneStatus): string {
  if (status === 'pending') return 'bg-zinc-300';
  if (status === 'failed') return 'bg-red-500';
  if (status === 'needs_review') return 'bg-yellow-400';
  if (status.endsWith('_ready')) return 'bg-emerald-500';
  if (isInFlightSceneStatus(status)) return 'bg-blue-500 animate-pulse';
  // brief_built — instant transient state, render as in-flight blue.
  return 'bg-blue-500 animate-pulse';
}

export function SceneCardStatusBadge({
  status,
  compact = false,
  className,
}: SceneCardStatusBadgeProps) {
  const dotClass = statusColorClass(status);
  const label = HEBREW_LABELS[status];

  if (compact) {
    return (
      <span
        dir="rtl"
        title={label}
        aria-label={label}
        className={cn('inline-block h-2.5 w-2.5 rounded-full', dotClass, className)}
      />
    );
  }

  return (
    <span
      dir="rtl"
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700',
        className,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', dotClass)} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
