// Quick diagnostic for in-flight / recently-attempted clip generation.

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { prisma } from '../lib/db';

async function main() {
  const recentScenes = await prisma.scene.findMany({
    where: {
      OR: [
        { clipUrl: { not: null } },
        { clipGenerationCount: { gt: 0 } },
      ],
    },
    orderBy: { clipGeneratedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      sceneOrder: true,
      voiceUrl: true,
      voiceDurationSeconds: true,
      imageUrl: true,
      clipUrl: true,
      clipGenerationCount: true,
      clipGeneratedAt: true,
      clipDurationSeconds: true,
      durationSeconds: true,
      script: { select: { project: { select: { id: true, productData: true } } } },
    },
  });

  console.log('--- Recent scene clip attempts ---');
  for (const s of recentScenes) {
    console.log(`scene order=${s.sceneOrder}  id=${s.id}`);
    console.log(`  voiceUrl?    ${!!s.voiceUrl} (dur=${s.voiceDurationSeconds}s)`);
    console.log(`  imageUrl?    ${!!s.imageUrl}`);
    console.log(`  clipUrl?     ${s.clipUrl ?? 'NULL'}`);
    console.log(`  clipGenCount: ${s.clipGenerationCount}`);
    console.log(`  clipGenAt:   ${s.clipGeneratedAt}`);
    console.log(`  clipDuration: ${s.clipDurationSeconds}s  (sceneDur: ${s.durationSeconds}s)`);
    console.log('');
  }

  console.log('--- Recent Kling API calls (any status) ---');
  const apiCalls = await prisma.apiCall.findMany({
    where: { provider: 'kling' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  for (const c of apiCalls) {
    console.log(
      `  ${c.createdAt.toISOString()}  op=${c.operation}  model=${c.model}  ` +
        `dur=${c.durationMs}ms  $${c.costUsd}  success=${c.success}` +
        (c.errorMessage ? `  error=${c.errorMessage.slice(0, 200)}` : ''),
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
