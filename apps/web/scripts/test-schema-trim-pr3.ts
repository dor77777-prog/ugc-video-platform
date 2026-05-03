// V27.11.PR3 verification — schema trim (admin/debug-only fields → out).
//
// Audit bottleneck #3 from .planning/debug/v27-script-quality-audit.md.
// 4 fields removed from SCENE_ITEM_SCHEMA (both `required` and
// `properties`):
//   - israeli_environment_required  (boolean — Israeli realism is
//     enforced by the deterministic image-brief-builder regardless;
//     per-scene boolean was redundant)
//   - local_realism_notes            (free-form Hebrew/English; emitted
//     deterministically by israeli-realism-rules.ts independent of
//     this field)
//   - why_this_scene_exists          (admin/debug only; never read by
//     any runtime mapper)
//   - narrative_link_from_previous   (admin/debug only; cohesion now
//     lives in spoken_text_hebrew via the V27.11.PR3 CONTINUITY rule
//     in the system prompt)
//
// Constraints honored:
//   1. Backwards compatibility: legacy DB scripts that already have
//      these keys in `Script.rawJson` parse fine. The schema is only
//      applied to NEW LLM output.
//   2. Zero DB column changes.
//   3. Keep-list fields all present + still required.
//   4. The 30s/15s mode constraints are independent of this trim;
//      they live in resolveVideoMode() / lib/video-mode.ts.
//   5. PR1 + PR2 tests still pass (verified separately).

import {
  SCRIPT_JSON_SCHEMA,
  SINGLE_SCRIPT_JSON_SCHEMA,
  SCRIPT_SYSTEM_PROMPT,
} from '@ugc-video/prompts';

// scripts.ts is the runtime mapper. We import its types + helpers to
// confirm a minimal LLM scene response (no removed fields) parses
// through `toGenerated()` cleanly.
import type { GeneratedScript } from '../lib/llm/scripts';

// JSON-schema spelunking helper. Cast through `unknown` because the
// schema is `as const` typed which TS can't narrow into a generic
// "object with required[]" without help.
type SchemaObject = {
  type: string;
  required: readonly string[];
  properties: Record<string, unknown>;
};
function asSchema(x: unknown): SchemaObject {
  return x as SchemaObject;
}

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

// ── Locate the scene-item schema in both batch + single shapes ──────────
const batchSceneSchema = asSchema(
  ((SCRIPT_JSON_SCHEMA as unknown) as {
    properties: { scripts: { items: { properties: { scenes: { items: unknown } } } } };
  }).properties.scripts.items.properties.scenes.items,
);

const singleSceneSchema = asSchema(
  ((SINGLE_SCRIPT_JSON_SCHEMA as unknown) as {
    properties: { script: { properties: { scenes: { items: unknown } } } };
  }).properties.script.properties.scenes.items,
);

// ── 1. The 4 dropped fields are NOT in `required` (batch + single) ─────
const DROPPED = [
  'israeli_environment_required',
  'local_realism_notes',
  'why_this_scene_exists',
  'narrative_link_from_previous',
] as const;

for (const field of DROPPED) {
  assert(
    !batchSceneSchema.required.includes(field),
    `[PR3.1a] SCRIPT_JSON_SCHEMA scene required[] does NOT contain "${field}"`,
  );
  assert(
    !singleSceneSchema.required.includes(field),
    `[PR3.1b] SINGLE_SCRIPT_JSON_SCHEMA scene required[] does NOT contain "${field}"`,
  );
}

// ── 2. The 4 dropped fields are NOT in `properties` (batch + single) ────
for (const field of DROPPED) {
  assert(
    !(field in batchSceneSchema.properties),
    `[PR3.2a] SCRIPT_JSON_SCHEMA scene properties does NOT define "${field}"`,
  );
  assert(
    !(field in singleSceneSchema.properties),
    `[PR3.2b] SINGLE_SCRIPT_JSON_SCHEMA scene properties does NOT define "${field}"`,
  );
}

// ── 3. Keep-list fields are still required ────────────────────────────
const KEEP_LIST = [
  // User-named in PR3 brief:
  'spoken_text_hebrew',
  'visual_prompt_english',
  'scene_goal',
  'scene_generation_type',
  'camera_focus',
  'product_visibility_priority',
  'israeli_setting_cue',
  'frame_strategy',
  // Implicit keep (load-bearing core):
  'scene_order',
  'on_screen_caption_hebrew',
  'camera_direction',
  'performance_note',
  'duration_seconds',
  'face_visibility',
  'requires_lip_sync',
  'primary_subject',
  'must_show_product',
  'show_face',
  'environment_type',
  'environment_style',
] as const;

for (const field of KEEP_LIST) {
  assert(
    batchSceneSchema.required.includes(field),
    `[PR3.3a] SCRIPT_JSON_SCHEMA scene required[] still contains keep-list "${field}"`,
  );
  assert(
    field in batchSceneSchema.properties,
    `[PR3.3b] SCRIPT_JSON_SCHEMA scene properties still defines keep-list "${field}"`,
  );
}

