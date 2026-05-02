// Script Engine Eval — main CLI orchestrator. Runs the configured
// engine path against a gold-set of pinned products, measures 4
// metrics + 3 per-stage timings, writes a structured JSON, prints a
// console summary, and (optionally) compares to a baseline.
//
// Usage:
//   npm run eval:script-engine                          # run on all gold-set products
//   npm run eval:script-engine -- --only=cosmetics-1    # one product
//   npm run eval:script-engine -- --smoke               # 1 product, skip judges (cheap)
//   npm run eval:script-engine -- --baseline-out=path   # write to a specific path (Sub-task 2)
//   npm run eval:script-engine -- --compare=path        # compare to baseline JSON
//   npm run eval:script-engine -- --pick=2              # how many concepts to expand (default 1, max 6)
//
// Engine mode + provider come from env (matches production):
//   SCRIPT_ENGINE_MODE=concept_interactive (or legacy_full_batch)
//   LLM_SCRIPT_PROVIDER=openai|anthropic|gemini
//   OPENAI_SCRIPT_MODEL / ANTHROPIC_SCRIPT_MODEL / etc.
//
// IMPORTANT: this script ALWAYS calls the concept_interactive code
// path for the concept-batch + expansion, regardless of
// SCRIPT_ENGINE_MODE. The env var is captured into the run output for
// traceability ("baseline was captured under SCRIPT_ENGINE_MODE=X")
// but doesn't change the runner. Sub-task 2 is responsible for
// running the eval TWICE — once with each mode — to capture parallel
// baselines. Doing it inside one run would double the cost on every
// single eval and isn't needed.

import dotenv from 'dotenv';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { runConceptBatch } from './runners/concept-runner';
import { runExpandConcept, type ExpandedScriptShape } from './runners/expand-runner';
import { measureBigIdeaDiversity } from './metrics/big-idea-diversity';
import { measureCasualMarkers } from './metrics/casual-markers';
import { measureFrameworkSignalMatch } from './metrics/framework-signal';
import { measureRegisterAuthenticity } from './metrics/register-authenticity';
import { TimingCollector } from './lib/timing-collector';
import {
  writeRunJson,
  loadBaseline,
  printSummary,
  readGitSha,
  type EvalRunResult,
} from './lib/output-writer';
import {
  loadGoldSetEntry,
  loadAllGoldSetIds,
} from './lib/gold-set-loader';
import { resolveScriptEngineMode } from '../../lib/llm/concept-engine';
import type { ScriptProvider } from '../../lib/llm/concept-engine';

interface CliArgs {
  onlyId: string | null;
  smoke: boolean;
  baselineOut: string | null;
  comparePath: string | null;
  pick: number;
  skipJudges: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    onlyId: null,
    smoke: false,
    baselineOut: null,
    comparePath: null,
    pick: 1,
    skipJudges: false,
  };
  for (const a of argv) {
    if (a.startsWith('--only=')) out.onlyId = a.slice('--only='.length);
    else if (a === '--smoke') out.smoke = true;
    else if (a.startsWith('--baseline-out=')) out.baselineOut = a.slice('--baseline-out='.length);
    else if (a.startsWith('--compare=')) out.comparePath = a.slice('--compare='.length);
    else if (a.startsWith('--pick=')) out.pick = Math.max(1, Math.min(6, parseInt(a.slice('--pick='.length), 10) || 1));
    else if (a === '--skip-judges') out.skipJudges = true;
  }
  // Smoke implies skipJudges + onlyId=cosmetics-1 + pick=1 unless overridden.
  if (out.smoke) {
    out.skipJudges = true;
    if (!out.onlyId) out.onlyId = 'cosmetics-1';
    out.pick = 1;
  }
  return out;
}

function resolveProvider(): ScriptProvider {
  const raw = process.env.LLM_SCRIPT_PROVIDER?.toLowerCase().trim();
  if (raw === 'anthropic') return 'anthropic';
  if (raw === 'gemini') return 'gemini';
  return 'openai';
}

