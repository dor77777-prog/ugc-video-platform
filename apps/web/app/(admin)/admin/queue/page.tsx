import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getQueueCounts, getRecentFailedJobs, getActiveJobs } from '@/lib/admin/queue-stats';
import { cleanCompletedAction, cleanFailedAction, pauseQueueAction, resumeQueueAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminQueuePage() {
  const [counts, failed, active] = await Promise.all([
    getQueueCounts(),
    getRecentFailedJobs(10),
    getActiveJobs(10),
  ]);

  const isPaused = counts.paused > 0;

  return (
    <div className="p-6 md:p-10 max-w-7xl space-y-6">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin · BullMQ Queue</div>
        <h1 className="text-3xl font-bold tracking-tight">תור הרינדור</h1>
        <p className="text-sm text-muted-foreground">חי מ־Redis. רענן את הדף כדי לקבל ערכים עדכניים.</p>
      </div>

      {/* 6 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="ממתין" value={counts.waiting} />
        <StatCard label="פעיל" value={counts.active} accent={counts.active > 0} />
        <StatCard label="הושלם" value={counts.completed} />
        <StatCard label="כשל" value={counts.failed} danger={counts.failed > 0} />
        <StatCard label="מעוכב" value={counts.delayed} />
        <StatCard label="מושהה" value={counts.paused} />
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">פעולות:</span>
          <form action={cleanFailedAction}>
            <button className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted">
              נקה כשלונות ישנים מ־1ש׳
            </button>
          </form>
          <form action={cleanCompletedAction}>
            <button className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted">
              נקה הושלמו ישנים מ־24ש׳
            </button>
          </form>
          {isPaused ? (
            <form action={resumeQueueAction}>
              <button className="text-xs px-3 py-1.5 rounded-md bg-ai text-ai-foreground font-semibold">
                המשך עיבוד
              </button>
            </form>
          ) : (
            <form action={pauseQueueAction}>
              <button className="text-xs px-3 py-1.5 rounded-md bg-foreground text-background font-semibold">
                השהה תור
              </button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Active jobs */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <h3 className="font-semibold">ג׳ובים שרצים עכשיו</h3>
          {active.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">אין ג׳ובים פעילים</div>
          ) : (
            <ul className="space-y-1">
              {active.map((j) => (
                <li key={j.id} className="text-sm flex justify-between items-center py-2 border-b border-border last:border-0">
                  <span className="font-mono text-xs">{j.id}</span>
                  <span className="text-xs text-muted-foreground">{j.name}</span>
                  <Badge variant="default">{typeof j.progress === 'number' ? `${j.progress}%` : '—'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Failed jobs */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <h3 className="font-semibold">10 כשלונות אחרונים בתור</h3>
          {failed.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">אין כשלים בתור 🎉</div>
          ) : (
            <ul className="space-y-2">
              {failed.map((j) => (
                <li key={j.id} className="text-sm py-2 border-b border-border last:border-0">
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-mono text-xs">{j.id}</div>
                    <Badge variant="destructive">{j.attemptsMade} ניסיונות</Badge>
                  </div>
                  <div className="text-xs text-destructive mt-1" dir="ltr">{j.failedReason}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(j.timestamp).toLocaleString('he-IL')}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  danger,
}: {
  label: string;
  value: number;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <Card
      className={
        danger
          ? 'border-destructive/40 bg-destructive/5'
          : accent
            ? 'border-ai/60 bg-ai/15'
            : undefined
      }
    >
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className={`text-3xl font-bold mt-1 ${danger ? 'text-destructive' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
