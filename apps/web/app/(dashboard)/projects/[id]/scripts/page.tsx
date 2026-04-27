import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScriptAngle } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/wizard/stepper';
import { GenerateButton, ScriptCard } from './client-bits';
import { selectScriptAction, continueAfterSelectAction } from './actions';

const ANGLE_LABEL_HEBREW: Record<ScriptAngle, string> = {
  problem_solution: 'בעיה ↔ פתרון',
  testimonial: 'המלצה אישית',
  product_demo: 'הדגמת מוצר',
  before_after: 'לפני / אחרי',
  price_anchor: 'השוואת מחיר',
  fast_benefit: 'תועלת מהירה',
};

const ANGLE_ORDER: ScriptAngle[] = [
  'problem_solution',
  'testimonial',
  'product_demo',
  'before_after',
  'price_anchor',
  'fast_benefit',
];

export default async function ScriptsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    include: {
      scripts: {
        include: { scenes: { orderBy: { sceneOrder: 'asc' } } },
      },
    },
  });
  if (!project) notFound();

  // Sort scripts by canonical angle order.
  const scripts = [...project.scripts].sort(
    (a, b) => ANGLE_ORDER.indexOf(a.angle) - ANGLE_ORDER.indexOf(b.angle),
  );

  const hasScripts = scripts.length > 0;
  const selectedScriptId = project.selectedScriptId;

  return (
    <div className="p-6 md:p-10 max-w-6xl space-y-8">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {project.productName}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">בחר תסריט</h1>
        <p className="text-sm text-muted-foreground">
          ה-AI כותב 6 תסריטים בזוויות שיווקיות שונות. בחר אחד שמדבר אליך — תוכל גם לערוך
          אותו ידנית בשלבים הבאים.
        </p>
      </div>

      <Stepper current={3} done={[1, 2]} projectId={projectId} />

      {!hasScripts ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center space-y-5">
            <div className="text-5xl">✍️</div>
            <h2 className="text-2xl font-bold">צור 6 תסריטים</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              נשלח את פרטי המוצר ל-AI ונקבל בחזרה 6 גרסאות שונות לתסריט קצר. עלות:{' '}
              <strong>קרדיט אחד</strong> (יש לך {dbUser.creditsBalance}).
            </p>
            <GenerateButton projectId={projectId} />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scripts.map((s) => {
              const isSelected = s.id === selectedScriptId;
              return (
                <ScriptCard
                  key={s.id}
                  scriptId={s.id}
                  projectId={projectId}
                  angleLabel={ANGLE_LABEL_HEBREW[s.angle]}
                  hook={s.hook}
                  cta={s.cta ?? ''}
                  estimatedDurationSeconds={s.estimatedDurationSeconds}
                  scenes={s.scenes.map((sc) => ({
                    id: sc.id,
                    sceneOrder: sc.sceneOrder,
                    textHebrew: sc.textHebrew,
                    durationSeconds: sc.durationSeconds,
                  }))}
                  isSelected={isSelected}
                  selectAction={selectScriptAction}
                />
              );
            })}
          </div>

          <div className="flex justify-between items-center gap-3 pt-4" dir="ltr">
            <GenerateButton projectId={projectId} regenerate />
            <form action={continueAfterSelectAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <Button type="submit" size="lg" disabled={!selectedScriptId}>
                המשך לשלב הבא →
              </Button>
            </form>
          </div>
        </>
      )}

      {/* Subtle footer with credits + nav back */}
      <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-4">
        <Link href="/dashboard" className="hover:text-foreground">
          ← חזרה לדאשבורד
        </Link>
        <div>
          קרדיטים: <span className="font-mono font-semibold">{dbUser.creditsBalance}</span>
        </div>
      </div>
    </div>
  );
}
