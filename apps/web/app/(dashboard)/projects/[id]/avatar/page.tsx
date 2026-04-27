import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { Card, CardContent } from '@/components/ui/card';
import { Stepper } from '@/components/wizard/stepper';
import { AvatarPicker } from './client-bits';
import { selectAvatarAction, continueFromAvatarAction } from './actions';

export default async function AvatarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const { dbUser } = await getOrCreateAppUser();
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
  });
  if (!project) notFound();

  const productData = (project.productData as Record<string, unknown> | null) ?? {};
  const initialSelectedId =
    typeof productData.selectedAvatarId === 'string' ? productData.selectedAvatarId : null;

  return (
    <div className="p-6 md:p-10 max-w-6xl space-y-8">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {project.productName}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">בחר את הדמות שלך</h1>
        <p className="text-sm text-muted-foreground">
          בחר את הדמות שתופיע בכל הסצנות. ה-AI ישמור על אותה דמות לאורך כל הסרטון —
          אותו מראה, אותם מאפיינים. תוכל לסנן לפי מגדר וטווח גיל.
        </p>
      </div>

      <Stepper current={2} done={[1]} />

      <Card>
        <CardContent className="p-6">
          <AvatarPicker
            projectId={projectId}
            initialSelectedId={initialSelectedId}
            selectAction={selectAvatarAction}
            continueAction={continueFromAvatarAction}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-4">
        <Link href={`/projects/${projectId}/edit`} className="hover:text-foreground">
          ← חזרה לפרטי המוצר
        </Link>
        <div className="text-[10px]">
          הקטלוג כרגע: 16 אווטארים placeholder. בקרוב: אינטגרציה עם HeyGen / קטלוג מלא.
        </div>
      </div>
    </div>
  );
}
