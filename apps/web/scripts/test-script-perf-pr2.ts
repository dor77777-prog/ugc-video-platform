// V27.11.PR2 verification — script cost/latency quick wins.
//
// Three changes ride together (audit bottlenecks #1, #2, #4):
//   1. Product Intelligence MOVED from per-call user prompt to the
//      shared `systemInstruction` so all 6 parallel framework calls
//      see an identical instructions prefix → provider prefix-cache
//      hits on calls 2-6 (write on call 1; read at ~10% of input rate
//      after).
//   2. The 30-item self-checklist at the tail of SCRIPT_SYSTEM_PROMPT
//      compressed to a single read-aloud sentence. Stops the
//      checkmark-noise from fighting every other instruction in the
//      prompt and trims ~3000 chars / ~750 tokens off the system
//      prefix.
//   3. OpenAI default model flipped `gpt-5.4` → `gpt-5.4-mini` (~3x
//      cheaper) with `OPENAI_SCRIPT_MODEL` + `SCRIPT_QUALITY_MODE`
//      env overrides preserved.
//
// All three are pure and side-effect-free; this script verifies them
// without making any LLM calls.

import {
  buildSystemInstructionWithIntelligence,
  type ProductInput,
} from '../lib/llm/scripts';
import { SCRIPT_SYSTEM_PROMPT } from '@ugc-video/prompts';
import { OPENAI_DEFAULT_SCRIPT_MODEL } from '../lib/llm/openai-script-client';
import type {
  ProductIntelligence,
  ProductDossier,
  ProductVisualAnalysis,
  AudienceInference,
} from '../lib/product-intelligence';

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

// ── Fixtures ────────────────────────────────────────────────────────────
function makeIntelligence(): ProductIntelligence {
  const dossier: ProductDossier = {
    productName: 'Cleansing Oil',
    category: 'skincare',
    subcategory: 'cleansing',
    productType: 'cleansing oil',
    productMechanism: 'oil emulsifies makeup with water',
    applicationMethod: 'pump 2-3 drops into damp palms, massage onto face, rinse',
    applicatorType: 'pump',
    packagingType: 'bottle',
    textureType: 'oil',
    outputSubstance: 'clear amber oil',
    painPoints: ['stubborn waterproof makeup', 'morning grey skin'],
    desiredOutcomes: ['clean skin without tightness'],
    purchaseTriggers: ['skin felt clean for the first time'],
    mainObjections: ['will it clog pores?'],
    usageSteps: ['wet hands', 'pump 2 drops', 'massage', 'add water', 'rinse'],
    mustShowVisuals: ['amber bottle', 'pump applicator', 'oil on palm'],
    mustAvoidVisuals: ['white foam', 'heavy lather'],
    visualEvidenceRequirements: ['cotton round comes off clean'],
    visualFailureModes: ['cartoon foam'],
    israeliRealismCues: ['Israeli-style outlet'],
    conservativeAssumptions: ['suitable for daily use'],
    likelyUseEnvironments: ['bathroom counter', 'vanity'],
  } as unknown as ProductDossier;

  const visualAnalysis: ProductVisualAnalysis = {
    objectDescription: 'amber glass bottle with black pump',
    activePart: 'pump head',
    howToHold: 'one hand around bottle, other on pump',
    howToUseVisually: 'press pump, oil dispensed onto palm',
    contactPoint: 'palm of hand',
    substanceVisualType: 'clear amber oil',
    textureAndMaterial: 'glossy glass + matte label',
    bestDemoAngles: ['top-down on counter', 'mid-pump close-up'],
    mustShowForDemo: ['oil on palm'],
    mustAvoidForDemo: ['white foam'],
    likelyModelMistakes: ['rendered as a cream'],
  } as unknown as ProductVisualAnalysis;

  const audience: AudienceInference = {
    primaryAudience: ['Israeli women 25-40 with sensitive skin'],
    dailyUseMoments: ['Friday evening before going out'],
    problemContext: ['mascara that lingers under eyes the next morning'],
    emotionalTriggers: ['relief'],
    purchaseObjections: ['too expensive vs supermarket cleanser'],
    realisticIsraeliSettings: ['Tel Aviv apartment bathroom'],
    toneRecommendation: 'matter-of-fact friend',
    visualStrategyRecommendation: 'show the cotton round',
  } as unknown as AudienceInference;

  return {
    dossier,
    visualAnalysis,
    audience,
  } as unknown as ProductIntelligence;
}

