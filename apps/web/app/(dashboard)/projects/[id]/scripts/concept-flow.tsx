'use client';

// V27.11.PR6 — Concept-first interactive flow.
//
// State machine driven by user actions; orchestrates the 4 server
// actions (generate / regenerate-selected / regenerate-all / expand-
// picked) and renders the right UI for each state.
//
// States:
//   - idle:         no concepts (or pendingConcepts.status='expanded' with
//                   no scripts loaded yet); CTA "צור 6 כיוונים"
//   - generating:   phase 1 in flight
//   - picking:      6 concepts visible; user selects 1-3
//   - regenerating: at least one concept is being refreshed
//   - expanding:    expansion in flight
//   - error:        last action failed; show retry CTA
//
// pendingConcepts is the source of truth for concepts state. When
// status='expanded' and the page also has Script rows, the legacy
// streaming-scripts-grid takes over rendering and this component
// stays out of the way.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, Wand2, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConceptCardView } from './concept-card';
import {
  generateConceptsAction,
  regenerateSelectedConceptsAction,
  regenerateAllConceptsAction,
  expandPickedConceptsAction,
  type ConceptActionError,
  type ConceptsActionSuccess,
  type ExpandActionSuccess,
} from './concept-actions';
import type { PendingConcepts, StoredConcept } from '@/lib/llm/concept-storage';

interface ConceptFlowProps {
  projectId: string;
  initialPendingConcepts: PendingConcepts | null;
  /** From getOrCreateAppUser — used to display credit cost up-front. */
  creditsBalance: number;
  /** Per-script expansion cost from PER_OPERATION_CREDITS.script_batch.
   *  Passed in so the client can show "1×N" up-front. */
  expandCostPerScript: number;
}

type FlowStatus =
  | 'idle'
  | 'generating'
  | 'picking'
  | 'regenerating'
  | 'expanding'
  | 'error';

/** V27.11.PR6 — initial selection auto-preselects top-3-by-quality
 *  with deterministic tie-break on slot_index. The user can override. */
function autoPreselect(concepts: StoredConcept[]): string[] {
  if (concepts.length === 0) return [];
  return [...concepts]
    .sort((a, b) => {
      const q = (b.estimated_quality ?? 0) - (a.estimated_quality ?? 0);
      if (q !== 0) return q;
      return a.slot_index - b.slot_index;
    })
    .slice(0, 3)
    .map((c) => c.concept_id);
}

