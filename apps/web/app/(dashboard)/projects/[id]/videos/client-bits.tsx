'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// V14.3-B — VoicePicker (312 lines) + MusicPicker (352 lines) are heavy
// client components used only AFTER the user reaches step 5 / opens a
// `<details>` disclosure. Lazy-loading them via next/dynamic with
// ssr:false moves their JS into separate chunks that are fetched only
// when actually rendered, shaving ~50KB off the initial videos-page
// bundle. Server-render pages can't pass ssr:false directly in Next 15
// — wrappers live here in a 'use client' module instead.
export const VoicePicker = dynamic(
  () => import('./voice-picker').then((m) => ({ default: m.VoicePicker })),
  {
    ssr: false,
    loading: () => (
      <div className="text-xs text-muted-foreground p-3">טוען בורר קולות…</div>
    ),
  },
);
export const MusicPicker = dynamic(
  () => import('./music-picker').then((m) => ({ default: m.MusicPicker })),
  {
    ssr: false,
    loading: () => (
      <div className="text-xs text-muted-foreground p-3">טוען בורר מוזיקה…</div>
    ),
  },
);
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ElapsedTimer } from '@/components/ui/elapsed-timer';
import { AudioPreview } from '@/components/ui/audio-preview';
import { VideoPreview } from '@/components/ui/video-preview';
import { cn } from '@/lib/utils';
import { isPageVisible } from '@/lib/utils/visibility';
import {
  CAPTION_PRESETS,
  DEFAULT_CAPTION_PRESET_ID,
  type CaptionPresetId,
} from '@ugc-video/shared';
// V26.10 — generateSceneClipAction / regenLipSyncOnlyAction removed
// from this client file. Per-scene generation now goes through fetch()
// against /api/scenes/[id]/clip and /api/scenes/[id]/lipsync-only so
// concurrent clicks on different scenes run in parallel (Next.js
// serializes Server Actions per route).
import {
  setSceneRequiresLipSyncAction,
  setSceneClipProviderAction,
  type GenerateClipState,
} from './actions';

// V21 cleanup — VOICES_BATCH_* events removed; voice gen lives on
// the scenes page now. Clip batch events still in use.
const CLIPS_BATCH_START = 'clips:batch-start';
const CLIPS_BATCH_DONE = 'clips:batch-done';

const SCENE_GOAL_LABEL: Record<string, string> = {
  stop_scroll: 'עוצר גלילה',
  establish_pain: 'מבסס כאב',
  introduce_product: 'מכניס מוצר',
  prove_it_works: 'מוכיח שעובד',
  decision_push: 'דחיפה לפעולה',
  other: 'אחר',
};

interface SceneInfo {
  id: string;
  sceneOrder: number;
  hasImage: boolean;
  hasVoice: boolean;
  hasClip: boolean;
}

/* ============================================================
 * Helpers
 * ============================================================ */

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

/* ============================================================
 * Batch buttons
 *
 * V14.7 / V21 cleanup: GenerateAllVoicesButton was removed entirely
 * — voice generation moved to step 4 (scenes page). The clip batch
 * remains here because clips are step-5-only.
 * ============================================================ */

