// One-off debug script — inspect the most recent voice-over generations
// to diagnose "voice sounds different from sample" complaints.

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { prisma } from '../lib/db';

async function main() {
  const recent = await prisma.scene.findMany({
    where: { voiceUrl: { not: null } },
    orderBy: { voiceGeneratedAt: 'desc' },
    take: 3,
    select: {
      id: true,
      sceneOrder: true,
      textHebrew: true,
      textHebrewTts: true,
      performanceNote: true,
      voiceUrl: true,
      voiceProvider: true,
      voiceGeneratedAt: true,
      script: { select: { project: { select: { productData: true } } } },
    },
  });

  console.log('--- Recent generated scenes ---');
  for (const s of recent) {
    const productData = s.script.project.productData as Record<string, unknown> | null;
    const voiceId = productData?.voiceId;
    console.log(`scene order=${s.sceneOrder}  voiceId(project)=${voiceId}`);
    console.log(`  performanceNote: ${s.performanceNote}`);
    console.log(`  textHebrew    : ${s.textHebrew?.slice(0, 200)}`);
    console.log(`  textHebrewTts : ${s.textHebrewTts?.slice(0, 200)}`);
    console.log(`  voiceUrl      : ${s.voiceUrl}`);
    console.log(`  voiceGeneratedAt: ${s.voiceGeneratedAt}`);
    console.log('');
  }

  const apiCalls = await prisma.apiCall.findMany({
    where: { provider: 'elevenlabs', operation: 'tts' },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { model: true, units: true, costUsd: true, createdAt: true, success: true },
  });
  console.log('--- Last 8 ElevenLabs TTS calls ---');
  for (const c of apiCalls) {
    console.log(
      `  ${c.createdAt.toISOString()}  model=${c.model}  units=${c.units}  $${c.costUsd}  success=${c.success}`,
    );
  }

  console.log('\n--- Current process.env.ELEVENLABS_MODEL_ID ---');
  console.log(`  '${process.env.ELEVENLABS_MODEL_ID}'`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
