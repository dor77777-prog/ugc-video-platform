// V19.1 — bento-grid dashboard layout. Pulls from `dashboard` +
// `glassmorphism` + `contemporary` design systems. Asymmetric grid
// with the hero CTA spanning 3×2 on desktop, three stat tiles
// stacking on the right, and project tiles spanning various widths
// below. Cinematic mesh + noise background underneath.

import { Suspense } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  FolderKanban,
  Film,
  Coins,
  Sparkles,
  Clock,
  CheckCircle2,
  Library,
  Plus,
  TrendingUp,
  Play,
  Zap,
} from 'lucide-react';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCurrentStepNumber, getResumeUrl } from '@/lib/wizard/current-step';
import { WIZARD_STEPS } from '@/components/wizard/stepper';
import { StudioCanvasIllustration } from '@/components/brand/illustrations';
import { DashboardAurora } from '@/components/layout/dashboard-aurora';
import { AnimatedCounter, LiveActivityTicker } from '@/app/landing-hero';
import { DeleteProjectButton } from './delete-button';

export default async function DashboardHome() {
  const { dbUser } = await getOrCreateAppUser();

  // V21.1 — branch the hero CTA based on whether the user is new or
  // returning. We do this read up front (cheap query, hits the same
  // index as the count tiles) so the right hero renders in the
  // initial paint.
  const completedRendersCount = await prisma.renderJob.count({
    where: { userId: dbUser.id, status: 'completed' },
  });
  const isReturningUser = completedRendersCount > 0;

  return (
    <div className="relative min-h-screen">
      <DashboardAurora />
      <div className="relative px-6 md:px-10 py-8 md:py-10 space-y-12 max-w-7xl mx-auto">
        {/* ───────────── Header — landing-grade typography ───────────── */}
        <div className="space-y-3 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-soft-pulse" />
            לוח בקרה · Studio
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[0.95]">
            {isReturningUser ? 'שלום שוב, ' : 'ברוכים הבאים, '}
            <span className="text-gradient">{dbUser.email.split('@')[0]}</span>
          </h1>
        </div>

        {/* ───────────── Live activity ticker (returning users only) ───────────── */}
        {isReturningUser && (
          <div className="animate-fade-in-up [animation-delay:80ms]">
            <LiveActivityTicker />
          </div>
        )}

        {/* ───────────── Bento — hero CTA + stats ───────────── */}
        <div className="bento animate-fade-in-up [animation-delay:160ms]">
          {!isReturningUser ? (
            <FirstVideoHero />
          ) : (
            <ReturningUserHero completedCount={completedRendersCount} />
          )}

          <Suspense fallback={<StatTile label="פרויקטים" value={null} icon={FolderKanban} />}>
            <ProjectCountTile userId={dbUser.id} />
          </Suspense>
          <Suspense fallback={<StatTile label="סרטונים" value={null} icon={Film} />}>
            <RendersCountTile userId={dbUser.id} />
          </Suspense>
          <StatTile
            label="קרדיטים"
            value={dbUser.creditsBalance}
            icon={Coins}
            accent
          />
        </div>

        {/* ───────────── Completed videos showcase (returning users) ───────────── */}
        {isReturningUser && (
          <Suspense fallback={null}>
            <CompletedVideosShowcase userId={dbUser.id} />
          </Suspense>
        )}

        {/* ───────────── Recent projects ───────────── */}
        <Suspense fallback={<RecentProjectsSkeleton />}>
          <RecentProjectsSection userId={dbUser.id} />
        </Suspense>
      </div>
    </div>
  );
}

