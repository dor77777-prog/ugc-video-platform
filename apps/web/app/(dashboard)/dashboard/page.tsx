import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, FolderKanban, Film, Coins, Sparkles, Clock, CheckCircle2 } from 'lucide-react';
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
    <div className="relative bg-mesh bg-noise min-h-screen">
      <div className="relative p-8 space-y-10 max-w-6xl">
        <div className="space-y-2 animate-fade-in-up">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>לוח בקרה</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            ברוכים הבאים, <span className="text-gradient">{dbUser.email.split('@')[0]}</span>
          </h1>
        </div>

        {/* Stats — streamed separately so 3 counts don't block the header. */}
        <Suspense fallback={<StatsSkeleton creditsBalance={dbUser.creditsBalance} />}>
          <StatsSection userId={dbUser.id} creditsBalance={dbUser.creditsBalance} />
        </Suspense>

        {/* Big CTA — pure markup, never blocks. */}
        <Card className="relative overflow-hidden border-primary/30 shadow-glow animate-fade-in-up [animation-delay:120ms]">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-card to-accent/15 -z-10" />
          <CardContent className="p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-6 justify-between">
            <div className="space-y-3 max-w-xl">
              <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 gap-1.5">
                <Sparkles className="h-3 w-3" />
                Powered by AI
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                צרו את הסרטון הראשון שלכם
              </h2>
              <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
                הזינו כתובת מוצר או הקלידו פרטים ידנית. אנחנו נכתוב 6 תסריטים,
                נבחר אווטאר ונרכיב סרטון אנכי בעברית מוכן לפייסבוק וטיקטוק.
              </p>
            </div>
            <Button asChild size="lg" className="shadow-glow">
              <Link href="/projects/new" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                צור סרטון מוצר
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent projects — streamed; bottom of the page can fade in. */}
        <Suspense fallback={<RecentProjectsSkeleton />}>
          <RecentProjectsSection userId={dbUser.id} />
        </Suspense>
      </div>
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
      <StatCard label="פרויקטים" value={projectCount} icon={FolderKanban} />
      <StatCard label="סרטונים שנוצרו" value={completedRenders} icon={Film} />
      <StatCard label="קרדיטים" value={creditsBalance} icon={Coins} accent />
    </div>
  );
}

function StatsSkeleton({ creditsBalance }: { creditsBalance: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard label="פרויקטים" value={null} icon={FolderKanban} />
      <StatCard label="סרטונים שנוצרו" value={null} icon={Film} />
      <StatCard label="קרדיטים" value={creditsBalance} icon={Coins} accent />
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
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            <Clock className="h-4 w-4 text-primary" />
            ממשיכים ממה שהפסקת
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {inProgress.map((p, i) => {
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
                <Card
                  key={p.id}
                  className="glass card-hover hover:border-primary/40 animate-fade-in-up"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="font-semibold truncate text-base">
                        {p.productName ?? 'פרויקט ללא שם'}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <Badge variant="outline" className="border-primary/30 text-primary">שלב {step}/6</Badge>
                        <span>{stepLabel}</span>
                        <span>·</span>
                        <span>
                          עודכן {new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(p.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <Button asChild size="sm">
                      <Link href={resumeUrl} className="flex items-center gap-1.5">
                        המשך
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Link>
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
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            הושלמו לאחרונה
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {finished.map((p, i) => (
              <Card
                key={p.id}
                className="glass card-hover animate-fade-in-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate text-base">{p.productName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' }).format(p.updatedAt)}
                    </div>
                  </div>
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    הושלם
                  </Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/projects/${p.id}/videos`}>ערוך</Link>
                  </Button>
                  <DeleteProjectButton projectId={p.id} productName={p.productName ?? 'פרויקט'} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state — V15 polished */}
      {projectCount === 0 && (
        <Card className="glass border-dashed border-2 border-primary/20 animate-fade-in-up">
          <CardContent className="p-12 text-center space-y-5">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="text-lg font-semibold">עדיין לא יצרתם פרויקטים</div>
              <div className="text-sm text-muted-foreground max-w-md mx-auto">
                לחצו "התחילו עכשיו" — דקה של הזנת פרטי המוצר, ואנחנו נכין לכם 6 גרסאות תסריט שונות לבחירה.
              </div>
            </div>
            <Button asChild>
              <Link href="/projects/new" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                התחילו עכשיו
              </Link>
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
  icon: Icon,
}: {
  label: string;
  value: number | null;
  accent?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card
      className={
        accent
          ? 'glass border-accent/40 bg-accent/15 card-hover animate-fade-in-up [animation-delay:80ms]'
          : 'glass card-hover animate-fade-in-up'
      }
    >
      <CardContent className="p-5 flex items-center gap-4">
        {Icon && (
          <div
            className={
              accent
                ? 'h-10 w-10 rounded-lg bg-accent/30 flex items-center justify-center text-accent-foreground'
                : 'h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary'
            }
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-muted-foreground uppercase tracking-widest">{label}</div>
          <div className="text-3xl font-bold tracking-tight mt-0.5">
            {value === null ? (
              <span className="inline-block h-7 w-12 bg-muted/40 rounded animate-pulse" />
            ) : (
              value
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
