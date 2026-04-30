'use client';

// Wizard warnings panel — V13 PR7.4.
//
// Collapsible "אזהרות (N)" panel that sits above the scene grid and
// surfaces non-fatal issues the user should know about: weak scrape
// description, low audience-confidence, mirror-risk scenes, hands-
// physics-required scenes, image-gen safety auto-rewrites, manual
// needs_review flags, etc.
//
// The component is purely presentational — the page that mounts it
// computes the warnings from the project + scenes data (server-side)
// and passes the array in. Empty array = panel hidden.

import { useState } from 'react';
import { cn } from '@/lib/utils';

export type WizardWarningSeverity = 'info' | 'warn';

export interface WizardWarning {
  /** Stable id so React can key the row across re-renders. */
  id: string;
  /** Hebrew human-readable warning text. */
  message: string;
  /** Optional scene number (1-based) the warning applies to. When set,
   *  the row gets a "סצנה N" prefix. */
  sceneNumber?: number;
  /** Severity drives the color chip. Defaults to 'warn'. */
  severity?: WizardWarningSeverity;
}

interface WizardWarningsPanelProps {
  warnings: readonly WizardWarning[];
  className?: string;
  /** When true the panel starts open; otherwise it's collapsed and
   *  reveals only the count badge until clicked. */
  defaultOpen?: boolean;
}

function severityChipClass(s: WizardWarningSeverity): string {
  if (s === 'info') return 'bg-blue-50 text-blue-700 ring-blue-200';
  return 'bg-amber-50 text-amber-700 ring-amber-200';
}

export function WizardWarningsPanel({
  warnings,
  className,
  defaultOpen = false,
}: WizardWarningsPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (warnings.length === 0) return null;

  return (
    <section
      dir="rtl"
      className={cn(
        'overflow-hidden rounded-md border border-amber-200 bg-amber-50/60 text-sm text-zinc-800',
        className,
      )}
      aria-label="אזהרות"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-right hover:bg-amber-50"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-medium">
          <span className="text-amber-700">⚠️</span>
          <span>אזהרות ({warnings.length})</span>
        </span>
        <span className="text-xs text-zinc-500">{open ? 'הסתר' : 'הצג'}</span>
      </button>
      {open && (
        <ul className="space-y-1.5 border-t border-amber-200 bg-white p-3">
          {warnings.map((w) => (
            <li
              key={w.id}
              className="flex items-start gap-2 text-sm leading-snug text-zinc-800"
            >
              <span
                className={cn(
                  'mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1',
                  severityChipClass(w.severity ?? 'warn'),
                )}
              >
                {w.severity === 'info' ? 'מידע' : 'אזהרה'}
              </span>
              <span className="flex-1">
                {typeof w.sceneNumber === 'number' && (
                  <span className="ml-1 font-medium text-zinc-600">
                    סצנה {w.sceneNumber}:
                  </span>
                )}
                <span>{w.message}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
