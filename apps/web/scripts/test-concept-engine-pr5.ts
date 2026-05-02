// V27.11.PR5 verification — concept-first script engine.
//
// Audit bottleneck: phase-2 of the original "PR5" recommendation.
// Two-phase generation behind SCRIPT_ENGINE_MODE=concept_first:
//   Phase 1: 1 LLM call → 6 lightweight concept cards.
//   Phase 2: pickTopConceptsByQuality picks top N (default 3),
//            expanded in parallel into full SINGLE_SCRIPT_JSON_SCHEMA
//            scripts. ~45% fewer output tokens vs legacy_full_batch.
//
// Default mode = legacy_full_batch (zero behavior change). PR5 is
// pure plumbing + a feature flag; this script verifies the schema,
// the picker, env resolution, and the prompt-extraction helper —
// no actual LLM calls.

import {
  CONCEPT_CARDS_JSON_SCHEMA,
  CONCEPT_SYSTEM_PROMPT,
  SCRIPT_FRAMEWORKS,
  SCRIPT_SYSTEM_PROMPT,
} from '@ugc-video/prompts';
import {
  pickTopConceptsByQuality,
  buildExpansionPromptFragment,
  resolveScriptEngineMode,
  resolveConceptTopN,
  extractIntelligenceBlock,
  type ConceptCard,
  type ScriptEngineMode,
} from '../lib/llm/concept-engine';
import { buildSystemInstructionWithIntelligence } from '../lib/llm/scripts';

let failures = 0;
function ok(name: string) {
  console.log(`✓ ${name}`);
}
function fail(name: string, detail: string) {
  failures++;
  console.error(`✗ ${name}\n   ${detail}`);
}
function assert(cond: boolean, name: string, detail = '') {
  if (cond) ok(name);
  else fail(name, detail);
}

// ── 1. CONCEPT_CARDS_JSON_SCHEMA shape ─────────────────────────────────
{
  type SchemaObject = {
    type: string;
    required: readonly string[];
    properties: Record<string, unknown>;
    additionalProperties?: boolean;
  };
  const top = (CONCEPT_CARDS_JSON_SCHEMA as unknown) as SchemaObject;
  assert(top.type === 'object', '[PR5.1a] CONCEPT_CARDS_JSON_SCHEMA top is type:object');
  assert(
    top.additionalProperties === false,
    '[PR5.1b] CONCEPT_CARDS_JSON_SCHEMA top has additionalProperties:false',
  );
  assert(
    top.required.includes('concepts'),
    '[PR5.1c] CONCEPT_CARDS_JSON_SCHEMA top requires "concepts"',
  );
  const conceptsArr = top.properties.concepts as { items: SchemaObject };
  const card = conceptsArr.items;
  assert(card.type === 'object', '[PR5.1d] each concept card is type:object');
  assert(
    card.additionalProperties === false,
    '[PR5.1e] each concept card has additionalProperties:false',
  );
  // Required fields per card
  const REQUIRED_CARD_FIELDS = [
    'framework',
    'big_idea',
    'specific_situation',
    'selected_hook',
    'emotional_trigger',
    'persuasion_angle',
    'why_this_is_different_from_other_scripts',
    'scene_outline',
    'estimated_quality',
    'why_this_quality_score',
  ];
  for (const f of REQUIRED_CARD_FIELDS) {
    assert(
      card.required.includes(f),
      `[PR5.1f] concept card requires "${f}"`,
    );
    assert(
      f in card.properties,
      `[PR5.1g] concept card defines "${f}" in properties`,
    );
  }
  assert(
    card.required.length === REQUIRED_CARD_FIELDS.length,
    `[PR5.1h] concept card required count = ${REQUIRED_CARD_FIELDS.length}`,
    `actual: ${card.required.length}`,
  );

  // Framework enum matches
  const fw = card.properties.framework as { enum: readonly string[] };
  for (const v of SCRIPT_FRAMEWORKS as readonly string[]) {
    assert(
      fw.enum.includes(v),
      `[PR5.1i] concept card framework enum includes "${v}"`,
    );
  }
}

