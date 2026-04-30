'use client';

// V13.2 — in-flight section now polls /api/admin/costs/in-flight
// directly every 4s instead of full-page router.refresh(). The
// summary/recent-calls components have their own polling cadence,
// so a 4s tick here only re-runs the small in-flight query (covered
// by the (status, createdAt) composite index).

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import { cancelApiCallAction, cancelAllStaleInProgressAction } from './actions';

const PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  kling: 'Kling',
  ffmpeg: 'ffmpeg',
};
const OPERATION_LABEL: Record<string, string> = {
  script_gen: 'יצירת תסריט',
  image_gen: 'תמונת סצנה',
  tts: 'קריינות (TTS)',
  i2v: 'אנימציה (Kling i2v)',
  lipsync: 'סנכרון שפתיים (Kling)',
  mux: 'מיסוך אודיו (ffmpeg)',
};

export interface InFlightRow {
  id: string;
  provider: string;
  operation: string;
  model: string | null;
  createdAt: Date;
  user: { email: string } | null;
  projectId: string | null;
}

// Live tile of currently-running provider calls. We:
//   1. Tick the elapsed timer every second so the user sees the call age.
//   2. Poll /api/admin/costs/in-flight every 4s for fresh rows. Faster
//      than the rest of the dashboard because in-flight calls finish
//      mid-poll and the operator wants to see "started"/"finished"
//      transitions in near-real-time.
export function InFlightCallsSection({ rows: initial }: { rows: InFlightRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<InFlightRow[]>(initial);
  const [now, setNow] = useState<number>(() => Date.now());

  // Per-second clock for elapsed display.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/costs/in-flight', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as { rows: InFlightRow[] };
      setRows(
        json.rows.map((r) => ({
          ...r,
          createdAt: new Date(r.createdAt as unknown as string),
        })),
      );
    } catch {
      /* observability only — keep previous data */
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  if (rows.length === 0) {
    return (
      <Card className="border-muted">
        <CardContent className="p-4 flex items-center gap-3">
          <Badge variant="muted">0</Badge>
          <div className="text-sm text-muted-foreground">
            אין קריאות API פעילות כרגע
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          קריאות API פעילות עכשיו
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="default" className="text-xs">
            {rows.length} פעילות · live
          </Badge>
          <CancelStaleButton />
        </div>
      </div>
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>התחלה</TableHead>
                <TableHead>זמן רץ</TableHead>
                <TableHead>ספק</TableHead>
                <TableHead>פעולה</TableHead>
                <TableHead>מודל</TableHead>
                <TableHead>משתמש</TableHead>
                <TableHead>פרויקט</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const startedAt = new Date(c.createdAt).getTime();
                const elapsedMs = Math.max(0, now - startedAt);
                const elapsedSec = Math.floor(elapsedMs / 1000);
                const elapsedDisplay =
                  elapsedSec >= 60
                    ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
                    : `${elapsedSec}s`;
                // Color the elapsed badge red after 5 min (something is stuck).
                const stuck = elapsedSec > 300;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleTimeString('he-IL')}
                    </TableCell>
                    <TableCell className="font-mono">
                      <span
                        className={
                          stuck
                            ? 'text-destructive font-bold animate-pulse'
                            : 'text-amber-600 dark:text-amber-400'
                        }
                      >
                        ⏱ {elapsedDisplay}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {PROVIDER_LABEL[c.provider] ?? c.provider}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {OPERATION_LABEL[c.operation] ?? c.operation}
                    </TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">
                      {c.model ?? '—'}
                    </TableCell>
                    <TableCell dir="ltr" className="text-xs text-muted-foreground">
                      {c.user?.email ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {c.projectId?.slice(-8) ?? '—'}
                    </TableCell>
                    <TableCell>
                      <CancelOneButton callId={c.id} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CancelOneButton({ callId }: { callId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const fd = new FormData();
            fd.set('id', callId);
            const res = await cancelApiCallAction(fd);
            if (!res.ok) setError(res.error ?? 'שגיאה');
            router.refresh();
          });
        }}
        className="text-xs px-2 py-1 rounded bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 disabled:opacity-50"
        title="סמן כ-failed + נקה in-flight על הסצנה (לא מבטל בצד הספק)"
      >
        {pending ? '…' : '✕ בטל'}
      </button>
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </div>
  );
}

function CancelStaleButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [last, setLast] = useState<{ count: number } | null>(null);
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
        title="בטל את כל הקריאות התקועות יותר מ-15 דק׳"
      >
        🧹 נקה תקועים
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">בטל הכל מעל 15 דק׳?</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const fd = new FormData();
            fd.set('olderThanMinutes', '15');
            const res = await cancelAllStaleInProgressAction(fd);
            setLast({ count: res.cancelled });
            setConfirming(false);
            router.refresh();
          });
        }}
        className="text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? '…' : 'כן'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
      >
        ביטול
      </button>
      {last && <span className="text-[10px] text-muted-foreground">בוטלו {last.count}</span>}
    </div>
  );
}