export function ConceptFlow({
  projectId,
  initialPendingConcepts,
  creditsBalance,
  expandCostPerScript,
}: ConceptFlowProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [pending, setPending] = useState<PendingConcepts | null>(
    initialPendingConcepts,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialPendingConcepts && initialPendingConcepts.concepts.length
      ? initialPendingConcepts.selectedConceptIds.length > 0
        ? initialPendingConcepts.selectedConceptIds
        : autoPreselect(initialPendingConcepts.concepts)
      : [],
  );
  const [status, setStatus] = useState<FlowStatus>(() => {
    if (!initialPendingConcepts) return 'idle';
    if (initialPendingConcepts.status === 'expanded') return 'idle';
    return 'picking';
  });
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const concepts = pending?.concepts ?? [];

  const onToggleSelect = (conceptId: string) => {
    setSelectedIds((prev) =>
      prev.includes(conceptId)
        ? prev.filter((id) => id !== conceptId)
        : prev.length >= 3
          ? prev // refuse 4+ silently; UI shows hint
          : [...prev, conceptId],
    );
  };

  const onGenerate = async () => {
    setStatus('generating');
    setErrorMsg(null);
    try {
      const result: ConceptActionError | ConceptsActionSuccess =
        await generateConceptsAction(projectId);
      if (!result.ok) {
        setStatus('error');
        setErrorMsg(result.error);
        return;
      }
      setPending(result.pendingConcepts);
      setSelectedIds(autoPreselect(result.pendingConcepts.concepts));
      setStatus('picking');
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error).message);
    }
  };

  const onRegenerateOne = async (conceptId: string) => {
    if (refreshingIds.has(conceptId)) return;
    setRefreshingIds((prev) => new Set(prev).add(conceptId));
    setStatus('regenerating');
    setErrorMsg(null);
    try {
      const result = await regenerateSelectedConceptsAction(projectId, [
        conceptId,
      ]);
      if (!result.ok) {
        setErrorMsg(result.error);
        // Don't go to 'error' state — we want the user to keep picking
        // from the surviving concepts. Surface error inline.
      } else {
        setPending(result.pendingConcepts);
        // Drop the regenerated id from selection (it's a different
        // concept now) — leave other selections intact.
        setSelectedIds((prev) => prev.filter((id) => id !== conceptId));
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(conceptId);
        return next;
      });
      // Revert to 'picking' if no other refreshes are in flight.
      setStatus((s) => (s === 'regenerating' ? 'picking' : s));
    }
  };

  const onRegenerateAll = async () => {
    if (
      !window.confirm(
        'בטוח? כל 6 הקונספטים יוחלפו. ייגרם להם credit-free regen נוסף.',
      )
    ) {
      return;
    }
    setStatus('generating');
    setErrorMsg(null);
    try {
      const result = await regenerateAllConceptsAction(projectId);
      if (!result.ok) {
        setStatus('error');
        setErrorMsg(result.error);
        return;
      }
      setPending(result.pendingConcepts);
      setSelectedIds(autoPreselect(result.pendingConcepts.concepts));
      setStatus('picking');
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error).message);
    }
  };

  const onExpand = async () => {
    if (selectedIds.length === 0 || selectedIds.length > 3) return;
    setStatus('expanding');
    setErrorMsg(null);
    try {
      const result: ConceptActionError | ExpandActionSuccess =
        await expandPickedConceptsAction(projectId, selectedIds);
      if (!result.ok) {
        setStatus('error');
        setErrorMsg(result.error);
        return;
      }
      // Refresh the page so the legacy streaming-scripts-grid can
      // pick up the freshly-created Script rows. Use a transition so
      // the loading state survives the navigation.
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setStatus('error');
      setErrorMsg((err as Error).message);
    }
  };

  const totalExpandCost = expandCostPerScript * selectedIds.length;
  const insufficientCredits = totalExpandCost > creditsBalance;
  const selectionInvalid = selectedIds.length === 0 || selectedIds.length > 3;
  const expandingDisabled = selectionInvalid || insufficientCredits;

  // ── State 1: idle (no concepts yet) ────────────────────────────────
  if (status === 'idle' && concepts.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="space-y-5 p-12 text-center">
          <div className="text-5xl">💡</div>
          <h2 className="text-2xl font-bold">צור 6 כיוונים קריאייטיביים</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            נייצר קודם רעיונות קצרים, תבחר את הכיוונים החזקים, ורק אותם נהפוך
            לתסריטים מלאים. צרכי קרדיטים ייחויב רק על השלב השני.
          </p>
          <Button onClick={onGenerate} size="lg" className="gap-2">
            <Wand2 className="h-4 w-4" />
            צור 6 כיוונים קריאייטיביים
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── State 2: generating (phase 1 or regen-all in flight) ─────────
  if (status === 'generating') {
    return (
      <Card className="border-dashed">
        <CardContent className="space-y-4 p-12 text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          <h2 className="text-xl font-bold">מייצר כיוונים קריאייטיביים...</h2>
          <p className="text-sm text-muted-foreground">
            בודק זוויות, קהל יעד, הוק והוכחת מוצר. ~10-15 שניות.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── State 3: expanding (phase 2 in flight) ────────────────────────
  if (status === 'expanding') {
    return (
      <Card className="border-dashed">
        <CardContent className="space-y-4 p-12 text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          <h2 className="text-xl font-bold">
            מרחיב {selectedIds.length} קונספטים לתסריטים מלאים...
          </h2>
          <p className="text-sm text-muted-foreground">
            כל קונספט הופך לתסריט מלא עם spoken text, scene metadata, וכל מה שצריך
            ליצירת הסרטון. ~25 שניות.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── State 4 / 5 / 6: picking / regenerating / error
  // (concepts visible; show grid + actions). ─────────────────────────
  return (
    <div className="space-y-6" dir="rtl">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="kicker-muted font-mono text-[10px] uppercase">
            6 כיוונים — בחר 1 עד 3 להרחבה
          </div>
          <p className="text-sm text-muted-foreground">
            הכיוונים שלא תבחר יישמרו — תוכל לרענן בודדים, או לרענן הכול ולקבל
            6 חדשים.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            נבחרו {selectedIds.length} מתוך {concepts.length}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRegenerateAll}
            disabled={status === 'regenerating'}
          >
            <RotateCcw className="ml-2 h-3 w-3" />
            צור את כל הרעיונות מחדש
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          ⚠ {errorMsg}
        </div>
      )}

      {/* Grid of concept cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {concepts.map((c) => (
          <ConceptCardView
            key={c.concept_id}
            concept={c}
            selected={selectedIds.includes(c.concept_id)}
            isRefreshing={refreshingIds.has(c.concept_id)}
            disabled={false}
            onToggleSelect={onToggleSelect}
            onRefresh={onRegenerateOne}
          />
        ))}
      </div>

      {/* Action bar */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/90 p-4 shadow-floating backdrop-blur">
        <div className="space-y-1 text-sm">
          {selectionInvalid ? (
            <p className="text-muted-foreground">
              בחר 1-3 כיוונים להמשך. לחיצה על כיוון תוסיף או תוריד אותו מהבחירה.
            </p>
          ) : (
            <>
              <p>
                <strong>{selectedIds.length}</strong> כיוונים נבחרים → {selectedIds.length}{' '}
                תסריטים מלאים
              </p>
              <p className="text-xs text-muted-foreground">
                עלות: <strong>{totalExpandCost} קרדיטים</strong> ({creditsBalance} זמינים)
              </p>
            </>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          intent="action"
          onClick={onExpand}
          disabled={expandingDisabled}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          {selectedIds.length === 1
            ? 'הפוך לתסריט מלא'
            : `הפוך ל-${selectedIds.length} תסריטים מלאים`}
        </Button>
      </div>
      {insufficientCredits && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠ אין מספיק קרדיטים. נדרש {totalExpandCost}, ברשותך {creditsBalance}.
        </div>
      )}
    </div>
  );
}