// V22 — completed-renders showcase grid. Renders the user's 6 most-
// recent completed RenderJobs as 9:16 thumbnail cards using the FIRST
// scene image of each project as the visual (since we don't generate
// dedicated MP4 thumbnails). Hover scale + numbered badge + Play
// overlay to signal "click to play".
async function CompletedVideosShowcase({ userId }: { userId: string }) {
  const completed = await prisma.renderJob.findMany({
    where: { userId, status: 'completed' },
    select: {
      id: true,
      finalVideoUrl: true,
      completedAt: true,
      project: {
        select: {
          id: true,
          productName: true,
          scripts: {
            select: {
              scenes: {
                where: { sceneOrder: 0 },
                select: { imageUrl: true },
                take: 1,
              },
            },
            take: 1,
          },
        },
      },
    },
    orderBy: { completedAt: 'desc' },
    take: 6,
  });

  if (completed.length === 0) return null;

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-end justify-between">
        <h3 className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.25em]">
          <Film className="h-4 w-4 text-accent" />
          הסרטונים שיצרת
        </h3>
        <Link
          href="/library"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          ספריית מלאה
          <ArrowLeft className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {completed.map((job, i) => {
          const thumbnail = job.project.scripts[0]?.scenes[0]?.imageUrl ?? null;
          return (
            <Link
              key={job.id}
              href={`/library#job-${job.id}`}
              className="group relative aspect-[9/16] rounded-2xl overflow-hidden glass card-hover animate-fade-in-up cursor-pointer"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {thumbnail ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={thumbnail}
                  alt={job.project.productName ?? 'סרטון'}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/15" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="h-12 w-12 rounded-full bg-primary/90 backdrop-blur-md flex items-center justify-center shadow-glow">
                  <Play className="h-5 w-5 text-background ms-0.5" fill="currentColor" />
                </div>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-3">
                <div className="text-xs font-bold truncate">
                  {job.project.productName ?? '—'}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  {job.completedAt
                    ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' }).format(
                        job.completedAt,
                      )
                    : ''}
                </div>
              </div>
              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-background/80 backdrop-blur-md text-[9px] font-black tracking-widest uppercase border border-border-subtle">
                {String(i + 1).padStart(2, '0')}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// V21.1 — Hero for first-time users (no completed renders yet).
// Encourages them to create their first ad.
function FirstVideoHero() {
  return (
    <Card className="bento-3x1 md:bento-2x2 glass-strong gradient-border relative overflow-hidden card-hover">
      <div
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            'radial-gradient(circle at 20% 100%, hsl(258 100% 65% / 0.4), transparent 60%), radial-gradient(circle at 80% 0%, hsl(73 95% 60% / 0.3), transparent 60%)',
        }}
      />
      <CardContent className="p-7 md:p-10 h-full flex flex-col justify-between gap-6">
        <div className="space-y-4">
          <Badge
            variant="outline"
            className="border-primary/40 bg-primary/10 text-primary gap-1.5 backdrop-blur-md"
          >
            <Sparkles className="h-3 w-3" />
            Powered by AI
          </Badge>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
            צרו את הסרטון <span className="text-gradient">הראשון שלכם</span>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-md">
            הזינו כתובת מוצר. נכתוב 6 תסריטים, נבחר אווטאר ונרכיב סרטון
            9:16 בעברית — מוכן לפייסבוק וטיקטוק תוך פחות מ־5 דקות.
          </p>
        </div>
        <Button asChild size="lg" className="shadow-glow self-start">
          <Link href="/projects/new" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            צור סרטון מוצר
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// V21.1 — Hero for returning users (≥1 completed render). Surfaces
// production stats + dual CTA: "create another" + "browse library".
// Replaces the "create your first" pitch which feels condescending
// to a returning user.
function ReturningUserHero({ completedCount }: { completedCount: number }) {
  return (
    <Card className="bento-3x1 md:bento-2x2 glass-strong gradient-border relative overflow-hidden card-hover">
      <div
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            'radial-gradient(circle at 20% 100%, hsl(258 100% 65% / 0.4), transparent 60%), radial-gradient(circle at 80% 0%, hsl(73 95% 60% / 0.3), transparent 60%)',
        }}
      />
      <div className="absolute right-6 top-6 hidden md:block opacity-30 pointer-events-none">
        <StudioCanvasIllustration className="w-64 h-36" />
      </div>
      <CardContent className="relative p-7 md:p-10 h-full flex flex-col justify-between gap-6">
        <div className="space-y-4">
          <Badge
            variant="outline"
            className="border-accent/40 bg-accent/10 text-accent gap-1.5 backdrop-blur-md"
          >
            <TrendingUp className="h-3 w-3" />
            סטודיו פעיל · {completedCount} סרטונים
          </Badge>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
            <span className="text-gradient">סרטון נוסף</span> במחי לחיצה
          </h2>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-md">
            יש לך כבר {completedCount} סרטונים בספרייה. צור גרסה חדשה למוצר שכבר
            הזנת, או התחל פרויקט חדש לגמרי. הצינור הולך הרבה יותר מהר בפעם השנייה.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="shadow-glow">
            <Link href="/projects/new" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              פרויקט חדש
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-border bg-card/40 backdrop-blur-md"
          >
            <Link href="/library" className="flex items-center gap-2">
              <Library className="h-4 w-4" />
              ספריית הסרטונים
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

async function ProjectCountTile({ userId }: { userId: string }) {
  const count = await prisma.project.count({ where: { userId } });
  return <StatTile label="פרויקטים" value={count} icon={FolderKanban} />;
}

async function RendersCountTile({ userId }: { userId: string }) {
  const count = await prisma.renderJob.count({
    where: { userId, status: 'completed' },
  });
  return <StatTile label="סרטונים" value={count} icon={Film} />;
}

function StatTile({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: number | null;
  accent?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card
      className={
        accent
          ? 'glass card-hover border-accent/40 bg-accent/10'
          : 'glass card-hover'
      }
    >
      <CardContent className="p-5 h-full flex flex-col justify-between gap-3">
        <div
          className={
            accent
              ? 'h-10 w-10 rounded-xl bg-accent/25 text-accent-foreground flex items-center justify-center'
              : 'h-10 w-10 rounded-xl bg-gradient-to-br from-primary/30 to-accent/15 text-primary flex items-center justify-center'
          }
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-4xl md:text-5xl font-black tracking-tight font-mono leading-none">
            {value === null ? (
              <span className="inline-block h-9 w-14 bg-muted/40 rounded animate-pulse" />
            ) : (
              <AnimatedCounter end={value} />
            )}
          </div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground mt-2">
            {label}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function RecentProjectsSection({ userId }: { userId: string }) {
  const recentProjects = await prisma.project.findMany({
    where: { userId, status: { not: 'archived' } },
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
  const inProgress = recentProjects.filter(
    (p) => p.status !== 'completed' && p.status !== 'failed',
  );
  const finished = recentProjects.filter((p) => p.status === 'completed');

  return (
    <div className="space-y-10">
      {/* In-progress */}
      {inProgress.length > 0 && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
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
                  className="glass card-hover tilt-hover animate-fade-in-up"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="font-bold truncate text-base">
                        {p.productName ?? 'פרויקט ללא שם'}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <Badge
                          variant="outline"
                          className="border-primary/40 bg-primary/10 text-primary font-mono"
                        >
                          שלב {step}/6
                        </Badge>
                        <span>{stepLabel}</span>
                        <span>·</span>
                        <span className="font-mono">
                          {new Intl.DateTimeFormat('he-IL', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          }).format(p.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <Button asChild size="sm" className="shadow-glow">
                      <Link href={resumeUrl} className="flex items-center gap-1.5">
                        המשך
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <DeleteProjectButton
                      projectId={p.id}
                      productName={p.productName ?? 'פרויקט'}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed */}
      {finished.length > 0 && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            הושלמו לאחרונה
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {finished.map((p, i) => (
              <Card
                key={p.id}
                className="glass card-hover tilt-hover animate-fade-in-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate text-base">
                      {p.productName ?? '—'}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' }).format(
                        p.updatedAt,
                      )}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-accent/40 bg-accent/10 text-accent gap-1"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    הושלם
                  </Badge>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-border bg-card/40"
                  >
                    <Link href={`/projects/${p.id}/videos`}>ערוך</Link>
                  </Button>
                  <DeleteProjectButton
                    projectId={p.id}
                    productName={p.productName ?? 'פרויקט'}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {projectCount === 0 && (
        <Card className="glass-liquid border-dashed border-2 border-primary/30 animate-fade-in-up">
          <CardContent className="p-12 text-center space-y-5">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center shadow-glow">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="text-xl font-bold tracking-tight">
                עדיין לא יצרתם פרויקטים
              </div>
              <div className="text-sm text-muted-foreground max-w-md mx-auto">
                לחצו "התחילו עכשיו" — דקה של הזנת פרטי המוצר, ואנחנו נכין לכם 6
                גרסאות תסריט שונות לבחירה.
              </div>
            </div>
            <Button asChild className="shadow-glow">
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
          <Card key={i} className="glass opacity-60">
            <CardContent className="p-5 h-[88px] animate-pulse bg-muted/20" />
          </Card>
        ))}
      </div>
    </div>
  );
}
