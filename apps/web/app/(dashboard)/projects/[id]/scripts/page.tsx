// Script generation can take up to ~3min on Sonnet 4.6 (V14):
// Product Intelligence + 6 parallel Anthropic calls, each generating
// ~3K tokens of structured JSON. With thinking disabled and effort:low
// we typically land in 60-120s, but the first batch in a cache window
// pays the prompt-cache write premium. 300s is the Hobby plan ceiling
// — this gives headroom without forcing a plan upgrade.
export const maxDuration = 300;

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Wand2 } from 'lucide-react';
import { ScriptAngle } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { timed } from '@/lib/timing';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Stepper } from '@/components/wizard/stepper';
import { ProjectHero } from '@/components/wizard/project-hero';
import { GenerateButton } from './client-bits';
import { ContinueButton } from './continue-button';
import { StreamingScriptsGrid } from './streaming-scripts-grid';

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
  const selectedScriptId = project.selectedScriptId;

  return (
    <div className="relative bg-mesh-soft bg-noise min-h-screen">
      <div className="relative px-6 md:px-10 py-8 md:py-10 max-w-6xl mx-auto space-y-8">
        <ProjectHero
          kicker="תסריטים"
          title="בחר תסריט"
          description="ה-AI כותב 6 תסריטים בזוויות שיווקיות שונות (problem-agitation, סקפטיקל, הוכחה, עוגן מחיר, רגע ישראלי, דיירקט). בחר אחד שמדבר אליך — תוכל גם לערוך אותו ידנית בשלבים הבאים."
          projectName={project.productName}
          step={4}
          totalSteps={8}
          icon={Wand2}
          backHref={`/projects/${projectId}/features`}
          backLabel="חזרה לתכונות"
        />

        <Stepper current={4} done={[1, 2, 3]} projectId={projectId} />

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
          {/* V27.10.10 — client-side streaming grid. Polls /api/scripts/list
              and renders cards from local state, bypassing the
              router.refresh() bottleneck that was blocked by the
              in-flight Server Action. */}
          <StreamingScriptsGrid
            projectId={projectId}
            initialScripts={scripts.map((s) => ({
              id: s.id,
              framework: s.framework ?? null,
              angle: s.angle,
              hook: s.hook,
              cta: s.cta ?? null,
              estimatedDurationSeconds: s.estimatedDurationSeconds,
              qualityScoreOverall: s.qualityScoreOverall ?? null,
              rawJson: (s.rawJson ?? null) as Record<string, unknown> | null,
              scenes: s.scenes.map((sc) => ({
                id: sc.id,
                sceneOrder: sc.sceneOrder,
                sceneGoal: sc.sceneGoal ?? null,
                textHebrew: sc.textHebrew,
                onScreenCaptionHebrew: sc.onScreenCaptionHebrew ?? null,
                cameraDirection: sc.cameraDirection ?? null,
                performanceNote: sc.performanceNote ?? null,
                durationSeconds: sc.durationSeconds,
              })),
            }))}
            initialSelectedScriptId={selectedScriptId}
          />

          <div className="flex justify-between items-center gap-3 pt-4" dir="ltr">
            <GenerateButton projectId={projectId} regenerate />
            <ContinueButton projectId={projectId} disabled={!selectedScriptId}>
              המשך לשלב הבא →
            </ContinueButton>
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
    </div>
  );
}
