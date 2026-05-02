'use client';

// V27.10.10 — fixes the "all scripts appear at once" bug.
//
// The old approach: page.tsx (Server Component) renders the grid;
// `<GenerateButton>` (client) polls /api/.../scripts/list and calls
// `router.refresh()` when count grows. Problem — Next.js App Router
// SERIALIZES `router.refresh()` (and `revalidatePath`) on a route while
// a Server Action is in-flight on the same route. So the gen action
// runs for ~63s, persists scripts to the DB as each lands, but every
// refresh attempt queues until the action returns. The user sees a
// loader for the whole duration and then all 6 cards at once.
//
// New approach: this client component owns the grid render. It seeds
// from server-fetched `initialScripts` and then polls the lightweight
// list endpoint, mutating local React state directly. No
// `router.refresh()` involved → not blocked by the in-flight action.
//
// Polling rules (matches the GenerateButton's existing pattern):
//   - Tick every 1s while count < 6
//   - Pause when document.hidden
//   - 5s cool-down after reaching 6 to catch any straggler
//   - Stop on unmount

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ScriptCard } from './client-bits';
import { selectScriptAction } from './actions';

const EXPECTED = 6;

const FRAMEWORK_ORDER = [
  'problem_agitation_solution',
  'skeptical_testimonial',
  'demonstration_proof',
  'price_alternative_anchor',
  'relatable_israeli_moment',
  'fast_direct_response',
];

const FRAMEWORK_LABEL_HEBREW: Record<string, string> = {
  problem_agitation_solution: 'בעיה → הסלמה → פתרון',
  skeptical_testimonial: 'סקפטיקל מתהפך',
  demonstration_proof: 'הדגמה ויזואלית',
  price_alternative_anchor: 'עוגן מחיר/אלטרנטיבה',
  relatable_israeli_moment: 'רגע ישראלי',
  fast_direct_response: 'דיירקט-ריספונס מהיר',
};

const ANGLE_LABEL_HEBREW: Record<string, string> = {
  problem_solution: 'בעיה ↔ פתרון',
  testimonial: 'המלצה אישית',
  product_demo: 'הדגמת מוצר',
  before_after: 'לפני / אחרי',
  price_anchor: 'השוואת מחיר',
  fast_benefit: 'תועלת מהירה',
};

const ANGLE_ORDER = [
  'problem_solution',
  'testimonial',
  'product_demo',
  'before_after',
  'price_anchor',
  'fast_benefit',
];

export interface ScriptRowForGrid {
  id: string;
  framework: string | null;
  angle: string;
  hook: string;
  cta: string | null;
  estimatedDurationSeconds: number;
  qualityScoreOverall: number | null;
  rawJson: Record<string, unknown> | null;
  scenes: Array<{
    id: string;
    sceneOrder: number;
    sceneGoal: string | null;
    textHebrew: string;
    onScreenCaptionHebrew: string | null;
    cameraDirection: string | null;
    performanceNote: string | null;
    durationSeconds: number;
  }>;
}

function sortScripts(arr: ScriptRowForGrid[]): ScriptRowForGrid[] {
  return [...arr].sort((a, b) => {
    const aIdx = a.framework ? FRAMEWORK_ORDER.indexOf(a.framework) : -1;
    const bIdx = b.framework ? FRAMEWORK_ORDER.indexOf(b.framework) : -1;
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    return ANGLE_ORDER.indexOf(a.angle) - ANGLE_ORDER.indexOf(b.angle);
  });
}

interface ApiScene {
  id: string;
  sceneOrder: number;
  sceneGoal: string | null;
  textHebrew: string;
  onScreenCaptionHebrew: string | null;
  cameraDirection: string | null;
  performanceNote: string | null;
  durationSeconds: number;
}

interface ApiScript {
  id: string;
  framework: string | null;
  angle: string;
  hook: string;
  cta: string | null;
  estimatedDurationSeconds: number;
  qualityScoreOverall: number | null;
  selectedHookReason: string | null;
  rawJson: Record<string, unknown> | null;
  scenes: ApiScene[];
}

interface ApiResponse {
  scripts: ApiScript[];
  selectedScriptId: string | null;
  expectedCount: number;
  generating: boolean;
}

