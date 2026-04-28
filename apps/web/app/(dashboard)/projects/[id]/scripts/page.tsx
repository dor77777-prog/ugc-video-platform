import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScriptAngle } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/wizard/stepper';
import { GenerateButton, ScriptCard } from './client-bits';
import { selectScriptAction, continueAfterSelectAction } from './actions';

// V2: framework labels in Hebrew. Older scripts (pre-V2) won't have a `framework`
// field — for those we fall back to the legacy angle label.
const FRAMEWORK_LABEL_HEBREW: Record<string, string> = {
  problem_agitation_solution: 'בעיה → הסלמה → פתרון',
  skeptical_testimonial: 'סקפטיקל מתהפך',
  demonstration_proof: 'הדגמה ויזואלית',
  price_alternative_anchor: 'עוגן מחיר/אלטרנטיבה',
  relatable_israeli_moment: 'רגע ישראלי',
  fast_direct_response: 'דיירקט-ריספונס מהיר',
};

const ANGLE_LABEL_HEBREW: Record<ScriptAngle, string> = {
  problem_solution: 'בעיה ↔ פתרון',
  testimonial: 'המלצה אישית',
  product_demo: 'הדגמת מוצר',
  before_after: 'לפני / אחרי',
  price_anchor: 'השוואת מחיר',
  fast_benefit: 'תועלת מהירה',
};

const FRAMEWORK_ORDER = [
  'problem_agitation_solution',
  'skeptical_testimonial',
  'demonstration_proof',
  'price_alternative_anchor',
  'relatable_israeli_moment',
  'fast_direct_response',
];

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

  // Sort scripts: V2 scripts come first by framework order, V1 fall back to angle order.
  const scripts = [...project.scripts].sort((a, b) => {
    const aIdx = a.framework ? FRAMEWORK_ORDER.indexOf(a.framework) : -1;
    const bIdx = b.framework ? FRAMEWORK_ORDER.indexOf(b.framework) : -1;
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    return ANGLE_ORDER.indexOf(a.angle) - ANGLE_ORDER.indexOf(b.angle);
  });

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
              const label = s.framework
                ? FRAMEWORK_LABEL_HEBREW[s.framework] ?? ANGLE_LABEL_HEBREW[s.angle]
                : ANGLE_LABEL_HEBREW[s.angle];
              const raw = (s.rawJson ?? {}) as Record<string, unknown>;
              const strategy =
                (raw.creativeStrategy as Record<string, unknown> | undefined) ?? null;
              const qualityScore =
                (raw.qualityScore as Record<string, unknown> | undefined) ?? null;
              const hookOptions = Array.isArray(raw.hookOptions)
                ? (raw.hookOptions as string[])
                : [];
              const hookReason =
                typeof raw.hookReason === 'string' ? raw.hookReason : '';
              return (
                <ScriptCard
                  key={s.id}
                  scriptId={s.id}
                  projectId={projectId}
                  angleLabel={label}
                  hook={s.hook}
                  cta={s.cta ?? ''}
                  estimatedDurationSeconds={s.estimatedDurationSeconds}
                  qualityScoreOverall={s.qualityScoreOverall ?? null}
                  hookOptions={hookOptions}
                  hookReason={hookReason}
                  creativeStrategy={strategy}
                  qualityScore={qualityScore}
                  scenes={s.scenes.map((sc) => ({
                    id: sc.id,
                    sceneOrder: sc.sceneOrder,
                    sceneGoal: sc.sceneGoal ?? null,
                    textHebrew: sc.textHebrew,
                    onScreenCaption: sc.onScreenCaptionHebrew ?? '',
                    cameraDirection: sc.cameraDirection ?? '',
                    performanceNote: sc.performanceNote ?? '',
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
