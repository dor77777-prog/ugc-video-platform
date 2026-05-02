// Loads pinned gold-set JSONs (input + intel) from
// .planning/eval/gold-set/<id>.json — the file shape produced by
// bootstrap-gold-set.ts.
//
// The eval ALWAYS reads from disk (never recomputes PI on the fly) so
// each run is deterministic. If a file is missing the loader fails
// loudly with a "run bootstrap first" error.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProductFixture } from '../fixtures/products';
import type { ProductIntelligence } from '../../../lib/product-intelligence';

export interface GoldSetEntry {
  fixture: ProductFixture;
  intelligence: ProductIntelligence;
  /** When the bootstrap ran (ISO). Used to spot stale intel. */
  bootstrappedAt: string;
}

const GOLD_SET_DIR = path.resolve(
  __dirname,
  '../../../../../.planning/eval/gold-set',
);

export interface GoldSetFile {
  fixture: ProductFixture;
  intelligence: ProductIntelligence;
  bootstrappedAt: string;
  /** Pinned models so we know what produced this intel snapshot. */
  models: {
    dossier: string;
    visualAnalysis: string;
    audience: string;
  };
}

export async function loadGoldSetEntry(id: string): Promise<GoldSetEntry> {
  const filePath = path.join(GOLD_SET_DIR, `${id}.json`);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    throw new Error(
      `Gold-set entry "${id}" not found at ${filePath}.\n` +
        `Run the bootstrap first:\n` +
        `  npm run eval:script-engine:bootstrap -- --only=${id}\n` +
        `  (or without --only to bootstrap all 9)`,
    );
  }
  const parsed = JSON.parse(raw) as GoldSetFile;
  if (!parsed?.fixture || !parsed?.intelligence) {
    throw new Error(
      `Gold-set entry "${id}" malformed — missing fixture or intelligence.`,
    );
  }
  return {
    fixture: parsed.fixture,
    intelligence: parsed.intelligence,
    bootstrappedAt: parsed.bootstrappedAt,
  };
}

export async function loadAllGoldSetIds(): Promise<string[]> {
  try {
    const entries = await fs.readdir(GOLD_SET_DIR);
    return entries
      .filter((n) => n.endsWith('.json'))
      .map((n) => n.replace(/\.json$/, ''))
      .sort();
  } catch {
    return [];
  }
}

export async function writeGoldSetEntry(file: GoldSetFile): Promise<string> {
  await fs.mkdir(GOLD_SET_DIR, { recursive: true });
  const filePath = path.join(GOLD_SET_DIR, `${file.fixture.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(file, null, 2), 'utf-8');
  return filePath;
}
