import { Suspense } from 'react';
import Link from 'next/link';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCurrentStepNumber, getResumeUrl } from '@/lib/wizard/current-step';
import { WIZARD_STEPS } from '@/components/wizard/stepper';
import { DeleteProjectButton } from './delete-button';

// V14.3-C — split the dashboard into:
//   1. instant shell (header + 3 stat cards + CTA card) — uses only the
//      authoritative `dbUser` already fetched at the top, no extra
//      query latency on top of auth.
//   2. <RecentProjectsSection /> — streamed via Suspense. Holds the
//      slower findMany on Project + Script + Scene, plus the wizard
//      step computation. Header is on screen ~500ms earlier on slow
//      DB connections.
export default async function DashboardHome() {
  const { dbUser } = await getOrCreateAppUser();

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">לוח בקרה</div>
        <h1 className="text-3xl font-bold tracking-tight">ברוכים הבאים, {dbUser.email}</h1>
      </div>

      {/* Stats — streamed separately so 3 counts don't block the header. */}
      <Suspense fallback={<StatsSkeleton creditsBalance={dbUser.creditsBalance} />}>
        <StatsSection userId={dbUser.id} creditsBalance={dbUser.creditsBalance} />
      </Suspense>

      {/* Big CTA — pure markup, never blocks. */}
      <Card className="bg-gradient-to-br from-primary/5 via-card to-accent/10 border-primary/20">
        <CardContent className="p-8 flex flex-col md:flex-row items-start md:items-center gap-6 justify-between">
          <div className="space-y-2 max-w-xl">
            <h2 className="text-2xl font-bold">צרו את הסרטון הראשון שלכם</h2>
            <p className="text-muted-foreground text-sm">
              הזינו כתובת מוצר או הקלידו פרטים ידנית. אנחנו נכתוב 6 תסריטים, נבחר אווטאר ונרכיב
              סרטון אנכי בעברית מוכן לפייסבוק וטיקטוק.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/projects/new">צור סרטון מוצר</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Recent projects — streamed; bottom of the page can fade in. */}
      <Suspense fallback={<RecentProjectsSkeleton />}>
        <RecentProjectsSection userId={dbUser.id} />
      </Suspense>
    </div>
  );
}

async function StatsSection({
  userId,
  creditsBalance,
}: {
  userId: string;
  creditsBalance: number;
}) {
  const [projectCount, completedRenders] = await Promise.all([
    prisma.project.count({ where: { userId } }),
    prisma.renderJob.count({ where: { userId, status: 'completed' } }),
  ]);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard label="פרויקטים" value={projectCount} />
      <StatCard label="סרטונים שנוצרו" value={completedRenders} />
      <StatCard label="קרדיטים" value={creditsBalance} accent />
    </div>
  );
}

function StatsSkeleton({ creditsBalance }: { creditsBalance: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard label="פרויקטים" value={null} />
      <StatCard label="סרטונים שנוצרו" value={null} />
      <StatCard label="קרדיטים" value={creditsBalance} accent />
    </div>
  );
}

async function RecentProjectsSection({ userId }: { userId: string }) {
  const recentProjects = await prisma.project.findMany({
    where: { userId, status: { not: 'archived' } },
    // V14.1b — explicit select instead of full include. Skips userId /
    // productUrl / createdAt that the dashboard never renders, and
    // pulls only id+imageUrl off scenes (the wizard helpers don't
    // touch the rest of the 60-column Scene model).
    select: {
      id: true,
      productName: true,
      status: true,
      updatedAt: true,
      selectedScriptId: true,
      productData: true,
      scripts: {
        select: {
          id: true,
          scenes: { select: { id: true, imageUrl: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 8,
  });

  const projectCount = recentProjects.length;
  const inProgress = recentProjects.filter((p) => p.status !== 'completed' && p.status !== 'failed');
  const finished = recentProjects.filter((p) => p.status === 'completed');

  return (
    <div className="space-y-8">
      {/* In-progress projects (resume) */}
      {inProgress.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            ממשיכים ממה שהפסקת
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {inProgress.map((p) => {
              const step = getCurrentStepNumber({
                id: p.id,
                selectedScriptId: p.selectedScriptId,
                productData: p.productData,
                scripts: p.scripts,
              });
              const stepLabel = WIZARD_STEPS.find((s) => s.num === step)?.label ?? '';
              const resumeUrl = getResumeUrl({
                id: p.id,
                selectedScriptId: p.selectedScriptId,
                productData: p.productData,
                scripts: p.scripts,
              });
              return (
                <Card key={p.id} className="hover:border-primary/40 transition-colors">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-semibold truncate">
                        {p.productName ?? 'פרויקט ללא שם'}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">שלב {step}/6</Badge>
                        <span>{stepLabel}</span>
                        <span>·</span>
                        <span>
                          עודכן {new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(p.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <Button asChild size="sm">
                      <Link href={resumeUrl}>המשך →</Link>
                    </Button>
                    <DeleteProjectButton projectId={p.id} productName={p.productName ?? 'פרויקט'} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Recently completed */}
      {finished.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            הושלמו לאחרונה
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {finished.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{p.productName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' }).format(p.updatedAt)}
                    </div>
                  </div>
                  <Badge variant="success">הושלם</Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/projects/${p.id}/videos`}>✎ ערוך</Link>
                  </Button>
                  <DeleteProjectButton projectId={p.id} productName={p.productName ?? 'פרויקט'} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {projectCount === 0 && (
        <Card>
          <CardContent className="p-12 text-center space-y-3">
            <div className="text-muted-foreground text-sm">עדיין לא יצרתם פרויקטים.</div>
            <Button asChild variant="outline">
              <Link href="/projects/new">התחילו עכשיו</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RecentProjectsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-3 w-40 bg-muted/40 rounded animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="opacity-60">
            <CardContent className="p-5 h-[88px] animate-pulse bg-muted/20" />
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | null;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? 'bg-accent/20 border-accent/40' : undefined}>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-3xl font-bold mt-1">
          {value === null ? (
            <span className="inline-block h-7 w-12 bg-muted/40 rounded animate-pulse" />
          ) : (
            value
          )}
        </div>
      </CardContent>
    </Card>
  );
}
