// V27.11.PR6 — Concept-first script engine (interactive mode).
//
// Engine modes (SCRIPT_ENGINE_MODE):
//   - legacy_full_batch (default) — 6 parallel SINGLE_SCRIPT calls,
//     same as before V27.11. Always works, always shows 6 scripts.
//   - concept_interactive — interactive UX:
//       1. generateConceptCards     → 6 light concept cards
//       2. user picks 1-3 + (optional) refresh weak ones
//       3. regenerateSelectedConcepts replaces only chosen slots
//       4. expandConceptCard expands one chosen card to full script
//
// Older `concept_first` (PR5 backend-only auto-pick) is silently
// re-mapped to `legacy_full_batch` here to prevent the broken
// "backend gives 3, UI expects 6" state that triggered the rollback.
// The new interactive UX replaces it.
//
// Cost (PR6 measured against legacy_full_batch on gpt-5.4-mini):
//   Concept generation: 1 call, ~2K output tokens
//   Concept refresh:    1 call per refresh, ~0.4K-1K output tokens
//   Concept expansion:  1 call per chosen concept, ~5K output tokens
//
//   User picks 1 → ~7K output total vs legacy 30K (~75% cheaper)
//   User picks 3 → ~17K output total vs legacy 30K (~45% cheaper)
//
// Backwards-compat: PR5's auto-pick path is replaced. The schema
// changed (12 fields, including new ones); legacy DB scripts are
// untouched. The legacy_full_batch mode is the safe rollback.

