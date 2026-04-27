import Link from 'next/link';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default async function DashboardHome() {
  const { dbUser } = await getOrCreateAppUser();

  const projectCount = await prisma.project.count({ where: { userId: dbUser.id } });
  const completedRenders = await prisma.renderJob.count({
    where: { userId: dbUser.id, status: 'completed' },
  });

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">לוח בקרה</div>
        <h1 className="text-3xl font-bold tracking-tight">ברוכים הבאים, {dbUser.email}</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="פרויקטים" value={projectCount} />
        <StatCard label="סרטונים שנוצרו" value={completedRenders} />
        <StatCard label="קרדיטים" value={dbUser.creditsBalance} accent />
      </div>

      {/* Big CTA */}
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

      {/* Empty state for project list */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          הפרויקטים שלכם
        </h3>
        {projectCount === 0 ? (
          <Card>
            <CardContent className="p-12 text-center space-y-3">
              <div className="text-muted-foreground text-sm">עדיין לא יצרתם פרויקטים.</div>
              <Button asChild variant="outline">
                <Link href="/projects/new">התחילו עכשיו</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              רשימת פרויקטים תופיע כאן (יש {projectCount}).
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card className={accent ? 'bg-accent/20 border-accent/40' : undefined}>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-3xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
