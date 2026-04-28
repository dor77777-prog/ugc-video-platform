'use client';

import { useEffect, useState } from 'react';
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
//   2. Re-query via router.refresh() every 5 seconds so completed rows
//      drop off and new ones appear without a manual reload.
export function InFlightCallsSection({ rows }: { rows: InFlightRow[] }) {
  const router = useRouter();
  const [now, setNow] = useState<number>(() => Date.now());

  // Per-second clock for elapsed display.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Re-fetch the page every 5s so we pick up newly-finished/started rows.
  // 5s is a fair compromise — the page is server-rendered force-dynamic,
  // so each refresh hits the DB without much overhead.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [router]);

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
        <Badge variant="default" className="text-xs">
          {rows.length} פעילות · live
        </Badge>
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
