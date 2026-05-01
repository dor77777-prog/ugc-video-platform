'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

// V26.19 — voice UI moved to /voices step. Scenes page is image-only.
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
import {
  AIThinking,
  IMAGE_GEN_PHASES,
} from '@/components/ui/ai-thinking';
import { cn } from '@/lib/utils';
import { isPageVisible } from '@/lib/utils/visibility';
import {
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

// V26.19 — image-only batch button. Voice gen moved to its own /voices
// step (the parallel image+voice run was a V14.2-B optimisation; with
// the wizard split, voice has its own batch and per-scene UI).
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
                'סצנה זו נוצרה ללא תמונת המוצר (מנוע ההפקה דחה את הגרסה הראשונה). הזהות שמורה — תוכל לרגנר ידנית אם רוצה לוודא נאמנות למוצר.',
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

  const headline = pending ? 'יוצר את כל הסצנות…' : 'צור את כל הסצנות בלחיצה אחת';
  const subline = pending
    ? `${progress.done + progress.failed} מתוך ${progress.total} ${progress.failed > 0 ? `(${progress.failed} נכשלו) ` : ''}— תמונות מופיעות בהדרגה למטה`
    : `${queue.length} סצנות חסרות. ${cost} קרדיטים סך הכל. (יש לך ${creditsBalance})`;
  const buttonLabel = pending ? 'מייצר…' : `✨ צור ${queue.length} סצנות`;

  return (
    <Card className="glass border-primary/40 bg-primary/[0.04] shadow-glow card-hover animate-fade-in-up">
      <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
        <div className="space-y-2 flex-1">
          <div className="text-base font-semibold">{headline}</div>
          <div className="text-xs text-muted-foreground">{subline}</div>
          {pending && (
            <>
              <div className="pt-2">
                <ProgressBar variant="primary" />
              </div>
              {/* V17 — AI thinking phases. Replaces the static spinner
                  with the actual pipeline narrative the user is paying
                  for. Uses IMAGE_GEN_PHASES because images dominate the
                  wall-clock; voice runs in parallel and finishes first. */}
              <AIThinking phases={IMAGE_GEN_PHASES} active={pending} compact className="pt-1" />
            </>
          )}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2 mt-2">
              {error}
            </div>
          )}
        </div>
        <Button onClick={run} disabled={pending || !canRun} size="lg" className="shadow-glow">
          {buttonLabel}
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
  // Set by the impl when an image generation is in flight; cleared in
  // try/finally. Survives page refresh so the user keeps seeing the
  // overlay even if they reload mid-generation.
  imageInFlightAt: string | null;
}

// V17 — prompt tweak chips shown under the prompt textarea on
// SceneCard. Each chip appends an English fragment to the draft so
// the user can iterate without typing English themselves. Chips
// match the gpt-image-2 prompt vocabulary used by buildImageBrief.
const PROMPT_TWEAK_CHIPS: Array<{ label: string; append: string }> = [
  { label: '🎨 רקע פשוט', append: 'simple uncluttered background, soft natural lighting' },
  { label: '📷 זווית קרובה', append: 'tight close-up framing, shallow depth of field' },
  { label: '☀️ אור טבעי', append: 'natural daylight from a window, no harsh shadows' },
  { label: '🌃 ערב חמים', append: 'warm evening light, golden-hour mood' },
  { label: '🇮🇱 פרט ישראלי', append: 'subtle Israeli home detail visible (kettle / mezuzah / soft framing)' },
  { label: '😊 חיוך טבעי', append: 'natural relaxed smile, candid expression' },
];

// 3 min budget — Image gen is fast (gpt-image-1 ~30s) but we leave headroom
// for network blips so a stale flag doesn't pin the overlay forever.
const IMAGE_IN_FLIGHT_TTL_MS = 3 * 60 * 1000;
function isFresh(at: string | null, ttlMs: number): boolean {
  if (!at) return false;
  return Date.now() - new Date(at).getTime() < ttlMs;
}

