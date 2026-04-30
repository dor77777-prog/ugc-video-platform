'use client';

// V13.2 — recent-calls table with polling + filters.
//
// Polls /api/admin/costs/recent-calls every 8s by default. Shows last
// updated, manual refresh, provider/operation/status/date filters,
// and an expandable row that opts in to ?expand=metadata for the raw
// provider payload.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const REFRESH_INTERVAL_MS = 8000;

const PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  kling: 'Kling',
  pixverse: 'PixVerse',
  ffmpeg: 'ffmpeg',
};
const OPERATION_LABEL: Record<string, string> = {
  script_gen: 'יצירת תסריט',
  image_gen: 'תמונת סצנה',
  tts: 'קריינות (TTS)',
  motion_analysis: 'ניתוח תנועה',
  i2v: 'אנימציה',
  lipsync: 'סנכרון שפתיים',
  pixverse_media_upload: 'העלאת מדיה PixVerse',
  mux: 'Mux אודיו',
  compose: 'הרכבה סופית',
};

type Row = {
  id: string;
  provider: string;
  operation: string;
  model: string | null;
  status: string;
  success: boolean;
  costUsd: number;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  units: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  userId: string | null;
  projectId: string | null;
  renderJobId: string | null;
  sceneId: string | null;
  user: { email: string } | null;
  metadata?: Record<string, unknown>;
};

interface Props {
  initial: Row[];
}

