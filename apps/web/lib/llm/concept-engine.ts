// V27.11.PR5 — Concept-first script engine.
//
// Flow (gated behind SCRIPT_ENGINE_MODE=concept_first):
//   Phase 1: 1 LLM call returns 6 concept cards, one per framework.
//            Each card commits to the creative concept (big_idea,
//            specific_situation, hook, emotional_trigger, persuasion_
//            angle, why_this_is_different) plus a 4-5 bullet scene
//            outline + a self-rated estimated_quality score. NO full
//            spoken text or visual prompts at this stage.
//   Phase 2: pickTopConceptsByQuality() ranks by estimated_quality
//            (with deterministic FRAMEWORK_ORDER as tie-breaker).
//            Top N (default 3, env-tunable) get expanded in parallel
//            using the existing SINGLE_SCRIPT_JSON_SCHEMA — same
//            shape as the legacy_full_batch path.
//
// Cost win on a typical batch (gpt-5.4-mini):
//   legacy_full_batch: 6 × full script (~5K out each) = ~30K out
//   concept_first:    1 × 6 cards (~1.5K) + 3 × full (~5K each) = ~16.5K
//                     ≈ 45% fewer output tokens, ~$0.07 saved per batch.
//
// Latency: phase 1 wall-clock ~10-12s, phase 2 wall-clock ~25s, total
// ~35-40s. Slower than legacy ~25-30s wall, but the orchestrator can
// surface phase-1 cards to the user as a "thinking preview" the
// moment they arrive — perceived latency drops below legacy.
//
// Backwards-compat: legacy_full_batch (default) is unchanged. Setting
// SCRIPT_ENGINE_MODE=concept_first opts in. The downstream
// ScriptGenerationOutput shape is identical between modes — the only
// observable difference is `scripts.length` (6 in legacy, N in
// concept_first; default N=3).

import {
  CONCEPT_CARDS_JSON_SCHEMA,
  CONCEPT_SYSTEM_PROMPT,
  SINGLE_SCRIPT_JSON_SCHEMA,
} from '@ugc-video/prompts';
import {
  openaiStructuredCall,
  OpenAiConfigError,
} from './openai-script-client';
import {
  anthropicStructuredCall,
  AnthropicConfigError,
} from './anthropic-script-client';
import {
  geminiStructuredCall,
  GeminiConfigError,
} from './gemini-client';

export type ScriptEngineMode = 'legacy_full_batch' | 'concept_first';

/** V27.11.PR5 — env resolution.
 *  Default `legacy_full_batch` so PR5 ships with zero behavior change.
 *  Operators flip via `SCRIPT_ENGINE_MODE=concept_first` (no redeploy
 *  required, env vars are read at call time inside generateScripts). */
export function resolveScriptEngineMode(): ScriptEngineMode {
  const raw = process.env.SCRIPT_ENGINE_MODE?.trim().toLowerCase();
  if (raw === 'concept_first') return 'concept_first';
  return 'legacy_full_batch';
}

/** V27.11.PR5 — number of concepts expanded into full scripts in
 *  phase 2. Default 3 (the audit's recommendation). Operators can
 *  override via `SCRIPT_CONCEPT_TOP_N` to e.g. 4 (more variety) or
 *  2 (faster + cheaper). Clamped to [1, 6]. */
export function resolveConceptTopN(): number {
  const raw = process.env.SCRIPT_CONCEPT_TOP_N?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(6, parsed));
}

/** V27.11.PR5 — concept card returned by phase 1. Mirror of the
 *  CONCEPT_CARD_SCHEMA in packages/prompts/src/concept-cards-schema.ts. */
export interface ConceptCard {
  framework: string;
  big_idea: string;
  specific_situation: string;
  selected_hook: string;
  emotional_trigger: string;
  persuasion_angle: string;
  why_this_is_different_from_other_scripts: string;
  scene_outline: string[];
  estimated_quality: number;
  why_this_quality_score: string;
}

interface ConceptBatchResponse {
  concepts: ConceptCard[];
}

export interface GenerateConceptCardsInput {
  /** Built once via buildSystemInstructionWithIntelligence() in
   *  scripts.ts and shared with phase 2 — same cache prefix. */
  systemInstruction: string;
  /** Per-batch product context. Phase 1 sees the same content as
   *  phase 2's framework-specific prompt minus the framework brief. */
  userPrompt: string;
  provider: 'openai' | 'anthropic' | 'gemini';
  model: string;
}

