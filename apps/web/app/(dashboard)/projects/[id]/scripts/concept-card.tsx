'use client';

// V27.11.PR6 — Single ConceptCard renderer. Used inside the picker
// grid. Pure presentational component:
//   - Receives a StoredConcept + UI flags (selected, isRefreshing).
//   - Bubbles selection toggle + "refresh this card" intent to the
//     parent via callbacks.
//   - All Hebrew RTL.

import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StoredConcept } from '@/lib/llm/concept-storage';

const FRAMEWORK_LABEL: Record<string, string> = {
  problem_agitation_solution: 'בעיה → הסלמה → פתרון',
  skeptical_testimonial: 'סקפטיקל מתהפך',
  demonstration_proof: 'הדגמה ויזואלית',
  price_alternative_anchor: 'עוגן מחיר/אלטרנטיבה',
  relatable_israeli_moment: 'רגע ישראלי',
  fast_direct_response: 'דיירקט-ריספונס מהיר',
};

const HOOK_DIRECTION_LABEL: Record<string, string> = {
  confession: 'וידוי',
  frustration: 'תסכול',
  mistake: 'טעות',
  curiosity: 'סקרנות',
  price_shock: 'הלם מחיר',
  wish_i_knew: 'הלוואי שידעתי',
  i_stopped_doing: 'הפסקתי לעשות',
  nobody_tells_you: 'אף אחד לא מספר לך',
};

// V28.0.ST3 — Hebrew labels for the 6 big_idea_axis values. Surfaced
// as a chip on each card so the user can see what makes this concept
// distinct at a glance. 'unknown' (legacy cards) renders no chip.
const BIG_IDEA_AXIS_LABEL: Record<string, string> = {
  convenience: 'נוחות',
  proof: 'הוכחה',
  price: 'מחיר',
  emotion: 'רגש',
  mechanism: 'איך זה עובד',
  social_validation: 'מה אחרים אומרים',
};

interface ConceptCardProps {
  concept: StoredConcept;
  selected: boolean;
  isRefreshing: boolean;
  /** When false, the card is disabled (e.g. expand in flight). */
  disabled: boolean;
  onToggleSelect: (conceptId: string) => void;
  onRefresh: (conceptId: string) => void;
}

export function ConceptCardView({
  concept,
  selected,
  isRefreshing,
  disabled,
  onToggleSelect,
  onRefresh,
}: ConceptCardProps) {
  const framework = FRAMEWORK_LABEL[concept.framework] ?? concept.framework;
  const hookDir =
    HOOK_DIRECTION_LABEL[concept.hook_direction.trim().toLowerCase()] ??
    concept.hook_direction;
  // V28.0.ST3 — axis chip; legacy cards (axis='unknown' or missing)
  // render no chip rather than an awkward "unknown" placeholder.
  const axisLabel =
    concept.big_idea_axis && concept.big_idea_axis !== 'unknown'
      ? (BIG_IDEA_AXIS_LABEL[concept.big_idea_axis] ?? concept.big_idea_axis)
      : null;

  return (
    <Card
      dir="rtl"
      className={cn(
        'relative flex h-full flex-col transition-all',
        selected && 'border-primary ring-2 ring-primary/40 shadow-glow',
        disabled && !selected && 'opacity-50',
        isRefreshing && 'opacity-60 pointer-events-none',
      )}
    >
      <CardContent className="flex flex-grow flex-col gap-4 p-5 text-sm">
        {/* Header: framework + quality + select checkbox */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="kicker-muted font-mono text-[10px] uppercase">
              {framework}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {axisLabel && (
                <Badge variant="default">
                  {axisLabel}
                </Badge>
              )}
              {hookDir && (
                <Badge variant="outline" className="font-normal">
                  {hookDir}
                </Badge>
              )}
              {concept.regenerationCount > 0 && (
                <Badge variant="outline" className="font-normal text-xs">
                  רוענן ×{concept.regenerationCount}
                </Badge>
              )}
            </div>
          </div>
          <label
            className={cn(
              'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 transition-all',
              selected
                ? 'border-primary bg-primary text-primary-foreground shadow-glow'
                : 'border-border bg-transparent hover:border-primary/60',
              disabled && 'cursor-not-allowed',
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={selected}
              disabled={disabled}
              onChange={() => onToggleSelect(concept.concept_id)}
            />
            {selected && <Sparkles className="h-5 w-5" />}
          </label>
        </div>

        {/* Big idea */}
        <div>
          <p className="text-base font-semibold leading-snug">
            {concept.big_idea}
          </p>
        </div>

        {/* Hook preview */}
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="kicker-muted mb-1 font-mono text-[10px] uppercase">
            הוק פתיחה
          </div>
          <p className="text-sm font-medium leading-snug">
            "{concept.selected_hook}"
          </p>
        </div>

        {/* Audience moment + emotional trigger */}
        <div className="space-y-2 text-xs">
          <div>
            <span className="font-semibold text-muted-foreground">
              הרגע של הקהל:{' '}
            </span>
            <span>{concept.target_audience_moment}</span>
          </div>
          <div>
            <span className="font-semibold text-muted-foreground">
              טריגר רגשי:{' '}
            </span>
            <span>{concept.emotional_trigger}</span>
          </div>
          <div>
            <span className="font-semibold text-muted-foreground">
              ההוכחה הוויזואלית:{' '}
            </span>
            <span>{concept.product_proof_moment}</span>
          </div>
        </div>

        {/* Scene outline (compact) */}
        <details className="group cursor-pointer">
          <summary className="kicker-muted flex items-center gap-2 font-mono text-[10px] uppercase outline-none">
            <span>תרשים סצנות ({concept.scene_outline.length})</span>
            <span className="transition-transform group-open:rotate-180">▾</span>
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pr-5 text-xs text-muted-foreground">
            {concept.scene_outline.map((beat, i) => (
              <li key={i}>{beat}</li>
            ))}
          </ol>
        </details>

        {/* Why-it-fits (collapsible) */}
        <details className="group cursor-pointer">
          <summary className="kicker-muted flex items-center gap-2 font-mono text-[10px] uppercase outline-none">
            <span>למה זה מתאים</span>
            <span className="transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-2 space-y-2 text-xs">
            <div>
              <span className="font-semibold text-muted-foreground">למוצר: </span>
              <span>{concept.why_it_fits_product}</span>
            </div>
            <div>
              <span className="font-semibold text-muted-foreground">לקהל: </span>
              <span>{concept.why_it_fits_audience}</span>
            </div>
          </div>
        </details>

        {/* Risk note (only if present) */}
        {concept.risk_notes && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            <span className="font-semibold">⚠ סיכון: </span>
            {concept.risk_notes}
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || isRefreshing}
            onClick={() => onRefresh(concept.concept_id)}
          >
            {isRefreshing ? (
              <>
                <Loader2 className="ml-2 h-3 w-3 animate-spin" />
                מרענן...
              </>
            ) : (
              <>
                <RefreshCw className="ml-2 h-3 w-3" />
                רענן רעיון
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            slot {concept.slot_index}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
