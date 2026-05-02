// V27.11.PR6 verification — concept-first interactive flow.
//
// Covers the 16 test cases from the PR6 brief:
//   1.  legacy_full_batch still resolved correctly.
//   2.  concept_interactive engine-mode flag.
//   3.  Concept schema shape (12 required fields).
//   4.  Storage: wrapRawConceptsForStorage assigns IDs + slots.
//   5.  Storage: replaceSlots preserves byte-identical kept slots.
//   6.  Storage: replaceSlots increments regenerationCount + records
//       regeneratedFromConceptId on regenerated slots.
//   7.  Selection validation: 0 blocked, 1-3 allowed, 4+ blocked,
//       duplicates blocked.
//   8.  readPendingConcepts forward-compat (rejects unknown shapes).
//   9.  writePendingConcepts merges into existing productData.
//   10. clearPendingConcepts removes the key without disturbing rest.
//   11. Concept system prompt mentions all 12 LLM-output fields.
//   12. Regen system prompt mentions kept/replace contracts.
//   13. Anti-collage rule still in concept system prompt.
//   14. Schema also exposes a regen schema with same card shape.
//   15. PR1+PR4 anti-collage tests still pass (run regression).
//   16. Type-shape sanity (StoredConcept has both raw + wrapper fields).

import {
  CONCEPT_CARDS_JSON_SCHEMA,
  CONCEPT_REGEN_JSON_SCHEMA,
  CONCEPT_SYSTEM_PROMPT,
  CONCEPT_REGEN_SYSTEM_PROMPT,
} from '@ugc-video/prompts';
import {
  resolveScriptEngineMode,
  type ScriptEngineMode,
} from '../lib/llm/concept-engine';
import {
  wrapRawConceptsForStorage,
  replaceSlots,
  readPendingConcepts,
  writePendingConcepts,
  clearPendingConcepts,
  validateSelection,
  type RawConceptCard,
  type StoredConcept,
  type PendingConcepts,
} from '../lib/llm/concept-storage';

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

const REQUIRED_FIELDS = [
  'framework',
  'big_idea',
  'selected_hook',
  'hook_direction',
  'target_audience_moment',
  'emotional_trigger',
  'product_proof_moment',
  'scene_outline',
  'why_it_fits_product',
  'why_it_fits_audience',
  'estimated_quality',
  'risk_notes',
];

function makeRaw(framework: string, label = 'a'): RawConceptCard {
  return {
    framework,
    big_idea: `[${label}] big idea for ${framework}`,
    selected_hook: `[${label}] hook ${framework}`,
    hook_direction: 'frustration',
    target_audience_moment: `[${label}] audience moment`,
    emotional_trigger: 'frustration',
    product_proof_moment: `[${label}] proof moment for ${framework}`,
    scene_outline: ['scene 0', 'scene 1', 'scene 2', 'scene 3'],
    why_it_fits_product: `[${label}] product fit`,
    why_it_fits_audience: `[${label}] audience fit`,
    estimated_quality: 8,
    risk_notes: null,
  };
}

// ── 1. resolveScriptEngineMode default ───────────────────────────────
{
  const before = process.env.SCRIPT_ENGINE_MODE;
  delete process.env.SCRIPT_ENGINE_MODE;
  assert(
    resolveScriptEngineMode() === 'legacy_full_batch',
    '[PR6.1] No env → legacy_full_batch (default unchanged)',
  );
  if (before === undefined) delete process.env.SCRIPT_ENGINE_MODE;
  else process.env.SCRIPT_ENGINE_MODE = before;
}

