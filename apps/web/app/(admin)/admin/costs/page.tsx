import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InFlightCallsSection } from './in-flight';
import { RecentCallsTable } from './recent-calls';
import { SummaryKpis } from './summary-kpis';
import { PROVIDER_CATALOG } from '@/lib/usage/pricing';
import {
  CREDIT_LIST_VALUE_USD,
  PROVIDER_COST_ESTIMATES_USD,
  PIXVERSE_COST_MODEL,
  VIDEO_COST_ESTIMATES,
  OPERATION_CREDIT_PRICING,
} from '@/lib/pricing/provider-costs';
import {
  PLAN_CONFIGS,
  effectiveCreditValueUsd,
} from '@/lib/plans';
import { fetchAllProviderBalances } from '@/lib/providers/balance';

export const dynamic = 'force-dynamic';
// Cache the live-balance section for 5 min. The earlier 60s window
// hammered ElevenLabs hard enough that /v1/user/subscription started
// returning HTTP 429 rate_limited on free-tier accounts (each Vercel
// region's first hit triggers a fresh call). Billing data is fine
// stale by a few minutes; the trade-off favors not falling back to
// the local-spend card when we have a perfectly good live call.
export const revalidate = 300;

const PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  // V25 — script generation now goes through Google Gemini.
  gemini: 'Google Gemini',
  // V26 — image-to-video animation supports Grok in addition to Kling.
  xai: 'xAI / Grok',
  elevenlabs: 'ElevenLabs',
  kling: 'Kling',
  pixverse: 'PixVerse',
  ffmpeg: 'ffmpeg',
  runway: 'Runway',
  creatomate: 'Creatomate',
};

const OPERATION_LABEL: Record<string, string> = {
  script_gen: 'יצירת תסריט',
  image_gen: 'תמונת סצנה',
  tts: 'קריינות (TTS)',
  motion_analysis: 'ניתוח תנועה (Vision)',
  i2v: 'אנימציה (Kling i2v)',
  lipsync: 'סנכרון שפתיים (PixVerse)',
  pixverse_media_upload: 'העלאת מדיה ל-PixVerse',
  video_gen: 'וידאו לסצנה',
  compose: 'הרכבה סופית',
  mux: 'Mux אודיו (ffmpeg)',
};

