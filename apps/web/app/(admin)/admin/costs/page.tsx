import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InFlightCallsSection } from './in-flight';

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
  motion_analysis: 'ניתוח תנועה (Vision)',
  i2v: 'אנימציה (Kling i2v)',
  lipsync: 'סנכרון שפתיים (Kling)',
  video_gen: 'וידאו לסצנה',
  compose: 'הרכבה סופית',
};

// 1 credit costs the user $0.50 (per pricing.ts comment in STATUS.md);
// updates here flow into the "revenue vs cost" KPIs.
const PRICE_PER_CREDIT_USD = 0.5;

export default async function AdminUsagePage() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    today,
    week,
    month,
    allTime,
    byProvider,
    byOperation,
    failedToday,
    recent,
    latencyByOp,
    topProjects,
    recentFailures,
    rendersFinishedAllTime,
    rendersFinished30d,
    inFlightCalls,
  ] = await Promise.all([
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
    // Latency P50/avg per provider+operation — helps spot slow providers.
    prisma.apiCall.groupBy({
      by: ['provider', 'operation'],
      where: {
        success: true,
        createdAt: { gte: since30d },
        durationMs: { not: null },
      },
      _avg: { durationMs: true },
      _max: { durationMs: true },
      _count: { _all: true },
    }),
    // Top 10 projects by API cost in the last 30 days. Shows which videos
    // are expensive (regenerations, retries, long scripts).
    prisma.apiCall.groupBy({
      by: ['projectId'],
      where: {
        success: true,
        createdAt: { gte: since30d },
        projectId: { not: null },
      },
      _sum: { costUsd: true },
      _count: { _all: true },
      orderBy: { _sum: { costUsd: 'desc' } },
      take: 10,
    }),
    // 10 most recent failed API calls — drill-down beyond the count badge.
    prisma.apiCall.findMany({
      where: { status: 'failed' },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // Total finished renders across all time — for cost-per-video metric.
    prisma.renderJob.count({
      where: { status: 'completed' },
    }),
    // Renders finished in the last 30 days — for windowed cost-per-video.
    prisma.renderJob.count({
      where: { status: 'completed', completedAt: { gte: since30d } },
    }),
    // Currently in-flight calls. Two-phase recordApiCall inserts a row at
    // submit time with status="in_progress" and updates it to success/
    // failed when the call returns. The dashboard shows these LIVE so we
    // can watch a Kling i2v progress through its 60-180s lifetime.
    prisma.apiCall.findMany({
      where: { status: 'in_progress' },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  // Hydrate top-projects with project names + owner emails. The groupBy
  // returns only projectId, so a single follow-up query gets the rest.
  const projectIds = topProjects.map((p) => p.projectId).filter((x): x is string => !!x);
  const projectsLookup = projectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: {
          id: true,
          productData: true,
          user: { select: { email: true } },
          renderJobs: { select: { status: true }, take: 1, orderBy: { createdAt: 'desc' } },
        },
      })
    : [];
  const projectMeta = new Map(projectsLookup.map((p) => [p.id, p]));

  const apiCost30d = month._sum.costUsd ?? 0;
  const allTimeCost = allTime._sum.costUsd ?? 0;
  const costPerFinishedRender =
    rendersFinishedAllTime > 0 ? allTimeCost / rendersFinishedAllTime : 0;
  const costPerFinishedRender30d =
    rendersFinished30d > 0 ? apiCost30d / rendersFinished30d : 0;
  // Per STATUS.md: ~12 credits per finished video × $0.5/credit = $6 revenue.
  const ESTIMATED_REVENUE_PER_RENDER = 12 * PRICE_PER_CREDIT_USD;
  const estimatedRevenue30d = rendersFinished30d * ESTIMATED_REVENUE_PER_RENDER;
  const estimatedMargin30d = estimatedRevenue30d - apiCost30d;
  const estimatedMarginPct =
    estimatedRevenue30d > 0 ? (estimatedMargin30d / estimatedRevenue30d) * 100 : 0;

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="עלות/וידאו (סה״כ)"
          value={fmtUSD(costPerFinishedRender)}
          sublabel={`${rendersFinishedAllTime} סרטונים גמורים`}
        />
        <Kpi
          label="עלות/וידאו (30 ימים)"
          value={fmtUSD(costPerFinishedRender30d)}
          sublabel={`${rendersFinished30d} סרטונים בחודש האחרון`}
        />
        <Kpi
          label="הכנסה משוערת (30 ימים)"
          value={fmtUSD(estimatedRevenue30d)}
          sublabel={`${rendersFinished30d} × ${ESTIMATED_REVENUE_PER_RENDER}$ (12 קרדיטים)`}
        />
        <Kpi
          label="מרג'ין משוער (30 ימים)"
          value={fmtUSD(estimatedMargin30d)}
          sublabel={
            estimatedRevenue30d > 0 ? `${estimatedMarginPct.toFixed(0)}% מרג'ין` : 'אין דאטה'
          }
          accent
        />
      </div>

      {failedToday > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Badge variant="destructive">{failedToday}</Badge>
            <div className="text-sm">קריאות API שכשלו ב-24 השעות האחרונות</div>
          </CardContent>
        </Card>
      )}

      {/* In-flight calls — live view of currently-running provider calls.
          Auto-refreshes via the page's force-dynamic + the sub-component's
          5s polling. Each row shows elapsed time so we can spot stuck
          requests (e.g. Kling i2v sitting at 7+ minutes). */}
      <InFlightCallsSection rows={inFlightCalls} />

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
          הפרויקטים היקרים (30 ימים)
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>פרויקט</TableHead>
                  <TableHead>בעלים</TableHead>
                  <TableHead>סטטוס רינדור</TableHead>
                  <TableHead>קריאות API</TableHead>
                  <TableHead>עלות API</TableHead>
                  <TableHead>הכנסה משוערת</TableHead>
                  <TableHead>מרג'ין</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      אין פרויקטים פעילים ב-30 הימים האחרונים
                    </TableCell>
                  </TableRow>
                ) : (
                  topProjects.map((p) => {
                    const meta = p.projectId ? projectMeta.get(p.projectId) : null;
                    const productName =
                      (meta?.productData as { productName?: string } | null)?.productName ??
                      p.projectId?.slice(-8) ??
                      '—';
                    const renderStatus = meta?.renderJobs?.[0]?.status ?? 'pending';
                    const cost = p._sum.costUsd ?? 0;
                    const hasFinishedRender = renderStatus === 'completed';
                    const revenue = hasFinishedRender ? ESTIMATED_REVENUE_PER_RENDER : 0;
                    const margin = revenue - cost;
                    return (
                      <TableRow key={p.projectId ?? 'null'}>
                        <TableCell className="text-sm max-w-[200px] truncate" title={productName}>
                          {productName}
                        </TableCell>
                        <TableCell dir="ltr" className="text-xs text-muted-foreground">
                          {meta?.user?.email ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={hasFinishedRender ? 'success' : 'outline'}>
                            {renderStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">{p._count._all}</TableCell>
                        <TableCell className="font-mono">{fmtUSD(cost)}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {hasFinishedRender ? fmtUSD(revenue) : '—'}
                        </TableCell>
                        <TableCell
                          className={
                            'font-mono ' + (margin < 0 ? 'text-destructive' : 'text-foreground')
                          }
                        >
                          {hasFinishedRender ? fmtUSD(margin) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          זמני תגובה (30 ימים)
        </h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ספק</TableHead>
                  <TableHead>פעולה</TableHead>
                  <TableHead>קריאות</TableHead>
                  <TableHead>זמן ממוצע</TableHead>
                  <TableHead>גרוע ביותר</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latencyByOp.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      אין דאטה
                    </TableCell>
                  </TableRow>
                ) : (
                  latencyByOp
                    .slice()
                    .sort((a, b) => (b._avg.durationMs ?? 0) - (a._avg.durationMs ?? 0))
                    .map((row) => (
                      <TableRow key={`${row.provider}-${row.operation}`}>
                        <TableCell>{PROVIDER_LABEL[row.provider] ?? row.provider}</TableCell>
                        <TableCell>{OPERATION_LABEL[row.operation] ?? row.operation}</TableCell>
                        <TableCell className="font-mono">{row._count._all}</TableCell>
                        <TableCell className="font-mono">
                          {row._avg.durationMs != null
                            ? `${(row._avg.durationMs / 1000).toFixed(1)}s`
                            : '—'}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {row._max.durationMs != null
                            ? `${(row._max.durationMs / 1000).toFixed(1)}s`
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {recentFailures.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            כשלונות אחרונים
          </h2>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>זמן</TableHead>
                    <TableHead>ספק</TableHead>
                    <TableHead>פעולה</TableHead>
                    <TableHead>שגיאה</TableHead>
                    <TableHead>משתמש</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentFailures.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {c.createdAt.toLocaleString('he-IL', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {PROVIDER_LABEL[c.provider] ?? c.provider}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {OPERATION_LABEL[c.operation] ?? c.operation}
                      </TableCell>
                      <TableCell
                        className="text-xs text-destructive max-w-[400px] truncate"
                        title={c.errorMessage ?? undefined}
                        dir="ltr"
                      >
                        {c.errorMessage ?? '—'}
                      </TableCell>
                      <TableCell dir="ltr" className="text-xs text-muted-foreground">
                        {c.user?.email ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

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
                  <TableHead>יחידות</TableHead>
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
                      {formatUnits(c.provider, c.operation, c.inputTokens, c.outputTokens, c.units)}
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

// Display the metered unit per provider so the cost is interpretable at a
// glance: OpenAI text shows token in/out, ElevenLabs shows characters,
// Kling shows resource units, etc.
function formatUnits(
  provider: string,
  operation: string,
  inputTokens: number | null,
  outputTokens: number | null,
  units: number | null,
): string {
  if (provider === 'openai' && operation === 'script_gen') {
    if (inputTokens != null || outputTokens != null) {
      return `${inputTokens ?? 0} → ${outputTokens ?? 0} tok`;
    }
  }
  if (provider === 'openai' && operation === 'image_gen') {
    return units ? `${units} img` : '1 img';
  }
  if (provider === 'elevenlabs') {
    if (units) return `${units} chars`;
  }
  if (provider === 'kling') {
    if (units) return `${units} task`;
  }
  if (inputTokens != null || outputTokens != null) {
    return `${inputTokens ?? 0} / ${outputTokens ?? 0}`;
  }
  return units != null ? String(units) : '—';
}
