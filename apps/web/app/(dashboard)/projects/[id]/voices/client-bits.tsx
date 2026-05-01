'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress-bar';
import { AudioPreview } from '@/components/ui/audio-preview';
import { isPageVisible } from '@/lib/utils/visibility';

// V26.19 — voice step. VoicePicker stays in /videos/voice-picker.tsx
// (single source of truth) and we lazy-import here so the 312-line
// catalog JS only loads when the user actually opens the picker.
export const VoicePicker = dynamic(
  () => import('../videos/voice-picker').then((m) => ({ default: m.VoicePicker })),
  {
    ssr: false,
    loading: () => (
      <div className="text-xs text-muted-foreground p-3">טוען בורר קולות…</div>
    ),
  },
);

const VOICE_IN_FLIGHT_TTL_MS = 90 * 1000;

function isFresh(at: string | null, ttlMs: number): boolean {
  if (!at) return false;
  return Date.now() - new Date(at).getTime() < ttlMs;
}

interface SceneInfo {
  id: string;
  sceneOrder: number;
  hasVoice: boolean;
}

// V26.19 — top-of-page batch button. Fires /api/scenes/[id]/voice for
// every scene that lacks voiceUrl. Voice is independent of image, so
// this can run anytime after step 5 (scenes/images) is done.
export function GenerateAllVoicesButton({
  scenes,
  creditsBalance,
  voiceSelected,
}: {
  scenes: SceneInfo[];
  creditsBalance: number;
  voiceSelected: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number }>({
    done: 0,
    total: 0,
    failed: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const queue = scenes.filter((s) => !s.hasVoice);
  if (queue.length === 0) return null;

  const cost = queue.length;
  const canRun = voiceSelected && creditsBalance >= cost && !pending;

  const run = async () => {
    if (!canRun) return;
    setError(null);
    setProgress({ done: 0, total: queue.length, failed: 0 });
    setPending(true);

    try {
      let done = 0;
      let failed = 0;

      // Voice gen is fast (~5-15s per scene) and ElevenLabs handles
      // parallel calls fine — fire all at once, await Promise.all.
      const results = await Promise.all(
        queue.map((s) =>
          fetch(`/api/scenes/${s.id}/voice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
            .then((r) => r.json())
            .catch((err) => ({ success: false, error: (err as Error).message }))
            .then((body) => {
              if (body && body.success) done++;
              else {
                failed++;
                if (body?.error) setError(body.error);
              }
              setProgress({ done, total: queue.length, failed });
            }),
        ),
      );
      void results;
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  const headline = pending ? 'יוצר קריינות לכל הסצנות…' : 'צור קריינות לכל הסצנות בלחיצה אחת';
  const subline = pending
    ? `${progress.done + progress.failed} מתוך ${progress.total}${progress.failed > 0 ? ` (${progress.failed} נכשלו)` : ''}`
    : voiceSelected
      ? `${queue.length} סצנות חסרות קריינות. ${cost} קרדיטים. (יש לך ${creditsBalance})`
      : '⚠ בחר קול בראש העמוד לפני יצירת קריינות.';

  return (
    <Card className="tier-elevated border-primary/40 bg-primary/[0.04] glow-primary">
      <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
        <div className="space-y-2 flex-1">
          <div className="text-base font-semibold">{headline}</div>
          <div className="text-xs text-muted-foreground">{subline}</div>
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
        <Button onClick={run} disabled={!canRun} size="lg" className="glow-primary">
          {pending ? 'מייצר…' : `🎙 צור ${queue.length} קריינויות`}
        </Button>
      </CardContent>
    </Card>
  );
}

interface SceneVoiceCardProps {
  sceneId: string;
  sceneOrder: number;
  totalScenes: number;
  textHebrew: string;
  voiceUrl: string | null;
  voiceDurationSeconds: number | null;
  voiceGenerationCount: number;
  voiceInFlightAt: string | null;
  voiceSelected: boolean;
}

// V26.19 — per-scene voice card. Mirrors the voice section that used
// to live inside SceneCard on /scenes, but standalone now.
export function SceneVoiceCard(props: SceneVoiceCardProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveVoiceUrl, setLiveVoiceUrl] = useState<string | null>(null);
  const effectiveUrl = liveVoiceUrl ?? props.voiceUrl;
  const hasVoice = !!effectiveUrl;
  const inFlightServer = isFresh(props.voiceInFlightAt, VOICE_IN_FLIGHT_TTL_MS);
  const showWorking = pending || inFlightServer;

  const handleRegenerate = useCallback(async () => {
    if (pending || !props.voiceSelected) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/scenes/${props.sceneId}/voice`, {
        method: 'POST',
      });
      const body = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; voiceUrl?: string | null }
        | null;
      if (!body) {
        setError('יצירת הקול נכשלה: תגובה לא תקינה מהשרת');
        return;
      }
      if (body.success) {
        if (body.voiceUrl) setLiveVoiceUrl(body.voiceUrl);
        router.refresh();
      } else {
        setError(body.error ?? 'יצירת הקול נכשלה');
      }
    } catch (err) {
      setError(`שגיאה: ${(err as Error).message}`);
    } finally {
      setPending(false);
    }
  }, [pending, props.voiceSelected, props.sceneId, router]);

  const sceneIdRef = useRef(props.sceneId);
  const initialUrlRef = useRef(props.voiceUrl);
  useEffect(() => {
    if (!inFlightServer) return;
    const baselineUrl = initialUrlRef.current;
    const id = setInterval(async () => {
      if (!isPageVisible()) return;
      try {
        const res = await fetch(`/api/scenes/${sceneIdRef.current}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          voiceUrl: string | null;
          voiceInFlightAt: string | null;
        };
        if (json.voiceUrl && json.voiceUrl !== baselineUrl) {
          setLiveVoiceUrl(json.voiceUrl);
          initialUrlRef.current = json.voiceUrl;
          clearInterval(id);
          router.refresh();
        } else if (!json.voiceInFlightAt) {
          clearInterval(id);
          router.refresh();
        }
      } catch {
        /* keep trying */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [inFlightServer, router]);

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <Badge variant={hasVoice ? 'success' : 'outline'}>
            סצנה {props.sceneOrder + 1}/{props.totalScenes}
          </Badge>
          {props.voiceGenerationCount > 0 && !showWorking && (
            <span className="text-[10px] text-muted-foreground">
              {props.voiceGenerationCount} ניסיונות
            </span>
          )}
        </div>

        <div className="text-xs text-muted-foreground leading-relaxed">
          {props.textHebrew}
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">קריינות:</span>
            {showWorking ? (
              <span className="flex items-center gap-1 text-primary">
                <span className="animate-pulse">🎙</span>
                <span>יוצר…</span>
              </span>
            ) : hasVoice ? (
              <span className="text-emerald-600 dark:text-emerald-400">✓ נוצרה</span>
            ) : !props.voiceSelected ? (
              <span className="text-amber-600 dark:text-amber-400">
                ⚠ בחר קול בראש העמוד
              </span>
            ) : (
              <span className="text-muted-foreground">לא נוצרה</span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant={hasVoice ? 'outline' : 'default'}
            disabled={showWorking || !props.voiceSelected}
            onClick={handleRegenerate}
          >
            {showWorking
              ? 'יוצר…'
              : hasVoice
                ? '↻ צור מחדש (1 קרדיט)'
                : '🎙 צור קול (1 קרדיט)'}
          </Button>
        </div>

        {hasVoice && (
          <AudioPreview
            src={effectiveUrl!}
            durationSeconds={props.voiceDurationSeconds}
          />
        )}

        {error && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
