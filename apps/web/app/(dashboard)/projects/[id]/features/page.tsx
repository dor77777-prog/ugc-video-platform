// V26.18 — Feature Focus wizard step.
//
// Sits between Avatar and Script. Loads cached LLM suggestions from
// Project.productData.suggestedFeatures (or fires the API to generate
// them). User multi-selects, can add custom features, then continues
// to the script step. Selected features land in
// Project.productData.selectedFeatures and become the FEATURE FOCUS
// block in every script call.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import {
  suggestedFeaturesFromProductData,
  selectedFeaturesFromProductData,
} from '@ugc-video/shared';
import { Card, CardContent } from '@/components/ui/card';
import { ProjectHero } from '@/components/wizard/project-hero';
import { FeaturePicker } from './client-bits';

export const dynamic = 'force-dynamic';

export default async function FeaturesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    select: {
      id: true,
      productName: true,
      productData: true,
    },
  });
  if (!project) notFound();

  const suggested = suggestedFeaturesFromProductData(project.productData);
  const selected = selectedFeaturesFromProductData(project.productData);

  return (
    <div className="p-6 md:p-10 max-w-5xl space-y-6">
      <ProjectHero
        kicker="שלב 3 · תכונות מנצחות"
        title="באיזה תכונות יתמקד הסרטון?"
        description="ה-AI חילץ את התכונות המנצחות של המוצר. בחר אחת או כמה — התסריטים ייבנו סביבן במקום לנסות לכסות הכל. אפשר להוסיף תכונה משלך."
        projectName={project.productName}
        step={3}
        totalSteps={7}
        backHref={`/projects/${projectId}/avatar`}
        backLabel="אווטאר"
      />

      <Card>
        <CardContent className="p-6">
          <FeaturePicker
            projectId={projectId}
            initialSuggestions={suggested}
            initialSelection={selected}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <Link href={`/projects/${projectId}/avatar`} className="hover:text-foreground">
          ← חזור לבחירת אווטאר
        </Link>
        <span>בחירה מרובה מותרת. המשך אחרי שבחרת לפחות תכונה אחת.</span>
      </div>
    </div>
  );
}
