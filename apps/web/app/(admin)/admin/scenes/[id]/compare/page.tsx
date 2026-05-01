// Admin/dev compare page — animate the same scene frame with all three
// i2v engines (Kling Omni v3, Kling video-o1, Grok Imagine) and view
// the three videos side-by-side. The actual work is done by the
// /api/admin/scenes/[id]/animate-compare endpoint; this page is just
// the UI shell.
//
// Auth is provided by the (admin) layout; no extra guard needed here.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { CompareClient } from './client-bits';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminSceneComparePage({ params }: PageProps) {
  const { id } = await params;
  const scene = await prisma.scene.findUnique({
    where: { id },
    select: {
      id: true,
      sceneOrder: true,
      textHebrew: true,
      imageUrl: true,
      sceneGoal: true,
      script: {
        select: {
          projectId: true,
          project: { select: { productName: true } },
        },
      },
    },
  });
  if (!scene) notFound();

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">השוואת מנועי הנפשה — סצנה {scene.sceneOrder + 1}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {scene.script.project.productName ?? '—'} · {scene.sceneGoal ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={`/admin/scenes/${id}/debug`}
            className="text-muted-foreground hover:text-foreground"
          >
            ← חזרה ל-Debug
          </Link>
          <Link
            href={`/projects/${scene.script.projectId}/videos`}
            className="text-muted-foreground hover:text-foreground"
          >
            סצנות הפרויקט
          </Link>
        </div>
      </div>

      {scene.imageUrl ? (
        <CompareClient
          sceneId={scene.id}
          imageUrl={scene.imageUrl}
          textHebrew={scene.textHebrew}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
          אין תמונה לסצנה הזו. צור תמונה תחילה ואז חזור לכאן.
        </div>
      )}

      <div className="rounded-md border border-border bg-muted/40 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">הערות פיתוח</p>
        <ul className="list-disc pr-5 space-y-0.5">
          <li>הקליפים שקטים — אין מיקס קולי, אין כתוביות. המטרה: להעריך תנועה גולמית בלבד.</li>
          <li>משך כל קליפ: 5 שניות. גודל: 9:16 (או יחס הפרויקט).</li>
          <li>עלות ~$2.30 פר ריצה (Kling Omni + Kling video-o1 + Grok). לא יורד מהאשראי שלך — רק מוקלט ב-/admin/costs.</li>
          <li>זמן ריצה: 2–10 דקות פר מנוע. הם רצים במקביל אז הזמן הכולל = הכי-איטי שביניהם.</li>
        </ul>
      </div>
    </div>
  );
}
