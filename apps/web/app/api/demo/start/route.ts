import { NextResponse } from 'next/server';
import { ProjectStatus, ScriptAngle, SceneType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { renderQueue } from '@/lib/queue';

// Demo endpoint — creates a sample project + script + scenes,
// enqueues a render job, returns the jobId.
// Use this from the home page to see the full mock pipeline run.
export async function POST() {
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
