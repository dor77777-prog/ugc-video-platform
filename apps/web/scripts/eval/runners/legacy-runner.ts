// Calls the legacy_full_batch script-gen path (generateScripts())
// directly — 6 parallel SINGLE_SCRIPT calls returning fully-expanded
// scripts. No concept stage.
//
// We use the raw LlmScript view (script.raw) for the metric inputs
// because it has the same snake_case shape concept_interactive's
// expand-runner returns — so big-idea-diversity, casual-markers,
// framework-signal, and register-authenticity all consume both
// pipelines uniformly.

import {
  generateScripts,
  type GeneratedScript,
  type ProductInput,
  type ScriptFrameworkSlug,
} from '../../../lib/llm/scripts';
import type { GoldSetEntry } from '../lib/gold-set-loader';
import type { ExpandedScriptShape } from './expand-runner';

export interface LegacyRunnerOptions {
  // generateScripts() resolves provider/model from env internally
  // (LLM_SCRIPT_PROVIDER + the *_SCRIPT_MODEL vars). We pass the same
  // resolved values for telemetry so the eval JSON records what was
  // actually used.
  provider: string;
  model: string;
}

export interface LegacyRunnerResult {
  /** All 6 expanded scripts in the same shape concept_interactive's
   *  expand-runner returns (so the metrics consume both uniformly). */
  scripts: ExpandedScriptShape[];
  /** Big-idea analogues for the diversity metric. Legacy doesn't have
   *  a literal "big_idea" field — `creative_strategy.core_insight`
   *  is the closest semantic match: the one-sentence creative
   *  thesis each script is built around. */
  bigIdeas: string[];
  /** Total LLM time for the batch (parallelized internally so
   *  wall-clock < sum of per-call durations). */
  durationMs: number;
  /** Whether any of the 6 calls failed (legacy path tolerates partial
   *  failures and returns fewer scripts; we record this for forensics). */
  partialFailureCount: number;
}

export async function runLegacyBatch(
  entry: GoldSetEntry,
  opts: LegacyRunnerOptions,
): Promise<LegacyRunnerResult> {
  const productInput: ProductInput = {
    productName: entry.fixture.productData.productName,
    description: entry.fixture.productData.description,
    brand: entry.fixture.productData.brand,
    targetAudience: entry.fixture.scriptInput.targetAudience,
    durationSeconds: entry.fixture.scriptInput.durationSeconds,
    price: entry.fixture.productData.price,
    currency: entry.fixture.productData.currency,
    selectedFeatures: entry.fixture.productData.features,
    intelligence: entry.intelligence,
    avatarDescription: entry.fixture.scriptInput.avatarDescription,
    avatarGender: entry.fixture.scriptInput.avatarGender,
    categoryId: entry.fixture.scriptInput.categoryId,
    categoryLabel: entry.fixture.scriptInput.categoryLabel,
    categoryGuidance: entry.fixture.scriptInput.categoryGuidance,
  };

  const start = performance.now();
  // generateScripts honors LLM_SCRIPT_PROVIDER + ANTHROPIC_/OPENAI_/
  // GEMINI_SCRIPT_MODEL env vars internally; we don't override here so
  // the legacy path matches what production runs today.
  const out = await generateScripts(productInput);
  const durationMs = performance.now() - start;

  const scripts: ExpandedScriptShape[] = [];
  const bigIdeas: string[] = [];

  for (const s of out.scripts) {
    // Use the snake_case raw LlmScript view for uniformity with
    // concept_interactive's expand-runner output. Defensive: legacy
    // scripts might lack `raw` if a future refactor drops it.
    const raw = (s as GeneratedScript).raw;
    if (!raw) continue;
    scripts.push({
      framework: raw.framework as ScriptFrameworkSlug,
      scenes: raw.scenes.map((scene) => ({
        scene_order: scene.scene_order,
        scene_goal: scene.scene_goal,
        spoken_text_hebrew: scene.spoken_text_hebrew,
        on_screen_caption_hebrew: scene.on_screen_caption_hebrew,
        visual_prompt_english: scene.visual_prompt_english,
      })),
    });
    // creative_strategy.core_insight is the legacy big_idea analog —
    // the one-sentence thesis each script is built around.
    bigIdeas.push(raw.creative_strategy.core_insight);
  }

  // generateScripts returns AT MOST 6 scripts; if any framework call
  // failed it's silently dropped (legacy behavior). Track the gap.
  const partialFailureCount = 6 - scripts.length;

  return {
    scripts,
    bigIdeas,
    durationMs,
    partialFailureCount,
  };
}