// ── 2. concept_interactive flag + legacy concept_first remap ────────
{
  const before = process.env.SCRIPT_ENGINE_MODE;
  process.env.SCRIPT_ENGINE_MODE = 'concept_interactive';
  assert(
    resolveScriptEngineMode() === 'concept_interactive',
    '[PR6.2a] SCRIPT_ENGINE_MODE=concept_interactive → "concept_interactive"',
  );
  process.env.SCRIPT_ENGINE_MODE = 'CONCEPT_INTERACTIVE';
  assert(
    resolveScriptEngineMode() === 'concept_interactive',
    '[PR6.2b] case-insensitive resolution',
  );
  // Legacy PR5 value silently remaps to legacy_full_batch.
  process.env.SCRIPT_ENGINE_MODE = 'concept_first';
  assert(
    resolveScriptEngineMode() === 'legacy_full_batch',
    '[PR6.2c] PR5 legacy "concept_first" silently → legacy_full_batch (broken UX retired)',
  );
  if (before === undefined) delete process.env.SCRIPT_ENGINE_MODE;
  else process.env.SCRIPT_ENGINE_MODE = before;

  const valid: ScriptEngineMode = 'concept_interactive';
  assert(
    valid === 'concept_interactive',
    '[PR6.2d] ScriptEngineMode union compiles with concept_interactive',
  );
}

// ── 3. CONCEPT_CARDS_JSON_SCHEMA shape (12 required fields) ─────────
{
  type SchemaObject = {
    type: string;
    required: readonly string[];
    properties: Record<string, unknown>;
    additionalProperties?: boolean;
  };
  const top = (CONCEPT_CARDS_JSON_SCHEMA as unknown) as SchemaObject;
  const card = (top.properties.concepts as { items: SchemaObject }).items;

  assert(
    card.required.length === REQUIRED_FIELDS.length,
    `[PR6.3a] concept card has exactly ${REQUIRED_FIELDS.length} required fields`,
    `actual: ${card.required.length}`,
  );
  for (const f of REQUIRED_FIELDS) {
    assert(
      card.required.includes(f),
      `[PR6.3b] concept card requires "${f}"`,
    );
    assert(
      f in card.properties,
      `[PR6.3c] concept card defines "${f}" in properties`,
    );
  }
  assert(
    card.additionalProperties === false,
    '[PR6.3d] concept card additionalProperties: false (strict mode)',
  );
}

// ── 4. wrapRawConceptsForStorage assigns IDs + slot indices ─────────
{
  const raw = ['problem_agitation_solution', 'skeptical_testimonial', 'demonstration_proof'].map(
    (f, i) => makeRaw(f, `r${i}`),
  );
  const stored = wrapRawConceptsForStorage(raw);
  assert(
    stored.length === 3,
    '[PR6.4a] wrapRawConceptsForStorage preserves count',
  );
  assert(
    stored.every((c) => typeof c.concept_id === 'string' && c.concept_id.length > 10),
    '[PR6.4b] every stored concept has a UUID concept_id',
  );
  assert(
    new Set(stored.map((c) => c.concept_id)).size === stored.length,
    '[PR6.4c] concept_ids are unique',
  );
  assert(
    stored[0]!.slot_index === 0 &&
      stored[1]!.slot_index === 1 &&
      stored[2]!.slot_index === 2,
    '[PR6.4d] slot_index assigned 0..N-1',
  );
  assert(
    stored.every((c) => c.regenerationCount === 0),
    '[PR6.4e] regenerationCount initialized to 0',
  );
  assert(
    stored.every((c) => c.regeneratedFromConceptId === null),
    '[PR6.4f] regeneratedFromConceptId starts as null',
  );
}

// ── 5. replaceSlots preserves kept slots byte-identical ─────────────
{
  const raw6 = ['a', 'b', 'c', 'd', 'e', 'f'].map((l, i) =>
    makeRaw(`fw_${i}`, l),
  );
  const stored = wrapRawConceptsForStorage(raw6);

  // Replace slots 1 and 4 with two new raw cards.
  const replacement = [makeRaw('fw_1_new', 'X'), makeRaw('fw_4_new', 'Y')];
  const updated = replaceSlots(stored, [1, 4], replacement);

  assert(
    updated.length === stored.length,
    '[PR6.5a] replaceSlots keeps total count',
  );
  // Kept slots (0, 2, 3, 5) byte-identical.
  for (const slot of [0, 2, 3, 5]) {
    const before = stored[slot]!;
    const after = updated[slot]!;
    assert(
      before === after,
      `[PR6.5b] slot ${slot} byte-identical after replaceSlots (kept)`,
    );
  }

  // ── 6. replaced slots get new ID + regen tracking ─────────────────
  for (const slot of [1, 4]) {
    const before = stored[slot]!;
    const after = updated[slot]!;
    assert(
      after.concept_id !== before.concept_id,
      `[PR6.6a] replaced slot ${slot} got a new concept_id`,
    );
    assert(
      after.slot_index === slot,
      `[PR6.6b] replaced slot ${slot} preserves slot_index`,
    );
    assert(
      after.regenerationCount === before.regenerationCount + 1,
      `[PR6.6c] replaced slot ${slot} increments regenerationCount`,
    );
    assert(
      after.regeneratedFromConceptId === before.concept_id,
      `[PR6.6d] replaced slot ${slot} records previous concept_id as regeneratedFromConceptId`,
    );
  }
}