export interface GenerateConceptCardsOutput {
  concepts: ConceptCard[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** V27.11.PR5 — phase 1: dispatch to the same provider clients used by
 *  phase 2, but with the LIGHT system prompt + CONCEPT_CARDS_JSON_SCHEMA.
 *  The concept system prompt is short (~3.5K chars) — the heavy
 *  SCRIPT_SYSTEM_PROMPT (~38K chars) is reserved for phase 2 where
 *  full scripts are written. The PI block is in `systemInstruction`
 *  so phase 1 ALSO benefits from the cached prefix that phase 2 uses;
 *  cache hit is on the SCRIPT-LEVEL prefix only when phase 2's system
 *  block builds on the same provider. Phase 1's concept system prompt
 *  is a different cache slot, so it caches across multiple concept_first
 *  batches in the same 5-min window — orthogonal, also useful. */
export async function generateConceptCards(
  input: GenerateConceptCardsInput,
): Promise<GenerateConceptCardsOutput> {
  // Phase 1's "system" is the LIGHT concept prompt + (optional) PI
  // block. We don't reuse SCRIPT_SYSTEM_PROMPT here — it's overkill
  // for concept work and would defeat the cost win.
  //
  // PI block already lives in the `systemInstruction` we received —
  // strip the heavy SCRIPT_SYSTEM_PROMPT prefix and keep only the PI
  // append, so we attach it to the CONCEPT_SYSTEM_PROMPT instead.
  const piBlock = extractIntelligenceBlock(input.systemInstruction);
  const conceptSystem = piBlock
    ? `${CONCEPT_SYSTEM_PROMPT}\n\n${piBlock}`
    : CONCEPT_SYSTEM_PROMPT;

  const { parsed, usage } =
    input.provider === 'anthropic'
      ? await anthropicStructuredCall<ConceptBatchResponse>({
          systemInstruction: conceptSystem,
          userPrompt: input.userPrompt,
          responseSchema: CONCEPT_CARDS_JSON_SCHEMA,
          model: input.model,
        })
      : input.provider === 'gemini'
        ? await geminiStructuredCall<ConceptBatchResponse>({
            systemInstruction: conceptSystem,
            userPrompt: input.userPrompt,
            responseSchema: CONCEPT_CARDS_JSON_SCHEMA,
            model: input.model,
          })
        : await openaiStructuredCall<ConceptBatchResponse>({
            systemInstruction: conceptSystem,
            userPrompt: input.userPrompt,
            responseSchema: CONCEPT_CARDS_JSON_SCHEMA,
            model: input.model,
            temperature: 0.7,
          });

  return {
    concepts: parsed.concepts,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    },
  };
}

/** V27.11.PR5 — extract the Product Intelligence block out of the
 *  shared system instruction, so phase 1 can prepend it onto its
 *  own (smaller) concept system prompt instead of carrying the full
 *  SCRIPT_SYSTEM_PROMPT. The PI block starts with a dedicated marker
 *  emitted by buildIntelligencePromptBlock() in scripts.ts:
 *    `═══════════════════════════════════════════`
 *    `🧠 PRODUCT INTELLIGENCE — USE THIS, NOT THE LEAN FIELDS ABOVE.`
 *    `═══════════════════════════════════════════`
 *  Returns null when no PI block is present (legacy projects).
 *
 *  This function is forgiving: if the marker is absent or the layout
 *  changes, it returns null and phase 1 just runs without PI. Phase
 *  1 still has the user prompt with product info — null PI doesn't
 *  break the flow, it just means slightly weaker concept grounding. */
export function extractIntelligenceBlock(
  systemInstruction: string,
): string | null {
  const marker = '🧠 PRODUCT INTELLIGENCE';
  const idx = systemInstruction.indexOf(marker);
  if (idx < 0) return null;
  // Walk back to the previous separator line to capture the full
  // header block (the ═══ row above the marker).
  const before = systemInstruction.slice(0, idx);
  const headerStart = before.lastIndexOf('═══════════════════════════════════════════');
  const start = headerStart >= 0 ? headerStart : idx;
  return systemInstruction.slice(start).trim();
}

/** V27.11.PR5 — pick the top-N concepts by estimated_quality, with
 *  the canonical FRAMEWORK_ORDER index as a deterministic tie-breaker.
 *  Pure function: same input → same output, no LLM calls.
 *
 *  Why deterministic tie-break: when 6 concepts all rate 8/10, we
 *  don't want to pick a random subset on each rerun. FRAMEWORK_ORDER
 *  reflects the canonical ad-mix priority (problem-solution first,
 *  fast-direct-response last) so the tie-break is editorially
 *  meaningful. */
export function pickTopConceptsByQuality(
  concepts: ConceptCard[],
  topN: number,
  frameworkOrder: readonly string[],
): ConceptCard[] {
  if (topN <= 0) return [];
  if (concepts.length <= topN) return [...concepts];

  const indexedConcepts = concepts.map((c, i) => ({
    concept: c,
    originalIndex: i,
    frameworkRank: frameworkOrder.indexOf(c.framework),
  }));

  indexedConcepts.sort((a, b) => {
    // Higher estimated_quality first.
    const qDelta = (b.concept.estimated_quality ?? 0) - (a.concept.estimated_quality ?? 0);
    if (qDelta !== 0) return qDelta;
    // Then earlier frameworkRank first (canonical priority). Frameworks
    // not in the order list (shouldn't happen, but be safe) sink to
    // the end.
    const aRank = a.frameworkRank < 0 ? Number.MAX_SAFE_INTEGER : a.frameworkRank;
    const bRank = b.frameworkRank < 0 ? Number.MAX_SAFE_INTEGER : b.frameworkRank;
    if (aRank !== bRank) return aRank - bRank;
    // Final fallback: original arrival order.
    return a.originalIndex - b.originalIndex;
  });

  return indexedConcepts.slice(0, topN).map((x) => x.concept);
}

/** V27.11.PR5 — build the user-prompt fragment that asks phase 2 to
 *  EXPAND a chosen concept into the full SINGLE_SCRIPT_JSON_SCHEMA
 *  shape. Concatenated AFTER the existing per-framework user prompt
 *  built in scripts.ts → buildSingleFrameworkPrompt() so the
 *  framework brief is also visible. */
export function buildExpansionPromptFragment(concept: ConceptCard): string {
  const lines: string[] = [
    '',
    '═══════════════════════════════════════════',
    '🎯 EXPAND THIS CONCEPT (V27.11.PR5)',
    '═══════════════════════════════════════════',
    'הקונספט הבא נבחר בשלב 1 (concept_first mode). הרחב אותו לתסריט מלא תואם לסכמה.',
    '**אסור לסטות** מ-big_idea, specific_situation, selected_hook, emotional_trigger, או persuasion_angle של הקונספט. הם הוחלטו ב-phase 1 ונבחרו על ידי הציון estimated_quality.',
    'מותר לחדד hook ניסוח קל, אבל הרעיון נשאר זהה. scene_outline הוא הסקלטון של scenes — הרחב כל בולט לסצנה מלאה עם spoken_text_hebrew, visual_prompt_english, scene_generation_type, frame_strategy, וכל המטא-דאטה הסטנדרטית.',
    '',
    `framework: ${concept.framework}`,
    `big_idea: ${concept.big_idea}`,
    `specific_situation: ${concept.specific_situation}`,
    `selected_hook: ${concept.selected_hook}`,
    `emotional_trigger: ${concept.emotional_trigger}`,
    `persuasion_angle: ${concept.persuasion_angle}`,
    `why_this_is_different_from_other_scripts: ${concept.why_this_is_different_from_other_scripts}`,
    'scene_outline:',
    ...concept.scene_outline.map((b, i) => `  ${i}. ${b}`),
    `(Concept self-rated estimated_quality: ${concept.estimated_quality}. הסבר: ${concept.why_this_quality_score})`,
    '',
    'הפק עכשיו תסריט אחד מלא שמכבד את הקונספט שלמעלה ועונה על ה-SINGLE_SCRIPT_JSON_SCHEMA. החזר { "script": {...} }.',
  ];
  return lines.join('\n');
}

// Re-exports so scripts.ts can use these without importing the
// individual module names. Schema export not re-exported here —
// scripts.ts imports it directly from @ugc-video/prompts.
export { SINGLE_SCRIPT_JSON_SCHEMA };
export type { OpenAiConfigError, AnthropicConfigError, GeminiConfigError };
