import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';

export default async function LibraryPage() {
  const { dbUser } = await getOrCreateAppUser();

  const finishedJobs = await prisma.renderJob.findMany({
    where: { userId: dbUser.id, status: 'completed' },
    include: { project: true },
    orderBy: { completedAt: 'desc' },
    take: 50,
  });

  return (
    <div className="p-6 md:p-10 max-w-6xl space-y-6">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">ספרייה</div>
        <h1 className="text-3xl font-bold tracking-tight">הסרטונים שלכם</h1>
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
          {finishedJobs.map((job) => (
            <Card key={job.id}>
              <div className="aspect-[9/16] bg-gradient-to-br from-primary/10 to-accent/10 rounded-t-lg flex items-center justify-center">
                <span className="text-4xl">▶</span>
              </div>
              <CardContent className="p-4">
                <div className="font-semibold truncate">{job.project.productName ?? 'ללא שם'}</div>
                <div className="text-xs text-muted-foreground mt-1 truncate" dir="ltr">
                  {job.finalVideoUrl}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {job.completedAt?.toLocaleDateString('he-IL') ?? '—'}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