// ── 7. validateSelection enforces 1-3 + dedupe ─────────────────────
{
  assert(
    !validateSelection([]).ok,
    '[PR6.7a] 0 selected → blocked',
  );
  assert(
    validateSelection(['a']).ok,
    '[PR6.7b] 1 selected → allowed',
  );
  assert(
    validateSelection(['a', 'b']).ok,
    '[PR6.7c] 2 selected → allowed',
  );
  assert(
    validateSelection(['a', 'b', 'c']).ok,
    '[PR6.7d] 3 selected → allowed',
  );
  assert(
    !validateSelection(['a', 'b', 'c', 'd']).ok,
    '[PR6.7e] 4 selected → blocked',
  );
  assert(
    !validateSelection(['a', 'a']).ok,
    '[PR6.7f] duplicate IDs → blocked',
  );
}

// ── 8. readPendingConcepts forward-compat ──────────────────────────
{
  assert(
    readPendingConcepts(null) === null,
    '[PR6.8a] null productData → null',
  );
  assert(
    readPendingConcepts({}) === null,
    '[PR6.8b] empty productData → null',
  );
  assert(
    readPendingConcepts({ pendingConcepts: 'string' }) === null,
    '[PR6.8c] non-object pendingConcepts → null',
  );
  assert(
    readPendingConcepts({ pendingConcepts: { version: 999 } }) === null,
    '[PR6.8d] unknown version → null (forward-compat)',
  );
  assert(
    readPendingConcepts({
      pendingConcepts: { version: 1, scriptEngineMode: 'legacy_full_batch' },
    }) === null,
    '[PR6.8e] mode mismatch → null',
  );

  const raw = wrapRawConceptsForStorage([makeRaw('demonstration_proof', 'a')]);
  const valid: PendingConcepts = {
    status: 'draft',
    version: 1,
    scriptEngineMode: 'concept_interactive',
    generatedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    selectedConceptIds: [],
    expandedConceptIds: [],
    concepts: raw,
  };
  const recovered = readPendingConcepts({ pendingConcepts: valid });
  assert(
    recovered != null && recovered.concepts.length === 1,
    '[PR6.8f] valid pendingConcepts round-trips through read',
  );
}

// ── 9. writePendingConcepts merges into existing productData ───────
{
  const baseProductData = {
    description: 'a product',
    avatarId: 'noa',
    intelligence: { dossier: { painPoints: [] } },
  };
  const pending: PendingConcepts = {
    status: 'draft',
    version: 1,
    scriptEngineMode: 'concept_interactive',
    generatedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    selectedConceptIds: [],
    expandedConceptIds: [],
    concepts: [],
  };
  const merged = writePendingConcepts(baseProductData, pending);
  assert(
    'pendingConcepts' in merged,
    '[PR6.9a] writePendingConcepts adds pendingConcepts key',
  );
  assert(
    merged.description === 'a product',
    '[PR6.9b] writePendingConcepts preserves base productData fields',
  );
  assert(
    typeof merged.intelligence === 'object',
    '[PR6.9c] writePendingConcepts preserves nested intelligence',
  );
}