function makeProductInput(intel: ProductIntelligence | null): ProductInput {
  return {
    productName: 'Cleansing Oil',
    description: 'A pump oil cleanser that emulsifies makeup with water.',
    brand: 'TestBrand',
    durationSeconds: 30,
    intelligence: intel,
    avatarDescription: 'Israeli woman, 28, dark hair',
    avatarGender: 'female',
  };
}

// ── 1. SCRIPT_SYSTEM_PROMPT no longer carries the 30-item checklist ────
{
  const sys = SCRIPT_SYSTEM_PROMPT;

  // Hard-numbered patterns 1.✅ … 30.✅ are gone.
  const numbered = sys.match(/^\d{1,2}\.\s+✅/gm) ?? [];
  assert(
    numbered.length === 0,
    '[PR2.1a] No "N. ✅" numbered checkmark items remain in SCRIPT_SYSTEM_PROMPT',
    `found ${numbered.length} matches: ${numbered.slice(0, 5).join(' | ')}`,
  );

  // V27.9 / V14 PR5 / V14 PR4 numbered checklist anchors are gone.
  for (const phrase of [
    '✅ V6 register lock',
    '✅ V6 genre',
    '✅ V6 voice_profile',
    '✅ V6 israeli_setting_cue per scene',
    '✅ V27.9 narrative_link_from_previous',
    '✅ V27.9 קריאה ברצף',
    '✅ V27.9 תקינות עברית',
    '✅ V27.9 frame_strategy עקבי',
  ]) {
    assert(
      !sys.includes(phrase),
      `[PR2.1b] Removed checklist anchor: "${phrase}"`,
    );
  }

  // The compressed final-check sentence IS in the prompt.
  assert(
    /בדיקה עצמית סופית/.test(sys),
    '[PR2.1c] Compressed final-check section header is preserved',
  );
  assert(
    /קרא את spoken_text_hebrew של כל הסצנות ברצף/.test(sys),
    '[PR2.1d] Compressed final-check sentence references the read-aloud test',
  );
  assert(
    /החזר אך ורק JSON תואם לסכמה\. שום טקסט מסביב/.test(sys),
    '[PR2.1e] Compressed final-check sentence preserves the "JSON only" rule',
  );
}

// ── 2. SCRIPT_SYSTEM_PROMPT growth contained relative to pre-PR2 ─────
// Growth history:
//   pre-PR2: 661 lines / ~40K chars (with 30-item self-checklist)
//   post-PR2: ~628 lines / ~37K chars (checklist removed)
//   post-V28.0.ST4 iter 1: ~680 lines / ~42K chars
//     (+ casual_markers requirement section + register anti-examples)
//   post-V28.0.ST4 iter 2: ~761 lines / ~46K chars
//     (+ Pure Hebrew rules + Grammar/Syntax self-check section)
// The user's milestone-level pain is Hebrew quality. The growth
// reflects load-bearing rules: register markers (REG-04), pure Hebrew
// (REG-05), and grammar/syntax self-check. Each is justified by
// production failures captured in eval runs.
{
  const lines = SCRIPT_SYSTEM_PROMPT.split('\n').length;
  const chars = SCRIPT_SYSTEM_PROMPT.length;
  // V28.0.ST4 iter 2 — relaxed line cap from <750 to <850
  assert(
    lines < 850,
    `[PR2.2a] SCRIPT_SYSTEM_PROMPT line count under +29% ceiling vs pre-PR2 baseline (was 661, now ${lines})`,
  );
  // V28.0.ST4 iter 2 — relaxed char cap from <44K to <50K (post-iter-2 actual ~46K)
  assert(
    chars < 50_000,
    `[PR2.2b] SCRIPT_SYSTEM_PROMPT char count under +25% ceiling vs pre-PR2 baseline (~40K → ${chars})`,
  );
  // Sanity floor — if we accidentally truncated the prompt entirely
  // we'd get a tiny string. The pre-PR2 prompt had REGISTER LOCK +
  // genre tables + voice profiles + Israeli realism + 7 frame
  // strategies + 6 frameworks at minimum.
  assert(
    chars > 25_000,
    `[PR2.2c] SCRIPT_SYSTEM_PROMPT still contains the load-bearing rails (chars=${chars})`,
  );
}

