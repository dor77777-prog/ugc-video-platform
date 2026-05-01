import { NextResponse } from 'next/server';
import { ProjectStatus, ScriptAngle, SceneType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { renderQueue } from '@/lib/queue';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';

// Demo endpoint — creates a sample project + script + scenes,
// enqueues a render job, returns the jobId.
// Used from the /dev/demo page to see the full pipeline run.
//
// V26.SEC — auth gate. Pre-V26.SEC this endpoint was reachable
// unauthenticated (every /api/* slips through middleware) and would
// upsert a shared demo@ugc-video.local user, create a project + 4
// scenes + a render job, and enqueue a Redis BullMQ job — for any
// passing visitor with curl. The /dev/demo page that consumes this
// route lives behind the (dashboard) auth gate, so requiring an
// authenticated session here doesn't change UX. We still keep the
// shared demo user (matches the previous semantics — the operator
// runs the demo without polluting their own dashboard).
export async function POST() {
  await getOrCreateAppUser();
  const user = await prisma.user.upsert({
    where: { email: 'demo@ugc-video.local' },
    update: {},
    create: { email: 'demo@ugc-video.local' },
  });

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      productUrl: 'https://example.com/products/demo',
      productName: 'מברשת שיניים חכמה לילדים',
      status: ProjectStatus.scripts_generated,
    },
  });

  const script = await prisma.script.create({
    data: {
      projectId: project.id,
      angle: ScriptAngle.problem_solution,
      hook: 'הילד שוב מסרב לצחצח שיניים?',
      cta: 'לבדיקת המוצר באתר',
      estimatedDurationSeconds: 28,
      rawJson: {},
      scenes: {
        create: [
          {
            sceneOrder: 0,
            textHebrew: 'אם גם אצלכם צחצוח שיניים הפך למלחמה קטנה כל ערב.',
            visualPromptEnglish:
              'Israeli bathroom, parent and child, evening light, UGC vertical 9:16',
            durationSeconds: 5,
            sceneType: SceneType.hook,
          },
          {
            sceneOrder: 1,
            textHebrew: 'גילינו את המברשת הזו, והיא משנה את כל הסיפור.',
            visualPromptEnglish:
              'Close-up of kids toothbrush, parent demonstrating, vertical 9:16',
            durationSeconds: 6,
            sceneType: SceneType.product_demo,
          },
          {
            sceneOrder: 2,
            textHebrew: 'הילדים מתחילים לצחצח לבד, בלי בכי ובלי מאבקים.',
            visualPromptEnglish: 'Happy child brushing teeth alone, smiling, vertical 9:16',
            durationSeconds: 5,
            sceneType: SceneType.benefit,
          },
          {
            sceneOrder: 3,
            textHebrew: 'הזמינו עכשיו עם הנחה של חמישים אחוז.',
            visualPromptEnglish: 'Product on counter with offer overlay, vertical 9:16',
            durationSeconds: 4,
            sceneType: SceneType.cta,
          },
        ],
      },
    },
  });

  const renderJob = await prisma.renderJob.create({
    data: { projectId: project.id, scriptId: script.id, userId: user.id },
  });

  await renderQueue.add('render-job', { renderJobId: renderJob.id });

  return NextResponse.json({
    jobId: renderJob.id,
    projectId: project.id,
    scriptId: script.id,
    productName: project.productName,
    sceneCount: 4,
  });
}