export function GenerateAllClipsButton({
  scenes,
  creditsBalance,
}: {
  scenes: SceneInfo[];
  creditsBalance: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [error, setError] = useState<string | null>(null);

  const queue = scenes.filter((s) => s.hasImage && s.hasVoice && !s.hasClip);
  if (queue.length === 0) return null;

  const cost = queue.length;
  const canRun = creditsBalance >= cost;

  const run = async () => {
    if (!canRun || pending) return;
    setError(null);
    setProgress({ done: 0, total: queue.length, failed: 0 });
    setPending(true);
    if (typeof window !== 'undefined')
      window.dispatchEvent(new CustomEvent(CLIPS_BATCH_START));

    try {
      let done = 0;
      let failed = 0;
      let abort = false;
      // Kling submits are quick — the long part (60-180s) is the actual
      // video render which runs on Kling's side. 5 parallel POSTs are
      // well within our rate limit (12/5min) and let all scenes start
      // their Kling work simultaneously instead of staggered in pairs.
      // For a 5-scene batch this changes wall-time from ~3 batches ×
      // ~3min each = 9min → 1 batch × ~3min = ~3min.
      const PARALLELISM = 5;
      // Kling i2v + lipsync = up to 8 minutes on slow days. Plus margin.
      const PER_SCENE_BUDGET_MS = 600_000;

      const runOne = async (s: SceneInfo) => {
        if (abort) return;
        try {
          const result = await raceWithTimeout(
            fetch(`/api/scenes/${s.id}/clip`, { method: 'POST' }).then(
              (r) =>
                r.json() as Promise<{
                  success: boolean;
                  error?: string;
                  needsCredits?: boolean;
                  needsImage?: boolean;
                  needsVoice?: boolean;
                  configError?: boolean;
                  failedStage?: 'motion' | 'lipsync';
                }>,
            ),
            PER_SCENE_BUDGET_MS,
          );
          if (!result.success) {
            failed++;
            setError(result.error ?? 'יצירת קליפ נכשלה');
            if (result.needsCredits || result.configError) abort = true;
          } else {
            done++;
            setError(null);
          }
        } catch (err) {
          failed++;
          const msg = (err as Error).message;
          setError(
            msg.includes('timeout')
              ? 'הקליפ לא הסתיים תוך 6 דקות. ממשיך לסצנה הבאה.'
              : `שגיאה: ${msg}`,
          );
        }
        setProgress({ done, total: queue.length, failed });
      };

      for (let i = 0; i < queue.length; i += PARALLELISM) {
        if (abort) break;
        const chunk = queue.slice(i, i + PARALLELISM);
        await Promise.all(chunk.map(runOne));
        router.refresh();
      }
    } finally {
      setPending(false);
      if (typeof window !== 'undefined')
        window.dispatchEvent(new CustomEvent(CLIPS_BATCH_DONE));
    }
  };

  return (
    <Card className="border-ai/40 bg-ai/[0.04]">
      <CardContent className="p-4 flex items-center gap-3 justify-between">
        <div className="flex-1 space-y-0.5">
          <div className="text-sm font-semibold">
            {pending ? 'מנפיש קליפים…' : 'הנפש את כל הקליפים החסרים'}
          </div>
          <div className="text-xs text-muted-foreground">
            {pending
              ? `${progress.done + progress.failed} מתוך ${progress.total}${progress.failed > 0 ? ` (${progress.failed} נכשלו)` : ''}`
              : `${queue.length} חסרים · ${queue.length} קרדיטים (יש לך ${creditsBalance}). ~5 דק' סך הכל.`}
          </div>
          {pending && (
            <div className="pt-2">
              <ProgressBar variant="ai" />
            </div>
          )}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2 mt-2">
              {error}
            </div>
          )}
        </div>
        <Button onClick={run} disabled={pending || !canRun} size="default" variant="default">
          {pending ? '…' : '🎬 הנפש הכל'}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * SceneClipCard — per-scene tile with voice + clip controls
 * ============================================================ */

interface SceneClipCardProps {
  sceneId: string;
  // V14.7 — used by the "no voice yet" link back to the scenes page.
  projectId: string;
  sceneOrder: number;
  totalScenes: number;
  sceneGoal: string | null;
  textHebrew: string;
  imageUrl: string | null;
  voiceUrl: string | null;
  voiceDurationSeconds: number | null;
  voiceGenerationCount: number;
  /** ISO timestamp set when a voice generation is currently running on
   * the server. Null when idle. Lets the spinner survive page refresh. */
  voiceInFlightAt: string | null;
  clipUrl: string | null;
  clipDurationSeconds: number | null;
  clipGenerationCount: number;
  /** ISO timestamp set when a clip generation is currently running. */
  clipInFlightAt: string | null;
  voiceSelected: boolean;
  /** Currently effective lipsync flag (auto-derived OR user override). */
  requiresLipSync: boolean;
  /** True if the user has set the flag explicitly (so we can show "auto"
   * vs "manual" in the UI and offer a "reset to auto" button). */
  requiresLipSyncIsExplicit: boolean;
  /** Auto-derived scene type label (talking_head / broll / hands_only / ...). */
  sceneGenerationType: string;
  /** V26 — per-scene clip-engine choice. 'kling' (default) | 'grok'.
   *  null is treated as 'kling'. */
  clipProvider: string | null;
}

// In-flight TTLs match the server. Past these, the flag is treated as
// stale (the worker probably crashed) and the UI offers the action again.
const CLIP_IN_FLIGHT_TTL_MS = 15 * 60 * 1000;
const VOICE_IN_FLIGHT_TTL_MS = 2 * 60 * 1000;

function isFresh(iso: string | null, ttlMs: number): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < ttlMs;
}