// ── 3. PI lives in systemInstruction, NOT in scripts user prompt ───────
{
  const intel = makeIntelligence();
  const sys = buildSystemInstructionWithIntelligence(intel);

  // PI markers DO show up in the system instruction.
  for (const marker of [
    '🧠 PRODUCT INTELLIGENCE',
    '📦 PRODUCT DOSSIER',
    '👥 AUDIENCE INFERENCE',
    '🎥 PRODUCT VISUAL ANALYSIS',
  ]) {
    assert(
      sys.includes(marker),
      `[PR2.3a] PI marker "${marker}" appears in shared systemInstruction`,
    );
  }

  // Concrete dossier content survives the move.
  assert(
    sys.includes('stubborn waterproof makeup'),
    '[PR2.3b] dossier.painPoints content lands in shared systemInstruction',
  );
  assert(
    sys.includes('Tel Aviv apartment bathroom'),
    '[PR2.3c] audience.realisticIsraeliSettings content lands in shared systemInstruction',
  );

  // Null intel → systemInstruction is exactly SCRIPT_SYSTEM_PROMPT.
  const sysNull = buildSystemInstructionWithIntelligence(null);
  assert(
    sysNull === SCRIPT_SYSTEM_PROMPT,
    '[PR2.3d] Null intelligence → systemInstruction === SCRIPT_SYSTEM_PROMPT (no PI block)',
  );

  // SCRIPT_SYSTEM_PROMPT is preserved verbatim as the prefix.
  assert(
    sys.startsWith(SCRIPT_SYSTEM_PROMPT),
    '[PR2.3e] systemInstruction starts with SCRIPT_SYSTEM_PROMPT verbatim (cache prefix integrity)',
  );
}

// ── 4. systemInstruction is byte-identical across calls (cache integrity) ─
{
  const intel = makeIntelligence();
  // Call the helper many times with the same input; every invocation
  // must return a string that's byte-identical. If anything inside
  // injects per-call randomness (timestamps, UUIDs, framework hints),
  // the prefix cache won't fire — assert it doesn't.
  const refs = Array.from({ length: 10 }, () =>
    buildSystemInstructionWithIntelligence(intel),
  );
  const allEqual = refs.every((r) => r === refs[0]);
  assert(
    allEqual,
    '[PR2.4a] buildSystemInstructionWithIntelligence is byte-identical across 10 invocations (deterministic cache prefix)',
    `lengths: ${refs.map((r) => r.length).join(', ')}`,
  );
}

