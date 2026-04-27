import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Stepper } from '@/components/wizard/stepper';

export default async function ScenesPlaceholder({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const { dbUser } = await getOrCreateAppUser();
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    include: {
      selectedScript: { include: { scenes: { orderBy: { sceneOrder: 'asc' } } } },
    },
  });
  if (!project) notFound();

  const selected = project.selectedScript;

  return (
    <div className="p-6 md:p-10 max-w-5xl space-y-8">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {project.productName}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">סצנות תמונות</h1>
      </div>

      <Stepper current={4} done={[1, 3]} />

      {selected ? (
        <Card className="bg-accent/10 border-accent/40">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <Badge variant="success">תסריט נבחר</Badge>
                <h2 className="text-xl font-semibold mt-2">{selected.hook}</h2>
              </div>
            </div>
            <div className="space-y-2">
              {selected.scenes.map((s) => (
                <div key={s.id} className="text-sm border-s-2 border-primary ps-3">
                  <div className="text-xs text-muted-foreground">
                    סצנה {s.sceneOrder + 1} · {s.durationSeconds}s
                  </div>
                  <div>{s.textHebrew}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            לא נבחר תסריט עדיין.{' '}
            <Link href={`/projects/${projectId}/scripts`} className="text-primary underline">
              חזור לבחירת תסריט
            </Link>
          </CardContent>
        </Card>
      )}

      <Card className="border-dashed">
        <CardContent className="p-12 text-center space-y-3">
          <div className="text-5xl">🖼️</div>
          <h2 className="text-xl font-semibold">בקרוב — יצירת תמונות לכל סצנה</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            ה-AI ייצר תמונה מפורטת לכל סצנה, על בסיס תיאור ה-visual_prompt_english והתמונה
            הראשית של המוצר כרפרנס. תוכל לאשר, לערוך פרומפט, או להריץ מחדש.
          </p>
          <div className="pt-2">
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/scripts`}>← חזרה לתסריט</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