export function StreamingScriptsGrid({
  projectId,
  initialScripts,
  initialSelectedScriptId,
}: {
  projectId: string;
  initialScripts: ScriptRowForGrid[];
  initialSelectedScriptId: string | null;
}) {
  const [scripts, setScripts] = useState<ScriptRowForGrid[]>(() => sortScripts(initialScripts));
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(initialSelectedScriptId);
  const lastSeenIdsRef = useRef(scripts.map((s) => s.id).join(','));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let aborted = false;
    let stopAt: number | null = null;
    let id: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (aborted) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await fetch(`/api/projects/${projectId}/scripts/list`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as ApiResponse;
        const sorted = sortScripts(
          json.scripts.map(
            (s): ScriptRowForGrid => ({
              id: s.id,
              framework: s.framework,
              angle: s.angle,
              hook: s.hook,
              cta: s.cta,
              estimatedDurationSeconds: s.estimatedDurationSeconds,
              qualityScoreOverall: s.qualityScoreOverall,
              rawJson: s.rawJson,
              scenes: s.scenes,
            }),
          ),
        );
        const ids = sorted.map((s) => s.id).join(',');
        if (ids !== lastSeenIdsRef.current) {
          lastSeenIdsRef.current = ids;
          setScripts(sorted);
        }
        if (selectedScriptId !== json.selectedScriptId) {
          setSelectedScriptId(json.selectedScriptId);
        }
        // Cool-down once we hit the expected count.
        if (sorted.length >= EXPECTED && stopAt == null) {
          stopAt = Date.now() + 5000;
        }
        if (stopAt != null && Date.now() > stopAt) {
          aborted = true;
          if (id) clearInterval(id);
        }
      } catch {
        // network blip — next tick retries
      }
    };

    if (scripts.length < EXPECTED) {
      id = setInterval(tick, 1000);
      void tick();
    }
    return () => {
      aborted = true;
      if (id) clearInterval(id);
    };
  }, [projectId, scripts.length, selectedScriptId]);

  const isStreaming = scripts.length > 0 && scripts.length < EXPECTED;

  return (
    <>
      {isStreaming && (
        <div className="rounded-md border border-primary/30 bg-primary/[0.05] p-3 text-sm flex items-center gap-2">
          <span className="animate-pulse text-lg">⏳</span>
          <span>
            <strong>{scripts.length} מתוך {EXPECTED} תסריטים</strong> מוכנים — השאר
            עדיין ביצירה. הדף מתעדכן אוטומטית.
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scripts.map((s) => {
          const isSelected = s.id === selectedScriptId;
          const label = s.framework
            ? FRAMEWORK_LABEL_HEBREW[s.framework] ?? ANGLE_LABEL_HEBREW[s.angle]
            : ANGLE_LABEL_HEBREW[s.angle];
          const raw = (s.rawJson ?? {}) as Record<string, unknown>;
          const strategy =
            (raw.creativeStrategy as Record<string, unknown> | undefined) ?? null;
          const qualityScore =
            (raw.qualityScore as Record<string, unknown> | undefined) ?? null;
          const hookOptions = Array.isArray(raw.hookOptions)
            ? (raw.hookOptions as string[])
            : [];
          const hookReason =
            typeof raw.hookReason === 'string' ? raw.hookReason : '';
          return (
            <ScriptCard
              key={s.id}
              scriptId={s.id}
              projectId={projectId}
              angleLabel={label ?? ''}
              hook={s.hook}
              cta={s.cta ?? ''}
              estimatedDurationSeconds={s.estimatedDurationSeconds}
              qualityScoreOverall={s.qualityScoreOverall ?? null}
              hookOptions={hookOptions}
              hookReason={hookReason}
              creativeStrategy={strategy}
              qualityScore={qualityScore}
              scenes={s.scenes.map((sc) => ({
                id: sc.id,
                sceneOrder: sc.sceneOrder,
                sceneGoal: sc.sceneGoal ?? null,
                textHebrew: sc.textHebrew,
                onScreenCaption: sc.onScreenCaptionHebrew ?? '',
                cameraDirection: sc.cameraDirection ?? '',
                performanceNote: sc.performanceNote ?? '',
                durationSeconds: sc.durationSeconds,
              }))}
              isSelected={isSelected}
              selectAction={selectScriptAction}
              onSelect={(scriptId) => setSelectedScriptId(scriptId)}
            />
          );
        })}
        {isStreaming &&
          Array.from({ length: EXPECTED - scripts.length }).map((_, i) => (
            <Card
              key={`pending-${i}`}
              data-ai-active="script-batch"
              className="tier-elevated border-dashed motion-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <CardContent className="p-6 space-y-3">
                <div
                  className="h-4 bg-elevated/80 rounded w-2/3 motion-shimmer"
                  style={{
                    backgroundImage:
                      'linear-gradient(90deg, hsl(var(--elevated)), hsl(var(--ai)/0.2), hsl(var(--elevated)))',
                    backgroundSize: '200% 100%',
                  }}
                />
                <div className="h-3 bg-elevated/80 rounded w-full" />
                <div className="h-3 bg-elevated/80 rounded w-5/6" />
                <div className="h-3 bg-elevated/80 rounded w-4/6" />
                <div className="text-xs text-fg-tertiary pt-2 font-mono uppercase tracking-[0.18em]">
                  תסריט בתהליך יצירה
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
    </>
  );
}
