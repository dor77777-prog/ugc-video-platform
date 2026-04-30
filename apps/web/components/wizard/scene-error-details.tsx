'use client';

// Scene error details panel — V13 PR7.3.
//
// Renders the curated Hebrew error message from PR5's map alongside the
// stage tag, raw error in <details>, and action buttons (retry / skip
// — the actual handlers are passed in by the wizard, this component is
// purely presentational).
//
// Client component because the action buttons are interactive. The
// data props (lastErrorCode / lastErrorMessage) come from the
// server-fetched Scene row.

import { cn } from '@/lib/utils';
import {
  getSceneErrorMessage,
} from '@/lib/errors/scene-error-messages';

interface SceneErrorDetailsProps {
  /** From Scene.lastErrorCode — `<stage>.<reason>` shape. */
  errorCode: string;
  /** From Scene.lastErrorMessage — raw provider error for <details>. */
  errorMessage?: string | null;
  /** Optional handler for the "נסה שוב" button. When omitted, the
   *  retry button is hidden — useful for terminal needs_review states
   *  where retrying without action won't help. */
  onRetry?: () => void;
  /** Optional handler for "דלג על סצנה זו". */
  onSkip?: () => void;
  /** Optional href to /admin/scenes/[id]/debug — only rendered when
   *  the wizard caller is an admin. */
  debugHref?: string;
  className?: string;
}

function deriveStage(code: string): string {
  // <stage>.<reason> — return the stage portion for the small label.
  const dot = code.indexOf('.');
  return dot > 0 ? code.slice(0, dot) : code;
}

export function SceneErrorDetails({
  errorCode,
  errorMessage,
  onRetry,
  onSkip,
  debugHref,
  className,
}: SceneErrorDetailsProps) {
  const entry = getSceneErrorMessage(errorCode, errorMessage ?? undefined);
  const stage = deriveStage(errorCode);

  return (
    <div
      dir="rtl"
      className={cn(
        'space-y-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-zinc-800',
        className,
      )}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-medium leading-snug">{entry.hebrew}</p>
          <p className="text-xs text-zinc-500">
            שלב: <span className="font-mono">{stage}</span>
          </p>
        </div>
      </div>

      {entry.retryHint && !entry.needsUserEdit && (
        <p className="text-xs text-zinc-600">{entry.retryHint}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {onRetry && !entry.needsUserEdit && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            נסה שוב
          </button>
        )}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
          >
            דלג על סצנה זו
          </button>
        )}
        {debugHref && (
          <a
            href={debugHref}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
          >
            צפה ב-debug
          </a>
        )}
      </div>

      {(errorMessage || entry.isFallback) && (
        <details className="text-xs text-zinc-600">
          <summary className="cursor-pointer select-none">פרטי שגיאה</summary>
          <div className="mt-2 space-y-1">
            <p>
              קוד: <span className="font-mono">{errorCode}</span>
            </p>
            {errorMessage && (
              <pre dir="ltr" className="whitespace-pre-wrap break-words rounded bg-zinc-100 p-2 font-mono text-[11px]">
                {errorMessage}
              </pre>
            )}
            {entry.isFallback && (
              <p className="text-amber-700">
                קוד לא מתועד — אם זה חוזר, דווח על תקלה ונוסיף אותו למפת השגיאות.
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
