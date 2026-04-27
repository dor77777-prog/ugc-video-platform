import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

const PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  kling: 'Kling',
  runway: 'Runway',
  creatomate: 'Creatomate',
};

const OPERATION_LABEL: Record<string, string> = {
  script_gen: 'יצירת תסריט',
  image_gen: 'תמונת סצנה',
  tts: 'קריינות (TTS)',
  video_gen: 'וידאו לסצנה',
  compose: 'הרכבה סופית',
};

export default async function AdminUsagePage() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [today, week, month, allTime, byProvider, byOperation, failedToday, recent] =
    await Promise.all([
      prisma.apiCall.aggregate({
        where: { success: true, createdAt: { gte: since24h } },
        _sum: { costUsd: true },
        _count: { _all: true },
      }),
      prisma.apiCall.aggregate({
        where: { success: true, createdAt: { gte: since7d } },
        _sum: { costUsd: true },
        _count: { _all: true },
      }),
      prisma.apiCall.aggregate({
        where: { success: true, createdAt: { gte: since30d } },
        _sum: { costUsd: true },
        _count: { _all: true },
      }),
      prisma.apiCall.aggregate({
        where: { success: true },
        _sum: { costUsd: true },
        _count: { _all: true },
      }),
      prisma.apiCall.groupBy({
        by: ['provider'],
        where: { success: true, createdAt: { gte: since30d } },
        _sum: { costUsd: true },
        _count: { _all: true },
        orderBy: { _sum: { costUsd: 'desc' } },
      }),
      prisma.apiCall.groupBy({
        by: ['provider', 'operation', 'model'],
        where: { success: true, createdAt: { gte: since30d } },
        _sum: { costUsd: true },
        _count: { _all: true },
        orderBy: { _sum: { costUsd: 'desc' } },
      }),
      prisma.apiCall.count({
        where: { success: false, createdAt: { gte: since24h } },
      }),
      prisma.apiCall.findMany({
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

  return (
    <div className="p-6 md:p-10 max-w-7xl space-y-6">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin · API Usage</div>
        <h1 className="text-3xl font-bold tracking-tight">עלויות וקריאות API</h1>
        <p className="text-sm text-muted-foreground">
          כל קריאה ל-OpenAI / ElevenLabs / Kling / וכו׳ מתועדת עם עלות מחושבת. רענן את
          הדף לערכים עדכניים.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="היום" value={fmtUSD(today._sum.costUsd)} sublabel={`${today._count._all} קריאות`} />
        <Kpi label="7 ימים אחרונים" value={fmtUSD(week._sum.costUsd)} sublabel={`${week._count._all} קריאות`} />
        <Kpi label="30 ימים אחרונים" value={fmtUSD(month._sum.costUsd)} sublabel={`${month._count._all} קריאות`} />
        <Kpi label="סך הכל" value={fmtUSD(allTime._sum.costUsd)} sublabel={`${allTime._count._all} קריאות`} accent />
      </div>

      {failedToday > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Badge variant="destructive">{failedToday}</Badge>
            <div className="text-sm">קריאות API שכשלו ב-24 השעות האחרונות</div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          פירוק לפי ספק (30 ימים)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {byProvider.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                אין קריאות API ב-30 הימים האחרונים.
              </CardContent>
            </Card>
          ) : (
            byProvider.map((p) => (
              <Card key={p.provider}>
                <CardContent className="p-5">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">
                    {PROVIDER_LABEL[p.provider] ?? p.provider}
                  </div>
                  <div className="text-2xl font-bold font-mono mt-1">{fmtUSD(p._sum.costUsd)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {p._count._all} קריאות
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          פירוק לפי פעולה ומודל (30 ימים)
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ספק</TableHead>
                  <TableHead>פעולה</TableHead>
                  <TableHead>מודל</TableHead>
                  <TableHead>קריאות</TableHead>
                  <TableHead>עלות</TableHead>
                  <TableHead>ממוצע / קריאה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byOperation.map((row, i) => (
                  <TableRow key={`${row.provider}-${row.operation}-${row.model}-${i}`}>
                    <TableCell>{PROVIDER_LABEL[row.provider] ?? row.provider}</TableCell>
                    <TableCell>{OPERATION_LABEL[row.operation] ?? row.operation}</TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">{row.model ?? '—'}</TableCell>
                    <TableCell className="font-mono">{row._count._all}</TableCell>
                    <TableCell className="font-mono">{fmtUSD(row._sum.costUsd)}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {fmtUSD((row._sum.costUsd ?? 0) / (row._count._all || 1))}
                    </TableCell>
                  </TableRow>
                ))}
                {byOperation.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      אין נתונים
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          50 קריאות אחרונות
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>זמן</TableHead>
                  <TableHead>ספק</TableHead>
                  <TableHead>פעולה</TableHead>
                  <TableHead>מודל</TableHead>
                  <TableHead>טוקנים I/O</TableHead>
                  <TableHead>משך</TableHead>
                  <TableHead>עלות</TableHead>
                  <TableHead>משתמש</TableHead>
                  <TableHead>סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {c.createdAt.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{PROVIDER_LABEL[c.provider] ?? c.provider}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{OPERATION_LABEL[c.operation] ?? c.operation}</TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">{c.model ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {c.inputTokens != null || c.outputTokens != null
                        ? `${c.inputTokens ?? 0} / ${c.outputTokens ?? 0}`
                        : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.durationMs != null ? `${(c.durationMs / 1000).toFixed(1)}s` : '—'}
                    </TableCell>
                    <TableCell className="font-mono">{fmtUSD(c.costUsd)}</TableCell>
                    <TableCell dir="ltr" className="text-xs text-muted-foreground">
                      {c.user?.email ?? '—'}
                    </TableCell>
                    <TableCell>
                      {c.success ? (
                        <Badge variant="success">OK</Badge>
                      ) : (
                        <Badge variant="destructive" title={c.errorMessage ?? undefined}>
                          fail
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {recent.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      אין קריאות עדיין. ברגע שמישהו ייצר תסריט / תמונה — זה יופיע כאן.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
    <Card className={accent ? 'bg-accent/15 border-accent/40' : undefined}>
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