function resolveModel(provider: ScriptProvider): string {
  if (provider === 'openai') return process.env.OPENAI_SCRIPT_MODEL ?? 'gpt-5.4-mini';
  if (provider === 'anthropic') return process.env.ANTHROPIC_SCRIPT_MODEL ?? 'claude-sonnet-4-6';
  return process.env.GEMINI_SCRIPT_MODEL ?? 'gemini-3-pro-preview';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const provider = resolveProvider();
  const model = resolveModel(provider);
  const engineMode = resolveScriptEngineMode();

  // Determine target gold-set entries.
  const allIds = await loadAllGoldSetIds();
  if (allIds.length === 0) {
    console.error(
      '[eval] No gold-set entries found in .planning/eval/gold-set/.\n' +
        'Run the bootstrap first:\n' +
        '  npm run eval:script-engine:bootstrap',
    );
    process.exit(1);
  }
  const targetIds = args.onlyId
    ? [args.onlyId].filter((id) => allIds.includes(id))
    : allIds;
  if (targetIds.length === 0) {
    console.error(`[eval] --only=${args.onlyId} did not match any bootstrapped gold-set entry.`);
    console.error(`[eval] Available: ${allIds.join(', ')}`);
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SCRIPT ENGINE EVAL`);
  console.log(`  engine: ${engineMode}    provider: ${provider}:${model}`);
  console.log(`  products: ${targetIds.length}    pick per product: ${args.pick}    smoke: ${args.smoke}`);
  console.log(`  judges: ${args.skipJudges ? 'SKIPPED' : 'enabled (Sonnet)'}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const collector = new TimingCollector();
  const ranAt = new Date().toISOString();
  const gitSha = await readGitSha();
  const perProduct: EvalRunResult['perProduct'] = [];

  for (const id of targetIds) {
    console.log(`▶ ${id}`);
    const entry = await loadGoldSetEntry(id);

    // Stage 1 — PI is "free" in the eval because we read from disk;
    // we still record a near-zero pi_duration_ms so the schema is
    // stable. Bootstrap measures real PI cost separately.
    const pi_duration_ms = 1; // sentinel: PI is pinned, no live call.

    // Stage 2 — concept batch.
    let concept_batch_duration_ms = 0;
    let cards;
    let conceptCtx;
    try {
      conceptCtx = await collector.time(`concept-batch:${id}`, () =>
        runConceptBatch(entry, { provider, model }),
      );
      concept_batch_duration_ms = conceptCtx.durationMs;
      cards = conceptCtx.cards;
      console.log(`    concept batch: ${cards.length} cards in ${(concept_batch_duration_ms / 1000).toFixed(1)}s`);
    } catch (err) {
      console.error(`    [FAIL] concept batch: ${(err as Error).message}`);
      perProduct.push({
        productId: id,
        category: entry.fixture.category,
        metrics: { big_idea_diversity: 0, casual_markers_per_scene: 0, framework_signal_match: 0, register_authenticity_score: 0 },
        timings: { pi_duration_ms, concept_batch_duration_ms, concept_expand_duration_ms: 0 },
        notes: [`concept batch failed: ${(err as Error).message}`],
      });
      continue;
    }

    // Metric 1 — big_idea_diversity (cheap; ~$0.0001 in embeddings).
    let bigIdeaDiv = 0;
    try {
      const r = await measureBigIdeaDiversity(cards);
      bigIdeaDiv = r.score;
      console.log(`    big_idea_diversity: ${bigIdeaDiv.toFixed(3)}`);
    } catch (err) {
      console.warn(`    [WARN] big_idea_diversity failed: ${(err as Error).message}`);
    }

    // Stage 3 — expand `pick` concepts (1..min(pick, cards.length)).
    const pickN = Math.min(args.pick, cards.length);
    const cardsToExpand = cards.slice(0, pickN);
    let concept_expand_duration_ms = 0;
    const expandedScripts: ExpandedScriptShape[] = [];
    for (let i = 0; i < cardsToExpand.length; i++) {
      const card = cardsToExpand[i];
      if (!card) continue;
      try {
        const r = await collector.time(`expand:${id}:${i}`, () =>
          runExpandConcept({
            rawCard: card,
            slotIndex: i,
            systemInstruction: conceptCtx.systemInstruction,
            conceptBatchUserPrompt: conceptCtx.conceptBatchUserPrompt,
            provider,
            model,
          }),
        );
        concept_expand_duration_ms += r.durationMs;
        expandedScripts.push(r.script);
        console.log(`    expand[${i}] (${card.framework}): ${r.script.scenes?.length ?? 0} scenes in ${(r.durationMs / 1000).toFixed(1)}s`);
      } catch (err) {
        console.error(`    [FAIL] expand[${i}]: ${(err as Error).message}`);
      }
    }

    // Metric 2 — casual_markers (cheap, no LLM).
    const markersResult = measureCasualMarkers(expandedScripts);
    console.log(`    casual_markers_per_scene: ${markersResult.avgMarkersPerScene.toFixed(2)} (${markersResult.scenesWithZero}/${markersResult.scenesCounted} scenes had 0)`);

    // Metric 3 + 4 — Sonnet judges (skip in smoke mode).
    let frameworkMatch = 0;
    let registerScore = 0;
    if (args.skipJudges) {
      console.log(`    framework_signal_match: SKIPPED (--skip-judges)`);
      console.log(`    register_authenticity_score: SKIPPED (--skip-judges)`);
    } else {
      try {
        const r = await measureFrameworkSignalMatch(expandedScripts);
        frameworkMatch = r.matchRate;
        console.log(`    framework_signal_match: ${frameworkMatch.toFixed(3)}`);
      } catch (err) {
        console.warn(`    [WARN] framework_signal_match failed: ${(err as Error).message}`);
      }
      try {
        const r = await measureRegisterAuthenticity(expandedScripts, entry.fixture.category);
        registerScore = r.avgScore;
        console.log(`    register_authenticity_score: ${registerScore.toFixed(2)}/10`);
      } catch (err) {
        console.warn(`    [WARN] register_authenticity_score failed: ${(err as Error).message}`);
      }
    }

    perProduct.push({
      productId: id,
      category: entry.fixture.category,
      metrics: {
        big_idea_diversity: bigIdeaDiv,
        casual_markers_per_scene: markersResult.avgMarkersPerScene,
        framework_signal_match: frameworkMatch,
        register_authenticity_score: registerScore,
      },
      timings: { pi_duration_ms, concept_batch_duration_ms, concept_expand_duration_ms },
      notes: [],
    });
    console.log('');
  }

  // Aggregate metrics across products (simple mean).
  const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  const aggMetrics = {
    big_idea_diversity: avg(perProduct.map((p) => p.metrics.big_idea_diversity)),
    casual_markers_per_scene: avg(perProduct.map((p) => p.metrics.casual_markers_per_scene)),
    framework_signal_match: avg(perProduct.map((p) => p.metrics.framework_signal_match)),
    register_authenticity_score: avg(perProduct.map((p) => p.metrics.register_authenticity_score)),
  };
  const aggTimings = {
    pi_duration_ms: perProduct.reduce((acc, p) => acc + p.timings.pi_duration_ms, 0),
    concept_batch_duration_ms: perProduct.reduce((acc, p) => acc + p.timings.concept_batch_duration_ms, 0),
    concept_expand_duration_ms: perProduct.reduce((acc, p) => acc + p.timings.concept_expand_duration_ms, 0),
    wall_time_total: collector.totalElapsedMs(),
  };

  const result: EvalRunResult = {
    ranAt,
    engineMode,
    providerModel: `${provider}:${model}`,
    gitSha,
    productCount: perProduct.length,
    metrics: aggMetrics,
    timings: aggTimings,
    perProduct,
  };

  const outPath = await writeRunJson(result, { baselineOut: args.baselineOut ?? undefined });

  let comparison = null;
  if (args.comparePath) {
    const baseline = await loadBaseline(args.comparePath);
    if (baseline) {
      comparison = { baselinePath: args.comparePath, baseline };
    } else {
      console.warn(`[eval] --compare=${args.comparePath} could not be loaded; printing without baseline.`);
    }
  }

  printSummary(result, comparison);
  console.log(`  → wrote ${outPath}`);
  console.log('');
}

main().catch((err) => {
  console.error('[eval] fatal:', err);
  process.exit(1);
});
