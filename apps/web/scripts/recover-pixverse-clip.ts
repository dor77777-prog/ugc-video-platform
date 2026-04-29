// One-shot recovery: download a successful PixVerse output that our
// poller mis-reported as "failed", save it as the scene's clipUrl,
// and bookkeep — without re-charging the user (PixVerse already
// billed for the call; our system showed the error).
//
// Usage:
//   npx tsx scripts/recover-pixverse-clip.ts <projectId> <pixverseUrl>
// or pass --auto to pick the most-recent talking-head scene
// automatically (only one talking-head per project on V6 modes).

import dotenv from 'dotenv';
import path from 'path';
import { promises as fs } from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { prisma } from '../lib/db';

async function main() {
  const [projectId, pixverseUrl, sceneIdArg] = process.argv.slice(2);
  if (!projectId || !pixverseUrl) {
    console.error('usage: tsx scripts/recover-pixverse-clip.ts <projectId> <pixverseUrl> [sceneId]');
    process.exit(1);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      scripts: {
        where: { id: undefined as unknown as string }, // overridden below
      },
    },
  });
  if (!project) {
    console.error(`project ${projectId} not found`);
    process.exit(1);
  }

  const scenes = await prisma.scene.findMany({
    where: { script: { projectId } },
    orderBy: { sceneOrder: 'asc' },
  });

  let sceneId = sceneIdArg;
  if (!sceneId) {
    const talking = scenes.filter((s) => s.requiresLipSync && s.voiceUrl && s.clipUrl);
    console.log(`Found ${talking.length} talking-head scenes with clip + voice:`);
    for (const s of talking) {
      console.log(
        `  scene ${s.sceneOrder} (id=${s.id}) — clipUrl=${s.clipUrl?.slice(-40)} updatedAt=${s.clipGeneratedAt?.toISOString()}`,
      );
    }
    if (talking.length === 0) {
      console.error('no talking-head scene to recover into');
      process.exit(1);
    }
    sceneId = talking[talking.length - 1]!.id;
    console.log(`auto-picked scene ${sceneId}`);
  }

  const scene = scenes.find((s) => s.id === sceneId);
  if (!scene) {
    console.error(`scene ${sceneId} not in project ${projectId}`);
    process.exit(1);
  }

  console.log(`Downloading PixVerse output ${pixverseUrl} ...`);
  const res = await fetch(pixverseUrl);
  if (!res.ok) {
    console.error(`fetch failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  console.log(`  → ${bytes.length} bytes`);

  // Save to apps/web/public/uploads/clips/{projectId}/{filename}
  const filename = `${scene.id}-${Date.now()}-pixverse-recovered.mp4`;
  const destDir = path.resolve(__dirname, '../public/uploads/clips', projectId);
  await fs.mkdir(destDir, { recursive: true });
  const destPath = path.join(destDir, filename);
  await fs.writeFile(destPath, bytes);
  const url = `/uploads/clips/${projectId}/${filename}`;
  console.log(`  → saved to ${url}`);

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      clipUrl: url,
      clipProvider: 'pixverse',
      clipGeneratedAt: new Date(),
      clipGenerationCount: { increment: 1 },
    },
  });
  console.log(`✓ scene ${sceneId} updated. clipUrl now ${url}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
