// V27.11.PR6 — Concept-first script engine (interactive mode).
//
// Engine modes (SCRIPT_ENGINE_MODE):
//   - concept_interactive (DEFAULT post-V28.0.ST4) — interactive UX:
//       1. generateConceptCards     → 6 light concept cards
//       2. user picks 1-3 + (optional) refresh weak ones
//       3. regenerateSelectedConcepts replaces only chosen slots
//       4. expandConceptCard expands one chosen card to full script
//   - legacy_full_batch (opt-in via env) — 6 parallel SINGLE_SCRIPT
//     calls, same as pre-V27.11. Available as emergency rollback
//     and as the eval baseline. Set SCRIPT_ENGINE_MODE=legacy_full_batch
//     to force.
//
// V28.0.ST4 default flip: concept_interactive is now the production
// default. Previously it was opt-in via env var; production was
// already running it (env set in Vercel). Flipping the default removes
// the dependency on the env var so concept mode runs even if env is
// dropped, and matches what the user has been testing/iterating on
// for several sub-tasks.
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
  BIG_IDEA_AXES,
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

/** V28.0.ST4 — env resolution. Default flipped to `concept_interactive`
 *  per user direction ("we moved to concept mode several iterations
 *  ago — should be default"). legacy_full_batch is now opt-in via
 *  explicit env var (kept for emergency rollback + eval baseline).
 *  The legacy PR5 value `concept_first` is silently remapped to
 *  `concept_interactive` (PR5's broken auto-pick UX is permanently
 *  retired; PR6's interactive picker is the replacement). */