// ── 2. CONCEPT_SYSTEM_PROMPT is meaningfully shorter than full ─────────
{
  const conceptLen = CONCEPT_SYSTEM_PROMPT.length;
  const fullLen = SCRIPT_SYSTEM_PROMPT.length;
  // Full prompt should be 5-15× larger; concept must be smaller by an
  // order of magnitude or so (different scopes).
  assert(
    conceptLen < fullLen / 4,
    `[PR5.2a] CONCEPT_SYSTEM_PROMPT (${conceptLen} chars) is < SCRIPT_SYSTEM_PROMPT/4 (${Math.round(fullLen / 4)})`,
  );
  // But not trivial — must contain the framework brief + concept rules.
  assert(
    conceptLen > 1500,
    `[PR5.2b] CONCEPT_SYSTEM_PROMPT is non-trivial (>1.5K chars)`,
    `actual: ${conceptLen}`,
  );
  // Hits the load-bearing topics.
  for (const phrase of [
    'big_idea',
    'specific_situation',
    'selected_hook',
    'estimated_quality',
    'scene_outline',
    'אל תכתוב spoken_text_hebrew',
  ]) {
    assert(
      CONCEPT_SYSTEM_PROMPT.includes(phrase),
      `[PR5.2c] CONCEPT_SYSTEM_PROMPT mentions "${phrase}"`,
    );
  }
}

// ── 3. resolveScriptEngineMode env resolution ─────────────────────────
{
  // Default — when env is unset, mode is legacy_full_batch.
  const beforeRaw = process.env.SCRIPT_ENGINE_MODE;
  delete process.env.SCRIPT_ENGINE_MODE;
  assert(
    resolveScriptEngineMode() === 'legacy_full_batch',
    '[PR5.3a] No env → resolveScriptEngineMode() === "legacy_full_batch"',
  );

  process.env.SCRIPT_ENGINE_MODE = 'concept_first';
  assert(
    resolveScriptEngineMode() === 'concept_first',
    '[PR5.3b] SCRIPT_ENGINE_MODE=concept_first → "concept_first"',
  );

  process.env.SCRIPT_ENGINE_MODE = 'CONCEPT_FIRST';
  assert(
    resolveScriptEngineMode() === 'concept_first',
    '[PR5.3c] Case-insensitive resolution',
  );

  process.env.SCRIPT_ENGINE_MODE = 'unknown_value';
  assert(
    resolveScriptEngineMode() === 'legacy_full_batch',
    '[PR5.3d] Unknown value falls back to legacy',
  );

  // Cleanup
  if (beforeRaw === undefined) delete process.env.SCRIPT_ENGINE_MODE;
  else process.env.SCRIPT_ENGINE_MODE = beforeRaw;

  // Compile-time check (signpost): the type union has exactly two values.
  const valid: ScriptEngineMode = 'legacy_full_batch';
  assert(valid === 'legacy_full_batch', '[PR5.3e] ScriptEngineMode union compiles');
}

// ── 4. resolveConceptTopN bounds + default ────────────────────────────
{
  const beforeRaw = process.env.SCRIPT_CONCEPT_TOP_N;
  delete process.env.SCRIPT_CONCEPT_TOP_N;
  assert(resolveConceptTopN() === 3, '[PR5.4a] Default topN === 3');

  process.env.SCRIPT_CONCEPT_TOP_N = '4';
  assert(resolveConceptTopN() === 4, '[PR5.4b] topN=4 honored');

  process.env.SCRIPT_CONCEPT_TOP_N = '1';
  assert(resolveConceptTopN() === 1, '[PR5.4c] topN=1 honored');

  process.env.SCRIPT_CONCEPT_TOP_N = '0';
  assert(resolveConceptTopN() === 1, '[PR5.4d] topN=0 clamped to 1');

  process.env.SCRIPT_CONCEPT_TOP_N = '99';
  assert(resolveConceptTopN() === 6, '[PR5.4e] topN=99 clamped to 6');

  process.env.SCRIPT_CONCEPT_TOP_N = 'garbage';
  assert(resolveConceptTopN() === 3, '[PR5.4f] non-numeric falls back to 3');

  if (beforeRaw === undefined) delete process.env.SCRIPT_CONCEPT_TOP_N;
  else process.env.SCRIPT_CONCEPT_TOP_N = beforeRaw;
}

