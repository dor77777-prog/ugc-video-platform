// Calls the production concept-generation code path with pinned PI.
//
// We replicate the relevant bits of generateConceptsAction
// (apps/web/app/(dashboard)/projects/[id]/scripts/concept-actions.ts)
// WITHOUT the Next.js auth/credit/persistence wrappers — just the
// engine call. This matches how the real wizard flows:
//   1. buildSystemInstructionWithIntelligence(intel) — shared system block
//   2. buildConceptBatchUserPrompt(productInput) — per-batch user prompt
//   3. generateConceptCards({ systemInstruction, userPrompt, provider, model })

import {
  generateConceptCards,
  type ScriptProvider,
  type RawConceptCard,
} from '../../../lib/llm/concept-engine';
import {
  buildSystemInstructionWithIntelligence,
  buildConceptBatchUserPrompt,
  type ProductInput,
} from '../../../lib/llm/scripts';
import type { GoldSetEntry } from '../lib/gold-set-loader';

export interface ConceptRunnerOptions {
  provider?: ScriptProvider;
  model?: string;
}

export interface ConceptRunnerResult {
  cards: RawConceptCard[];
  productInput: ProductInput;
  /** The shared system instruction (already includes the PI block). We
   *  return it so the expand-runner can reuse the SAME instance, which
   *  is what production does for prefix-cache friendliness. */
  systemInstruction: string;
  /** The phase-1 user prompt (without the expansion fragment). The
   *  expand-runner appends buildExpansionPromptFragment() to this. */
  conceptBatchUserPrompt: string;
  usage: { inputTokens: number; outputTokens: number };
  /** Wall-clock for just the LLM call (no PI overhead — that's
   *  measured separately and folded into pi_duration_ms in the eval). */
  durationMs: number;
  provider: ScriptProvider;
  model: string;
}

const DEFAULT_PROVIDER: ScriptProvider = 'openai';
const DEFAULT_MODEL = 'gpt-5.4-mini';

export async function runConceptBatch(
  entry: GoldSetEntry,
  opts: ConceptRunnerOptions = {},
): Promise<ConceptRunnerResult> {
  const provider = opts.provider ?? DEFAULT_PROVIDER;
  const model = opts.model ?? DEFAULT_MODEL;

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

  const systemInstruction = buildSystemInstructionWithIntelligence(
    productInput.intelligence ?? null,
  );
  const userPrompt = buildConceptBatchUserPrompt(productInput);

  const start = performance.now();
  const out = await generateConceptCards({
    systemInstruction,
    userPrompt,
    provider,
    model,
  });
  const durationMs = performance.now() - start;

  return {
    cards: out.concepts,
    productInput,
    systemInstruction,
    conceptBatchUserPrompt: userPrompt,
    usage: out.usage,
    durationMs,
    provider,
    model,
  };
}