export function SceneCard(props: SceneCardProps) {
  // Single-scene "regenerate" button. Fires the parallel-friendly route
  // handler (POST /api/scenes/[id]/generate) instead of the server
  // action. Why: Next.js 15 serializes server actions per route — two
  // SceneCards on the same page calling the action concurrently would
  // run sequentially, so clicking "regen" on scenes 1 + 3 + 4 would
  // process scene 1 fully before scene 3 even starts. The route
  // handler has no such serialization, so all three regen calls run
  // in parallel (subject to provider rate limits + spend cap).
  const [state, setState] = useState<GenerateSceneImageState>(undefined);
  const [pending, setPending] = useState(false);
  // V11.5 — local mirror of the latest LLM-regenerated prompt. Used so
  // the inline preview + editor textarea reflect the new prompt
  // immediately after the regen-prompt call, without waiting for a
  // router.refresh() round-trip. Reset to null when the server-side
  // prop catches up (handled by an effect below).
  const [livePrompt, setLivePrompt] = useState<string | null>(null);
  // Independent pending state for the "🎲 פרומט חדש" button so
  // generating a new prompt doesn't grey out the "↻ צור מחדש" button.
  const [promptPending, setPromptPending] = useState(false);
  // Hoisted here so the callbacks below can call router.refresh()
  // without a temporal-dead-zone error. The original `router`
  // declaration further down the component now reuses this binding.
  const router = useRouter();

  const handleRegenerate = useCallback(async () => {
    if (pending) return;
    setPending(true);
    setState(undefined);
    try {
      const res = await fetch(`/api/scenes/${props.sceneId}/generate`, {
        method: 'POST',
      });
      const body = (await res.json().catch(() => null)) as
        | (GenerateSceneImageState & { success?: boolean; safetyRetryApplied?: boolean })
        | null;
      if (!body) {
        setState({ error: 'יצירת התמונה נכשלה: תגובה לא תקינה מהשרת' });
        return;
      }
      if (body.success) {
        setState(body.safetyRetryApplied ? { safetyRetryApplied: true } : undefined);
      } else {
        setState({
          error: body.error,
          needsCredits: body.needsCredits,
          safetyBlocked: body.safetyBlocked,
          timedOut: body.timedOut,
        });
      }
    } catch (err) {
      setState({ error: `יצירת התמונה נכשלה: ${(err as Error).message}` });
    } finally {
      setPending(false);
    }
  }, [pending, props.sceneId]);

  // V11.5 — "🎲 פרומט חדש" button. Asks the LLM for a fresh
  // visual_prompt_english (different camera / beat / lighting,
  // grounded in the product dossier + script + scene type) and
  // persists it on the Scene. Does NOT trigger image generation —
  // user reviews the new prompt, can edit it, can click again for
  // another variant, and decides themselves when to spend a credit
  // on a new image. Multiple cards can run this in parallel.
  const handleRegenPromptOnly = useCallback(async () => {
    if (promptPending) return;
    setPromptPending(true);
    setState(undefined);
    try {
      const res = await fetch(`/api/scenes/${props.sceneId}/regen-prompt`, {
        method: 'POST',
      });
      const body = (await res.json().catch(() => null)) as
        | { success: boolean; visualPromptEnglish?: string; error?: string }
        | null;
      if (!body?.success || !body.visualPromptEnglish) {
        setState({
          error: body?.error ?? 'לא הצלחתי לייצר פרומט חדש. נסה שוב.',
        });
        return;
      }
      // Reflect the new prompt locally so the inline preview AND the
      // editor's draft mirror it instantly. The server already
      // persisted it; a soft router.refresh() will catch other parts
      // of the tree (admin counters etc).
      setLivePrompt(body.visualPromptEnglish);
      setDraftPrompt(body.visualPromptEnglish);
      router.refresh();
    } catch (err) {
      setState({ error: `יצירת פרומט חדש נכשלה: ${(err as Error).message}` });
    } finally {
      setPromptPending(false);
    }
  }, [promptPending, props.sceneId, router]);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(props.visualPromptEnglish);
  const [savingPrompt, startSaving] = useTransition();

  // Live override for the scene image when polling beats router.refresh().
  // Resets to null if a fresh server-side render arrives with a different
  // imageUrl prop (so the prop stays the source of truth between batches).
  const [liveImageUrl, setLiveImageUrl] = useState<string | null>(null);
  const [batchPolling, setBatchPolling] = useState(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Drop the live override once the prop catches up — keeps the cards in
  // sync with the server-rendered tree on the next refresh.
  useEffect(() => {
    if (liveImageUrl && props.imageUrl) {
      setLiveImageUrl(null);
    }
  }, [props.imageUrl, liveImageUrl]);

  // Same idea for the live prompt mirror — clear once the
  // server-rendered prop matches what the client just wrote.
  useEffect(() => {
    if (livePrompt && livePrompt === props.visualPromptEnglish) {
      setLivePrompt(null);
    }
  }, [props.visualPromptEnglish, livePrompt]);

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
      // V14.1 — skip the API call while the tab is hidden. The next tick
      // (within 2.5s of returning) catches the user up.
      if (!isPageVisible()) return;
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
        if (!isPageVisible()) return;
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
  // Server-side in-flight flag: stays set across page refreshes so the
  // user keeps seeing "working" even if they reloaded mid-generation.
  // Crucially we do NOT gate it on `!hasImage` — during a regen the OLD
  // image is still on display and the flag tells us a NEW one is cooking.
  const imageInFlightServer = isFresh(props.imageInFlightAt, IMAGE_IN_FLIGHT_TTL_MS);
  const showGeneratingOverlay = pending || batchPolling || imageInFlightServer;

  // Poll for the new image while a regen is in-flight server-side. We
  // anchor on the URL we had at mount; once the API returns a different
  // URL we know the new image is ready and stop polling.
  const initialImageUrlRef = useRef(props.imageUrl);
  useEffect(() => {
    if (!imageInFlightServer) return;
    const baselineUrl = initialImageUrlRef.current;
    const id = setInterval(async () => {
      if (!isPageVisible()) return;
      try {
        const res = await fetch(`/api/scenes/${propsRef.current.sceneId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { imageUrl: string | null; imageInFlightAt: string | null };
        if (json.imageUrl && json.imageUrl !== baselineUrl) {
          setLiveImageUrl(json.imageUrl);
          initialImageUrlRef.current = json.imageUrl;
          clearInterval(id);
          router.refresh();
        } else if (!json.imageInFlightAt) {
          // Flag cleared without a new URL → terminal failure server-side.
          clearInterval(id);
          router.refresh();
        }
      } catch { /* keep trying */ }
    }, 3000);
    return () => clearInterval(id);
  }, [imageInFlightServer, router]);

  const savePrompt = () => {
    const fd = new FormData();
    fd.set('sceneId', props.sceneId);
    fd.set('visualPromptEnglish', draftPrompt);
    startSaving(async () => {
      await updateScenePromptAction(fd);
      setEditingPrompt(false);
    });
  };

  // V27 — data-ai-active wires this card into the AI breathing contract:
  // * "image" → glow-ai ring + motion-pulse-ai (1.6s breathe)
  // * complete → automatic [data-state="success"] in CSS via parent flow
  // CSS auto-promotes the muted kicker (Badge here) to loud-lime.
  const aiActiveValue = showGeneratingOverlay ? 'image' : undefined;

  return (
    <Card
      data-ai-active={aiActiveValue}
      className={cn(
        'tier-elevated motion-fade-up',
        hasImage && !showGeneratingOverlay && 'border-success/40',
      )}
    >
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
          <div className="text-xs text-fg-tertiary font-mono">{props.durationSeconds}s</div>
        </div>

        {/* Hebrew voiceover text */}
        <div className="text-sm leading-relaxed border-s-2 border-primary ps-3">
          <div className="text-xs text-muted-foreground mb-1">קריינות:</div>
          {props.textHebrew}
        </div>

        {/* Image area */}
        <div className="relative aspect-[9/16] rounded-md bg-muted overflow-hidden border border-border">
          {hasImage && (
            <Image
              src={effectiveImageUrl!}
              alt={`Scene ${props.sceneOrder + 1}`}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
            />
          )}
          {!hasImage && !showGeneratingOverlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-4">
              <span className="text-3xl opacity-40">🖼️</span>
              <span className="text-xs text-muted-foreground">תמונה עדיין לא נוצרה</span>
            </div>
          )}
          {showGeneratingOverlay && !hasImage && (
            // First-time generation: full overlay with progress (no image
            // exists yet to keep visible).
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
                בדרך כלל 40–70 שניות עם תמונות רפרנס.
              </div>
            </div>
          )}
          {showGeneratingOverlay && hasImage && (
            // Regen: keep the existing image fully visible — just a small
            // corner badge so the user can still see what they're
            // replacing while the new one renders.
            <div className="absolute top-2 right-2 z-20 rounded-md bg-black/80 text-white text-[11px] px-2 py-1 flex items-center gap-1.5 shadow-lg ring-1 ring-white/20">
              <span className="animate-pulse">✨</span>
              <span>מתחדשת…</span>
              <ElapsedTimer keyValue={props.sceneId + props.imageGenerationCount} />
            </div>
          )}
        </div>

        {/* Visual prompt — editable. Shows livePrompt (LLM-regenerated)
            when set, else the server-side prop. */}
        {!editingPrompt ? (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>תיאור ויזואלי (אנגלית):</span>
              {livePrompt && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                  • פרומט חדש
                </span>
              )}
            </div>
            <div
              className="text-xs text-muted-foreground/80 line-clamp-3 cursor-pointer hover:text-foreground"
              onClick={() => setEditingPrompt(true)}
              dir="ltr"
            >
              {livePrompt ?? props.visualPromptEnglish}
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
            {/* V17 — prompt suggestion chips. Click appends a tweak to
                the current draft so the user can iterate without typing
                English. Suggestions are deterministic English fragments
                that the gpt-image-2 prompt builder understands well. */}
            <div className="flex flex-wrap gap-1.5" dir="ltr">
              {PROMPT_TWEAK_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="text-[11px] px-2 py-1 rounded-full bg-primary/8 text-primary hover:bg-primary/15 border border-primary/20 transition-colors"
                  title={chip.append}
                  onClick={() =>
                    setDraftPrompt((prev) =>
                      prev.trim().endsWith('.') || prev.trim().endsWith(',')
                        ? `${prev} ${chip.append}.`
                        : `${prev}. ${chip.append}.`,
                    )
                  }
                >
                  {chip.label}
                </button>
              ))}
            </div>
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

        {/* Action row — three buttons:
              1. 🎲 פרומט חדש  → asks LLM for a fresh visual_prompt_english
                 variant. Doesn't generate an image. User can click again
                 for another variant, or edit the prompt manually.
              2. ↻ צור מחדש    → generates an image with the CURRENT
                 prompt (no LLM call for the prompt itself).
              3. ✨ צור תמונה  → first-time generation when no image exists. */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {props.imageGenerationCount > 0 ? `${props.imageGenerationCount} ניסיונות` : ''}
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={promptPending || pending}
              onClick={handleRegenPromptOnly}
              title="LLM יציע פרומט שונה מהקיים (זווית/תאורה/סצנה אחרת). לא נוצרת תמונה — רק פרומט. תוכל ללחוץ שוב לוואריאציה נוספת."
            >
              {promptPending ? '✨ מייצר פרומט…' : '🎲 פרומט חדש'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={hasImage ? 'outline' : 'default'}
              disabled={showGeneratingOverlay || promptPending}
              onClick={handleRegenerate}
            >
              {showGeneratingOverlay
                ? 'יוצר…'
                : hasImage
                  ? '↻ צור מחדש (1 קרדיט)'
                  : '✨ צור תמונה (1 קרדיט)'}
            </Button>
          </div>
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