// ── 5. pickTopConceptsByQuality ranking + tie-break ───────────────────
{
  const make = (framework: string, quality: number): ConceptCard => ({
    framework,
    big_idea: '',
    specific_situation: '',
    selected_hook: '',
    emotional_trigger: '',
    persuasion_angle: '',
    why_this_is_different_from_other_scripts: '',
    scene_outline: [],
    estimated_quality: quality,
    why_this_quality_score: '',
  });

  const FRAMEWORK_ORDER = SCRIPT_FRAMEWORKS as readonly string[];

  // Strict-quality ordering: highest score first.
  {
    const cards = [
      make('skeptical_testimonial', 6),
      make('problem_agitation_solution', 9),
      make('demonstration_proof', 7),
      make('price_alternative_anchor', 4),
      make('relatable_israeli_moment', 8),
      make('fast_direct_response', 5),
    ];
    const top3 = pickTopConceptsByQuality(cards, 3, FRAMEWORK_ORDER);
    assert(
      top3.length === 3,
      '[PR5.5a] top 3 returns 3 items',
    );
    assert(
      top3[0]?.framework === 'problem_agitation_solution',
      '[PR5.5b] highest-quality concept first',
    );
    assert(
      top3[1]?.framework === 'relatable_israeli_moment',
      '[PR5.5c] second-highest concept second',
    );
    assert(
      top3[2]?.framework === 'demonstration_proof',
      '[PR5.5d] third-highest concept third',
    );
  }

  // Tie-break: equal quality → FRAMEWORK_ORDER position.
  {
    const cards = [
      make('fast_direct_response', 8), // last in order
      make('problem_agitation_solution', 8), // first in order
      make('demonstration_proof', 8), // 3rd in order
    ];
    const top2 = pickTopConceptsByQuality(cards, 2, FRAMEWORK_ORDER);
    assert(
      top2[0]?.framework === 'problem_agitation_solution',
      '[PR5.5e] tie-break: earlier FRAMEWORK_ORDER wins',
    );
    assert(
      top2[1]?.framework === 'demonstration_proof',
      '[PR5.5f] tie-break: 2nd-earliest framework next',
    );
  }

  // Edge cases.
  {
    const cards = [make('demonstration_proof', 5)];
    const all = pickTopConceptsByQuality(cards, 3, FRAMEWORK_ORDER);
    assert(
      all.length === 1,
      '[PR5.5g] picking topN > available returns all',
    );

    const empty = pickTopConceptsByQuality([], 3, FRAMEWORK_ORDER);
    assert(empty.length === 0, '[PR5.5h] empty input returns empty');

    const zero = pickTopConceptsByQuality(cards, 0, FRAMEWORK_ORDER);
    assert(zero.length === 0, '[PR5.5i] topN=0 returns empty');
  }

  // Determinism: 100 runs of the same input → same output.
  {
    const cards = [
      make('skeptical_testimonial', 7),
      make('problem_agitation_solution', 7),
      make('demonstration_proof', 9),
      make('price_alternative_anchor', 7),
    ];
    const refs = Array.from({ length: 100 }, () =>
      pickTopConceptsByQuality(cards, 2, FRAMEWORK_ORDER)
        .map((c) => c.framework)
        .join('|'),
    );
    const allSame = refs.every((r) => r === refs[0]);
    assert(
      allSame,
      '[PR5.5j] picker is deterministic across 100 runs',
      `unique: ${[...new Set(refs)].join(', ')}`,
    );
  }
}

// ── 6. buildExpansionPromptFragment locks concept fields ──────────────
{
  const concept: ConceptCard = {
    framework: 'demonstration_proof',
    big_idea: 'אמא לא קונה ספר פעילות בגלל שהוא חינוכי, אלא בגלל ה-15 דקות של שקט.',
    specific_situation: 'ערב שישי, חמישה אורחים, הילד צועק.',
    selected_hook: 'אחותי, יש לי דקה שקטה לראשונה השבוע.',
    emotional_trigger: 'relief',
    persuasion_angle: 'social-proof',
    why_this_is_different_from_other_scripts: 'rhythm — הקריינית מדברת ברגעים שקטים, לא בקצב מהיר.',
    scene_outline: [
      'סצנה 0: hook במטבח',
      'סצנה 1: הילד פתאום שקט',
      'סצנה 2: closeup על הספר',
      'סצנה 3: CTA',
    ],
    estimated_quality: 9,
    why_this_quality_score: 'big_idea חד וייחודי, hook עובר את מבחן ה-3 ישראליות.',
  };

  const frag = buildExpansionPromptFragment(concept);

  // The fragment must lock every load-bearing concept field verbatim.
  for (const value of [
    'demonstration_proof',
    concept.big_idea,
    concept.specific_situation,
    concept.selected_hook,
    concept.emotional_trigger,
    concept.persuasion_angle,
    concept.why_this_is_different_from_other_scripts,
    concept.why_this_quality_score,
  ]) {
    assert(
      frag.includes(value),
      `[PR5.6a] expansion fragment contains concept value: "${value.slice(0, 40)}..."`,
    );
  }
  for (const beat of concept.scene_outline) {
    assert(
      frag.includes(beat),
      `[PR5.6b] expansion fragment contains scene_outline beat: "${beat}"`,
    );
  }
  // The marker that tells the LLM it's a phase-2 expansion call.
  assert(
    /EXPAND THIS CONCEPT/i.test(frag),
    '[PR5.6c] expansion fragment has the "EXPAND THIS CONCEPT" header',
  );
  // Outputs single-script JSON (matches phase-2 schema).
  assert(
    /{\s*"script":\s*\{\.\.\.\}\s*}/.test(frag),
    '[PR5.6d] expansion fragment instructs single-script JSON output',
  );
}