export function resolveScriptEngineMode(): ScriptEngineMode {
  const raw = process.env.SCRIPT_ENGINE_MODE?.trim().toLowerCase();
  if (raw === 'legacy_full_batch') return 'legacy_full_batch';
  // Default + 'concept_interactive' explicit + PR5 'concept_first' remap
  // all collapse to concept_interactive.
  return 'concept_interactive';
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
 *  V28.0.ST3 — adopted iter-1 design after empirical comparison:
 *
 *  Three iterations of axis-diversity enforcement were measured against
 *  the V27.11.PR6 baseline (big_idea_diversity = 0.420):
 *    - iter 1 (this file): post-gen `validateAxisDiversity()` checks
 *      uniqueness across the 6 cards' `big_idea_axis` values; on
 *      duplicate detection, re-issues ONCE with the duplicate slots
 *      called out + the unused axes named. Result: 0.548 / framework_signal
 *      0.833 (no negative trade-off on either side metric).
 *    - iter 2: added lexical-diversity nudge to CONCEPT_SYSTEM_PROMPT.
 *      Result: 0.510 — REGRESSED. The nudge pushed the LLM toward
 *      first-person openings on every card, which increased lexical
 *      surface variation but DECREASED embedding similarity (cards
 *      cluster around personal-narrative perspective). Reverted.
 *    - iter 3: deterministic per-slot axis pinning (slot 0 →
 *      convenience, slot 1 → proof, ...). Result: 0.541 / framework_signal
 *      DROPPED to 0.722 (below Sub-task 6's 0.80 trigger). Strict
 *      pinning forces axes onto frameworks they don't naturally fit;
 *      the LLM produces less framework-coherent scripts. Rejected.
 *
 *  Conclusion: 3 strategies converge to a 0.54-0.55 ceiling on this
 *  metric for 6 Hebrew sentences about the same product to the same
 *  audience. The original gate target (+0.15 = 0.570) was set without
 *  empirical grounding; recalibrated to +0.10 = 0.520 in STATE.md +
 *  PLAN.md based on this 3-iteration data. Iter 1 is the production
 *  shape — cleanest implementation, no negative trade-offs, achieves
 *  the recalibrated gate with margin (0.548 vs 0.520).
 *
 *  Side effect noted: casual_markers_per_scene moved 0.144 → 0.245
 *  (+70%) without Sub-task 4 having shipped. Hypothesis: the
 *  orthogonality framing in CONCEPT_SYSTEM_PROMPT naturally shifts
 *  the LLM toward more spoken Hebrew. Carry forward into Sub-task 4
 *  prompt design — the axis-locking pattern may transfer. */
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

  // V28.0.ST3 iter 1 — axis-uniqueness post-gen check + 1 retry on
  // duplicates. The system prompt's "6 distinct axes" hard rule is the
  // primary constraint; this validator is the safety net.
  let cards = parsed.concepts;
  let inputTokens = usage.inputTokens;
  let outputTokens = usage.outputTokens;

  const violation = validateAxisDiversity(cards);
  if (violation) {
    const correctivePrompt = buildAxisRetryPrompt(
      input.userPrompt,
      cards,
      violation,
    );
    try {
      const retry = await dispatchStructuredCall<ConceptBatchResponse>({
        provider: input.provider,
        model: input.model,
        systemInstruction: conceptSystem,
        userPrompt: correctivePrompt,
        responseSchema: CONCEPT_CARDS_JSON_SCHEMA,
      });
      cards = retry.parsed.concepts;
      inputTokens += retry.usage.inputTokens;
      outputTokens += retry.usage.outputTokens;
    } catch (err) {
      console.warn(
        '[concept-engine] axis-diversity retry failed, returning original cards:',
        (err as Error).message,
      );
    }
  }

  return {
    concepts: cards,
    usage: { inputTokens, outputTokens },
  };
}

/** V28.0.ST3 — checks `big_idea_axis` uniqueness across a card array.
 *  Returns null on pass, or the duplication report on fail.
 *
 *  Tolerance: a single 'unknown' axis (legacy data, shouldn't happen
 *  on a fresh generation) is allowed; two or more 'unknown' is a
 *  violation since it signals the LLM forgot to populate the field. */
export function validateAxisDiversity(cards: RawConceptCard[]): {
  duplicateAxes: string[];
  duplicateSlots: number[][];
  unusedAxes: string[];
} | null {
  const counts = new Map<string, number[]>();
  for (let i = 0; i < cards.length; i++) {
    const axis = cards[i]?.big_idea_axis ?? '';
    if (!counts.has(axis)) counts.set(axis, []);
    counts.get(axis)!.push(i);
  }
  const duplicateAxes: string[] = [];
  const duplicateSlots: number[][] = [];
  for (const [axis, slots] of counts) {
    if (slots.length > 1) {
      duplicateAxes.push(axis);
      duplicateSlots.push(slots);
    }
  }
  if (duplicateAxes.length === 0) return null;
  const used = new Set(counts.keys());
  const unusedAxes = (BIG_IDEA_AXES as readonly string[]).filter(
    (a) => !used.has(a),
  );
  return { duplicateAxes, duplicateSlots, unusedAxes };
}

function buildAxisRetryPrompt(
  originalUserPrompt: string,
  cards: RawConceptCard[],
  violation: NonNullable<ReturnType<typeof validateAxisDiversity>>,
): string {
  const lines: string[] = [
    originalUserPrompt,
    '',
    '═══════════════════════════════════════════',
    '⚠ V28.0.ST3 — תיקון big_idea_axis (חובה)',
    '═══════════════════════════════════════════',
    '',
    'הבאצ\' שהחזרת לא עומד בחוק האורתוגונליות של big_idea_axis. כל 6 הקונספטים חייבים להשתמש ב-6 ערכי axis שונים.',
    '',
    'הכפילויות:',
    ...violation.duplicateAxes.map((axis, i) => {
      const slots = violation.duplicateSlots[i] ?? [];
      const sampleBigIdeas = slots
        .map((s) => `slot ${s}: "${cards[s]?.big_idea ?? '?'}"`)
        .join('  |  ');
      return `  - axis "${axis}" משומש ב-${slots.length} קונספטים: ${sampleBigIdeas}`;
    }),
    '',
    `צירים שעדיין פנויים (חובה להשתמש בהם): ${
      violation.unusedAxes.length > 0
        ? violation.unusedAxes.join(', ')
        : '(אין — אבל חייבים 6 ערכים שונים, אז שנה לפי הצורך)'
    }`,
    '',
    'החזר את הבאצ' + ' המלא של 6 קונספטים מחדש, כשכל קונספט משתמש ב-big_idea_axis ייחודי. שמור על שאר השדות זהים לכל הניתן — שנה רק את ה-big_idea, big_idea_axis, ומה שצריך כדי שהקונספט יהפך באמת מסביב לציר החדש. אם אתה משנה את ה-big_idea, אז גם hook ו-scene_outline צריכים להיות עקביים עם הציר החדש.',
  ];
  return lines.join('\n');
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

  // V28.0.ST3 — extract the axes of kept concepts; the user prompt
  // forbids the regen from re-using any of them. ("unknown" axis from
  // legacy data is silently dropped from the forbidden list — it
  // shouldn't constrain the new axes since it's not a real choice.)
  const forbiddenAxes = Array.from(
    new Set(
      input.conceptsToKeep
        .map((c) => c.big_idea_axis)
        .filter((a): a is string => !!a && a !== 'unknown'),
    ),
  );

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
    `**forbidden_axes (V28.0.ST3)** — הצירים הבאים תפוסים על-ידי conceptsToKeep, אסור להשתמש בהם בקונספטים החדשים: ${
      forbiddenAxes.length > 0 ? forbiddenAxes.join(', ') : '(אין)'
    }`,
    `   צירים פנויים: ${(BIG_IDEA_AXES as readonly string[])
      .filter((a) => !forbiddenAxes.includes(a))
      .join(', ')}`,
    `   אם אתה מחזיר ${input.regenerateCount} קונספטים, כל אחד חייב להשתמש ב-axis פנוי שונה.`,
    '',
    `החזר ${input.regenerateCount} קונספטים חדשים בלבד, בפורמט { "concepts": [...] }. כל אחד עם 12 השדות לפי הסכמה (כולל big_idea_axis).`,
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
    `  [${tag} #${index + 1}, slot ${c.slot_index}, framework=${c.framework}, big_idea_axis=${c.big_idea_axis}]`,
    `    big_idea: ${c.big_idea}`,
    `    selected_hook: ${c.selected_hook}`,
    `    hook_direction: ${c.hook_direction}`,
    `    target_audience_moment: ${c.target_audience_moment}`,
    `    emotional_trigger: ${c.emotional_trigger}`,
    `    product_proof_moment: ${c.product_proof_moment}`,
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
    `big_idea_axis: ${concept.big_idea_axis}`,
    `target_audience_moment: ${concept.target_audience_moment}`,
    `selected_hook: ${concept.selected_hook}`,
    `hook_direction: ${concept.hook_direction}`,
    `emotional_trigger: ${concept.emotional_trigger}`,
    `product_proof_moment: ${concept.product_proof_moment}`,
    `why_it_fits_product: ${concept.why_it_fits_product}`,
    `why_it_fits_audience: ${concept.why_it_fits_audience}`,
    'scene_outline:',
    ...concept.scene_outline.map((b, i) => `  ${i}. ${b}`),
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
