'use client';

// V13.2 — KPI summary tiles with polling.
//
// Polls /api/admin/costs/summary every 20s (server-side cache TTL is
// 15s, so we never hammer the DB). Falls back to the SSR-rendered
// initial values if a fetch fails.

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface SummaryData {
  today: { sum: number; count: number };
  week: { sum: number; count: number };
  month: { sum: number; count: number };
  allTime: { sum: number; count: number };
  failedToday: number;
  fetchedAt: string;
}

const REFRESH_MS = 20_000;

export function SummaryKpis({ initial }: { initial: SummaryData }) {
  const [data, setData] = useState<SummaryData>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/costs/summary', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SummaryData;
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="היום"
          value={fmtUSD(data.today.sum)}
          sublabel={`${data.today.count} קריאות`}
        />
        <Kpi
          label="7 ימים אחרונים"
          value={fmtUSD(data.week.sum)}
          sublabel={`${data.week.count} קריאות`}
        />
        <Kpi
          label="30 ימים אחרונים"
          value={fmtUSD(data.month.sum)}
          sublabel={`${data.month.count} קריאות`}
        />
        <Kpi
          label="סך הכל"
          value={fmtUSD(data.allTime.sum)}
          sublabel={`${data.allTime.count} קריאות`}
          accent
        />
      </div>
      <div className="text-[10px] text-muted-foreground flex items-center gap-2 justify-end">
        <span>עודכן: {new Date(data.fetchedAt).toLocaleTimeString('he-IL')}</span>
        {error && <span className="text-destructive">· {error}</span>}
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={pending}
          className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted disabled:opacity-50"
        >
          {pending ? '…' : '↻'}
        </button>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? 'bg-ai/15 border-ai/40' : undefined}>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-3xl font-bold font-mono mt-1">{value}</div>
        {sublabel && <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>}
      </CardContent>
    </Card>
  );
}

function fmtUSD(v: number | null | undefined): string {
  if (v == null || v === 0) return '$0.00';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}
