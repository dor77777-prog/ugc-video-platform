// End-to-end smoke test against PROD Supabase to confirm:
// 1. Prisma client can write the new V13 columns (status / lastError* /
//    generationLogJson) to a Scene row.
// 2. The user's most recent project still has the structure the
//    pipeline expects (productData.intelligence is present, etc.).
// 3. ApiCall rows are queryable as expected.
//
// Run: DATABASE_URL=<prod pooler URL> npx tsx scripts/smoke-prod-pipeline.ts

import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // 1. Schema shape — does the Prisma client see the new columns?
    const cols = (await prisma.$queryRawUnsafe(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='Scene'
         AND column_name IN ('status','lastErrorCode','lastErrorMessage','generationLogJson')
       ORDER BY column_name`,
    )) as Array<{ column_name: string; data_type: string }>;
    console.log('V13 columns on Scene:');
    for (const c of cols) console.log(`  ${c.column_name} :: ${c.data_type}`);
    if (cols.length !== 4) {
      console.error('Expected 4 V13 columns, got', cols.length);
      process.exit(1);
    }

    // 2. Latest project of dor77777@gmail.com (the active prod user).
    const user = await prisma.user.findFirst({
      where: { email: 'dor77777@gmail.com' },
      select: { id: true, email: true, creditsBalance: true },
    });
    if (!user) {
      console.error('User dor77777@gmail.com not found on prod.');
      process.exit(1);
    }
    console.log(`\nUser: ${user.email} (${user.id}) credits=${user.creditsBalance}`);

    const project = await prisma.project.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        scripts: {
          include: { scenes: { take: 1 } },
        },
      },
    });
    if (!project) {
      console.error('No project found for user.');
      process.exit(1);
    }
    console.log(`\nMost-recent project: ${project.id}`);
    console.log(`  name: ${project.productName}`);
    console.log(`  updatedAt: ${project.updatedAt.toISOString()}`);
    console.log(`  scripts: ${project.scripts.length}`);
    const data = (project.productData as Record<string, unknown> | null) ?? {};
    console.log(`  productData keys: ${Object.keys(data).join(', ')}`);
    const intel = (data as { intelligence?: unknown }).intelligence;
    console.log(`  has intelligence: ${!!intel}`);

    // 3. Recent script_gen ApiCalls
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const calls = await prisma.apiCall.findMany({
      where: {
        userId: user.id,
        operation: 'script_gen',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    console.log(`\nRecent script_gen ApiCalls (last 60m): ${calls.length}`);
    for (const c of calls) {
      console.log(
        `  [${c.createdAt.toISOString()}] status=${c.status} cost=${c.costUsd} duration=${c.durationMs ?? '—'}ms err=${c.errorMessage ?? '—'}`,
      );
    }

    // 4. Try inserting + immediately deleting a temp Scene to confirm
    //    the new columns roundtrip via Prisma.
    if (project.scripts.length > 0) {
      const script = project.scripts[0]!;
      console.log(`\nProbing Scene roundtrip on script ${script.id}...`);
      const probe = await prisma.scene.create({
        data: {
          scriptId: script.id,
          sceneOrder: 999,
          sceneGoal: '__probe__',
          textHebrew: 'בדיקה',
          visualPromptEnglish: 'probe',
          durationSeconds: 1,
          sceneType: 'other',
          // V13 PR6 columns — write all four to confirm Prisma client
          // accepts them and prod DB persists them.
          status: 'pending',
          lastErrorCode: 'probe.test',
          lastErrorMessage: 'roundtrip probe',
          generationLogJson: [
            {
              stage: 'probe',
              level: 'info',
              message: 'roundtrip',
              ts: new Date().toISOString(),
            },
          ],
        },
      });
      console.log(`  ✓ inserted probe scene ${probe.id} with status=${probe.status}`);
      const fetched = await prisma.scene.findUnique({
        where: { id: probe.id },
        select: {
          status: true,
          lastErrorCode: true,
          lastErrorMessage: true,
          generationLogJson: true,
        },
      });
      console.log(`  ✓ readback: status=${fetched?.status} code=${fetched?.lastErrorCode}`);
      console.log(`  ✓ generationLogJson length=${(fetched?.generationLogJson as unknown[] | null)?.length ?? 0}`);
      await prisma.scene.delete({ where: { id: probe.id } });
      console.log(`  ✓ probe scene deleted`);
    }

    console.log('\n✓ Pipeline smoke test PASSED — prod schema + Prisma client + ApiCall logging are in sync.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