import {
  CONCEPT_CARDS_JSON_SCHEMA,
  CONCEPT_REGEN_JSON_SCHEMA,
  CONCEPT_SYSTEM_PROMPT,
  CONCEPT_REGEN_SYSTEM_PROMPT,
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
import type { RawConceptCard, StoredConcept } from './concept-storage';

export type ScriptEngineMode = 'legacy_full_batch' | 'concept_interactive';
export type ScriptProvider = 'openai' | 'anthropic' | 'gemini';

/** V27.11.PR6 — env resolution.
 *  Default `legacy_full_batch` so concept_interactive opt-in is
 *  required. The legacy PR5 value `concept_first` is silently
 *  remapped to legacy (the auto-pick UX that produced 3 forever-
 *  spinning cards is permanently retired). */
export function resolveScriptEngineMode(): ScriptEngineMode {
  const raw = process.env.SCRIPT_ENGINE_MODE?.trim().toLowerCase();
  if (raw === 'concept_interactive') return 'concept_interactive';
  // V27.11.PR5 remap: 'concept_first' silently → legacy. The PR5 backend-
  // only flow is gone; concept_interactive is the only opt-in.
  return 'legacy_full_batch';
}

/** Re-exported for downstream typing. */
export type { RawConceptCard, StoredConcept } from './concept-storage';

interface ConceptBatchResponse {
  concepts: RawConceptCard[];
}

export interface GenerateConceptCardsInput {
  /** Built once via buildSystemInstructionWithIntelligence() in
   *  scripts.ts — the SAME shared system instruction phase 2 will
   *  use for full-script expansion, so the cached prefix benefits
   *  both phases on warm batches. */
  systemInstruction: string;
  /** Per-batch product context. */
  userPrompt: string;
  provider: ScriptProvider;
  model: string;
}

export interface GenerateConceptCardsOutput {
  concepts: RawConceptCard[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** V27.11.PR6 — phase 1: generate 6 light concept cards in 1 LLM call.
 *
 *  Phase 1's "system" is the LIGHT concept prompt + (optional) PI
 *  block. Heavy SCRIPT_SYSTEM_PROMPT prefix is stripped — overkill
 *  for concept work and would defeat the cost win. */
export async function generateConceptCards(
  input: GenerateConceptCardsInput,
): Promise<GenerateConceptCardsOutput> {
  const piBlock = extractIntelligenceBlock(input.systemInstruction);
  const conceptSystem = piBlock
    ? `${CONCEPT_SYSTEM_PROMPT}\n\n${piBlock}`
    : CONCEPT_SYSTEM_PROMPT;

  const { parsed, usage } = await dispatchStructuredCall<ConceptBatchResponse>({
    provider: input.provider,
    model: input.model,
    systemInstruction: conceptSystem,
    userPrompt: input.userPrompt,
    responseSchema: CONCEPT_CARDS_JSON_SCHEMA,
  });

  return {
    concepts: parsed.concepts,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    },
  };
}

export interface RegenerateConceptsInput {
  systemInstruction: string;
  /** Project context (same as the first-batch user prompt) — gives
   *  the LLM the product / audience / mode constraints. */
  userPrompt: string;
  /** Concepts the user wants kept verbatim — the LLM must NOT
   *  duplicate their angles. */
  conceptsToKeep: StoredConcept[];
  /** Concepts the user rejected — the LLM must NOT repeat their
   *  weakness. The risk_notes field is the most useful signal here. */
  conceptsToReplace: StoredConcept[];
  /** Number of replacement cards to return (= conceptsToReplace.length). */
  regenerateCount: number;
  provider: ScriptProvider;
  model: string;
}

export interface RegenerateConceptsOutput {
  concepts: RawConceptCard[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/** V27.11.PR6 — partial regeneration of selected slots. The LLM
 *  receives the kept concepts as "do not duplicate these" and the
 *  rejected concepts as "do not repeat their weakness", and must
 *  return EXACTLY `regenerateCount` replacement cards. */
export async function regenerateSelectedConcepts(
  input: RegenerateConceptsInput,
): Promise<RegenerateConceptsOutput> {
  const piBlock = extractIntelligenceBlock(input.systemInstruction);
  // The regen system block stacks: CONCEPT_SYSTEM_PROMPT (rules of
  // each card) + CONCEPT_REGEN_SYSTEM_PROMPT (delta rules for partial
  // regen) + (optional) PI. The user prompt carries the kept/rejected
  // payload + the project context.
  const regenSystem = [
    CONCEPT_SYSTEM_PROMPT,
    CONCEPT_REGEN_SYSTEM_PROMPT,
    piBlock,
  ]
    .filter((s): s is string => !!s)
    .join('\n\n');

  const regenUserPrompt = [
    input.userPrompt,
    '',
    '═══════════════════════════════════════════',
    `🔁 CONCEPT REGEN — replace exactly ${input.regenerateCount} concept(s)`,
    '═══════════════════════════════════════════',
    '',
    `**conceptsToKeep (${input.conceptsToKeep.length})** — אסור לחזור על שום ממד שלהם (hook_direction, big_idea, product_proof_moment, framework אם אפשר):`,
    ...input.conceptsToKeep.map((c, i) => formatConceptForPrompt(c, i, 'KEEP')),
    '',
    `**conceptsToReplace (${input.conceptsToReplace.length})** — נדחו ע"י המשתמש. אסור לחזור על החולשה שלהם (כתוב ב-risk_notes או הימנע מאותו hook archetype):`,
    ...input.conceptsToReplace.map((c, i) =>
      formatConceptForPrompt(c, i, 'REPLACE'),
    ),
    '',
    `החזר ${input.regenerateCount} קונספטים חדשים בלבד, בפורמט { "concepts": [...] }. כל אחד עם 12 השדות לפי הסכמה.`,
  ].join('\n');

  const { parsed, usage } = await dispatchStructuredCall<ConceptBatchResponse>({
    provider: input.provider,
    model: input.model,
    systemInstruction: regenSystem,
    userPrompt: regenUserPrompt,
    responseSchema: CONCEPT_REGEN_JSON_SCHEMA,
  });

  // Defensive: clamp/pad to expected count. The schema can't enforce
  // an exact array length in OpenAI strict mode (no minItems/
  // maxItems), so we trim or fail-soft here.
  let cards = parsed.concepts;
  if (cards.length > input.regenerateCount) {
    cards = cards.slice(0, input.regenerateCount);
  } else if (cards.length < input.regenerateCount) {
    throw new Error(
      `regen returned ${cards.length} concepts, expected ${input.regenerateCount}`,
    );
  }

  return {
    concepts: cards,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    },
  };
}

function formatConceptForPrompt(
  c: StoredConcept,
  index: number,
  tag: 'KEEP' | 'REPLACE',
): string {
  return [
    `  [${tag} #${index + 1}, slot ${c.slot_index}, framework=${c.framework}]`,
    `    big_idea: ${c.big_idea}`,
    `    selected_hook: ${c.selected_hook}`,
    `    hook_direction: ${c.hook_direction}`,
    `    target_audience_moment: ${c.target_audience_moment}`,
    `    emotional_trigger: ${c.emotional_trigger}`,
    `    product_proof_moment: ${c.product_proof_moment}`,
    `    estimated_quality: ${c.estimated_quality}`,
    c.risk_notes ? `    risk_notes: ${c.risk_notes}` : '    risk_notes: null',
  ].join('\n');
}

/** V27.11.PR5 → kept for PR6 — extract the Product Intelligence block
 *  out of the shared system instruction so phase 1 can prepend it
 *  onto its own (smaller) concept system prompt. */
export function extractIntelligenceBlock(
  systemInstruction: string,
): string | null {
  const marker = '🧠 PRODUCT INTELLIGENCE';
  const idx = systemInstruction.indexOf(marker);
  if (idx < 0) return null;
  const before = systemInstruction.slice(0, idx);
  const headerStart = before.lastIndexOf(
    '═══════════════════════════════════════════',
  );
  const start = headerStart >= 0 ? headerStart : idx;
  return systemInstruction.slice(start).trim();
}

/** V27.11.PR6 — build the user-prompt fragment that asks phase 2 to
 *  EXPAND a chosen concept into the full SINGLE_SCRIPT_JSON_SCHEMA
 *  shape. Concatenated AFTER the existing per-framework user prompt
 *  built in scripts.ts → buildSingleFrameworkPrompt(). */
export function buildExpansionPromptFragment(concept: StoredConcept): string {
  const lines: string[] = [
    '',
    '═══════════════════════════════════════════',
    '🎯 EXPAND THIS CONCEPT (V27.11.PR6 — concept_interactive)',
    '═══════════════════════════════════════════',
    'הקונספט הבא נבחר ע"י המשתמש מתוך 6 כיוונים שיוצרו בשלב 1. הרחב אותו לתסריט מלא תואם לסכמה.',
    '**אסור לסטות** מ-big_idea, target_audience_moment, selected_hook, hook_direction, emotional_trigger, או product_proof_moment של הקונספט. הם נבחרו במפורש ע"י המשתמש.',
    'מותר לחדד hook ניסוח קל; הרעיון נשאר זהה. scene_outline הוא הסקלטון של scenes — הרחב כל בולט לסצנה מלאה עם spoken_text_hebrew, visual_prompt_english, scene_generation_type, frame_strategy, וכל המטא-דאטה הסטנדרטית.',
    '⚠ product_proof_moment חוצה סצנות (state ראשון בסצנה N, state שני בסצנה N+1). אל תבנה משהו לפאנל יחיד. ה-SINGLE-FRAME RULE ב-image-prompt wrapper דוחה את זה אוטומטית.',
    '',
    `framework: ${concept.framework}`,
    `big_idea: ${concept.big_idea}`,
    `target_audience_moment: ${concept.target_audience_moment}`,
    `selected_hook: ${concept.selected_hook}`,
    `hook_direction: ${concept.hook_direction}`,
    `emotional_trigger: ${concept.emotional_trigger}`,
    `product_proof_moment: ${concept.product_proof_moment}`,
    `why_it_fits_product: ${concept.why_it_fits_product}`,
    `why_it_fits_audience: ${concept.why_it_fits_audience}`,
    'scene_outline:',
    ...concept.scene_outline.map((b, i) => `  ${i}. ${b}`),
    `(Concept self-rated estimated_quality: ${concept.estimated_quality}.)`,
    concept.risk_notes
      ? `(Known risk noted at concept stage: ${concept.risk_notes} — address it in the expansion if possible.)`
      : '',
    '',
    'הפק עכשיו תסריט אחד מלא שמכבד את הקונספט שלמעלה ועונה על ה-SINGLE_SCRIPT_JSON_SCHEMA. החזר { "script": {...} }.',
  ];
  return lines.filter((l) => l !== '').join('\n');
}

/** V27.11.PR6 — provider-agnostic dispatcher. Used by
 *  generateConceptCards + regenerateSelectedConcepts so both the
 *  initial batch and the partial regen pick up the env-driven
 *  provider/model in one place. */
async function dispatchStructuredCall<T>(args: {
  provider: ScriptProvider;
  model: string;
  systemInstruction: string;
  userPrompt: string;
  responseSchema: unknown;
}): Promise<{
  parsed: T;
  usage: { inputTokens: number; outputTokens: number };
}> {
  if (args.provider === 'anthropic') {
    return anthropicStructuredCall<T>({
      systemInstruction: args.systemInstruction,
      userPrompt: args.userPrompt,
      responseSchema: args.responseSchema,
      model: args.model,
    });
  }
  if (args.provider === 'gemini') {
    return geminiStructuredCall<T>({
      systemInstruction: args.systemInstruction,
      userPrompt: args.userPrompt,
      responseSchema: args.responseSchema,
      model: args.model,
    });
  }
  return openaiStructuredCall<T>({
    systemInstruction: args.systemInstruction,
    userPrompt: args.userPrompt,
    responseSchema: args.responseSchema,
    model: args.model,
    temperature: 0.7,
  });
}

// Re-exports so scripts.ts can use these without importing the
// individual module names.
export { SINGLE_SCRIPT_JSON_SCHEMA };
export type { OpenAiConfigError, AnthropicConfigError, GeminiConfigError };
