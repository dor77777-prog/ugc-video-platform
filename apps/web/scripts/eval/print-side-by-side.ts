// Side-by-side comparison print of two baseline JSONs. Standalone
// debug helper used by Sub-task 2 to surface concept_interactive vs
// legacy_full_batch baselines in one table for the human reviewer.
//
// Usage:
//   npx tsx scripts/eval/print-side-by-side.ts \
//     .planning/eval/baselines/v27.11.PR6.json \
//     .planning/eval/baselines/v27.11.PR6-legacy.json

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EvalRunResult } from './lib/output-writer';

async function loadJson(p: string): Promise<EvalRunResult> {
  const raw = await fs.readFile(path.resolve(p), 'utf-8');
  return JSON.parse(raw) as EvalRunResult;
}

function fmt(n: number, digits = 3): string {
  return n.toFixed(digits);
}

function fmtMs(n: number): string {
  return `${(n / 1000).toFixed(1)}s`;
}

function pad(s: string, w: number): string {
  if (s.length >= w) return s;
  return s + ' '.repeat(w - s.length);
}

async function main(): Promise<void> {
  const [aPath, bPath] = process.argv.slice(2);
  if (!aPath || !bPath) {
    console.error(
      'Usage: npx tsx scripts/eval/print-side-by-side.ts <baselineA.json> <baselineB.json>',
    );
    process.exit(1);
  }
  const [a, b] = await Promise.all([loadJson(aPath), loadJson(bPath)]);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('  BASELINE COMPARISON — concept_interactive vs legacy_full_batch');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`  A: ${a.engineMode}    products=${a.productCount}    git=${a.gitSha}`);
  console.log(`     ${aPath}`);
  console.log(`     ranAt=${a.ranAt}`);
  console.log(`  B: ${b.engineMode}    products=${b.productCount}    git=${b.gitSha}`);
  console.log(`     ${bPath}`);
  console.log(`     ranAt=${b.ranAt}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('');

  const metricRows: Array<[string, number, number, string, string]> = [
    ['big_idea_diversity', a.metrics.big_idea_diversity, b.metrics.big_idea_diversity, '0..1 higher=more diverse', 'no gate this milestone (sub-task 3 gates +0.15 vs A)'],
    ['casual_markers_per_scene', a.metrics.casual_markers_per_scene, b.metrics.casual_markers_per_scene, 'avg per non-CTA scene', 'gate sub-task 4: ≥ 1.0 absolute'],
    ['framework_signal_match', a.metrics.framework_signal_match, b.metrics.framework_signal_match, '0..1 fraction correct', 'gate sub-task 6 (CONDITIONAL): ≥ 0.80'],
    ['register_authenticity_score', a.metrics.register_authenticity_score, b.metrics.register_authenticity_score, '1..10', 'gate sub-task 4: ≥ 7 absolute AND ≥ A + 1.5'],
  ];

  console.log(' METRIC                              A (concept)   B (legacy)   B-A    NOTE');
  console.log(' ───────────────────────────────────────────────────────────────────────────');
  for (const [name, av, bv, _scale, note] of metricRows) {
    const aS = fmt(av).padStart(10);
    const bS = fmt(bv).padStart(10);
    const delta = bv - av;
    const dS = ((delta >= 0 ? '+' : '') + fmt(delta)).padStart(7);
    console.log(` ${pad(name, 35)}${aS}    ${bS}   ${dS}   ${note}`);
  }

  console.log('');
  console.log(' TIMING                              A (concept)   B (legacy)   B-A');
  console.log(' ───────────────────────────────────────────────────────────────');
  const tRows: Array<[string, number, number]> = [
    ['pi_duration_ms', a.timings.pi_duration_ms, b.timings.pi_duration_ms],
    ['concept_batch_duration_ms', a.timings.concept_batch_duration_ms, b.timings.concept_batch_duration_ms],
    ['concept_expand_duration_ms', a.timings.concept_expand_duration_ms, b.timings.concept_expand_duration_ms],
    ['wall_time_total', a.timings.wall_time_total, b.timings.wall_time_total],
  ];
  for (const [name, av, bv] of tRows) {
    const aS = fmtMs(av).padStart(10);
    const bS = fmtMs(bv).padStart(10);
    const delta = bv - av;
    const dS = ((delta >= 0 ? '+' : '') + fmtMs(delta)).padStart(7);
    console.log(` ${pad(name, 35)}${aS}    ${bS}   ${dS}`);
  }
  console.log('');

  // Sub-task 6 decision rule per PLAN.md.
  const fwA = a.metrics.framework_signal_match;
  console.log(' SUB-TASK 6 DECISION (CONDITIONAL):');
  console.log(' ───────────────────────────────────────────────────────────────');
  if (fwA < 0.80) {
    console.log(`   concept_interactive framework_signal_match = ${fmt(fwA)} < 0.80`);
    console.log(`   → Sub-task 6 is REQUIRED. Expand the placeholder in PLAN.md.`);
  } else {
    console.log(`   concept_interactive framework_signal_match = ${fmt(fwA)} >= 0.80`);
    console.log(`   → Sub-task 6 is SKIPPED — baseline already passes.`);
  }
  console.log('');

  // "Interesting findings" check — is legacy systematically better than concept?
  const aBetter = [
    a.metrics.big_idea_diversity > b.metrics.big_idea_diversity,
    a.metrics.casual_markers_per_scene > b.metrics.casual_markers_per_scene,
    a.metrics.framework_signal_match > b.metrics.framework_signal_match,
    a.metrics.register_authenticity_score > b.metrics.register_authenticity_score,
  ];
  const bBetter = [
    b.metrics.big_idea_diversity > a.metrics.big_idea_diversity,
    b.metrics.casual_markers_per_scene > a.metrics.casual_markers_per_scene,
    b.metrics.framework_signal_match > a.metrics.framework_signal_match,
    b.metrics.register_authenticity_score > a.metrics.register_authenticity_score,
  ];
  const aWins = aBetter.filter(Boolean).length;
  const bWins = bBetter.filter(Boolean).length;
  console.log(' INTERESTING FINDINGS:');
  console.log(' ───────────────────────────────────────────────────────────────');
  console.log(`   concept_interactive wins ${aWins}/4 metrics, legacy_full_batch wins ${bWins}/4.`);
  if (bWins === 4) {
    console.log(`   → ⚠ Legacy beats concept on EVERY metric. Worth noting in STATE.md`);
    console.log(`     under "interesting findings". Doesn't change the plan (concept_interactive`);
    console.log(`     stays the architecture going forward), but signal to remember.`);
  } else if (bWins >= 3) {
    console.log(`   → Legacy beats concept on ${bWins}/4 metrics — partial signal worth`);
    console.log(`     watching. Note in STATE.md.`);
  } else {
    console.log(`   → Mixed results. concept_interactive holds on ${aWins} metrics.`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('print-side-by-side fatal:', err);
  process.exit(1);
});
