'use client';

// Scene log viewer — V13 PR7.4.
//
// Modal/inline timeline that renders the buffered log entries persisted
// to Scene.generationLogJson by PR7.2 (`flushSceneLogBuffer`). Reverse-
// chronological so the latest events lead — that's what the user
// actually wants to see when troubleshooting "why did this scene
// fail?".
//
// Shape of input matches the SceneLogEntry shape from lib/logging/log.
// Stage tag → Hebrew label table covers every stage emitted by PR4.2 /
// PR4.3. Unknown stages fall through to the raw tag.
//
// Client component because the entry rows expand/collapse their data
// blob locally — purely UI state, no fetch.

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface SceneLogEntry {
  stage: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: Record<string, unknown>;
  ts: string;
}

interface SceneLogViewerProps {
  entries: readonly SceneLogEntry[] | SceneLogEntry[] | null;
  className?: string;
  /** Render in compact mode — used inline in the wizard scene card.
   *  Off by default (full timeline). */
  compact?: boolean;
}

const STAGE_HEBREW: Record<string, string> = {
  scrape: 'סקרייפר',
  intelligence: 'תובנות מוצר',
  script: 'סקריפטים',
  'scene-plan': 'תוכנית סצנה',
  'image-brief': 'brief לתמונה',
  'image-gen': 'יצירת תמונה',
  voice: 'קול',
  'motion-analysis': 'ניתוח תנועה',
  'animation-plan': 'תוכנית אנימציה',
  kling: 'Kling',
  'face-gate': 'בדיקת פנים',
  pixverse: 'PixVerse',
  render: 'render',
  clip: 'קליפ',
};

const LEVEL_HEBREW: Record<SceneLogEntry['level'], string> = {
  debug: 'debug',
  info: 'מידע',
  warn: 'אזהרה',
  error: 'שגיאה',
};

function levelChipClass(level: SceneLogEntry['level']): string {
  switch (level) {
    case 'error':
      return 'bg-red-100 text-red-800 ring-red-200';
    case 'warn':
      return 'bg-amber-100 text-amber-800 ring-amber-200';
    case 'info':
      return 'bg-blue-50 text-blue-700 ring-blue-200';
    case 'debug':
    default:
      return 'bg-zinc-100 text-zinc-600 ring-zinc-200';
  }
}

function formatTs(ts: string): string {
  // Best-effort: accept either ISO or epoch-millis-string.
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString('he-IL', { hour12: false });
}

export function SceneLogViewer({ entries, className, compact = false }: SceneLogViewerProps) {
  const reversed = useMemo(() => {
    if (!entries || entries.length === 0) return [] as SceneLogEntry[];
    return [...entries].reverse();
  }, [entries]);

  if (reversed.length === 0) {
    return (
      <div
        dir="rtl"
        className={cn(
          'rounded-md bg-zinc-50 p-3 text-sm text-zinc-500',
          className,
        )}
      >
        עדיין אין רשומות לוג עבור הסצנה הזו.
      </div>
    );
  }

  return (
    <ol
      dir="rtl"
      className={cn(
        'space-y-2 text-sm text-zinc-800',
        compact ? 'max-h-72 overflow-y-auto' : '',
        className,
      )}
    >
      {reversed.map((e, idx) => (
        <SceneLogRow key={`${e.ts}-${idx}`} entry={e} />
      ))}
    </ol>
  );
}

function SceneLogRow({ entry }: { entry: SceneLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const stageLabel = STAGE_HEBREW[entry.stage] ?? entry.stage;
  const hasData = entry.data && Object.keys(entry.data).length > 0;

  return (
    <li className="rounded-md bg-white p-2.5 ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span className="font-mono text-[11px]">{formatTs(entry.ts)}</span>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700">
          {entry.stage}
        </span>
        <span className="text-zinc-400">·</span>
        <span>{stageLabel}</span>
        <span className="text-zinc-400">·</span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[11px] font-medium ring-1',
            levelChipClass(entry.level),
          )}
        >
          {LEVEL_HEBREW[entry.level]}
        </span>
      </div>
      <p className="mt-1 leading-snug">{entry.message}</p>
      {hasData && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-blue-700 hover:underline"
          >
            {expanded ? 'הסתר נתונים' : 'הצג נתונים'}
          </button>
          {expanded && (
            <pre
              dir="ltr"
              className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-50 p-2 font-mono text-[11px] text-zinc-700"
            >
              {JSON.stringify(entry.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
