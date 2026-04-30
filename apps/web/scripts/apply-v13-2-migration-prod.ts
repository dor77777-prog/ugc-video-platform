// One-shot migration applier for V13.2 — runs the
// `20260430120000_v13_2_costs_hardening` migration's SQL directly via
// the pooler URL. Same pattern as `apply-v13-migration-prod.ts`:
// prod was provisioned by `prisma db push`, so `_prisma_migrations`
// doesn't exist and we don't need to record bookkeeping there. The
// migration is fully idempotent (every statement is `IF NOT EXISTS`).
//
// Run: DATABASE_URL=<prod pooler URL> npx tsx scripts/apply-v13-2-migration-prod.ts

import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION_NAME = '20260430120000_v13_2_costs_hardening';
const MIGRATION_DIR = path.resolve(
  __dirname,
  '../../../prisma/migrations',
  MIGRATION_NAME,
);

async function main() {
  const sqlPath = path.join(MIGRATION_DIR, 'migration.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const prisma = new PrismaClient();
  try {
    console.log(`Applying migration: ${MIGRATION_NAME}`);

    // Strip comment lines first, then split on semicolons. Earlier
    // version filtered chunks by `startsWith('--')` which dropped
    // statements whose chunk happened to start with a section header
    // comment (e.g. CreditTransaction.refType).
    const sqlStripped = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const stmts = sqlStripped
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => (s.endsWith(';') ? s : s + ';'));

    for (const s of stmts) {
      const head = s.split('\n')[0]!.slice(0, 100);
      console.log(`  applying: ${head}${s.length > 100 ? '…' : ''}`);
      try {
        await prisma.$executeRawUnsafe(s);
      } catch (err) {
        const msg = (err as Error).message;
        if (/already exists|duplicate column|duplicate_object|42701|42P07/i.test(msg)) {
          console.log(`     (already exists — skipping)`);
        } else {
          throw err;
        }
      }
    }

    // Verify ApiCall has the new columns + ProviderBalanceSnapshot exists.
    const apiCallCols = (await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ApiCall' AND column_name IN ('estimatedCostUsd','actualCostUsd','metadata','renderJobId','sceneId')`,
    )) as Array<{ column_name: string }>;
    const ctRefType = (await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='CreditTransaction' AND column_name='refType'`,
    )) as Array<{ column_name: string }>;
    const snapshotTable = (await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='ProviderBalanceSnapshot'`,
    )) as Array<{ table_name: string }>;
    const indexes = (await prisma.$queryRawUnsafe(
      `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN (
        'ApiCall_provider_operation_createdAt_idx',
        'ApiCall_provider_status_createdAt_idx',
        'ApiCall_completedAt_idx',
        'ApiCall_userId_createdAt_idx',
        'ApiCall_projectId_createdAt_idx',
        'ApiCall_renderJobId_createdAt_idx',
        'ApiCall_sceneId_createdAt_idx',
        'CreditTransaction_refType_ref_idx',
        'RenderJob_status_createdAt_idx',
        'RenderJob_projectId_createdAt_idx',
        'RenderJob_completedAt_idx',
        'Project_userId_createdAt_idx',
        'ProviderBalanceSnapshot_provider_fetchedAt_idx',
        'ProviderBalanceSnapshot_fetchedAt_idx'
      )`,
    )) as Array<{ indexname: string }>;

    console.log('');
    console.log(
      `ApiCall new cols (${apiCallCols.length}/5): ${apiCallCols.map((c) => c.column_name).sort().join(', ')}`,
    );
    console.log(`CreditTransaction.refType: ${ctRefType.length === 1 ? '✓' : '✗'}`);
    console.log(`ProviderBalanceSnapshot table: ${snapshotTable.length === 1 ? '✓' : '✗'}`);
    console.log(`Indexes (${indexes.length}/14)`);

    const ok =
      apiCallCols.length === 5 &&
      ctRefType.length === 1 &&
      snapshotTable.length === 1 &&
      indexes.length === 14;

    if (ok) {
      console.log('✓ V13.2 migration applied successfully.');
    } else {
      console.error('✗ Migration verification failed — some objects missing.');
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
