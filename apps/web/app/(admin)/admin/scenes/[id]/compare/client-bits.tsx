'use client';

// Client UI for the admin compare page. Holds the still preview + the
// "generate 3 variants" button + a 3-column grid showing each video
// once it lands. Polls nothing — the API call is a single long-lived
// request that resolves when all 3 engines have finished (or failed).

import { useState } from 'react';

type Engine = 'kling-omni-v3' | 'kling-video-o1' | 'grok';

interface Variant {
  engine: Engine;
  model: string;
  status: 'completed' | 'failed';
  videoUrl?: string;
  durationMs: number;
  errorMessage?: string;
  promptPositive: string;
  promptNegative: string;
  cfgScale?: number;
}

interface CompareResponse {
  sceneId: string;
  totalDurationMs: number;
  plan: {
    animationGoal: string;
    motionSubject: string;
    cameraMotion: string;
    narrativeRole: string | null;
    emotionalTone: string | null;
  };
  variants: Variant[];
}

const ENGINE_LABEL: Record<Engine, string> = {
  'kling-omni-v3': 'Kling Omni v3',
  'kling-video-o1': 'Kling video-o1',
  grok: 'Grok Imagine',
};

const ENGINE_BADGE_CLASS: Record<Engine, string> = {
  'kling-omni-v3': 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  'kling-video-o1': 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  grok: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
};

export function CompareClient({
  sceneId,
  imageUrl,
  textHebrew,
}: {
  sceneId: string;
  imageUrl: string;
  textHebrew: string;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/scenes/${sceneId}/animate-compare`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as CompareResponse;
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Source still + run button */}
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Source still"
            className="w-full aspect-[9/16] object-cover bg-muted"
          />
          <div className="p-3 text-xs text-muted-foreground">תמונת מקור (Still)</div>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              טקסט הסצנה
            </div>
            <p className="text-sm leading-6">{textHebrew || '—'}</p>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending
              ? '⏳ מנפיש ב-3 מנועים במקביל… (2-10 דקות)'
              : '🎬 הנפש ב-3 מנועים והשווה'}
          </button>
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}
          {result && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">משך כולל:</span>{' '}
                <span className="font-mono">{(result.totalDurationMs / 1000).toFixed(1)}s</span>
              </div>
              <div>
                <span className="text-muted-foreground">Animation goal:</span>{' '}
                {result.plan.animationGoal}
              </div>
              <div>
                <span className="text-muted-foreground">Motion subject:</span>{' '}
                {result.plan.motionSubject}{' '}
                <span className="text-muted-foreground">· camera:</span>{' '}
                {result.plan.cameraMotion}
              </div>
              {result.plan.narrativeRole && (
                <div>
                  <span className="text-muted-foreground">Narrative:</span>{' '}
                  {result.plan.narrativeRole}
                  {result.plan.emotionalTone ? ` · ${result.plan.emotionalTone}` : ''}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Variants grid */}
      {result && (
        <div className="grid gap-4 md:grid-cols-3">
          {result.variants.map((v) => (
            <VariantCard key={v.engine} variant={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function VariantCard({ variant }: { variant: Variant }) {
  const [showPrompt, setShowPrompt] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span
          className={`text-[11px] font-medium px-2 py-0.5 rounded ${ENGINE_BADGE_CLASS[variant.engine]}`}
        >
          {ENGINE_LABEL[variant.engine]}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {(variant.durationMs / 1000).toFixed(1)}s
        </span>
      </div>
      {variant.status === 'completed' && variant.videoUrl ? (
        <video
          src={variant.videoUrl}
          controls
          loop
          playsInline
          className="w-full aspect-[9/16] bg-muted"
        />
      ) : (
        <div className="aspect-[9/16] bg-destructive/10 flex items-center justify-center p-4 text-xs text-destructive text-center">
          {variant.errorMessage ?? 'נכשל'}
        </div>
      )}
      <div className="p-2 space-y-1.5">
        <div className="text-[10px] text-muted-foreground font-mono">{variant.model}</div>
        {variant.cfgScale != null && (
          <div className="text-[10px] text-muted-foreground">
            cfg_scale: <span className="font-mono">{variant.cfgScale}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowPrompt((s) => !s)}
          className="text-[10px] text-primary hover:underline"
        >
          {showPrompt ? 'הסתר prompt' : 'הצג prompt'}
        </button>
        {showPrompt && (
          <div className="space-y-1.5 pt-1.5 border-t border-border">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                Positive
              </div>
              <pre className="text-[10px] whitespace-pre-wrap break-words bg-muted/60 rounded p-1.5 max-h-40 overflow-auto">
                {variant.promptPositive}
              </pre>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                Negative
              </div>
              <pre className="text-[10px] whitespace-pre-wrap break-words bg-muted/60 rounded p-1.5 max-h-32 overflow-auto">
                {variant.promptNegative || '—'}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
