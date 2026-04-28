'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// Custom events used by GenerateAllButton ↔ SceneCard so each tile can
// poll its own state during a batch run. router.refresh() in Next.js 15
// is unreliable when called rapidly in a loop (the refreshes get
// coalesced and the UI only updates at the very end). Each SceneCard
// listens for SCENES_BATCH_START and starts polling /api/scenes/{id}
// every few seconds until it sees an imageUrl come back, then stops.
const SCENES_BATCH_START = 'scenes:batch-start';
const SCENES_BATCH_DONE = 'scenes:batch-done';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ElapsedTimer } from '@/components/ui/elapsed-timer';
import { cn } from '@/lib/utils';
import {
  generateSceneImageAction,
  updateScenePromptAction,
  type GenerateSceneImageState,
} from './actions';

const SCENE_TYPE_LABEL: Record<string, string> = {
  hook: 'הוק',
  problem: 'בעיה',
  product_demo: 'הדגמת מוצר',
  benefit: 'תועלת',
  cta: 'קריאה לפעולה',
  other: 'אחר',
};

interface SceneInfo {
  id: string;
  sceneOrder: number;
  hasImage: boolean;
}

// Race a promise against a timeout so the UI never blocks indefinitely on
// a hung server action. The server itself has its own 180s timeout around
// the gpt-image-2 call, but if THAT also hangs (network, dev-server stall)
// the client-side race is the last line of defense.
function raceWithTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('client-side timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

// Top-of-page button. Generates every scene that doesn't have an image yet,
// sequentially (safer for OpenAI rate limits than firing all in parallel).
// router.refresh() between iterations lets the user see scenes appear one by
// one as the loop progresses.
export function GenerateAllButton({
  scenes,
  creditsBalance,
}: {
  scenes: SceneInfo[];
  creditsBalance: number;
}) {
  const router = useRouter();
  // We deliberately do NOT use useTransition here — router.refresh() inside
  // a transition is deprioritized by React and only commits when the
  // transition resolves, so users would see all 5 scenes pop in at once at
  // the very end instead of one-by-one as they finish. Plain useState
  // commits each refresh immediately.
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number }>({
    done: 0,
    total: 0,
    failed: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const queue = scenes.filter((s) => !s.hasImage);
  const allDone = scenes.length > 0 && queue.length === 0;

  if (allDone) return null;

  const cost = queue.length;
  const canRun = creditsBalance >= cost;

  const run = async () => {
    if (!canRun || pending) return;
    setError(null);
    setProgress({ done: 0, total: queue.length, failed: 0 });
    setPending(true);

    // Tell every SceneCard on the page to start polling its own image
    // state from /api/scenes/[id]. This bypasses router.refresh()'s
    // tendency to coalesce when fired rapidly during a loop.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SCENES_BATCH_START));
    }

    try {
      let done = 0;
      let failed = 0;
      let abortRest = false;
      // Per-scene budget. Each gpt-image-2 call has a 3-minute server-side
      // timeout, plus we add a tiny client-side cushion so a hung action
      // surfaces as an error rather than spinning forever.
      const PER_SCENE_BUDGET_MS = 200_000;

      // Process the queue in parallel chunks. With parallelism=5 all
      // scenes start gpt-image-2 simultaneously — the bottleneck shifts
      // from "user waits for sequential pairs" to "fastest 5 returns".
      // OpenAI tier 1 image rate limit is 5/min; tier 2+ is much higher.
      // Our per-user rate-limit caps at 20/min (lib/usage/rate-limit.ts)
      // so even with all 5 in parallel we stay under both ceilings.
      const PARALLELISM = 5;

      const runOne = async (s: SceneInfo) => {
        if (abortRest) return;
        try {
          // Use the Route Handler (POST /api/scenes/[id]/generate) instead
          // of the server action. Server actions are serialized per-route
          // by Next.js, so Promise.all over them runs sequentially. Route
          // Handlers run in parallel, which is what we actually want here.
          const result = await raceWithTimeout(
            fetch(`/api/scenes/${s.id}/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            }).then(
              (r) =>
                r.json() as Promise<{
                  success: boolean;
                  error?: string;
                  needsCredits?: boolean;
                  safetyBlocked?: boolean;
                  timedOut?: boolean;
                  safetyRetryApplied?: boolean;
                }>,
            ),
            PER_SCENE_BUDGET_MS,
          );
          if (!result.success) {
            failed++;
            setError(result.error ?? 'יצירת הסצנה נכשלה');
            if (result.needsCredits || result.safetyBlocked) {
              abortRest = true;
            }
          } else {
            done++;
            if (result.safetyRetryApplied) {
              setError(
                'סצנה זו נוצרה ללא תמונת המוצר (OpenAI דחו את הגרסה הראשונה). הזהות שמורה — תוכל לרגנר ידנית אם רוצה לוודא נאמנות למוצר.',
              );
            } else {
              setError(null);
            }
          }
        } catch (err) {
          failed++;
          const msg = (err as Error)?.message ?? String(err);
          setError(
            msg.includes('timeout')
              ? 'הסצנה לא הסתיימה בזמן (יותר מ-3 דקות). ממשיך לסצנה הבאה.'
              : `שגיאה: ${msg}`,
          );
        }
        setProgress({ done, total: queue.length, failed });
      };

      for (let i = 0; i < queue.length; i += PARALLELISM) {
        if (abortRest) break;
        const chunk = queue.slice(i, i + PARALLELISM);
        await Promise.all(chunk.map(runOne));
        // After each chunk, ask Next.js for fresh server data. SceneCard
        // is also polling /api/scenes/[id] independently so the live
        // image swap doesn't depend on this refresh succeeding.
        router.refresh();
      }
    } finally {
      setPending(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SCENES_BATCH_DONE));
      }
    }
  };

  return (
    <Card className="border-primary/40 bg-primary/[0.04]">
      <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
        <div className="space-y-1 flex-1">
          <div className="text-base font-semibold">
            {pending ? 'יוצר את כל הסצנות…' : 'צור את כל הסצנות בלחיצה אחת'}
          </div>
          <div className="text-xs text-muted-foreground">
            {pending
              ? `${progress.done + progress.failed} מתוך ${progress.total} ${progress.failed > 0 ? `(${progress.failed} נכשלו) ` : ''}— הסצנות מופיעות בהדרגה למטה`
              : `${queue.length} סצנות חסרות. ${queue.length} קרדיטים סך הכל. (יש לך ${creditsBalance})`}
          </div>
          {pending && (
            <div className="pt-2">
              <ProgressBar variant="primary" />
            </div>
          )}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2 mt-2">
              {error}
            </div>
          )}
        </div>
        <Button onClick={run} disabled={pending || !canRun} size="lg">
          {pending ? 'מייצר…' : `✨ צור ${queue.length} סצנות`}
        </Button>
      </CardContent>
    </Card>
  );
}

interface SceneCardProps {
  sceneId: string;
  sceneOrder: number;
  totalScenes: number;
  sceneType: string;
  textHebrew: string;
  visualPromptEnglish: string;
  durationSeconds: number;
  imageUrl: string | null;
  imageGenerationCount: number;
}

export function SceneCard(props: SceneCardProps) {
  const action = generateSceneImageAction.bind(null, props.sceneId);
  const [state, formAction, pending] = useActionState<GenerateSceneImageState, FormData>(
    action,
    undefined,
  );
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(props.visualPromptEnglish);
  const [savingPrompt, startSaving] = useTransition();

  // Live override for the scene image when polling beats router.refresh().
  // Resets to null if a fresh server-side render arrives with a different
  // imageUrl prop (so the prop stays the source of truth between batches).
  const [liveImageUrl, setLiveImageUrl] = useState<string | null>(null);
  const [batchPolling, setBatchPolling] = useState(false);
  const router = useRouter();
  const propsRef = useRef(props);
  propsRef.current = props;

  // Drop the live override once the prop catches up — keeps the cards in
  // sync with the server-rendered tree on the next refresh.
  useEffect(() => {
    if (liveImageUrl && props.imageUrl) {
      setLiveImageUrl(null);
    }
  }, [props.imageUrl, liveImageUrl]);

  // Poll this scene's state while a batch run is in progress. Listens to
  // window-level events fired by GenerateAllButton, polls /api/scenes/{id}
  // every 2.5s, and stops as soon as we see an imageUrl come back or the
  // batch ends.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let aborted = false;

    const stopPoll = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      setBatchPolling(false);
    };

    const tick = async () => {
      if (aborted) return;
      // If the prop already has the image, no need to poll anymore.
      if (propsRef.current.imageUrl) {
        stopPoll();
        return;
      }
      try {
        const res = await fetch(`/api/scenes/${propsRef.current.sceneId}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as { imageUrl: string | null };
        if (json.imageUrl && !aborted) {
          setLiveImageUrl(json.imageUrl);
          stopPoll();
          // Trigger a soft route refresh so the rest of the tree (credits
          // counter, "all done" footer button) catches up too.
          router.refresh();
        }
      } catch {
        /* ignore transient fetch errors — we'll try again next tick */
      }
    };

    const onStart = () => {
      // Only start polling if THIS card still has no image (a card whose
      // image already appeared in an earlier batch shouldn't spin).
      if (propsRef.current.imageUrl) return;
      setBatchPolling(true);
      // Run a tick immediately, then every 2.5s.
      void tick();
      intervalId = setInterval(tick, 2500);
    };
    const onDone = () => {
      stopPoll();
    };

    window.addEventListener(SCENES_BATCH_START, onStart);
    window.addEventListener(SCENES_BATCH_DONE, onDone);
    return () => {
      aborted = true;
      window.removeEventListener(SCENES_BATCH_START, onStart);
      window.removeEventListener(SCENES_BATCH_DONE, onDone);
      stopPoll();
    };
  }, [router]);

  // Live update for the SINGLE-scene "Create" button: when the per-scene
  // form action transitions from pending → done and we still don't have
  // an image prop, run a short polling burst to pick up the new imageUrl
  // without making the user refresh the page.
  const wasPendingRef = useRef(pending);
  useEffect(() => {
    if (wasPendingRef.current && !pending && !propsRef.current.imageUrl && !state?.error) {
      let polls = 0;
      const burst = setInterval(async () => {
        polls++;
        if (propsRef.current.imageUrl) {
          clearInterval(burst);
          return;
        }
        try {
          const res = await fetch(`/api/scenes/${propsRef.current.sceneId}`, {
            cache: 'no-store',
          });
          if (res.ok) {
            const json = (await res.json()) as { imageUrl: string | null };
            if (json.imageUrl) {
              setLiveImageUrl(json.imageUrl);
              clearInterval(burst);
              router.refresh();
              return;
            }
          }
        } catch {
          /* keep trying */
        }
        if (polls > 6) clearInterval(burst); // ~15s budget
      }, 2500);
      return () => clearInterval(burst);
    }
    wasPendingRef.current = pending;
  }, [pending, router, state]);

  const effectiveImageUrl = liveImageUrl ?? props.imageUrl;
  const hasImage = !!effectiveImageUrl;
  // Show the "AI is generating" overlay either when this scene's per-card
  // action is in flight, OR when a batch run has just told us to start
  // polling for our image (so users see *something* happening even though
  // the per-card useActionState pending flag is false).
  const showGeneratingOverlay = pending || (batchPolling && !hasImage);

  const savePrompt = () => {
    const fd = new FormData();
    fd.set('sceneId', props.sceneId);
    fd.set('visualPromptEnglish', draftPrompt);
    startSaving(async () => {
      await updateScenePromptAction(fd);
      setEditingPrompt(false);
    });
  };

  return (
    <Card className={cn(hasImage && 'border-accent/40')}>
      <CardContent className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Badge variant={hasImage ? 'success' : 'outline'}>
              סצנה {props.sceneOrder + 1}/{props.totalScenes}
            </Badge>
            <Badge variant="muted" className="ms-2">
              {SCENE_TYPE_LABEL[props.sceneType] ?? props.sceneType}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground font-mono">{props.durationSeconds}s</div>
        </div>

        {/* Hebrew voiceover text */}
        <div className="text-sm leading-relaxed border-s-2 border-primary ps-3">
          <div className="text-xs text-muted-foreground mb-1">קריינות:</div>
          {props.textHebrew}
        </div>

        {/* Image area */}
        <div className="relative aspect-[9/16] rounded-md bg-muted overflow-hidden border border-border">
          {hasImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={effectiveImageUrl!}
              alt={`Scene ${props.sceneOrder + 1}`}
              className="w-full h-full object-cover"
            />
          )}
          {!hasImage && !showGeneratingOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-4">
              <span className="text-3xl opacity-40">🖼️</span>
              <span className="text-xs text-muted-foreground">תמונה עדיין לא נוצרה</span>
            </div>
          )}
          {showGeneratingOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-4 bg-primary/5 backdrop-blur-[1px]">
              <div className="text-4xl animate-shimmer-overlay">✨</div>
              <div className="text-sm font-semibold">ה-AI יוצר תמונה…</div>
              <div className="w-3/4">
                <ProgressBar variant="accent" />
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span>זמן שעבר:</span>
                <ElapsedTimer keyValue={props.sceneId + props.imageGenerationCount} />
              </div>
              <div className="text-[10px] text-muted-foreground/70 max-w-[80%]">
                gpt-image-2 בדרך כלל 40–70 שניות עם תמונות רפרנס.
              </div>
            </div>
          )}
        </div>

        {/* Visual prompt — editable */}
        {!editingPrompt ? (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">תיאור ויזואלי (אנגלית):</div>
            <div
              className="text-xs text-muted-foreground/80 line-clamp-3 cursor-pointer hover:text-foreground"
              onClick={() => setEditingPrompt(true)}
              dir="ltr"
            >
              {props.visualPromptEnglish}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              dir="ltr"
              rows={4}
              className="text-xs"
            />
            <div className="flex gap-2 justify-end" dir="ltr">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraftPrompt(props.visualPromptEnglish);
                  setEditingPrompt(false);
                }}
              >
                בטל
              </Button>
              <Button type="button" size="sm" onClick={savePrompt} disabled={savingPrompt}>
                {savingPrompt ? 'שומר…' : 'שמור'}
              </Button>
            </div>
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {props.imageGenerationCount > 0 ? `${props.imageGenerationCount} ניסיונות` : ''}
          </div>
          <form action={formAction}>
            <Button
              type="submit"
              size="sm"
              variant={hasImage ? 'outline' : 'default'}
              disabled={pending}
            >
              {pending
                ? 'יוצר…'
                : hasImage
                  ? '↻ צור מחדש (1 קרדיט)'
                  : '✨ צור תמונה (1 קרדיט)'}
            </Button>
          </form>
        </div>

        {state?.error && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
            {state.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
