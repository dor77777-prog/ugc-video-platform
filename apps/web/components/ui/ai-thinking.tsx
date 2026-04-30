'use client';

// V17 — AI-thinking indicator. Replaces a static "Loading..." spinner
// with an animated label that cycles through pipeline phases as time
// passes. Each phase has a Lucide icon + Hebrew label, and the current
// one is highlighted with a soft pulse. Phases are time-anchored, not
// progress-anchored, so we can use it before knowing the actual server
// progress (e.g. the moment the user clicks "Generate all").
//
// Why phase-anchored vs %: image gen has no real progress events from
// gpt-image-2 — it just blocks for 30-60s. Showing fake percentages
// is dishonest; showing the AI's actual stages ("planning the shot →
// composing → rendering...") feels both transparent and modern. Same
// logic as ChatGPT's "Thinking → Researching → Writing..." UI.

import { useEffect, useState } from 'react';
import { Sparkles, Brain, Palette, Camera, Wand2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ThinkingPhase {
  atMs: number;
  label: string;
  icon: LucideIcon;
}

export const IMAGE_GEN_PHASES: ThinkingPhase[] = [
  { atMs: 0, label: 'בונה תיאור ויזואלי…', icon: Brain },
  { atMs: 4000, label: 'בוחר זווית מצלמה ותאורה…', icon: Camera },
  { atMs: 12000, label: 'מערבב את האווטאר עם הסצנה…', icon: Palette },
  { atMs: 22000, label: 'מייצר את התמונה ב־gpt-image-2…', icon: Sparkles },
  { atMs: 38000, label: 'משלים פרטים אחרונים…', icon: Wand2 },
];

export const VOICE_GEN_PHASES: ThinkingPhase[] = [
  { atMs: 0, label: 'מנתח את התסריט בעברית…', icon: Brain },
  { atMs: 2000, label: 'מסנכרן עם פרופיל הקול…', icon: Sparkles },
  { atMs: 5000, label: 'מייצר את ה־voice-over ב־ElevenLabs…', icon: Wand2 },
  { atMs: 10000, label: 'מודד timestamps לכל מילה…', icon: Camera },
];

export const CLIP_GEN_PHASES: ThinkingPhase[] = [
  { atMs: 0, label: 'בודק אם נדרש lipsync…', icon: Brain },
  { atMs: 3000, label: 'מנתח את התמונה (motion analysis)…', icon: Camera },
  { atMs: 8000, label: 'מנפיש את הסצנה ב־Kling Omni v3…', icon: Palette },
  { atMs: 60000, label: 'מסנכרן שפתיים עם ElevenLabs (PixVerse)…', icon: Wand2 },
  { atMs: 120000, label: 'משלים את הקליפ…', icon: Sparkles },
];

export interface AIThinkingProps {
  phases: ThinkingPhase[];
  active: boolean;
  className?: string;
  /** Optional — render a compact one-line variant instead of the
   *  card-style block. */
  compact?: boolean;
}

export function AIThinking({ phases, active, className, compact }: AIThinkingProps) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhaseIndex(0);
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      let next = 0;
      for (let i = phases.length - 1; i >= 0; i--) {
        if (elapsed >= phases[i]!.atMs) {
          next = i;
          break;
        }
      }
      setPhaseIndex(next);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active, phases]);

  if (!active) return null;

  const phase = phases[phaseIndex] ?? phases[0]!;
  const Icon = phase.icon;
  const elapsedSec = Math.floor(elapsedMs / 1000);

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2 text-xs', className)}>
        <Icon className="h-3.5 w-3.5 text-primary animate-soft-pulse" />
        <span className="text-foreground/80">{phase.label}</span>
        <span className="text-muted-foreground font-mono">{elapsedSec}s</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl glass border-primary/30 p-4 flex items-center gap-3',
        className,
      )}
    >
      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-primary animate-soft-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{phase.label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
          <span>שלב {phaseIndex + 1}/{phases.length}</span>
          <span>·</span>
          <span className="font-mono">{elapsedSec}s</span>
        </div>
      </div>
    </div>
  );
}