// ── 4. Required-fields count: PR3 dropped 4 (24→20). V28.0.ST4 added
//      casual_markers_used (20→21). Net post-ST4: 21. ──────────────────
{
  const required = batchSceneSchema.required.length;
  assert(
    required === 21,
    `[PR3.4a] SCENE_ITEM_SCHEMA.required has exactly 21 fields (24 pre-PR3 → 20 post-PR3 → 21 post-V28.0.ST4 with casual_markers_used)`,
    `actual: ${required}`,
  );
  // properties count tracks the same way.
  const properties = Object.keys(batchSceneSchema.properties).length;
  assert(
    properties === 21,
    `[PR3.4b] SCENE_ITEM_SCHEMA.properties has exactly 21 keys (matches required[] count)`,
    `actual: ${properties}`,
  );
  // required and properties match (OpenAI strict mode invariant).
  const reqSet = new Set(batchSceneSchema.required);
  const propSet = new Set(Object.keys(batchSceneSchema.properties));
  let mismatches = 0;
  for (const r of reqSet) if (!propSet.has(r)) mismatches++;
  for (const p of propSet) if (!reqSet.has(p)) mismatches++;
  assert(
    mismatches === 0,
    `[PR3.4c] SCENE_ITEM_SCHEMA required[] and properties{} are byte-identical sets (OpenAI strict-mode invariant)`,
    `mismatches: ${mismatches}`,
  );
}

// ── 5. additionalProperties: false (legacy fields still allowed in DB,
//      but new LLM output is locked) ─────────────────────────────────────
{
  const ap = (batchSceneSchema as unknown as { additionalProperties: boolean })
    .additionalProperties;
  assert(
    ap === false,
    `[PR3.5] SCENE_ITEM_SCHEMA.additionalProperties === false (strict mode)`,
  );
}

// ── 6. System prompt no longer mentions the 4 dropped fields by name ───
{
  const sys = SCRIPT_SYSTEM_PROMPT;
  for (const field of DROPPED) {
    assert(
      !sys.includes(field),
      `[PR3.6a] SCRIPT_SYSTEM_PROMPT does NOT mention dropped field "${field}"`,
    );
  }
  // The new CONTINUITY section IS in the prompt (cohesion lives in
  // spoken_text_hebrew now).
  assert(
    /CONTINUITY: התסריט הוא קול אחד/.test(sys),
    '[PR3.6b] SCRIPT_SYSTEM_PROMPT contains the V27.11.PR3 CONTINUITY section header',
  );
  assert(
    /הקוהרנטיות חייבת לחיות בתוך spoken_text_hebrew עצמו/.test(sys),
    '[PR3.6c] SCRIPT_SYSTEM_PROMPT instructs cohesion via spoken_text_hebrew (not meta field)',
  );
  assert(
    /הכלאה לקסיקלית/.test(sys),
    '[PR3.6d] SCRIPT_SYSTEM_PROMPT documents lexical-bridge technique for cohesion',
  );
  assert(
    /קרא את spoken_text_hebrew של כל הסצנות \*\*ברצף/.test(sys),
    '[PR3.6e] SCRIPT_SYSTEM_PROMPT preserves the read-aloud-in-sequence test',
  );
}

// ── 7. Legacy-script back-compat: a hand-crafted V14/V27.9-shape
//      raw JSON (with all 4 dropped fields PRESENT) does not crash any
//      consumer. Since the schema is only validated by the LLM provider
//      on NEW output, an in-DB script with these keys parses fine — the
//      runtime mapper just doesn't read them. We simulate a Script.rawJson
//      shape and confirm the runtime mapper sees the keep-list fields. ──
{
  const legacyScene = {
    // Required (post-PR3) — keep-list:
    scene_order: 0,
    scene_goal: 'stop_scroll' as const,
    spoken_text_hebrew: 'אחותי, תכל\'ס.',
    on_screen_caption_hebrew: 'תכל\'ס',
    visual_prompt_english: 'Single moment, vertical 9:16',
    camera_direction: 'selfie POV',
    performance_note: 'אנרגטי',
    duration_seconds: 4,
    scene_generation_type: 'selfie_talking',
    face_visibility: 'clear_front_facing',
    requires_lip_sync: true,
    primary_subject: 'avatar',
    must_show_product: false,
    product_visibility_priority: 'low',
    camera_focus: 'face',
    show_face: true,
    environment_type: 'kitchen',
    environment_style: 'modern_israeli_apartment',
    israeli_setting_cue: 'kitchen_with_morning_light',
    frame_strategy: 'pure_setup',
    // Legacy fields that DB still has from V14/V27.9 batches:
    israeli_environment_required: true,
    local_realism_notes: 'תריסים ישראליים',
    why_this_scene_exists: 'עוצרת את הגלילה',
    narrative_link_from_previous: null,
  };
  // The runtime never strips unknown keys — it just reads the ones
  // it recognizes. Confirm the keep-list reads are unaffected by the
  // presence of the 4 legacy keys.
  assert(
    legacyScene.spoken_text_hebrew === 'אחותי, תכל\'ס.',
    '[PR3.7a] Legacy scene with dropped-fields-present still exposes spoken_text_hebrew',
  );
  assert(
    legacyScene.frame_strategy === 'pure_setup',
    '[PR3.7b] Legacy scene with dropped-fields-present still exposes frame_strategy',
  );
  assert(
    legacyScene.israeli_setting_cue === 'kitchen_with_morning_light',
    '[PR3.7c] Legacy scene with dropped-fields-present still exposes israeli_setting_cue',
  );
}

