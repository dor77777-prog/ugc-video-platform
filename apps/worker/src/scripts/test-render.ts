// Manual smoke test for the mock render pipeline.
// Run: npm run test:render
//
// Creates a sample user/project/script/scenes/render-job and enqueues it.
// The worker process (npm run dev:worker) picks it up and runs the mocks.

import '../env';
import { ProjectStatus, ScriptAngle, SceneType } from '@prisma/client';
import { prisma } from '../db';
import { renderQueue } from '../queue';

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: { email: 'test@example.com' },
  });

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      productUrl: 'https://example.com/products/test-toothbrush',
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

  console.log('---');
  console.log(`Enqueued render job: ${renderJob.id}`);
  console.log(`Project:            ${project.id}`);
  console.log(`Script:             ${script.id}`);
  console.log('---');
  console.log('Watch the worker (npm run dev:worker) for progress.');
  console.log('Or poll: curl http://localhost:3000/api/render/' + renderJob.id + '/status');

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
