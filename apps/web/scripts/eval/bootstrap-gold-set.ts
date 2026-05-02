// One-time bootstrap: runs buildProductIntelligence() on each fixture
// in apps/web/scripts/eval/fixtures/products.ts and writes
// .planning/eval/gold-set/<id>.json so the eval can read pinned intel
// off disk on every run (deterministic, no surprise PI churn between
// eval comparisons).
//
// Usage:
//   npm run eval:script-engine:bootstrap                 # all 9 products
//   npm run eval:script-engine:bootstrap -- --only=cosmetics-1
//   npm run eval:script-engine:bootstrap -- --force      # overwrite existing
//
// Cost (one-time): ~$0.10 per fixture × 9 = ~$0.90.
// Re-run only when PI prompts change or a fixture is edited.

import dotenv from 'dotenv';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { performance } from 'node:perf_hooks';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { buildProductIntelligence } from '../../lib/product-intelligence';
import { PRODUCT_FIXTURES, type ProductFixture } from './fixtures/products';
import { writeGoldSetEntry, type GoldSetFile } from './lib/gold-set-loader';

interface CliArgs {
  onlyId: string | null;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { onlyId: null, force: false };
  for (const a of argv) {
    if (a.startsWith('--only=')) out.onlyId = a.slice('--only='.length);
    else if (a === '--force') out.force = true;
  }
  return out;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function bootstrapOne(
  fixture: ProductFixture,
  force: boolean,
): Promise<{ status: 'wrote' | 'skipped' | 'failed'; durationMs: number; error?: string }> {
  const start = performance.now();
  const goldSetDir = path.resolve(
    __dirname,
    '../../../../.planning/eval/gold-set',
  );
  const targetPath = path.join(goldSetDir, `${fixture.id}.json`);
  if (!force && (await fileExists(targetPath))) {
    return { status: 'skipped', durationMs: performance.now() - start };
  }

  try {
    const result = await buildProductIntelligence({
      productName: fixture.productData.productName,
      brand: fixture.productData.brand,
      description: fixture.productData.description,
      // DossierInput.features is string[] (raw scraped bullets). The
      // structured features in the fixture are for ProductInput.
      // selectedFeatures (script-gen layer); flatten to titles for PI.
      features: fixture.productData.features.map((f) => f.title),
      price: fixture.productData.price,
      currency: fixture.productData.currency,
      sourceUrl: fixture.productData.sourceUrl,
      userNotes: fixture.productData.userNotes,
      categoryGuess: fixture.productData.categoryGuess,
      heroImageUrl: fixture.productData.heroImageUrl,
      secondaryImageUrl: fixture.productData.secondaryImageUrl,
    });

    const file: GoldSetFile = {
      fixture,
      intelligence: result.intelligence,
      bootstrappedAt: new Date().toISOString(),
      models: result.intelligence.models,
    };
    await writeGoldSetEntry(file);
    return { status: 'wrote', durationMs: performance.now() - start };
  } catch (err) {
    return {
      status: 'failed',
      durationMs: performance.now() - start,
      error: (err as Error).message,
    };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const targets = args.onlyId
    ? PRODUCT_FIXTURES.filter((f) => f.id === args.onlyId)
    : PRODUCT_FIXTURES;

  if (args.onlyId && targets.length === 0) {
    console.error(
      `[bootstrap] --only=${args.onlyId} did not match any fixture. ` +
        `Available: ${PRODUCT_FIXTURES.map((f) => f.id).join(', ')}`,
    );
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  GOLD-SET BOOTSTRAP — ${targets.length} fixture(s)`);
  console.log(
    `  estimated cost: ~$${(targets.length * 0.1).toFixed(2)} (PI runs)`,
  );
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  let wrote = 0;
  let skipped = 0;
  let failed = 0;

  for (const fixture of targets) {
    process.stdout.write(`  → ${fixture.id} (${fixture.category}) ... `);
    const r = await bootstrapOne(fixture, args.force);
    if (r.status === 'wrote') {
      wrote++;
      console.log(`OK (${(r.durationMs / 1000).toFixed(1)}s)`);
    } else if (r.status === 'skipped') {
      skipped++;
      console.log('SKIP (already exists, use --force to overwrite)');
    } else {
      failed++;
      console.log(`FAIL — ${r.error}`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(
    `  DONE — wrote=${wrote}  skipped=${skipped}  failed=${failed}`,
  );
  console.log('═══════════════════════════════════════════════════════════════');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[bootstrap] fatal:', err);
  process.exit(1);
});