export function RecentCallsTable({ initial }: Props) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [provider, setProvider] = useState<string>('');
  const [operation, setOperation] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [since, setSince] = useState<string>('');
  const [until, setUntil] = useState<string>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('limit', '50');
    if (provider) sp.set('provider', provider);
    if (operation) sp.set('operation', operation);
    if (status) sp.set('status', status);
    if (since) sp.set('since', new Date(since).toISOString());
    if (until) sp.set('until', new Date(until).toISOString());
    return sp.toString();
  }, [provider, operation, status, since, until]);

  const refresh = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/costs/recent-calls?${queryString}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRows(json.rows as Row[]);
      setLastUpdated(new Date());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }, [queryString]);

  // Re-fetch when filters change.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Polling. Pause when document is hidden — saves DB queries when the
  // admin tab is in the background.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const toggleExpand = async (rowId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
    // If we don't have metadata for this row, lazy-fetch with expand=metadata.
    const row = rows.find((r) => r.id === rowId);
    if (row && !('metadata' in row)) {
      const sp = new URLSearchParams(queryString);
      sp.set('expand', 'metadata');
      const res = await fetch(`/api/admin/costs/recent-calls?${sp.toString()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        setRows(json.rows as Row[]);
      }
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          50 קריאות אחרונות (live)
        </h2>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>עודכן: {lastUpdated.toLocaleTimeString('he-IL')}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={pending}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
          >
            {pending ? '…' : '↻ רענן'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1"
        >
          <option value="">כל הספקים</option>
          <option value="openai">OpenAI</option>
          <option value="elevenlabs">ElevenLabs</option>
          <option value="kling">Kling</option>
          <option value="pixverse">PixVerse</option>
          <option value="ffmpeg">ffmpeg</option>
        </select>
        <select
          value={operation}
          onChange={(e) => setOperation(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1"
        >
          <option value="">כל הפעולות</option>
          <option value="script_gen">script_gen</option>
          <option value="image_gen">image_gen</option>
          <option value="tts">tts</option>
          <option value="motion_analysis">motion_analysis</option>
          <option value="i2v">i2v</option>
          <option value="lipsync">lipsync</option>
          <option value="mux">mux</option>
          <option value="compose">compose</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1"
        >
          <option value="">כל הסטטוסים</option>
          <option value="success">success</option>
          <option value="failed">failed</option>
          <option value="in_progress">in_progress</option>
        </select>
        <input
          type="date"
          value={since}
          onChange={(e) => setSince(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1"
          dir="ltr"
          placeholder="from"
        />
        <input
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1"
          dir="ltr"
          placeholder="to"
        />
        {(provider || operation || status || since || until) && (
          <button
            type="button"
            onClick={() => {
              setProvider('');
              setOperation('');
              setStatus('');
              setSince('');
              setUntil('');
            }}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
          >
            ✕ נקה סינון
          </button>
        )}
      </div>

      {error && (
        <div className="text-xs text-destructive mb-2 border border-destructive/30 bg-destructive/5 rounded p-2">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>זמן</TableHead>
                <TableHead>ספק</TableHead>
                <TableHead>פעולה</TableHead>
                <TableHead>מודל</TableHead>
                <TableHead>יחידות</TableHead>
                <TableHead>משך</TableHead>
                <TableHead>עלות</TableHead>
                <TableHead>משתמש</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <RowFragment
                  key={c.id}
                  row={c}
                  expanded={expanded.has(c.id)}
                  onToggle={() => void toggleExpand(c.id)}
                />
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    אין קריאות תואמות לסינון.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function RowFragment({
  row,
  expanded,
  onToggle,
}: {
  row: Row;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isInflight = row.status === 'in_progress';
  return (
    <>
      <TableRow>
        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(row.createdAt).toLocaleString('he-IL', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </TableCell>
        <TableCell>
          <Badge variant="outline">{PROVIDER_LABEL[row.provider] ?? row.provider}</Badge>
        </TableCell>
        <TableCell className="text-sm">
          {OPERATION_LABEL[row.operation] ?? row.operation}
        </TableCell>
        <TableCell className="font-mono text-xs" dir="ltr">
          {row.model ?? '—'}
        </TableCell>
        <TableCell className="font-mono text-xs whitespace-nowrap">
          {formatUnits(row)}
        </TableCell>
        <TableCell className="font-mono text-xs">
          {row.durationMs != null ? `${(row.durationMs / 1000).toFixed(1)}s` : '—'}
        </TableCell>
        <TableCell className="font-mono">{fmtUSD(row.costUsd)}</TableCell>
        <TableCell dir="ltr" className="text-xs text-muted-foreground">
          {row.user?.email ?? '—'}
        </TableCell>
        <TableCell>
          {isInflight ? (
            <Badge variant="default">…running</Badge>
          ) : row.success ? (
            <Badge variant="success">OK</Badge>
          ) : (
            <Badge variant="destructive" title={row.errorMessage ?? undefined}>
              fail
            </Badge>
          )}
        </TableCell>
        <TableCell>
          <button
            type="button"
            onClick={onToggle}
            className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted"
          >
            {expanded ? '−' : '+'}
          </button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={10} className="bg-muted/30">
            <div className="text-[11px] space-y-1 p-2">
              <div>
                <strong>id:</strong> <span className="font-mono" dir="ltr">{row.id}</span>
              </div>
              {row.estimatedCostUsd != null && (
                <div>
                  <strong>estimated:</strong> {fmtUSD(row.estimatedCostUsd)} ·{' '}
                  <strong>actual:</strong>{' '}
                  {row.actualCostUsd != null ? fmtUSD(row.actualCostUsd) : '—'}
                </div>
              )}
              {row.errorMessage && (
                <div className="text-destructive break-all" dir="ltr">
                  {row.errorMessage}
                </div>
              )}
              {row.metadata && (
                <pre
                  className="text-[10px] bg-background border border-border rounded p-2 overflow-x-auto"
                  dir="ltr"
                >
                  {JSON.stringify(row.metadata, null, 2)}
                </pre>
              )}
              {row.sceneId && (
                <div>
                  <a
                    href={`/admin/scenes/${row.sceneId}/debug`}
                    className="text-primary underline"
                    dir="ltr"
                  >
                    → /admin/scenes/{row.sceneId.slice(-8)}/debug
                  </a>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function fmtUSD(v: number | null | undefined): string {
  if (v == null || v === 0) return '$0.00';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

function formatUnits(row: Row): string {
  if (row.provider === 'openai' && row.operation === 'script_gen') {
    if (row.inputTokens != null || row.outputTokens != null) {
      return `${row.inputTokens ?? 0} → ${row.outputTokens ?? 0} tok`;
    }
  }
  if (row.provider === 'openai' && row.operation === 'image_gen') {
    return row.units ? `${row.units} img` : '1 img';
  }
  if (row.provider === 'elevenlabs' && row.units) return `${row.units} chars`;
  if (row.provider === 'kling' && row.units) return `${row.units} task`;
  if (row.inputTokens != null || row.outputTokens != null) {
    return `${row.inputTokens ?? 0} / ${row.outputTokens ?? 0}`;
  }
  return row.units != null ? String(row.units) : '—';
}
