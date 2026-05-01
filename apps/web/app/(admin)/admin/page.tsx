import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getQueueCounts, getRecentFailedJobs } from '@/lib/admin/queue-stats';
import { RenderJobStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    rendersToday,
    failedToday,
    completedToday,
    queueCounts,
    recentFailed,
    recentUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { updatedAt: { gte: since24h } } }),
    prisma.renderJob.count({ where: { createdAt: { gte: since24h } } }),
    prisma.renderJob.count({
      where: { createdAt: { gte: since24h }, status: RenderJobStatus.failed },
    }),
    prisma.renderJob.count({
      where: { createdAt: { gte: since24h }, status: RenderJobStatus.completed },
    }),
    getQueueCounts(),
    prisma.renderJob.findMany({
      where: { status: RenderJobStatus.failed },
      include: { user: true, project: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const successRate = rendersToday > 0 ? Math.round((completedToday / rendersToday) * 100) : 0;

  return (
    <div className="p-6 md:p-10 max-w-7xl space-y-8">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin · Overview</div>
        <h1 className="text-3xl font-bold tracking-tight">מבט־על על המערכת</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="משתמשים סך הכל" value={totalUsers} sublabel={`${activeUsers} פעילים השבוע`} />
        <KpiCard label="ג׳ובים היום" value={rendersToday} sublabel={`${failedToday} כשלו`} />
        <KpiCard label="שיעור הצלחה (24ש׳)" value={`${successRate}%`} accent={successRate >= 90} />
        <KpiCard label="פעיל בתור עכשיו" value={queueCounts.active + queueCounts.waiting} sublabel={`${queueCounts.failed} failed lifetime`} />
      </div>

      {/* Two-column lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">ג׳ובים שכשלו לאחרונה</h3>
              <Link href="/admin/renders" className="text-xs text-muted-foreground hover:text-foreground">
                כל הג׳ובים ←
              </Link>
            </div>
            {recentFailed.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">אין כשלים אחרונים 🎉</div>
            ) : (
              <ul className="space-y-2">
                {recentFailed.map((job) => (
                  <li key={job.id} className="text-sm py-2 border-b border-border last:border-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="font-medium truncate">{job.project.productName ?? 'ללא שם'}</div>
                      <Badge variant="destructive">failed</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                      {job.user.email}
                    </div>
                    {job.errorMessage && (
                      <div className="text-xs text-destructive/80 mt-1 line-clamp-2" dir="ltr">
                        {job.errorMessage}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">משתמשים אחרונים</h3>
              <Link href="/admin/users" className="text-xs text-muted-foreground hover:text-foreground">
                כל המשתמשים ←
              </Link>
            </div>
            <ul className="space-y-2">
              {recentUsers.map((u) => (
                <li key={u.id} className="text-sm py-2 border-b border-border last:border-0 flex justify-between items-center">
                  <div>
                    <div className="font-medium" dir="ltr">{u.email}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {u.createdAt.toLocaleDateString('he-IL')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.role === 'admin' && <Badge variant="default">admin</Badge>}
                    <span className="text-xs text-muted-foreground">{u.creditsBalance} קרדיטים</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? 'bg-ai/20 border-ai/40' : undefined}>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-3xl font-bold mt-1">{value}</div>
        {sublabel && <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>}
      </CardContent>
    </Card>
  );
}
