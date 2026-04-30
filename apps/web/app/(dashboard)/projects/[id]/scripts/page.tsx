// Script generation can take up to 90s (Product Intelligence + 6 parallel
// OpenAI calls). Without this the default 60s Vercel timeout kills the
// Server Action and leaves the client button stuck in pending forever.
export const maxDuration = 120;

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScriptAngle } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { timed } from '@/lib/timing';
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
  const pageStart = Date.now();
  console.log(`[PAGE] /projects/[id]/scripts — render start`);

  const { id: projectId } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const project = await timed('scripts-page:project.findFirst+scripts+scenes', () =>
    prisma.project.findFirst({
      where: { id: projectId, userId: dbUser.id },
      // V14.1b — explicit select. Was fetching all Project + all Script
      // + all Scene columns (heavy JSON: motionAnalysisJson /
      // generationLogJson / wordTimingsJson / captionChunksJson /
      // briefJson / imageBriefJson — none rendered here). Per-script
      // payload drops from ~60-col Scene rows to 8 needed columns.
      select: {
        id: true,
        productName: true,
        selectedScriptId: true,
        scripts: {
          select: {
            id: true,
            framework: true,
            angle: true,
            hook: true,
            cta: true,
            estimatedDurationSeconds: true,
            qualityScoreOverall: true,
            rawJson: true,
            scenes: {
              orderBy: { sceneOrder: 'asc' },
              select: {
                id: true,
                sceneOrder: true,
                sceneGoal: true,
                textHebrew: true,
                onScreenCaptionHebrew: true,
                cameraDirection: true,
                performanceNote: true,
                durationSeconds: true,
              },
            },
          },
        },
      },
    }),
  );
  if (!project) notFound();

  console.log(`[PAGE] /projects/[id]/scripts — total render: ${Date.now() - pageStart}ms`);

  // Sort scripts: V2 scripts come first by framework order, V1 fall back to angle order.
  const scripts = [...project.scripts].sort((a, b) => {
    const aIdx = a.framework ? FRAMEWORK_ORDER.indexOf(a.framework) : -1;
    const bIdx = b.framework ? FRAMEWORK_ORDER.indexOf(b.framework) : -1;
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    return ANGLE_ORDER.indexOf(a.angle) - ANGLE_ORDER.indexOf(b.angle);
  });

  const hasScripts = scripts.length > 0;
  const isStreaming = scripts.length > 0 && scripts.length < 6;
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
          {isStreaming && (
            <div className="rounded-md border border-primary/30 bg-primary/[0.05] p-3 text-sm flex items-center gap-2">
              <span className="animate-pulse text-lg">⏳</span>
              <span>
                <strong>{scripts.length} מתוך 6 תסריטים</strong> מוכנים — השאר עדיין ביצירה. הדף מתעדכן אוטומטית.
              </span>
            </div>
          )}
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
            {isStreaming &&
              Array.from({ length: 6 - scripts.length }).map((_, i) => (
                <Card
                  key={`pending-${i}`}
                  className="border-dashed animate-pulse opacity-60"
                >
                  <CardContent className="p-6 space-y-3">
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-3 bg-muted rounded w-full" />
                    <div className="h-3 bg-muted rounded w-5/6" />
                    <div className="h-3 bg-muted rounded w-4/6" />
                    <div className="text-xs text-muted-foreground pt-2">
                      ⏳ תסריט בתהליך יצירה…
                    </div>
                  </CardContent>
                </Card>
              ))}
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