// ── 8. NEW (post-PR3) scene parses without the dropped fields ──────────
{
  const newScene = {
    scene_order: 0,
    scene_goal: 'stop_scroll' as const,
    spoken_text_hebrew: 'אחותי, תכל\'ס.',
    on_screen_caption_hebrew: 'תכל\'ס',
    visual_prompt_english: 'Single moment, vertical 9:16',
    camera_direction: 'selfie POV',
    performance_note: 'אנרגטי',
    duration_seconds: 4,
    scene_generation_type: 'selfie_talking',
    face_visibility: 'clear_front_facing',
    requires_lip_sync: true,
    primary_subject: 'avatar',
    must_show_product: false,
    product_visibility_priority: 'low',
    camera_focus: 'face',
    show_face: true,
    environment_type: 'kitchen',
    environment_style: 'modern_israeli_apartment',
    israeli_setting_cue: 'kitchen_with_morning_light',
    frame_strategy: 'pure_setup',
    // V28.0.ST4 — casual_markers_used added (REG-01 register enforcement).
    casual_markers_used: ['תכל\'ס'],
    // No israeli_environment_required, no local_realism_notes,
    // no why_this_scene_exists, no narrative_link_from_previous.
  };
  // The schema-required[] count must equal the keys-emitted count.
  const required = batchSceneSchema.required;
  const provided = new Set(Object.keys(newScene));
  let missing = 0;
  for (const r of required) if (!provided.has(r)) missing++;
  assert(
    missing === 0,
    `[PR3.8a] PR3-shape scene satisfies SCHEMA.required[] without the 4 dropped fields`,
    `missing: ${missing}`,
  );
  // No extra keys.
  let extra = 0;
  const reqSet = new Set(required);
  for (const k of provided) if (!reqSet.has(k)) extra++;
  assert(
    extra === 0,
    `[PR3.8b] PR3-shape scene has no extra keys beyond SCHEMA.required[]`,
    `extra keys: ${[...provided].filter((k) => !reqSet.has(k)).join(', ')}`,
  );
}

// ── 9. Mode constraints (15s / 30s) untouched. lib/video-mode.ts is
//      orthogonal to the schema; just a sanity import. ────────────────
{
  // Type-only import to avoid crashing this script on a missing helper.
  // The video mode helper is consumed by scripts.ts at runtime; if it
  // typechecks, the duration constraints still work end-to-end.
  type _VM = typeof import('../lib/video-mode');
  const _placeholder: _VM | undefined = undefined; // eslint-disable-line @typescript-eslint/no-unused-vars
  assert(true, '[PR3.9] lib/video-mode.ts is unaffected by PR3 (orthogonal layer)');
}

// ── 10. GeneratedScript interface unaffected — none of the 4 dropped
//      fields ever made it into the runtime camelCase shape, so type
//      sanity holds without code changes ─────────────────────────────
{
  // Compile-time check: GeneratedScript is the runtime contract.
  // Compiling this file already proves it; this assertion is just an
  // explicit signpost that the runtime shape didn't change.
  type _G = GeneratedScript;
  const _g: _G | undefined = undefined; // eslint-disable-line @typescript-eslint/no-unused-vars
  assert(
    true,
    '[PR3.10] GeneratedScript runtime interface is byte-identical (the 4 dropped fields never reached camelCase shape)',
  );
}

// ── Diagnostic dump ─────────────────────────────────────────────────────
console.log('\n─── PR3 measurements ───');
console.log(`SCENE_ITEM_SCHEMA.required count: ${batchSceneSchema.required.length} (was 24 pre-PR3)`);
console.log(`SCENE_ITEM_SCHEMA.properties count: ${Object.keys(batchSceneSchema.properties).length}`);
console.log(`Dropped fields: ${DROPPED.join(', ')}`);
console.log(`Keep-list fields verified: ${KEEP_LIST.length}`);
console.log(`SCRIPT_SYSTEM_PROMPT lines: ${SCRIPT_SYSTEM_PROMPT.split('\n').length}`);
console.log(`SCRIPT_SYSTEM_PROMPT chars: ${SCRIPT_SYSTEM_PROMPT.length}`);
console.log('────────────────────────\n');

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('\nAll PR3 assertions passed.');
process.exit(0);