export function SceneClipCard(props: SceneClipCardProps) {
  const router = useRouter();

  // V21 cleanup: voice gen moved to step 4 (scenes page). All
  // voice-related useActionState / form action / batch-polling /
  // post-action poll burst was deleted from this card. The remaining
  // voice UI (audio preview + read-only spinner) drives off
  // `voiceInFlightAt` from the server prop only.

  // V26.10 — per-scene clip generation went from <form action={ServerAction}>
  // to a direct fetch() call against the same API route the batch button uses
  // (/api/scenes/[id]/clip). Reason: Next.js serializes Server Actions per
  // route, so clicking regen on 4 different scenes used to run them one-
  // after-another even though they're independent jobs. The /api route
  // handler is a plain Vercel function — clicks fan out in parallel
  // (subject to the existing per-user rate limit in lib/usage/rate-limit).
  const [clipPending, setClipPending] = useState(false);
  const [clipState, setClipState] = useState<GenerateClipState>(undefined);
  const clipStartedRef = useRef(false);

  const triggerClipRegen = async () => {
    if (clipPending) return;
    clipStartedRef.current = true;
    setClipPending(true);
    setClipState(undefined);
    try {
      const res = await fetch(`/api/scenes/${props.sceneId}/clip`, {
        method: 'POST',
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        needsCredits?: boolean;
        needsImage?: boolean;
        needsVoice?: boolean;
        configError?: boolean;
        timedOut?: boolean;
        failedStage?: 'motion' | 'lipsync';
      };
      if (!json.success) {
        setClipState({
          error: json.error,
          needsCredits: json.needsCredits,
          needsImage: json.needsImage,
          needsVoice: json.needsVoice,
          configError: json.configError,
          timedOut: json.timedOut,
          failedStage: json.failedStage,
        });
      } else {
        setClipState(undefined);
        router.refresh();
      }
    } catch (err) {
      setClipState({ error: `שגיאה: ${(err as Error).message}` });
    } finally {
      setClipPending(false);
    }
  };

  // Lipsync-only regen — same parallelization fix.
  const [lipsyncOnlyPending, setLipsyncOnlyPending] = useState(false);
  const [lipsyncOnlyState, setLipsyncOnlyState] = useState<GenerateClipState>(undefined);

  const triggerLipsyncOnlyRegen = async () => {
    if (lipsyncOnlyPending) return;
    setLipsyncOnlyPending(true);
    setLipsyncOnlyState(undefined);
    try {
      const res = await fetch(`/api/scenes/${props.sceneId}/lipsync-only`, {
        method: 'POST',
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        needsCredits?: boolean;
        needsImage?: boolean;
        needsVoice?: boolean;
        configError?: boolean;
        timedOut?: boolean;
        failedStage?: 'motion' | 'lipsync';
      };
      if (!json.success) {
        setLipsyncOnlyState({
          error: json.error,
          needsCredits: json.needsCredits,
          needsImage: json.needsImage,
          needsVoice: json.needsVoice,
          configError: json.configError,
          timedOut: json.timedOut,
          failedStage: json.failedStage,
        });
      } else {
        setLipsyncOnlyState(undefined);
        router.refresh();
      }
    } catch (err) {
      setLipsyncOnlyState({ error: `שגיאה: ${(err as Error).message}` });
    } finally {
      setLipsyncOnlyPending(false);
    }
  };

  // Live overrides: when polling beats router.refresh() during a batch,
  // we set these locally. Cleared once the prop catches up.
  const [liveVoiceUrl, setLiveVoiceUrl] = useState<string | null>(null);
  const [liveClipUrl, setLiveClipUrl] = useState<string | null>(null);
  const [clipBatchPolling, setClipBatchPolling] = useState(false);

  const propsRef = useRef(props);
  propsRef.current = props;

  // Drop overrides when the server-rendered prop arrives.
  useEffect(() => {
    if (liveVoiceUrl && props.voiceUrl) setLiveVoiceUrl(null);
  }, [props.voiceUrl, liveVoiceUrl]);
  useEffect(() => {
    if (liveClipUrl && props.clipUrl) setLiveClipUrl(null);
  }, [props.clipUrl, liveClipUrl]);

  // Clip batch polling — only batch left after V21 cleanup.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let aborted = false;
    const stop = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = null;
      setClipBatchPolling(false);
    };
    const tick = async () => {
      if (aborted || propsRef.current.clipUrl) {
        stop();
        return;
      }
      if (!isPageVisible()) return;
      try {
        const res = await fetch(`/api/scenes/${propsRef.current.sceneId}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as { clipUrl: string | null };
        if (json.clipUrl && !aborted) {
          setLiveClipUrl(json.clipUrl);
          stop();
          router.refresh();
        }
      } catch { /* keep trying */ }
    };
    const onStart = () => {
      if (propsRef.current.clipUrl) return;
      setClipBatchPolling(true);
      void tick();
      intervalId = setInterval(tick, 3000);
    };
    const onDone = () => stop();
    window.addEventListener(CLIPS_BATCH_START, onStart);
    window.addEventListener(CLIPS_BATCH_DONE, onDone);
    return () => {
      aborted = true;
      window.removeEventListener(CLIPS_BATCH_START, onStart);
      window.removeEventListener(CLIPS_BATCH_DONE, onDone);
      stop();
    };
  }, [router]);

  // V21 cleanup: voice post-action burst deleted (no voice form here
  // anymore). Server-side voiceInFlightAt + the regen-watch effect
  // below handle the in-flight UX.

  const wasClipPendingRef = useRef(clipPending);
  const clipUrlAtPendingRef = useRef<string | null>(props.clipUrl);
  useEffect(() => {
    if (!wasClipPendingRef.current && clipPending) {
      clipUrlAtPendingRef.current = propsRef.current.clipUrl;
    }
    if (wasClipPendingRef.current && !clipPending && !clipState?.error) {
      router.refresh();
      const startUrl = clipUrlAtPendingRef.current;
      let polls = 0;
      const id = setInterval(async () => {
        polls++;
        if (!isPageVisible()) return;
        try {
          const res = await fetch(`/api/scenes/${propsRef.current.sceneId}`, {
            cache: 'no-store',
          });
          if (res.ok) {
            const json = (await res.json()) as { clipUrl: string | null };
            if (json.clipUrl && json.clipUrl !== startUrl) {
              setLiveClipUrl(json.clipUrl);
              clearInterval(id);
              router.refresh();
              return;
            }
          }
        } catch { /* */ }
        if (polls > 12) clearInterval(id); // ~36s budget
      }, 3000);
      return () => clearInterval(id);
    }
    wasClipPendingRef.current = clipPending;
  }, [clipPending, router, clipState]);

  const effectiveVoiceUrl = liveVoiceUrl ?? props.voiceUrl;
  const effectiveClipUrl = liveClipUrl ?? props.clipUrl;
  const hasVoice = !!effectiveVoiceUrl;
  const hasClip = !!effectiveClipUrl;
  // Server-side in-flight flags survive page refresh — if the user
  // refreshes mid-generation, the spinner persists until the row's
  // *InFlightAt clears (set in the try/finally of the impl). When the
  // flag is older than the TTL, treat it as stale (worker crashed).
  const voiceInFlightServer = isFresh(props.voiceInFlightAt, VOICE_IN_FLIGHT_TTL_MS);
  const clipInFlightServer = isFresh(props.clipInFlightAt, CLIP_IN_FLIGHT_TTL_MS);
  // The server-side in-flight flag indicates an *active regen* even when
  // the previous result is still on disk. We deliberately do NOT gate it
  // on `!hasVoice` / `!hasClip`: during a regen the OLD result is still
  // visible (so the user can keep playing it), and we want the badge +
  // disabled button to reflect that a new generation is running.
  // V21 — voice gen moved to step 4. Spinner here just mirrors the
  // server-side in-flight flag (e.g. when a step-4 batch is still
  // running while the user navigated to step 5).
  const showVoiceWorking = voiceInFlightServer;
  const showClipWorking = clipPending || clipBatchPolling || clipInFlightServer;

  // Polling: when the server-side flag is set but we don't yet have a
  // result, keep checking the GET endpoint every 3s for up to its TTL
  // so the spinner flips to the result the moment the server finishes.
  // Track which URL we already have so we can detect the *new* one arriving
  // during a regen (when an old URL is still in props). Without this guard,
  // the poll bails immediately because hasVoice / hasClip is true.
  const initialVoiceUrlRef = useRef(effectiveVoiceUrl);
  const initialClipUrlRef = useRef(effectiveClipUrl);

  useEffect(() => {
    if (!voiceInFlightServer) return;
    const baselineUrl = initialVoiceUrlRef.current;
    const id = setInterval(async () => {
      if (!isPageVisible()) return;
      try {
        const res = await fetch(`/api/scenes/${propsRef.current.sceneId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { voiceUrl: string | null; voiceInFlightAt: string | null };
        // New URL arrived (different from what we had when regen started).
        if (json.voiceUrl && json.voiceUrl !== baselineUrl) {
          setLiveVoiceUrl(json.voiceUrl);
          initialVoiceUrlRef.current = json.voiceUrl;
          clearInterval(id);
          router.refresh();
        } else if (!json.voiceInFlightAt) {
          // Flag cleared without a new URL → terminal failure server-side.
          clearInterval(id);
          router.refresh();
        }
      } catch { /* keep trying */ }
    }, 3000);
    return () => clearInterval(id);
  }, [voiceInFlightServer, router]);

  useEffect(() => {
    if (!clipInFlightServer) return;
    const baselineUrl = initialClipUrlRef.current;
    const id = setInterval(async () => {
      if (!isPageVisible()) return;
      try {
        const res = await fetch(`/api/scenes/${propsRef.current.sceneId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { clipUrl: string | null; clipInFlightAt: string | null };
        if (json.clipUrl && json.clipUrl !== baselineUrl) {
          setLiveClipUrl(json.clipUrl);
          initialClipUrlRef.current = json.clipUrl;
          clearInterval(id);
          router.refresh();
        } else if (!json.clipInFlightAt) {
          clearInterval(id);
          router.refresh();
        }
      } catch { /* keep trying */ }
    }, 3000);
    return () => clearInterval(id);
  }, [clipInFlightServer, router]);

  const canGenerateVoice = !!props.imageUrl && props.voiceSelected;
  const canGenerateClip = !!props.imageUrl && hasVoice;

  // V27 — data-ai-active wires this card into the AI breathing contract.
  // Clip is the heaviest signal (longest wait), voice is the next.
  // CSS auto-applies glow-ai + motion-pulse-ai via globals.css.
  const aiActiveValue: 'clip' | 'voice' | undefined = showClipWorking
    ? 'clip'
    : showVoiceWorking
      ? 'voice'
      : undefined;

  return (
    <Card
      data-ai-active={aiActiveValue}
      className={cn(
        'tier-elevated motion-fade-up',
        hasClip && !aiActiveValue && 'border-success/40',
      )}
    >
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Badge variant={hasClip ? 'success' : hasVoice ? 'default' : 'outline'}>
              סצנה {props.sceneOrder + 1}/{props.totalScenes}
            </Badge>
            {props.sceneGoal && (
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                {SCENE_GOAL_LABEL[props.sceneGoal] ?? props.sceneGoal}
              </span>
            )}
          </div>
        </div>

        {/* Hebrew text */}
        <div className="text-sm leading-relaxed border-s-2 border-primary ps-3">
          <div className="text-xs text-muted-foreground mb-1">קריינות:</div>
          {props.textHebrew}
        </div>

        {/* Clip preview area — takes priority when present. During regen
            we KEEP the existing clip visible and overlay a small badge
            so the user can still play/preview the old result while the
            new one renders. (Replacing the player with a spinner during
            a 2-3 minute regen kills the workflow.) */}
        {hasClip ? (
          <div className="relative">
            <VideoPreview
              src={effectiveClipUrl!}
              poster={props.imageUrl ?? undefined}
              durationSeconds={props.clipDurationSeconds ?? null}
            />
            {showClipWorking && (
              <div className="absolute top-2 right-2 z-20 rounded-md bg-black/80 text-white text-[11px] px-2 py-1 flex items-center gap-1.5 shadow-lg ring-1 ring-white/20">
                <span className="animate-pulse">🎬</span>
                <span>מנפיש מחדש…</span>
                <ElapsedTimer keyValue={props.sceneId + props.clipGenerationCount} />
              </div>
            )}
          </div>
        ) : (
          /* Fallback: scene image (or empty state) */
          <div className="relative aspect-[9/16] rounded-md overflow-hidden bg-muted border border-border">
            {props.imageUrl ? (
              <Image
                src={props.imageUrl}
                alt={`Scene ${props.sceneOrder + 1}`}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-4">
                <span className="text-3xl opacity-40">🖼️</span>
                <span className="text-xs text-muted-foreground">צור תמונה לסצנה (שלב 4) קודם</span>
              </div>
            )}
            {showClipWorking && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-4 bg-black/40 backdrop-blur-[2px]">
                <div className="text-4xl motion-shimmer">🎬</div>
                <div className="text-sm font-semibold text-white">מנפיש את הסצנה…</div>
                <div className="w-3/4">
                  <ProgressBar variant="ai" />
                </div>
                <div className="text-xs text-white/80 flex items-center gap-2">
                  <span>זמן שעבר:</span>
                  <ElapsedTimer keyValue={props.sceneId + props.clipGenerationCount} />
                </div>
                <div className="text-[10px] text-white/70 max-w-[80%]">
                  Kling i2v + lipsync · ~2 דק' עם תמונת רפרנס
                </div>
              </div>
            )}
          </div>
        )}

        {/* Voice row — V14.7 read-only on this page. All voice generation
            + regeneration moved to step 4 (scenes page). The user lands
            here with voice already produced; we only show the audio
            preview. If voice is somehow missing (e.g. step-4 batch
            failed), surface a link back to the scenes page. */}
        <div className="space-y-2">
          {hasVoice ? (
            <div className="relative">
              <AudioPreview
                src={effectiveVoiceUrl!}
                durationSeconds={props.voiceDurationSeconds ?? null}
              />
              {showVoiceWorking && (
                <div className="absolute top-1 right-1 z-20 rounded bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 flex items-center gap-1 shadow-md ring-1 ring-white/20">
                  <span className="animate-pulse">🎙️</span>
                  <span>מתחדש…</span>
                  <ElapsedTimer keyValue={props.sceneId + props.voiceGenerationCount} />
                </div>
              )}
            </div>
          ) : showVoiceWorking ? (
            <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-3 flex items-center gap-3">
              <span className="text-xl motion-shimmer">🎙️</span>
              <div className="flex-1">
                <div className="text-xs font-semibold">יוצר voice-over…</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  זמן שעבר: <ElapsedTimer keyValue={props.sceneId + props.voiceGenerationCount} />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-muted-foreground">
              ⚠ אין voice-over —{' '}
              <Link
                href={`/projects/${props.projectId}/scenes`}
                className="text-primary underline"
              >
                חזור לשלב הסצנות לייצור הקול
              </Link>
              .
            </div>
          )}
        </div>

        {/* V26 / V26.4 — per-scene clip-engine picker. Either provider
            works on any scene; PixVerse lipsync runs on top of either
            silent i2v output if requiresLipSync is set. */}
        <ClipProviderToggle
          sceneId={props.sceneId}
          clipProvider={props.clipProvider}
        />

        {/* Lipsync toggle — controls whether the next clip generation
            adds a Kling LipSync pass on top of the silent i2v. */}
        <LipSyncToggle
          sceneId={props.sceneId}
          requiresLipSync={props.requiresLipSync}
          requiresLipSyncIsExplicit={props.requiresLipSyncIsExplicit}
          sceneGenerationType={props.sceneGenerationType}
        />

        {/* Animate button */}
        <div className="space-y-2">
          {!hasClip && !showClipWorking && (
            <Button
              type="button"
              size="sm"
              disabled={!canGenerateClip}
              className="w-full"
              onClick={triggerClipRegen}
            >
              {!hasVoice && props.requiresLipSync
                ? '🎬 צור voice-over לפני הנפשה'
                : props.requiresLipSync
                  ? '🎬 הנפש + Lipsync'
                  : '🎬 הנפש את הסצנה'}
            </Button>
          )}
          {hasClip && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                disabled={showClipWorking || lipsyncOnlyPending}
                onClick={triggerClipRegen}
                title="מנפיש מחדש מהתחלה — Kling i2v + lipsync (~30 קרדיטים). רץ במקביל לסצנות אחרות."
              >
                {showClipWorking ? 'מנפיש מחדש…' : '↻ הנפש מחדש'}
              </Button>
              {/* Lipsync-only — keeps the existing animation, swaps just
                  the lipsync provider's pass on the same audio. Cheaper
                  (12 credits) than a full clip regen (30). Only useful
                  when the scene already has both clip + voice AND
                  requires_lip_sync = true. */}
              {hasVoice && props.requiresLipSync && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  disabled={showClipWorking || lipsyncOnlyPending}
                  onClick={triggerLipsyncOnlyRegen}
                  title="רץ רק על שלב ה-lipsync עם הקליפ הנוכחי + האודיו הנוכחי. חוסך את שלב ה-i2v היקר."
                >
                  {lipsyncOnlyPending ? '👄 מסנכרן…' : '👄 רק lipsync'}
                </Button>
              )}
            </div>
          )}
          {clipState?.error && (
            <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-2 py-1.5">
              {clipState.failedStage && (
                <strong>
                  שלב{' '}
                  {clipState.failedStage === 'motion' ? 'תנועה' : 'lipsync'}:{' '}
                </strong>
              )}
              {clipState.error}
            </div>
          )}
          {lipsyncOnlyState?.error && (
            <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-2 py-1.5">
              <strong>Lipsync: </strong>
              {lipsyncOnlyState.error}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * ClipProviderToggle — per-scene i2v engine picker (Kling vs Grok)
 *
 * The choice is persisted on Scene.clipProvider. Lipsync scenes are
 * pinned to Kling because PixVerse's face-gate pipeline is wired only
 * against Kling output — we surface that as a disabled "Grok" pill.
 * ============================================================ */

function ClipProviderToggle({
  sceneId,
  clipProvider,
}: {
  sceneId: string;
  clipProvider: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // V26.14 — default flipped Kling → Grok. clipProvider === null means
  // "use the default" which is now Grok; only an explicit 'kling'
  // value keeps Kling selected.
  const [local, setLocal] = useState<string>(clipProvider === 'kling' ? 'kling' : 'grok');
  useEffect(() => {
    setLocal(clipProvider === 'kling' ? 'kling' : 'grok');
  }, [clipProvider]);

  // V26.4 — Grok works on lipsync scenes too. The lipsync pipeline is
  // provider-agnostic: PixVerse takes a silent video URL regardless of
  // whether Kling or Grok produced it, and the face-gate inspects
  // `scene.imageUrl` (not the video) so source doesn't matter. The
  // earlier "Grok blocks lipsync" UI was a self-imposed restriction;
  // removed.
  const set = async (value: 'kling' | 'grok') => {
    if (value === local) return;
    setPending(true);
    setError(null);
    const res = await setSceneClipProviderAction(sceneId, value);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? 'שמירה נכשלה');
      return;
    }
    setLocal(value);
    router.refresh();
  };

  return (
    <div className="rounded-md border border-border bg-card/50 px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">
          מנוע הנפשה: <span className="font-medium text-foreground">
            {local === 'grok' ? 'Grok Imagine (xAI)' : 'Kling Omni'}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => set('kling')}
          disabled={pending}
          className={cn(
            'flex-1 text-[11px] font-medium rounded px-2 py-1 transition-colors',
            local === 'kling'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-secondary',
          )}
          title="Kling Omni v3 — ספק ברירת מחדל. תומך גם ב-Lipsync (PixVerse)."
        >
          🎬 Kling
        </button>
        <button
          type="button"
          onClick={() => set('grok')}
          disabled={pending}
          className={cn(
            'flex-1 text-[11px] font-medium rounded px-2 py-1 transition-colors',
            local === 'grok'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-secondary',
          )}
          title="Grok Imagine (xAI) — i2v חלופי. סצנת Lipsync? PixVerse עדיין יבצע סנכרון שפתיים על הוידאו של Grok."
        >
          ✨ Grok
        </button>
      </div>
      {error && (
        <div className="text-[10px] text-destructive">{error}</div>
      )}
    </div>
  );
}

/* ============================================================
 * LipSyncToggle — per-scene flag override (auto / on / off)
 * ============================================================ */

const SCENE_TYPE_LABEL_HE: Record<string, string> = {
  talking_head: 'דיבור למצלמה',
  selfie_talking: 'סלפי מדבר',
  mirror_selfie_talking: 'סלפי במראה',
  product_demo: 'הדגמת מוצר',
  broll: 'B-roll',
  lifestyle: 'לייפסטייל',
  hands_only: 'ידיים בלבד',
  closeup_product: 'תקריב מוצר',
  before_after: 'לפני / אחרי',
};

function LipSyncToggle({
  sceneId,
  requiresLipSync,
  requiresLipSyncIsExplicit,
  sceneGenerationType,
}: {
  sceneId: string;
  requiresLipSync: boolean;
  requiresLipSyncIsExplicit: boolean;
  sceneGenerationType: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optimistic local state so the toggle feels instant. Reset whenever
  // the props (server-rendered) catch up.
  const [localRequires, setLocalRequires] = useState(requiresLipSync);
  const [localExplicit, setLocalExplicit] = useState(requiresLipSyncIsExplicit);
  useEffect(() => {
    setLocalRequires(requiresLipSync);
    setLocalExplicit(requiresLipSyncIsExplicit);
  }, [requiresLipSync, requiresLipSyncIsExplicit]);

  const set = async (value: boolean | null) => {
    setPending(true);
    setError(null);
    const res = await setSceneRequiresLipSyncAction(sceneId, value);
    setPending(false);
    if (!res.ok) {
      setError(res.error ?? 'שמירה נכשלה');
      return;
    }
    setLocalRequires(res.effective ?? false);
    setLocalExplicit(value !== null);
    router.refresh();
  };

  const typeLabel = SCENE_TYPE_LABEL_HE[sceneGenerationType] ?? sceneGenerationType;

  return (
    <div className="rounded-md border border-border bg-card/50 px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">
          סוג: <span className="font-medium text-foreground">{typeLabel}</span>
        </span>
        {!localExplicit && (
          <span className="text-[10px] text-muted-foreground italic">אוטומטי</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => set(true)}
          disabled={pending}
          className={cn(
            'flex-1 text-[11px] font-medium rounded px-2 py-1 transition-colors',
            localRequires && localExplicit
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-secondary',
          )}
          title="כפה Lipsync — Kling יוסיף סנכרון שפתיים אחרי ה-i2v"
        >
          💋 Lipsync
        </button>
        <button
          type="button"
          onClick={() => set(false)}
          disabled={pending}
          className={cn(
            'flex-1 text-[11px] font-medium rounded px-2 py-1 transition-colors',
            !localRequires && localExplicit
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-secondary',
          )}
          title="בטל Lipsync — silent i2v בלבד; קול ימוסך ב-ffmpeg"
        >
          🎵 שקט
        </button>
        {localExplicit && (
          <button
            type="button"
            onClick={() => set(null)}
            disabled={pending}
            className="text-[11px] text-muted-foreground hover:text-foreground rounded px-1.5 py-1"
            title="חזור לאוטומטי לפי כיוון מצלמה"
          >
            ↺
          </button>
        )}
      </div>
      {error && (
        <div className="text-[10px] text-destructive">{error}</div>
      )}
    </div>
  );
}

/* ============================================================
 * Caption preset picker (V12)
 *
 * Shows the 5 caption-style options as preview cards. The selection is
 * mirrored into localStorage under a per-project key so the
 * RenderFinalButton on the same page can pick it up at click time
 * without prop-drilling through the whole tree. The user's last
 * selection persists across page refreshes — re-renders don't lose it.
 * ============================================================ */

const PRESET_STORAGE_KEY = (projectId: string) => `caption-preset:${projectId}`;

function readPresetFromStorage(
  projectId: string,
  initial: CaptionPresetId,
): CaptionPresetId {
  if (typeof window === 'undefined') return initial;
  const v = window.localStorage.getItem(PRESET_STORAGE_KEY(projectId));
  if (!v) return initial;
  return CAPTION_PRESETS.some((p) => p.id === v) ? (v as CaptionPresetId) : initial;
}

export function CaptionPresetPicker({
  projectId,
  initialPresetId,
}: {
  projectId: string;
  initialPresetId: CaptionPresetId;
}) {
  const [selected, setSelected] = useState<CaptionPresetId>(initialPresetId);

  // Hydrate from localStorage on mount so a refresh after picking a
  // non-default preset shows the correct selection.
  useEffect(() => {
    setSelected(readPresetFromStorage(projectId, initialPresetId));
  }, [projectId, initialPresetId]);

  const onPick = (id: CaptionPresetId) => {
    setSelected(id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PRESET_STORAGE_KEY(projectId), id);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold">סגנון כתוביות</h3>
        <span className="text-xs text-muted-foreground">
          הסגנון יחול על הסרטון הסופי
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {CAPTION_PRESETS.map((preset) => {
          const isSelected = preset.id === selected;
          // Build text styling 100% via inline styles so the actual
          // hex colors hit the DOM regardless of Tailwind's purge or
          // theme config. Stroke = layered text-shadow approximating
          // an ASS outline; block = the text sits inside a solid
          // black card (mimics borderStyle:3).
          const textStyle: React.CSSProperties = {
            color: preset.preview.color,
            fontWeight: 900,
            letterSpacing: '-0.01em',
            ...(preset.preview.stroke
              ? {
                  textShadow:
                    '2px 0 0 #000, -2px 0 0 #000, 0 2px 0 #000, 0 -2px 0 #000, ' +
                    '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, ' +
                    '0 2px 4px rgba(0,0,0,0.9)',
                }
              : {
                  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                }),
            ...(preset.preview.block
              ? {
                  backgroundColor: 'rgba(0,0,0,0.85)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                }
              : {}),
          };
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onPick(preset.id)}
              className={cn(
                'group relative rounded-xl border-2 overflow-hidden text-right transition focus:outline-none focus:ring-2 focus:ring-ai bg-card',
                isSelected
                  ? 'border-ai ring-2 ring-ai/40'
                  : 'border-border hover:border-foreground/40',
              )}
              title={preset.descriptionHe}
            >
              {/* Preview tile — solid dark "scene" background with the
                  caption rendered at the bottom-third where it'd land
                  in the final mp4. All colors are inline styles so
                  the rendered hex matches exactly what the ASS file
                  will produce. */}
              <div
                className="aspect-[4/5] w-full flex items-end justify-center relative overflow-hidden"
                style={{ backgroundColor: '#1f1f23' }}
              >
                {/* Warm window-light highlight at the top — suggests a
                    face/subject lit from the side. */}
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(ellipse 70% 45% at 50% 28%, rgba(180,140,90,0.32) 0%, transparent 70%)',
                  }}
                />
                {/* Faint head-shape silhouette to imply a subject. */}
                <div
                  aria-hidden
                  className="absolute"
                  style={{
                    left: '50%',
                    top: '22%',
                    transform: 'translateX(-50%)',
                    width: '48%',
                    height: '44%',
                    borderRadius: '50%',
                    background:
                      'radial-gradient(circle, rgba(255,220,180,0.16) 0%, rgba(255,220,180,0.04) 50%, transparent 75%)',
                  }}
                />
                {/* Bottom dim — solid black gradient so caption text
                    always has high contrast against the "scene". */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0"
                  style={{
                    height: '55%',
                    background:
                      'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0) 100%)',
                  }}
                />

                {/* The caption sample. */}
                <div
                  className="relative w-full px-3 text-center"
                  style={{ paddingBottom: '14%' }}
                  dir="rtl"
                >
                  {preset.id === 'word_pop' ? (
                    <span
                      style={{
                        ...textStyle,
                        fontSize: '32px',
                        display: 'inline-block',
                        transform: 'scale(1.1)',
                      }}
                    >
                      {preset.preview.sample}
                    </span>
                  ) : (
                    <span
                      style={{
                        ...textStyle,
                        fontSize: '15px',
                        lineHeight: 1.15,
                        display: 'inline-block',
                      }}
                    >
                      {preset.preview.sample}
                    </span>
                  )}
                </div>

                {isSelected && (
                  <div
                    className="absolute top-2 right-2 text-[10px] font-bold rounded-full px-2 py-0.5 shadow"
                    style={{ backgroundColor: '#a3e635', color: '#0a0a0a' }}
                  >
                    ✓ נבחר
                  </div>
                )}
              </div>

              {/* Footer label below the preview. */}
              <div className="p-2 space-y-0.5 bg-card">
                <div className="text-sm font-semibold">{preset.labelHe}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-2">
                  {preset.descriptionHe}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
 * RenderFinalButton — Step 6 trigger
 * ============================================================ */

export function RenderFinalButton({
  projectId,
  allClipsReady,
  creditsBalance,
  initialPresetId,
  captionsEnabled,
}: {
  projectId: string;
  allClipsReady: boolean;
  creditsBalance: number;
  initialPresetId?: CaptionPresetId;
  captionsEnabled?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('');

  const start = async () => {
    if (!allClipsReady || pending) return;
    setError(null);
    setPending(true);
    setStatusText('שולח לרינדור…');
    try {
      // Read the user's caption-style choice off the same localStorage
      // key the picker writes to. When captions are disabled we still
      // send the value (server stores it for the next render) but the
      // worker will ignore it.
      const captionsPreset = captionsEnabled
        ? readPresetFromStorage(projectId, initialPresetId ?? DEFAULT_CAPTION_PRESET_ID)
        : initialPresetId ?? DEFAULT_CAPTION_PRESET_ID;
      const res = await fetch(`/api/projects/${projectId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captionsPreset }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        jobId?: string;
        error?: string;
      };
      if (!res.ok || !data.success || !data.jobId) {
        setError(data.error ?? 'הרכבה סופית נכשלה');
        setPending(false);
        setStatusText('');
        return;
      }
      setJobId(data.jobId);
      router.refresh();

      // V14.4 — Server-Sent Events stream replaces the 3s polling loop.
      // EventSource auto-reconnects on close, so the long render (~3-15
      // min) stays current with sub-2s latency without us managing the
      // interval ourselves. Each connection caps at 55s (Vercel Hobby
      // function ceiling); when it closes the browser opens a new one.
      const startedAt = Date.now();
      const MAX_TOTAL_MS = 10 * 60 * 1000;
      const finalJobId = data.jobId;
      const es = new EventSource(`/api/render/${finalJobId}/events`);
      const cleanup = () => {
        try {
          es.close();
        } catch {
          /* ignore */
        }
        clearTimeout(timeoutId);
      };
      const timeoutId = setTimeout(() => {
        cleanup();
        setError('הרינדור לוקח יותר מ-10 דק׳ — בדוק ב-/admin/queue או /library');
        setPending(false);
        setStatusText('');
      }, MAX_TOTAL_MS);

      es.onmessage = (ev) => {
        if (Date.now() - startedAt >= MAX_TOTAL_MS) return;
        try {
          const s = JSON.parse(ev.data) as {
            status?: string;
            progressPercent?: number;
            errorMessage?: string;
            finalVideoUrl?: string;
          };
          setStatusText(progressLabel(s.status, s.progressPercent));
          if (s.status === 'completed' && s.finalVideoUrl) {
            cleanup();
            router.push(`/library#job-${finalJobId}`);
          } else if (s.status === 'failed' || s.status === 'cancelled') {
            cleanup();
            setError(s.errorMessage ?? 'ההרכבה הסופית נכשלה');
            setPending(false);
            setStatusText('');
          }
        } catch {
          /* malformed event — ignore */
        }
      };
      es.addEventListener('error', (ev) => {
        // Treat error event from the server stream as terminal failure.
        try {
          const data = (ev as MessageEvent).data;
          if (typeof data === 'string') {
            const s = JSON.parse(data) as { errorMessage?: string };
            setError(s.errorMessage ?? 'הרינדור נכשל');
          }
        } catch {
          /* generic transport error — EventSource will auto-reconnect */
        }
      });
      es.onerror = () => {
        // Transport-level error (network blip, function cold-start).
        // EventSource auto-reconnects; nothing to do here. If the
        // server actively closed the connection (terminal status),
        // we already cleaned up above.
      };
    } catch (err) {
      setError(`שגיאה: ${(err as Error).message}`);
      setPending(false);
      setStatusText('');
    }
  };

  // V27 — render is the long-running case in the AI breathing contract.
  // data-ai-active="render" applies a STATIC ring (no pulse) — pulsing for
  // 5+ minutes is painful. The internal status text + progress carry the
  // "live" signal; the green static ring on completion will fade in via
  // [data-state="success"] (handled by parent on success redirect).
  const aiActive = pending ? 'render' : undefined;

  return (
    <div
      className="space-y-2"
      dir="ltr"
      data-ai-active={aiActive}
      style={pending ? { borderRadius: 'var(--radius-xl)', padding: '0.5rem' } : undefined}
    >
      <Button
        onClick={start}
        disabled={!allClipsReady || pending}
        intent="hero"
        className="min-w-[220px]"
      >
        {pending
          ? statusText || 'מתחיל הרכבה…'
          : allClipsReady
            ? '🎞️ הרכב סרטון סופי (1 קרדיט)'
            : 'צור קליפים לכל הסצנות קודם'}
      </Button>
      {jobId && pending && (
        <div className="text-xs text-fg-tertiary">
          ID: <span className="font-mono">{jobId.slice(0, 8)}</span>
          {' — '}אעבור לספרייה אוטומטית כשיסתיים
        </div>
      )}
      {error && (
        <div className="text-xs text-destructive-soft bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 max-w-md">
          {error}
        </div>
      )}
      <div className="text-[11px] text-fg-tertiary">
        קרדיטים: <span className="font-mono font-semibold text-fg">{creditsBalance}</span>
      </div>
    </div>
  );
}

function progressLabel(status: string | undefined, percent: number | undefined): string {
  switch (status) {
    case 'pending':
      return 'בתור…';
    case 'extracting_assets':
      return 'אוסף נכסים…';
    case 'composing_video':
      return `מרכיב סרטון… ${percent ?? 50}%`;
    case 'uploading_final':
      return 'מעלה לפלט…';
    case 'completed':
      return 'הושלם — מעביר לספרייה…';
    default:
      return `מרכיב… ${percent ?? 0}%`;
  }
}