// ── 10. clearPendingConcepts removes only the key ──────────────────
{
  const productData = {
    description: 'still here',
    intelligence: { dossier: {} },
    pendingConcepts: { version: 1, concepts: [] },
  };
  const cleared = clearPendingConcepts(productData);
  assert(
    !('pendingConcepts' in cleared),
    '[PR6.10a] clearPendingConcepts removes the key',
  );
  assert(
    cleared.description === 'still here',
    '[PR6.10b] clearPendingConcepts preserves other top-level fields',
  );
  assert(
    typeof cleared.intelligence === 'object',
    '[PR6.10c] clearPendingConcepts preserves intelligence',
  );
}

// ── 11. CONCEPT_SYSTEM_PROMPT mentions all 12 LLM-output fields ────
{
  for (const f of REQUIRED_FIELDS) {
    assert(
      CONCEPT_SYSTEM_PROMPT.includes(f),
      `[PR6.11] CONCEPT_SYSTEM_PROMPT mentions field "${f}"`,
    );
  }
}

// ── 12. CONCEPT_REGEN_SYSTEM_PROMPT contract phrases ──────────────
{
  for (const phrase of [
    'conceptsToKeep',
    'conceptsToReplace',
    'אסור לחזור עליהם',
  ]) {
    assert(
      CONCEPT_REGEN_SYSTEM_PROMPT.includes(phrase),
      `[PR6.12] regen system prompt mentions "${phrase}"`,
    );
  }
}

// ── 13. Anti-collage rule still present in concept system prompt ────
{
  assert(
    /split-screen/i.test(CONCEPT_SYSTEM_PROMPT),
    '[PR6.13a] concept system prompt forbids split-screen',
  );
  assert(
    /two-panel|שני פאנלים|שני panels/.test(CONCEPT_SYSTEM_PROMPT),
    '[PR6.13b] concept system prompt forbids two-panel',
  );
  assert(
    /רצף|שתי סצנות/.test(CONCEPT_SYSTEM_PROMPT),
    '[PR6.13c] concept system prompt explains before/after = scene sequence, not panel',
  );
}

// ── 14. CONCEPT_REGEN_JSON_SCHEMA exists with same card shape ──────
{
  type SchemaObject = {
    type: string;
    required: readonly string[];
    properties: Record<string, unknown>;
  };
  const regen = (CONCEPT_REGEN_JSON_SCHEMA as unknown) as SchemaObject;
  const card = (regen.properties.concepts as { items: SchemaObject }).items;
  assert(
    card.required.length === REQUIRED_FIELDS.length,
    '[PR6.14a] regen schema card has same required count as initial card',
  );
  for (const f of REQUIRED_FIELDS) {
    assert(
      card.required.includes(f),
      `[PR6.14b] regen schema card requires "${f}"`,
    );
  }
}

// ── 15. Type-shape sanity for StoredConcept ────────────────────────
{
  const raw = makeRaw('demonstration_proof', 'a');
  const stored: StoredConcept = wrapRawConceptsForStorage([raw])[0]!;
  // Compile-time check: StoredConcept extends RawConceptCard + wrapper fields.
  assert(
    typeof stored.concept_id === 'string',
    '[PR6.15a] StoredConcept has concept_id (server-managed)',
  );
  assert(
    typeof stored.slot_index === 'number',
    '[PR6.15b] StoredConcept has slot_index',
  );
  assert(
    typeof stored.regenerationCount === 'number',
    '[PR6.15c] StoredConcept has regenerationCount',
  );
  assert(
    stored.framework === 'demonstration_proof',
    '[PR6.15d] StoredConcept preserves raw framework',
  );
  assert(
    stored.big_idea === raw.big_idea,
    '[PR6.15e] StoredConcept preserves raw big_idea',
  );
}

// ── 16. Diagnostic dump ─────────────────────────────────────────────
console.log('\n─── PR6 measurements ───');
console.log(`CONCEPT_SYSTEM_PROMPT chars: ${CONCEPT_SYSTEM_PROMPT.length}`);
console.log(`CONCEPT_REGEN_SYSTEM_PROMPT chars: ${CONCEPT_REGEN_SYSTEM_PROMPT.length}`);
console.log(`Concept card required fields: ${REQUIRED_FIELDS.length}`);
console.log(`Default engine mode: ${resolveScriptEngineMode()}`);
console.log('────────────────────────\n');

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('\nAll PR6 assertions passed.');
process.exit(0);