// ── 7. extractIntelligenceBlock — phase-1 PI handoff ──────────────────
{
  // Build a real systemInstruction with PI block.
  type IntelShape = Parameters<typeof buildSystemInstructionWithIntelligence>[0];
  const fakeIntel = {
    dossier: {
      productName: 'X',
      category: 'skincare',
      subcategory: 'cleansing',
      productType: 'oil',
      productMechanism: 'oil emulsifies makeup',
      applicationMethod: 'pump 2 drops',
      applicatorType: 'pump',
      packagingType: 'bottle',
      textureType: 'oil',
      outputSubstance: 'amber oil',
      painPoints: ['tough makeup'],
      desiredOutcomes: ['clean skin'],
      purchaseTriggers: ['relief'],
      mainObjections: ['cost'],
      usageSteps: [],
      mustShowVisuals: [],
      mustAvoidVisuals: [],
      visualEvidenceRequirements: [],
      visualFailureModes: [],
      israeliRealismCues: [],
      conservativeAssumptions: [],
      likelyUseEnvironments: [],
    },
    visualAnalysis: {
      activePart: 'pump',
      objectDescription: 'amber bottle',
      howToHold: '',
      howToUseVisually: '',
      contactPoint: '',
      substanceVisualType: '',
      textureAndMaterial: '',
      bestDemoAngles: [],
      mustShowForDemo: [],
      mustAvoidForDemo: [],
      likelyModelMistakes: [],
    },
    audience: {
      primaryAudience: ['Israeli women'],
      dailyUseMoments: [],
      problemContext: [],
      emotionalTriggers: [],
      purchaseObjections: [],
      realisticIsraeliSettings: ['TLV bathroom'],
      toneRecommendation: '',
      visualStrategyRecommendation: '',
    },
  } as unknown as IntelShape;

  const sysWithIntel = buildSystemInstructionWithIntelligence(fakeIntel);
  const extracted = extractIntelligenceBlock(sysWithIntel);
  assert(
    extracted !== null,
    '[PR5.7a] extractIntelligenceBlock recovers PI from a real system instruction',
  );
  if (extracted) {
    assert(
      /PRODUCT INTELLIGENCE/.test(extracted),
      '[PR5.7b] extracted block contains the PI marker',
    );
    assert(
      /PRODUCT DOSSIER/.test(extracted),
      '[PR5.7c] extracted block contains DOSSIER section',
    );
    // Phase-1 will combine CONCEPT_SYSTEM_PROMPT + extracted PI; the
    // result is much smaller than the full system instruction (sub-PR2
    // savings still apply, just on a different prefix).
    const combined = `${CONCEPT_SYSTEM_PROMPT}\n\n${extracted}`;
    assert(
      combined.length < sysWithIntel.length,
      `[PR5.7d] CONCEPT_SYSTEM_PROMPT + PI (${combined.length}) shorter than SCRIPT_SYSTEM_PROMPT + PI (${sysWithIntel.length})`,
    );
  }

  // No PI → null.
  const sysWithoutIntel = buildSystemInstructionWithIntelligence(null);
  const empty = extractIntelligenceBlock(sysWithoutIntel);
  assert(
    empty === null,
    '[PR5.7e] No PI in the system instruction → null',
  );
}

// ── 8. Backwards-compat — default mode is legacy_full_batch ──────────
{
  const beforeRaw = process.env.SCRIPT_ENGINE_MODE;
  delete process.env.SCRIPT_ENGINE_MODE;
  assert(
    resolveScriptEngineMode() === 'legacy_full_batch',
    '[PR5.8a] PR5 default = legacy_full_batch (zero behavior change without env opt-in)',
  );
  if (beforeRaw === undefined) delete process.env.SCRIPT_ENGINE_MODE;
  else process.env.SCRIPT_ENGINE_MODE = beforeRaw;
}

// ── Diagnostic dump ─────────────────────────────────────────────────────
console.log('\n─── PR5 measurements ───');
console.log(`CONCEPT_SYSTEM_PROMPT chars: ${CONCEPT_SYSTEM_PROMPT.length}`);
console.log(`SCRIPT_SYSTEM_PROMPT chars: ${SCRIPT_SYSTEM_PROMPT.length}`);
console.log(`Ratio: concept is ${(CONCEPT_SYSTEM_PROMPT.length / SCRIPT_SYSTEM_PROMPT.length * 100).toFixed(1)}% the size of full`);
console.log(`Default engine mode: ${resolveScriptEngineMode()}`);
console.log(`Default topN: ${resolveConceptTopN()}`);
console.log('────────────────────────\n');

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('\nAll PR5 assertions passed.');
process.exit(0);
