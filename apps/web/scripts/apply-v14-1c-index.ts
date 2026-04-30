// One-shot: apply the Scene.status index to whatever DB DATABASE_URL points
// at. Bypasses prisma's schema-engine (which hangs on pgbouncer pooler URLs)
// by going through the runtime client + $executeRawUnsafe.
//
// Usage:
//   DATABASE_URL="<pooler-url>" npx tsx apps/web/scripts/apply-v14-1c-index.ts
//
// Idempotent: CREATE INDEX IF NOT EXISTS is a no-op if the index already
// exists. Safe to run repeatedly.

import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('[apply-v14.1c] connecting…');
    await prisma.$queryRawUnsafe(`SELECT 1`);
    console.log('[apply-v14.1c] connected — creating Scene_status_idx if not exists…');
    const start = Date.now();
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "Scene_status_idx" ON "Scene"("status")`,
    );
    console.log(`[apply-v14.1c] done in ${Date.now() - start}ms`);

    // Verify the index exists.
    const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'Scene' AND indexname = 'Scene_status_idx'`,
    );
    if (rows.length === 1) {
      console.log('[apply-v14.1c] verified: Scene_status_idx is present.');
    } else {
      console.error('[apply-v14.1c] WARNING: index not found post-create.');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[apply-v14.1c] failed:', err);
  process.exit(1);
});
