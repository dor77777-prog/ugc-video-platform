import Link from 'next/link';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DensityScope } from '@/components/density/density-scope';
import { SectionKicker } from '@/components/ui/section-kicker';
import { Library } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const { dbUser } = await getOrCreateAppUser();

  const finishedJobs = await prisma.renderJob.findMany({
    where: { userId: dbUser.id, status: 'completed' },
    include: { project: true },
    orderBy: { completedAt: 'desc' },
    take: 50,
  });

  return (
    <DensityScope mode="comfortable" as="div" className="p-6 md:p-10 max-w-container-showcase mx-auto space-y-8">
      <div className="space-y-2 motion-fade-up">
        <SectionKicker variant="loud" text="ספרייה" english="Library" icon={Library} />
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">הסרטונים שלכם</h1>
      </div>

      {finishedJobs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center space-y-2">
            <div className="text-2xl">🎬</div>
            <div className="font-semibold">אין סרטונים גמורים עדיין</div>
            <div className="text-sm text-muted-foreground">
              צרו את הסרטון הראשון שלכם כדי שהוא יופיע כאן.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {finishedJobs.map((job) => {
            // Legacy mock:// URLs from the demo phase aren't real files.
            // We mark them as "mock" so the user knows why they don't play.
            const isMock = (job.finalVideoUrl ?? '').startsWith('mock://');
            const playableUrl = isMock ? null : job.finalVideoUrl;
            return (
              <Card key={job.id} className="overflow-hidden tier-elevated motion-fade-up motion-tilt-hover" id={`job-${job.id}`}>
                {/* V27.5 — view-transition-name on the per-job poster
                    so navigations from /videos (render complete →
                    redirect to library#job-X) can morph the just-
                    rendered final video poster from the render-status
                    panel into this tile. Reserved name from globals.css
                    §10. Per-id is essential — same name across all
                    tiles would collide. */}
                <div
                  className="aspect-[9/16] bg-black relative"
                  style={{ viewTransitionName: `--vt-final-video-poster-${job.id}` } as React.CSSProperties}
                >
                  {playableUrl ? (
                    // Inline 9:16 player — controls + click-anywhere to play.
                    // preload="metadata" keeps the grid light; the actual
                    // bytes only stream when the user hits play.
                    <video
                      src={playableUrl}
                      controls
                      preload="metadata"
                      playsInline
                      className="w-full h-full object-contain bg-black"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/60">
                      <span className="text-4xl">🎭</span>
                      <Badge variant="muted" className="text-[10px]">demo / mock</Badge>
                    </div>
                  )}
                </div>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold truncate flex-1">
                      {job.project.productName ?? 'ללא שם'}
                    </div>
                    {isMock && (
                      <Badge variant="muted" className="text-[10px] flex-shrink-0">
                        mock
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground" dir="ltr">
                    {job.completedAt?.toLocaleString('he-IL', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }) ?? '—'}
                  </div>
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    {playableUrl && (
                      <>
                        <a
                          href={playableUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90"
                        >
                          ↗ פתח במסך מלא
                        </a>
                        <a
                          href={playableUrl}
                          download
                          className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
                        >
                          ⬇ הורד
                        </a>
                      </>
                    )}
                    {/* Back-to-edit: lets the user iterate on the same
                        project (regenerate scenes, redo voice, re-render). */}
                    <Link
                      href={`/projects/${job.projectId}/videos`}
                      className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
                    >
                      ✎ ערוך פרויקט
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </DensityScope>
  );
}
