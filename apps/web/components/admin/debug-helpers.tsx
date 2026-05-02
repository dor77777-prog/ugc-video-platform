// V27.11 — shared admin debug primitives. Extracted from
// /admin/scenes/[id]/debug so the new project + apicall + concept
// debug pages can reuse them.

import { Card, CardContent } from '@/components/ui/card';

/** V27.11 — rich metadata for each debug section so an admin can
 *  understand exactly what the section represents, when its data
 *  was built, and which code wrote it.
 *
 *  Surfaced as a collapsible "ℹ הסבר" panel under the section title.
 *  Optional — sections without `info` render exactly like before. */
export interface SectionInfo {
  /** One-line explanation of what this section represents. */
  whatItIs: string;
  /** Pipeline stage label, e.g. "שלב 1 — URL extract", "שלב 4 — concept_interactive phase 1". */
  pipelineStage?: string;
  /** Files / functions that read or write this data. Helps when
   *  jumping into the codebase. */
  sourceFiles?: string[];
  /** Env vars that affect this section's behavior. */
  envVars?: string[];
  /** When this data is updated — e.g. "on URL extract submit",
   *  "on every concept-gen call", "after expansion". */
  updatedWhen?: string;
  /** Common failure modes / interpretation tips. */
  notes?: string[];
}

export function DebugSection({
  title,
  children,
  hidden,
  description,
  info,
}: {
  title: string;
  children: React.ReactNode;
  hidden?: boolean;
  description?: string;
  info?: SectionInfo;
}) {
  if (hidden) return null;
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-zinc-700">{title}</h2>
          {description && (
            <p className="text-xs text-zinc-500">{description}</p>
          )}
          {info && <SectionInfoPanel info={info} />}
        </div>
        <div className="text-sm">{children}</div>
      </CardContent>
    </Card>
  );
}

function SectionInfoPanel({ info }: { info: SectionInfo }) {
  return (
    <details className="rounded border border-blue-200 bg-blue-50/50 p-2 text-xs">
      <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wide text-blue-800">
        ℹ הסבר על המקטע
      </summary>
      <div className="mt-2 space-y-2 text-blue-900">
        <p>
          <strong>מה זה: </strong>
          {info.whatItIs}
        </p>
        {info.pipelineStage && (
          <p>
            <strong>שלב ב-pipeline: </strong>
            {info.pipelineStage}
          </p>
        )}
        {info.updatedWhen && (
          <p>
            <strong>נכתב מחדש: </strong>
            {info.updatedWhen}
          </p>
        )}
        {info.sourceFiles && info.sourceFiles.length > 0 && (
          <div>
            <strong>קוד אחראי:</strong>
            <ul className="mt-1 list-disc pr-5 font-mono text-[10px]">
              {info.sourceFiles.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        {info.envVars && info.envVars.length > 0 && (
          <div>
            <strong>Env vars רלוונטיים:</strong>{' '}
            <span className="font-mono text-[10px]">
              {info.envVars.join(', ')}
            </span>
          </div>
        )}
        {info.notes && info.notes.length > 0 && (
          <div>
            <strong>הערות לקריאה:</strong>
            <ul className="mt-1 list-disc pr-5">
              {info.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

export function KeyValueGrid({
  rows,
}: {
  rows: ReadonlyArray<readonly [string, React.ReactNode]>;
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm md:grid-cols-2">
      {rows.map(([k, v], i) => (
        <div key={`${k}-${i}`} className="flex items-baseline gap-2">
          <dt className="shrink-0 font-mono text-xs text-zinc-500">{k}</dt>
          <dd className="break-all text-zinc-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PrettyJson({
  value,
  maxHeight,
}: {
  value: unknown;
  maxHeight?: string;
}) {
  if (value == null) {
    return <p className="text-xs text-zinc-500">— אין נתון —</p>;
  }
  return (
    <pre
      dir="ltr"
      className={`overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-50 p-3 font-mono text-[11px] text-zinc-700 ${
        maxHeight ?? 'max-h-96'
      }`}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function CodeBlock({
  value,
  maxHeight,
  dir,
}: {
  value: string | null | undefined;
  maxHeight?: string;
  dir?: 'rtl' | 'ltr';
}) {
  if (!value) {
    return <p className="text-xs text-zinc-500">— אין נתון —</p>;
  }
  return (
    <pre
      dir={dir ?? 'ltr'}
      className={`overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-50 p-3 font-mono text-[11px] text-zinc-700 ${
        maxHeight ?? 'max-h-96'
      }`}
    >
      {value}
    </pre>
  );
}

export function StatusPill({
  variant,
  children,
}: {
  variant: 'success' | 'error' | 'pending' | 'neutral';
  children: React.ReactNode;
}) {
  const cls =
    variant === 'success'
      ? 'bg-green-100 text-green-800 border-green-200'
      : variant === 'error'
        ? 'bg-red-100 text-red-800 border-red-200'
        : variant === 'pending'
          ? 'bg-amber-100 text-amber-800 border-amber-200'
          : 'bg-zinc-100 text-zinc-700 border-zinc-200';
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-mono ${cls}`}
    >
      {children}
    </span>
  );
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function fmtUSD(usd: number | null | undefined): string {
  if (usd == null) return '—';
  if (usd < 0.01) return `$${(usd * 1000).toFixed(2)}m`; // millicents for cheap calls
  return `$${usd.toFixed(4)}`;
}

export function fmtRelative(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
