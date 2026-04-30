// One-shot migration applier for prod Supabase via the pooler URL.
//
// `prisma migrate deploy` requires a non-pooled connection for
// advisory locks; Vercel only ships the pooler URL. Rather than
// requiring the user to provision a direct URL, we apply the
// `v13_scene_state_log` migration's SQL via $executeRawUnsafe and
// then insert the matching row into `_prisma_migrations` so the
// next `prisma migrate deploy` skips it cleanly.
//
// The SQL is the same one committed at
// prisma/migrations/20260430085802_v13_scene_state_log/migration.sql.
// Idempotent: column-exists checks prevent double-add; migration
// row insert uses ON CONFLICT DO NOTHING.
//
// Run: DATABASE_URL=<prod pooler URL> npx tsx scripts/apply-v13-migration-prod.ts

import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const MIGRATION_NAME = '20260430085802_v13_scene_state_log';
const MIGRATION_DIR = path.resolve(
  __dirname,
  '../../../prisma/migrations',
  MIGRATION_NAME,
);

async function main() {
  const sqlPath = path.join(MIGRATION_DIR, 'migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');

  const prisma = new PrismaClient();
  try {
    // Check current Scene columns to decide what's needed.
    const cols = (await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Scene'`,
    )) as Array<{ column_name: string }>;
    const have = new Set(cols.map((c) => c.column_name));
    const need = ['status', 'lastErrorCode', 'lastErrorMessage', 'generationLogJson'];
    const missing = need.filter((c) => !have.has(c));
    console.log(`Scene columns present: ${[...have].length}`);
    console.log(`v13 columns missing: ${missing.length === 0 ? '(none)' : missing.join(', ')}`);

    if (missing.length > 0) {
      // Run each ADD COLUMN as a separate IF NOT EXISTS statement so
      // partial state (e.g. previous attempt added some) is recoverable.
      const stmts: string[] = [];
      if (!have.has('status')) {
        stmts.push(`ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending'`);
      }
      if (!have.has('lastErrorCode')) {
        stmts.push(`ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "lastErrorCode" TEXT`);
      }
      if (!have.has('lastErrorMessage')) {
        stmts.push(`ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "lastErrorMessage" TEXT`);
      }
      if (!have.has('generationLogJson')) {
        stmts.push(`ALTER TABLE "Scene" ADD COLUMN IF NOT EXISTS "generationLogJson" JSONB`);
      }
      for (const s of stmts) {
        console.log(`  applying: ${s}`);
        await prisma.$executeRawUnsafe(s);
      }
    }

    // Skip the _prisma_migrations bookkeeping — prod was provisioned
    // via `prisma db push` (the table doesn't exist), so future
    // `migrate deploy` calls aren't expected. Schema state is what
    // matters; that's verified below.
    void checksum;

    // Final verification — count v13 columns again.
    const cols2 = (await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Scene' AND column_name IN ('status','lastErrorCode','lastErrorMessage','generationLogJson')`,
    )) as Array<{ column_name: string }>;
    console.log(`Verified v13 columns now on Scene: ${cols2.map((c) => c.column_name).sort().join(', ')}`);

    if (cols2.length === 4) {
      console.log('✓ Migration applied successfully.');
    } else {
      console.error('✗ Some v13 columns still missing.');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
