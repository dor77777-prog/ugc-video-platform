// Eval output writer + console summary table.
//
// Writes a structured JSON to .planning/eval/runs/<ISO-timestamp>.json
// AND prints a console table with one row per metric showing
// `value | baseline (if any) | delta`. Delta column is empty when no
// baseline JSON path was provided via --compare.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface EvalRunResult {
  /** ISO timestamp of when the run started. */
  ranAt: string;
  /** Engine mode tested (concept_interactive / legacy_full_batch). */
  engineMode: string;
  /** Provider + model (e.g. "openai:gpt-5.4-mini"). */
  providerModel: string;
  /** Git SHA at run time (for traceability). */
  gitSha: string | null;
  /** How many products from the gold set were exercised this run. */
  productCount: number;
  /** Aggregated metrics — averaged across all products. */
  metrics: {
    big_idea_diversity: number;       // 0..1, higher = more diverse
    casual_markers_per_scene: number; // average count, target >= 1.0
    framework_signal_match: number;   // 0..1, target >= 0.80
    register_authenticity_score: number; // 1..10, target >= 7
  };
  /** Per-stage wall-clock summed across products (ms). */
  timings: {
    pi_duration_ms: number;
    concept_batch_duration_ms: number;
    concept_expand_duration_ms: number;
    wall_time_total: number;
  };
  /** Per-product breakdown — useful for forensics when a metric moves. */
  perProduct: Array<{
    productId: string;
    category: string;
    metrics: {
      big_idea_diversity: number;
      casual_markers_per_scene: number;
      framework_signal_match: number;
      register_authenticity_score: number;
    };
    timings: {
      pi_duration_ms: number;
      concept_batch_duration_ms: number;
      concept_expand_duration_ms: number;
    };
    notes: string[];
  }>;
}

export interface BaselineComparison {
  baselinePath: string;
  baseline: EvalRunResult;
}

export async function writeRunJson(
  result: EvalRunResult,
  options: { outDir?: string; baselineOut?: string } = {},
): Promise<string> {
  const outDir =
    options.outDir ??
    path.resolve(__dirname, '../../../../../.planning/eval/runs');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = options.baselineOut
    ? path.resolve(options.baselineOut)
    : path.join(outDir, `${result.ranAt.replace(/[:.]/g, '-')}.json`);
  if (options.baselineOut) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
  }
  await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf-8');
  return outPath;
}

export async function loadBaseline(
  filePath: string,
): Promise<EvalRunResult | null> {
  try {
    const raw = await fs.readFile(path.resolve(filePath), 'utf-8');
    return JSON.parse(raw) as EvalRunResult;
  } catch {
    return null;
  }
}

/** Print a compact table to stdout. Uses Unicode box-drawing because
 *  the eval harness is operator-facing and a clean table is easier to
 *  diff at a glance than a JSON dump. */
export function printSummary(
  result: EvalRunResult,
  comparison: BaselineComparison | null,
): void {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  EVAL RUN — ${result.ranAt}`);
  console.log(`  engine: ${result.engineMode}    provider: ${result.providerModel}`);
  console.log(`  products: ${result.productCount}    git: ${result.gitSha ?? '?'}`);
  if (comparison) {
    console.log(`  comparing against: ${comparison.baselinePath}`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const rows: Array<[string, number, number | null, string]> = [
    ['big_idea_diversity (higher=better)', result.metrics.big_idea_diversity, comparison?.baseline.metrics.big_idea_diversity ?? null, '0..1'],
    ['casual_markers_per_scene (>=1.0)', result.metrics.casual_markers_per_scene, comparison?.baseline.metrics.casual_markers_per_scene ?? null, 'count'],
    ['framework_signal_match (>=0.80)', result.metrics.framework_signal_match, comparison?.baseline.metrics.framework_signal_match ?? null, '0..1'],
    ['register_authenticity_score (>=7)', result.metrics.register_authenticity_score, comparison?.baseline.metrics.register_authenticity_score ?? null, '1..10'],
  ];

  console.log(' METRIC                                  CURRENT     BASELINE    DELTA');
  console.log(' ───────────────────────────────────────────────────────────────────');
  for (const [name, current, base, _scale] of rows) {
    const cur = current.toFixed(3).padStart(9);
    const baseStr = base === null ? '       —' : base.toFixed(3).padStart(9);
    const delta = base === null ? '       —' : (current - base >= 0 ? '+' : '') + (current - base).toFixed(3);
    console.log(` ${name.padEnd(40)}${cur}  ${baseStr}  ${delta.padStart(8)}`);
  }

  console.log('');
  console.log(' TIMING (ms, summed across products)');
  console.log(' ───────────────────────────────────────────────────────────────────');
  const tRows: Array<[string, number, number | null]> = [
    ['pi_duration_ms', result.timings.pi_duration_ms, comparison?.baseline.timings.pi_duration_ms ?? null],
    ['concept_batch_duration_ms', result.timings.concept_batch_duration_ms, comparison?.baseline.timings.concept_batch_duration_ms ?? null],
    ['concept_expand_duration_ms', result.timings.concept_expand_duration_ms, comparison?.baseline.timings.concept_expand_duration_ms ?? null],
    ['wall_time_total', result.timings.wall_time_total, comparison?.baseline.timings.wall_time_total ?? null],
  ];
  for (const [name, current, base] of tRows) {
    const cur = current.toFixed(0).padStart(9);
    const baseStr = base === null ? '       —' : base.toFixed(0).padStart(9);
    const delta = base === null ? '       —' : (current - base >= 0 ? '+' : '') + (current - base).toFixed(0);
    console.log(` ${name.padEnd(40)}${cur}  ${baseStr}  ${delta.padStart(8)}`);
  }
  console.log('');
}

/** Try to read git HEAD SHA (best-effort, no shellouts). */
export async function readGitSha(): Promise<string | null> {
  try {
    const repoRoot = path.resolve(__dirname, '../../../../..');
    const headRaw = await fs.readFile(path.join(repoRoot, '.git', 'HEAD'), 'utf-8');
    const head = headRaw.trim();
    if (head.startsWith('ref:')) {
      const ref = head.slice(4).trim();
      const refPath = path.join(repoRoot, '.git', ref);
      const sha = (await fs.readFile(refPath, 'utf-8')).trim();
      return sha.slice(0, 12);
    }
    return head.slice(0, 12);
  } catch {
    return null;
  }
}