// ── 5. Default model is gpt-5.4-mini ───────────────────────────────────
{
  // OPENAI_DEFAULT_SCRIPT_MODEL is resolved at module load. With no
  // OPENAI_SCRIPT_MODEL / SCRIPT_QUALITY_MODE env, it should equal
  // 'gpt-5.4-mini' (the new V27.11.PR2 default).
  assert(
    typeof OPENAI_DEFAULT_SCRIPT_MODEL === 'string' &&
      OPENAI_DEFAULT_SCRIPT_MODEL.length > 0,
    '[PR2.5a] OPENAI_DEFAULT_SCRIPT_MODEL is exported and non-empty',
  );

  // The literal source declaration says 'gpt-5.4-mini' as DEFAULT.
  // We can't observe the const directly without importing it (which
  // we do), so we assert it equals the expected baseline ONLY when
  // no env override is in play.
  const hasOverride =
    !!process.env.OPENAI_SCRIPT_MODEL ||
    !!process.env.SCRIPT_QUALITY_MODE;
  if (!hasOverride) {
    assert(
      OPENAI_DEFAULT_SCRIPT_MODEL === 'gpt-5.4-mini',
      '[PR2.5b] OPENAI_DEFAULT_SCRIPT_MODEL === "gpt-5.4-mini" (no env override active)',
      `actual: ${OPENAI_DEFAULT_SCRIPT_MODEL}`,
    );
  } else {
    console.log(
      `  (skip PR2.5b: env override OPENAI_SCRIPT_MODEL=${process.env.OPENAI_SCRIPT_MODEL ?? '(unset)'} / SCRIPT_QUALITY_MODE=${process.env.SCRIPT_QUALITY_MODE ?? '(unset)'} — assertion would not be meaningful)`,
    );
  }
}

// ── 6. systemInstruction size matches the cache-prefix sweet spot ──────
{
  const intel = makeIntelligence();
  const sys = buildSystemInstructionWithIntelligence(intel);
  // Anthropic Sonnet 4.6 cache_control requires ≥2048 tokens to
  // qualify; ~4 chars/token → ≥8192 chars is the cache-eligibility
  // floor. SCRIPT_SYSTEM_PROMPT alone clears 25K chars; with PI
  // (~4-6K extra chars on a real dossier) we're well over the bar.
  assert(
    sys.length >= 8192,
    `[PR2.6a] systemInstruction with PI clears Anthropic cache-eligibility floor (chars=${sys.length})`,
  );
  // Ceiling sanity. If it explodes to 100K+ something is appending
  // junk; the system block isn't supposed to grow without bound.
  assert(
    sys.length < 80_000,
    `[PR2.6b] systemInstruction with PI under 80K chars (chars=${sys.length})`,
  );
}

// ── 7. ProductInput shape compiles + buildSystemInstructionWithIntelligence
//      accepts the same value the runtime passes in ─────────────────────
{
  const inputWithIntel = makeProductInput(makeIntelligence());
  const inputNoIntel = makeProductInput(null);

  // Just exercising the call signature — the asserts above already
  // validated content. This guards against the type signature
  // accidentally narrowing in a future refactor (a regression we'd
  // see at runtime when the action calls in here).
  const sysA = buildSystemInstructionWithIntelligence(
    inputWithIntel.intelligence ?? null,
  );
  const sysB = buildSystemInstructionWithIntelligence(
    inputNoIntel.intelligence ?? null,
  );
  assert(
    sysA.length > sysB.length,
    '[PR2.7] systemInstruction with PI is longer than without (PI block added in)',
    `withIntel=${sysA.length}, noIntel=${sysB.length}`,
  );
}

// ── Diagnostic dump ─────────────────────────────────────────────────────
console.log('\n─── PR2 measurements ───');
const intel = makeIntelligence();
const sysWith = buildSystemInstructionWithIntelligence(intel);
const sysWithout = buildSystemInstructionWithIntelligence(null);
console.log(`SCRIPT_SYSTEM_PROMPT lines: ${SCRIPT_SYSTEM_PROMPT.split('\n').length}`);
console.log(`SCRIPT_SYSTEM_PROMPT chars: ${SCRIPT_SYSTEM_PROMPT.length}`);
console.log(`systemInstruction WITH intelligence chars: ${sysWith.length}`);
console.log(`systemInstruction WITHOUT intelligence chars: ${sysWithout.length}`);
console.log(`PI delta: ${sysWith.length - sysWithout.length} chars`);
console.log(`OPENAI_DEFAULT_SCRIPT_MODEL: ${OPENAI_DEFAULT_SCRIPT_MODEL}`);
console.log('────────────────────────\n');

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('\nAll PR2 assertions passed.');
process.exit(0);