// 1 Tachles credit = $0.10 list price. For subscriber margin we use the
// PLAN-EFFECTIVE credit value (e.g. $49 / 500 credits = $0.098 on
// Creator), which is lower than list — see effectiveCreditValueUsd().
const PRICE_PER_CREDIT_USD = CREDIT_LIST_VALUE_USD;

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

  // V12.5 — live balance check on Kling + PixVerse. Soft-fails per
  // provider so an outage on one doesn't break the page.
  const providerBalances = await fetchAllProviderBalances();

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
  // Typical 15s video charges ≈ 84 credits (script 2 + 4×img 8 + 4×voice 4
  // + 4×kling 60 + 1×pixverse 2 + final 8). At $0.10 list per credit that's
  // $8.40 revenue. The mix on real usage drifts (regens, 30s mode), but
  // 84 is the right order of magnitude for the dashboard tile.
  const ESTIMATED_CREDITS_PER_RENDER = 84;
  const ESTIMATED_REVENUE_PER_RENDER =
    ESTIMATED_CREDITS_PER_RENDER * PRICE_PER_CREDIT_USD;
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
          כל קריאה ל-Gemini / OpenAI / ElevenLabs / Kling / xAI / PixVerse מתועדת עם עלות מחושבת.
          רענן את הדף לערכים עדכניים.
        </p>
      </div>

      {/* V13.2 — KPI tiles poll /api/admin/costs/summary every 20s. The
          SSR pass seeds the initial values so the dashboard renders
          instantly; the client takes over for updates. */}
      <SummaryKpis
        initial={{
          today: { sum: today._sum.costUsd ?? 0, count: today._count._all },
          week: { sum: week._sum.costUsd ?? 0, count: week._count._all },
          month: { sum: month._sum.costUsd ?? 0, count: month._count._all },
          allTime: { sum: allTime._sum.costUsd ?? 0, count: allTime._count._all },
          failedToday,
          fetchedAt: new Date().toISOString(),
        }}
      />

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
          sublabel={`${rendersFinished30d} × $${ESTIMATED_REVENUE_PER_RENDER.toFixed(2)} (${ESTIMATED_CREDITS_PER_RENDER} קרדיטים @ $${PRICE_PER_CREDIT_USD.toFixed(2)})`}
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

      {/* V12.5 — live provider balance check (Kling pack units + PixVerse credits). */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold">יתרות חיות אצל הספקים</h2>
            <p className="text-xs text-muted-foreground">
              מתעדכן כל 60 שניות. חישוב הקליפים/סצנות הנותרים מבוסס על שיעור הצריכה הנצפה
              (~6.24 Kling units לקליפ 5s, ~16 PixVerse credits לסצנת lipsync).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Kling */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">Kling AI</h3>
                <span className="text-[10px] text-muted-foreground">image-to-video</span>
              </div>
              {providerBalances.kling.ok ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-2xl font-mono font-bold">
                        {providerBalances.kling.totalRemainingUnits.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        units remaining
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-mono font-bold">
                        ~{providerBalances.kling.estimatedClipsRemaining}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        קליפים אפשריים
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {fmtUSD(providerBalances.kling.estimatedUsdRemaining)}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        ערך נשאר
                      </div>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pack</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Used</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expires</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {providerBalances.kling.packs.map((p) => (
                        <TableRow key={p.name}>
                          <TableCell className="text-xs font-mono" dir="ltr">
                            {p.name}
                          </TableCell>
                          <TableCell className="text-right font-mono">{p.totalUnits}</TableCell>
                          <TableCell className="text-right font-mono">{p.usedUnits.toFixed(1)}</TableCell>
                          <TableCell className="text-right font-mono">{p.remainingUnits.toFixed(1)}</TableCell>
                          <TableCell>
                            {p.status === 'online' ? (
                              <Badge variant="success">online</Badge>
                            ) : p.status === 'runOut' ? (
                              <Badge variant="destructive">runOut</Badge>
                            ) : (
                              <Badge variant="muted">{p.status}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.expiresAt.toLocaleDateString('he-IL', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="text-[11px] text-muted-foreground">
                    סה"כ צרכת לכל הזמנים: {providerBalances.kling.totalUsedUnits.toFixed(1)} units
                    {' (≈ '}
                    {Math.floor(providerBalances.kling.totalUsedUnits / 6.24)}
                    {' קליפים)'}
                  </div>
                </>
              ) : (
                <div className="text-sm text-destructive">
                  {providerBalances.kling.error}
                </div>
              )}
            </div>

            {/* PixVerse */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">PixVerse</h3>
                <span className="text-[10px] text-muted-foreground">lip-sync</span>
              </div>
              {providerBalances.pixverse.ok ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-2xl font-mono font-bold">
                        {providerBalances.pixverse.totalCredits.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        px-credits
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-mono font-bold">
                        ~{providerBalances.pixverse.estimatedScenesRemaining}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        סצנות lipsync
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {fmtUSD(providerBalances.pixverse.estimatedUsdRemaining)}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        ערך נשאר
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>
                      Monthly:{' '}
                      <span className="font-mono">
                        {providerBalances.pixverse.creditMonthly}
                      </span>
                      {' · '}
                      Package:{' '}
                      <span className="font-mono">
                        {providerBalances.pixverse.creditPackage}
                      </span>
                    </div>
                    <div className="text-[10px]">
                      pack pricing: ${PIXVERSE_COST_MODEL.packagePriceUsd} ={' '}
                      {PIXVERSE_COST_MODEL.packageCredits.toLocaleString()} credits = $
                      {PIXVERSE_COST_MODEL.usdPerPixverseCredit.toFixed(5)} per credit ·{' '}
                      observed{' '}
                      {PIXVERSE_COST_MODEL.observedCreditsPerLipSyncScene} credits/scene = $
                      {PIXVERSE_COST_MODEL.observedUsdPerLipSyncScene.toFixed(4)} per scene
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-destructive">
                  {providerBalances.pixverse.error}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ElevenLabs */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">ElevenLabs</h3>
                <span className="text-[10px] text-muted-foreground">Hebrew TTS</span>
              </div>
              {providerBalances.elevenlabs.ok ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-2xl font-mono font-bold">
                        {providerBalances.elevenlabs.charactersRemaining.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        chars remaining
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-mono font-bold">
                        ~{Math.floor(providerBalances.elevenlabs.charactersRemaining / 200)}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        סצנות (~200 תווים)
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {fmtUSD(providerBalances.elevenlabs.estimatedUsdRemaining)}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        ערך נשאר
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="text-muted-foreground">
                      Tier:{' '}
                      <span className="font-mono">
                        {providerBalances.elevenlabs.tier}
                      </span>
                      {' · '}
                      Used:{' '}
                      <span className="font-mono">
                        {providerBalances.elevenlabs.characterCount.toLocaleString()}
                      </span>
                      {' / '}
                      <span className="font-mono">
                        {providerBalances.elevenlabs.characterLimit.toLocaleString()}
                      </span>
                      {' chars'}
                    </div>
                    {providerBalances.elevenlabs.resetAt && (
                      <div className="text-[10px] text-muted-foreground">
                        מתאפס:{' '}
                        {providerBalances.elevenlabs.resetAt.toLocaleDateString('he-IL', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      Hebrew model (eleven_v3): $0.10 / 1K chars
                    </div>
                  </div>
                </>
              ) : (
                // V12.6 — fallback when API key lacks user_read scope.
                // Show our own spend from ApiCall table instead of red error.
                <ProviderFallbackCard
                  providerSlug="elevenlabs"
                  byProviderRow={byProvider.find((p) => p.provider === 'elevenlabs')}
                  errorMsg={providerBalances.elevenlabs.error}
                  fixHint="Edit the ElevenLabs API key → grant user_read scope (or regenerate with all scopes)."
                />
              )}
            </div>

            {/* OpenAI */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">OpenAI</h3>
                <span className="text-[10px] text-muted-foreground">
                  scripts · images · vision
                </span>
              </div>
              {providerBalances.openai.ok ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-2xl font-mono font-bold">
                        {fmtUSD(providerBalances.openai.totalSpentLast24hUsd)}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        24 שעות
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-mono font-bold">
                        {fmtUSD(providerBalances.openai.totalSpentLast7dUsd)}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        7 ימים
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-mono font-bold">
                        {fmtUSD(providerBalances.openai.totalSpentLast30dUsd)}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        30 ימים
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    OpenAI לא חושף "יתרה נשארת" — רק spend נצבר. דווח מ-
                    /v1/organization/costs.
                  </div>
                </>
              ) : (
                // V12.6 — fallback when key lacks api.usage.read scope.
                <ProviderFallbackCard
                  providerSlug="openai"
                  byProviderRow={byProvider.find((p) => p.provider === 'openai')}
                  errorMsg={providerBalances.openai.error}
                  fixHint="Edit the OpenAI service-account key → grant api.usage.read scope at platform.openai.com → Organization → Roles."
                />
              )}
            </div>

            {/* V25 — Google Gemini (script generation). The
                Generative Language API doesn't expose per-key billing,
                so this card always falls back to local ApiCall
                aggregates. */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">Google Gemini</h3>
                <span className="text-[10px] text-muted-foreground">
                  scripts (gemini-3-flash-preview)
                </span>
              </div>
              <ProviderFallbackCard
                providerSlug="gemini"
                byProviderRow={byProvider.find((p) => p.provider === 'gemini')}
                errorMsg={
                  'ok' in providerBalances.gemini && !providerBalances.gemini.ok
                    ? providerBalances.gemini.error
                    : 'no balance data'
                }
                fixHint="לסכום האותנטי: Google Cloud Console → Billing → APIs Detail → Generative Language API (Google לא חושפת עלות per-API-key)."
              />
            </div>

            {/* V26 — xAI / Grok Imagine (image-to-video alternative to
                Kling). Per-scene user toggle in step 5. xAI doesn't
                expose per-key billing either, so this card always falls
                back to local ApiCall aggregates. */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">xAI / Grok</h3>
                <span className="text-[10px] text-muted-foreground">
                  i2v (grok-imagine-video)
                </span>
              </div>
              <ProviderFallbackCard
                providerSlug="xai"
                byProviderRow={byProvider.find((p) => p.provider === 'xai')}
                errorMsg={
                  'ok' in providerBalances.xai && !providerBalances.xai.ok
                    ? providerBalances.xai.error
                    : 'no balance data'
                }
                fixHint="לסכום האותנטי: console.x.ai → Billing (xAI לא חושפת עלות per-API-key על ה-video API)."
              />
            </div>
          </div>

          <div className="text-[10px] text-muted-foreground border-t border-border pt-2">
            עודכן ב-
            {(providerBalances.kling.ok
              ? providerBalances.kling.fetchedAt
              : providerBalances.pixverse.ok
                ? providerBalances.pixverse.fetchedAt
                : providerBalances.elevenlabs.ok
                  ? providerBalances.elevenlabs.fetchedAt
                  : providerBalances.openai.ok
                    ? providerBalances.openai.fetchedAt
                    : new Date()
            ).toLocaleTimeString('he-IL')}
            {' · '}cache 60s
          </div>
        </CardContent>
      </Card>

      {/* Provider catalog — every paid third-party API the pipeline can
          touch + roughly what it costs per call. Pulled from
          PROVIDER_CATALOG in lib/usage/pricing.ts so adding a new
          integration is a one-place change. */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-bold">Provider integrations</h2>
            <p className="text-xs text-muted-foreground">
              כל ה-API החיצוניים שעלולים לחייב את החשבון שלנו. עלות לקריאה מוערכת —
              הסיכום בעמוד הזה מבוסס על ApiCall.costUsd שנכתב בזמן אמת ע"י כל
              integration. ספק "לא פעיל" קיים בקוד אבל לא רץ ב-flow הראשי.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ספק</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>תפקיד</TableHead>
                <TableHead>עלות לקריאה (USD)</TableHead>
                <TableHead>operation slugs ב-DB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PROVIDER_CATALOG.map((p) => (
                <TableRow key={p.provider}>
                  <TableCell>
                    <div className="font-semibold">{p.displayName}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {p.provider}
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.active ? (
                      <Badge variant="default">פעיל</Badge>
                    ) : (
                      <Badge variant="muted">לא פעיל</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{p.purposeHe}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {p.costPerCallUsd}
                  </TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">
                    {p.operations.join(', ')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="text-[11px] text-muted-foreground border-t border-border pt-2">
            💡 הסיכומים בעמוד מקבצים לפי <code>ApiCall.provider</code>. כשמוסיפים
            integration חדש: (א) עדכן את <code>PROVIDER_CATALOG</code> ב-
            <code>lib/usage/pricing.ts</code>, (ב) בקוד ה-impl ודא שהקריאה
            עוברת דרך <code>recordApiCallStart/Complete</code> עם השדה{' '}
            <code>provider</code> מוגדר נכון, (ג) כתוב פונקציית{' '}
            <code>price&lt;Provider&gt;()</code> או הוסף ל-<code>priceLipSync</code>{' '}
            כדי שה-costUsd ייכתב.
          </div>
        </CardContent>
      </Card>

      {/* Provider cost reference — measured estimates for the "do we
          lose money on a Kling clip?" sanity check. Numbers come from
          PROVIDER_COST_ESTIMATES_USD in lib/pricing/provider-costs.ts.
          Each row matches an ApiCall.operation slug we record. */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-bold">עלות מוערכת לקריאת ספק (USD)</h2>
            <p className="text-xs text-muted-foreground">
              ה-baseline שאנחנו משווים אליו את ה-actual ApiCall.costUsd. שינוי
              tier אצל ספק → עדכן את <code>provider-costs.ts</code> או env.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>פעולה</TableHead>
                <TableHead>ספק</TableHead>
                <TableHead className="text-right">עלות (USD)</TableHead>
                <TableHead>הערה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { op: 'gemini_script_batch', provider: 'gemini', cost: PROVIDER_COST_ESTIMATES_USD.gemini_script_batch, note: 'V25/V26.7 — gemini-3-pro-preview, thinkingLevel low (איכות פרוזה ויזואלית להפקת תמונות)' },
                { op: 'openai_scene_image', provider: 'openai', cost: PROVIDER_COST_ESTIMATES_USD.openai_scene_image, note: 'gpt-image-2 medium 1024x1792' },
                { op: 'openai_motion_analysis_scene', provider: 'openai', cost: PROVIDER_COST_ESTIMATES_USD.openai_motion_analysis_scene, note: 'gpt-4o-mini vision לכל סצנה' },
                { op: 'elevenlabs_voice_scene', provider: 'elevenlabs', cost: PROVIDER_COST_ESTIMATES_USD.elevenlabs_voice_scene, note: 'Multilingual v2 ~200 chars' },
                { op: 'kling_i2v_clip', provider: 'kling', cost: PROVIDER_COST_ESTIMATES_USD.kling_i2v_clip, note: '1.44 tok × $0.546 = $0.79 ממוצע' },
                { op: 'xai_video_clip', provider: 'xai', cost: PROVIDER_COST_ESTIMATES_USD.xai_video_clip, note: 'V26 — Grok Imagine i2v חלופי (5s 720p)' },
                { op: 'xai_video_per_sec_720p', provider: 'xai', cost: PROVIDER_COST_ESTIMATES_USD.xai_video_per_sec_720p, note: 'תעריף לשנייה ב-720p HD' },
                { op: 'xai_video_per_sec_480p', provider: 'xai', cost: PROVIDER_COST_ESTIMATES_USD.xai_video_per_sec_480p, note: 'תעריף לשנייה ב-480p (זול יותר)' },
                { op: 'pixverse_lipsync_scene', provider: 'pixverse', cost: PROVIDER_COST_ESTIMATES_USD.pixverse_lipsync_scene, note: '16 PixVerse credits @ $0.00444 = $0.071' },
                { op: 'pixverse_lipsync_second', provider: 'pixverse', cost: PROVIDER_COST_ESTIMATES_USD.pixverse_lipsync_second, note: 'לחישוב לפי שנייה (~$0.018/s)' },
                { op: 'pixverse_media_upload', provider: 'pixverse', cost: PROVIDER_COST_ESTIMATES_USD.pixverse_media_upload, note: 'אין חיוב נצפה — נרשם למקרה שזה ישתנה' },
                { op: 'openai_script_batch', provider: 'openai', cost: PROVIDER_COST_ESTIMATES_USD.openai_script_batch, note: 'legacy — לפני V25 (לא בשימוש בפרודקשן)' },
              ].map((row) => (
                <TableRow key={row.op}>
                  <TableCell className="font-mono text-xs" dir="ltr">{row.op}</TableCell>
                  <TableCell>{PROVIDER_LABEL[row.provider] ?? row.provider}</TableCell>
                  <TableCell className="font-mono text-right">{fmtUSD(row.cost)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* PixVerse cost model — show the exact pack-based math behind the
          $0.071/lipsync number so it's auditable. */}
      <Card>
        <CardContent className="p-5 space-y-2">
          <h2 className="text-lg font-bold">PixVerse — מודל מחיר (נצפה)</h2>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="text-sm">חבילה</TableCell>
                <TableCell className="font-mono">
                  ${PIXVERSE_COST_MODEL.packagePriceUsd.toFixed(2)} = {PIXVERSE_COST_MODEL.packageCredits.toLocaleString()} PixVerse credits
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-sm">USD ל-PixVerse credit</TableCell>
                <TableCell className="font-mono">${PIXVERSE_COST_MODEL.usdPerPixverseCredit.toFixed(5)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-sm">צריכה נצפית לסצנת LipSync</TableCell>
                <TableCell className="font-mono">{PIXVERSE_COST_MODEL.observedCreditsPerLipSyncScene} PixVerse credits</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-sm">עלות נצפית לסצנת LipSync</TableCell>
                <TableCell className="font-mono font-bold">${PIXVERSE_COST_MODEL.observedUsdPerLipSyncScene.toFixed(4)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Operation pricing — credits charged + nominal margin at list price.
          Effective margin on subscribers is lower (see plan economics). */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="text-lg font-bold">תמחור פעולה (קרדיטים)</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>פעולה</TableHead>
                <TableHead>ספק</TableHead>
                <TableHead className="text-right">עלות (USD)</TableHead>
                <TableHead className="text-right">קרדיטים</TableHead>
                <TableHead className="text-right">הכנסה (list)</TableHead>
                <TableHead className="text-right">מרג'ין (list)</TableHead>
                <TableHead>הערה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const rows: Array<{
                  op: string;
                  provider: string;
                  costUsd: number;
                  credits: number;
                  note: string;
                }> = [
                  { op: 'script_batch', provider: 'gemini', costUsd: PROVIDER_COST_ESTIMATES_USD.gemini_script_batch, credits: OPERATION_CREDIT_PRICING.script_batch, note: 'V25/V26.7 — Gemini 3 Pro + thinkingLevel low (~$0.30/batch); Flash הוריד איכות פרוזה ויזואלית' },
                  { op: 'scene_image_generate', provider: 'openai', costUsd: PROVIDER_COST_ESTIMATES_USD.openai_scene_image, credits: OPERATION_CREDIT_PRICING.scene_image_generate, note: 'יצירה ראשונה' },
                  { op: 'scene_image_regenerate', provider: 'openai', costUsd: PROVIDER_COST_ESTIMATES_USD.openai_scene_image, credits: OPERATION_CREDIT_PRICING.scene_image_regenerate, note: 'first regen חינם (FIRST_REGEN_FREE.image)' },
                  { op: 'voice_generate', provider: 'elevenlabs', costUsd: PROVIDER_COST_ESTIMATES_USD.elevenlabs_voice_scene, credits: OPERATION_CREDIT_PRICING.voice_generate, note: 'Hebrew TTS' },
                  { op: 'voice_regenerate', provider: 'elevenlabs', costUsd: PROVIDER_COST_ESTIMATES_USD.elevenlabs_voice_scene, credits: OPERATION_CREDIT_PRICING.voice_regenerate, note: 'first regen חינם' },
                  { op: 'motion_analysis', provider: 'openai', costUsd: PROVIDER_COST_ESTIMATES_USD.openai_motion_analysis_scene, credits: OPERATION_CREDIT_PRICING.motion_analysis, note: 'משולב במחיר הקליפ' },
                  { op: 'kling_i2v_clip', provider: 'kling', costUsd: PROVIDER_COST_ESTIMATES_USD.kling_i2v_clip, credits: OPERATION_CREDIT_PRICING.kling_i2v_clip, note: 'V26 — ברירת מחדל; ראה גם xai_i2v_clip' },
                  { op: 'xai_i2v_clip', provider: 'xai', costUsd: PROVIDER_COST_ESTIMATES_USD.xai_video_clip, credits: OPERATION_CREDIT_PRICING.kling_i2v_clip, note: 'V26 — Grok Imagine; קרדיטים זהים ל-Kling, הפרשי עלות נופלים עלינו' },
                  { op: 'pixverse_lipsync_scene', provider: 'pixverse', costUsd: PROVIDER_COST_ESTIMATES_USD.pixverse_lipsync_scene, credits: OPERATION_CREDIT_PRICING.pixverse_lipsync_scene, note: 'נטען רק אם PixVerse באמת רץ (face-gate עבר)' },
                  { op: 'lipsync_only', provider: 'pixverse', costUsd: PROVIDER_COST_ESTIMATES_USD.pixverse_lipsync_scene, credits: OPERATION_CREDIT_PRICING.lipsync_only, note: 'PixVerse על קליפ קיים — בלי i2v' },
                  { op: 'final_export_15s', provider: 'ffmpeg', costUsd: 0, credits: OPERATION_CREDIT_PRICING.final_export_15s, note: 'מקומי (storage + compute)' },
                  { op: 'final_export_30s', provider: 'ffmpeg', costUsd: 0, credits: OPERATION_CREDIT_PRICING.final_export_30s, note: 'מקומי (storage + compute)' },
                ];
                return rows.map((row) => {
                  const revenue = row.credits * PRICE_PER_CREDIT_USD;
                  const margin = revenue - row.costUsd;
                  const marginPct =
                    revenue > 0 ? (margin / revenue) * 100 : 0;
                  return (
                    <TableRow key={row.op}>
                      <TableCell className="font-mono text-xs" dir="ltr">{row.op}</TableCell>
                      <TableCell>{PROVIDER_LABEL[row.provider] ?? row.provider}</TableCell>
                      <TableCell className="font-mono text-right">{fmtUSD(row.costUsd)}</TableCell>
                      <TableCell className="font-mono text-right">{row.credits}</TableCell>
                      <TableCell className="font-mono text-right">{fmtUSD(revenue)}</TableCell>
                      <TableCell className={'font-mono text-right ' + (margin < 0 ? 'text-destructive font-bold' : '')}>
                        {fmtUSD(margin)} ({marginPct.toFixed(0)}%)
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.note}</TableCell>
                    </TableRow>
                  );
                });
              })()}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Per-video cost / revenue / margin estimates by mode. */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="text-lg font-bold">אומדן וידאו 15s / 30s</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>מצב</TableHead>
                <TableHead className="text-right">סצנות</TableHead>
                <TableHead className="text-right">LipSync</TableHead>
                <TableHead className="text-right">עלות ספק</TableHead>
                <TableHead className="text-right">קרדיטים</TableHead>
                <TableHead className="text-right">הכנסה (list)</TableHead>
                <TableHead className="text-right">מרג'ין</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { mode: '15s', est: VIDEO_COST_ESTIMATES.fifteenSec, credits: 84 },
                { mode: '30s', est: VIDEO_COST_ESTIMATES.thirtySec, credits: 108 },
              ].map((row) => {
                const revenue = row.credits * PRICE_PER_CREDIT_USD;
                const margin = revenue - row.est.totalUsd;
                const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
                return (
                  <TableRow key={row.mode}>
                    <TableCell className="font-bold">{row.mode}</TableCell>
                    <TableCell className="text-right font-mono">{row.est.sceneCount}</TableCell>
                    <TableCell className="text-right font-mono">{row.est.lipSyncSceneCount}</TableCell>
                    <TableCell className="text-right font-mono">${row.est.totalUsd.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">{row.credits}</TableCell>
                    <TableCell className="text-right font-mono">{fmtUSD(revenue)}</TableCell>
                    <TableCell className={'text-right font-mono ' + (margin < 0 ? 'text-destructive font-bold' : '')}>
                      {fmtUSD(margin)} ({marginPct.toFixed(0)}%)
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="text-[11px] text-muted-foreground">
            פיצול עלות ל-15s: {' '}
            ${VIDEO_COST_ESTIMATES.fifteenSec.scriptBatchUsd.toFixed(2)} script (Gemini 3 Pro) + {' '}
            ${VIDEO_COST_ESTIMATES.fifteenSec.imagesUsd.toFixed(2)} images (gpt-image-2) + {' '}
            ${VIDEO_COST_ESTIMATES.fifteenSec.voicesUsd.toFixed(2)} voices (ElevenLabs) + {' '}
            ${VIDEO_COST_ESTIMATES.fifteenSec.motionAnalysisUsd.toFixed(3)} motion (gpt-4o-mini) + {' '}
            ${VIDEO_COST_ESTIMATES.fifteenSec.klingI2vUsd.toFixed(2)} i2v (Kling — או Grok ב-${PROVIDER_COST_ESTIMATES_USD.xai_video_clip.toFixed(2)}) + {' '}
            ${VIDEO_COST_ESTIMATES.fifteenSec.pixverseLipSyncUsd.toFixed(3)} lipsync (PixVerse).
          </div>
        </CardContent>
      </Card>

      {/* Plan economics — effective credit value vs list, plus margin
          warning when a plan can't cover the worst-case 30s cost. */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="text-lg font-bold">כלכלת תוכניות</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>תוכנית</TableHead>
                <TableHead className="text-right">מחיר/חודש</TableHead>
                <TableHead className="text-right">קרדיטים</TableHead>
                <TableHead className="text-right">$/credit (list)</TableHead>
                <TableHead className="text-right">$/credit (אפקטיבי)</TableHead>
                <TableHead className="text-right">Max LipSync/וידאו</TableHead>
                <TableHead>אזהרה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.values(PLAN_CONFIGS).map((plan) => {
                const effective = effectiveCreditValueUsd(plan.slug);
                const cost30s = VIDEO_COST_ESTIMATES.thirtySec.totalUsd;
                const revenue30sEffective = 108 * effective;
                const underwater = revenue30sEffective < cost30s && plan.recurringCredits;
                return (
                  <TableRow key={plan.slug}>
                    <TableCell className="font-bold">{plan.displayName}</TableCell>
                    <TableCell className="text-right font-mono">${plan.monthlyPriceUsd}</TableCell>
                    <TableCell className="text-right font-mono">{plan.monthlyCredits.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">${PRICE_PER_CREDIT_USD.toFixed(3)}</TableCell>
                    <TableCell className={'text-right font-mono ' + (effective < PRICE_PER_CREDIT_USD ? 'text-amber-600' : '')}>
                      {effective > 0 ? `$${effective.toFixed(4)}` : '$0.0000 (acquisition)'}
                    </TableCell>
                    <TableCell className="text-right font-mono">{plan.maxLipSyncScenesPerVideo}</TableCell>
                    <TableCell className="text-xs">
                      {underwater ? (
                        <Badge variant="destructive">30s effective revenue ({fmtUSD(revenue30sEffective)}) {'<'} cost ({fmtUSD(cost30s)})</Badge>
                      ) : plan.slug === 'free_trial' ? (
                        <Badge variant="muted">acquisition spend</Badge>
                      ) : (
                        <Badge variant="success">positive margin</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="text-[11px] text-muted-foreground">
            $/credit אפקטיבי = monthlyPriceUsd / monthlyCredits. מתחת ל-$0.10 הליסט →
            סובסידיה לכל קרדיט שלא נוצל. השתמש בערך הזה למרג'ין על subscribers.
          </div>
        </CardContent>
      </Card>

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

      {/* V13.2 — recent calls table is now a client component that polls
          /api/admin/costs/recent-calls every 8s, supports
          provider/operation/status/date filters, and lazy-loads metadata
          per-row via ?expand=metadata. Initial 50 are SSR-rendered. */}
      <RecentCallsTable
        initial={recent.map((c) => ({
          id: c.id,
          provider: c.provider,
          operation: c.operation,
          model: c.model,
          status: c.status,
          success: c.success,
          costUsd: c.costUsd,
          estimatedCostUsd: (c as { estimatedCostUsd: number | null }).estimatedCostUsd ?? null,
          actualCostUsd: (c as { actualCostUsd: number | null }).actualCostUsd ?? null,
          inputTokens: c.inputTokens,
          outputTokens: c.outputTokens,
          units: c.units,
          durationMs: c.durationMs,
          errorMessage: c.errorMessage,
          createdAt: c.createdAt.toISOString(),
          completedAt: c.completedAt ? c.completedAt.toISOString() : null,
          userId: c.userId,
          projectId: c.projectId,
          renderJobId: (c as { renderJobId: string | null }).renderJobId ?? null,
          sceneId: (c as { sceneId: string | null }).sceneId ?? null,
          user: c.user,
        }))}
      />
    </div>
  );
}

// V12.6 — when a provider's balance API rejects us (missing scopes,
// auth errors), still render a useful card with our LOCAL spend from
// the ApiCall table. Better than a red error block.
function ProviderFallbackCard({
  providerSlug,
  byProviderRow,
  errorMsg,
  fixHint,
}: {
  providerSlug: string;
  byProviderRow: { _sum: { costUsd: number | null }; _count: { _all: number } } | undefined;
  errorMsg: string;
  fixHint: string;
}) {
  const localSpend30d = byProviderRow?._sum.costUsd ?? 0;
  const localCalls30d = byProviderRow?._count._all ?? 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-center">
        <div>
          <div className="text-2xl font-mono font-bold">
            {fmtUSD(localSpend30d)}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
            30 ימים — נצבר אצלנו
          </div>
        </div>
        <div>
          <div className="text-2xl font-mono font-bold">
            {localCalls30d.toLocaleString()}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
            קריאות
          </div>
        </div>
      </div>
      <details className="text-[11px] text-muted-foreground border border-amber-500/30 bg-amber-500/5 rounded p-2">
        <summary className="cursor-pointer font-semibold text-amber-700 dark:text-amber-400">
          ⚠ אין לנו גישה ל-{providerSlug}/balance — מוצג spend מקומי בלבד
        </summary>
        <div className="mt-2 space-y-1">
          <div>
            <span className="font-semibold">תיקון:</span> {fixHint}
          </div>
          <div className="font-mono text-[10px] text-destructive whitespace-pre-wrap break-all opacity-80">
            {errorMsg}
          </div>
        </div>
      </details>
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

// V13.2 — formatUnits moved into the client component
// app/(admin)/admin/costs/recent-calls.tsx alongside the live table.
