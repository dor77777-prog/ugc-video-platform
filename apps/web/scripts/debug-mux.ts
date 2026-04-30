// Inspect prod ApiCall rows for ffmpeg/mux operations + the most recent
// non-lipsync clip generations so we can see whether the mux step is
// failing silently.

import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    console.log('Recent ffmpeg/mux ApiCalls (last 24h):');
    const muxCalls = await prisma.apiCall.findMany({
      where: {
        provider: 'ffmpeg',
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (muxCalls.length === 0) {
      console.log('  (none)');
    }
    for (const c of muxCalls) {
      console.log(
        `  [${c.createdAt.toISOString()}] op=${c.operation} status=${c.status} success=${c.success} err=${c.errorMessage?.slice(0, 200) ?? '—'}`,
      );
    }

    console.log('\nRecent kling i2v ApiCalls (last 24h):');
    const klingCalls = await prisma.apiCall.findMany({
      where: { provider: 'kling', operation: 'i2v', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    for (const c of klingCalls) {
      console.log(
        `  [${c.createdAt.toISOString()}] status=${c.status} userId=${c.userId} duration=${c.durationMs ?? '—'}ms err=${c.errorMessage?.slice(0, 80) ?? '—'}`,
      );
    }

    console.log('\nRecent pixverse lipsync ApiCalls (last 24h):');
    const pxCalls = await prisma.apiCall.findMany({
      where: { provider: 'pixverse', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    for (const c of pxCalls) {
      console.log(
        `  [${c.createdAt.toISOString()}] op=${c.operation} status=${c.status} err=${c.errorMessage?.slice(0, 80) ?? '—'}`,
      );
    }

    // Most recent scenes with clips, joined to their script + project so
    // we can sanity-check what's there.
    console.log('\nMost recent scenes with clipUrl (last 24h):');
    const scenes = await prisma.scene.findMany({
      where: {
        clipUrl: { not: null },
        clipGeneratedAt: { gte: since },
      },
      orderBy: { clipGeneratedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        sceneOrder: true,
        sceneType: true,
        sceneGenerationType: true,
        requiresLipSync: true,
        clipUrl: true,
        clipDurationSeconds: true,
        clipGeneratedAt: true,
        voiceUrl: true,
        voiceDurationSeconds: true,
        status: true,
      },
    });
    for (const s of scenes) {
      console.log(
        `  [${s.clipGeneratedAt?.toISOString()}] scene_${s.id.slice(-8)} ` +
          `type=${s.sceneType} genType=${s.sceneGenerationType ?? '—'} ` +
          `lipsync=${s.requiresLipSync ?? '—'} status=${s.status} ` +
          `voiceLen=${s.voiceDurationSeconds ?? '—'}s ` +
          `clipLen=${s.clipDurationSeconds ?? '—'}s ` +
          `voiceUrl=${s.voiceUrl ? 'yes' : 'NO'} ` +
          `clipUrl=${s.clipUrl ? 'yes' : 'NO'}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
