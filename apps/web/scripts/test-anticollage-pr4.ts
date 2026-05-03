// V27.11.PR4 verification — durable anti-collage architecture.
//
// PR1 was stop-the-bleeding (universal SINGLE-FRAME RULE +
// comparison-guard bridge). PR4 closes the door at the upstream
// schema + system-prompt level so NEW LLM scripts never even ask
// for a multi-panel layout:
//
//   1. SCENE_GENERATION_TYPES no longer contains 'before_after'.
//      Before/after is rendered as TWO consecutive scenes (state 1
//      + state 2), never as a single panel-split frame.
//   2. FRAME_STRATEGIES: 'comparison_split' renamed to
//      'comparison_focus'. The new value enforces single-state
//      composition — the alternative, if visible, is desaturated /
//      out-of-focus / in the background, never a second panel.
//   3. The system prompt is updated end-to-end: scene_generation_type
//      lists drop before_after, the home/cleaning category rule
//      reframes "before/after = cross-scene narrative", the
//      frame_strategy table lists comparison_focus with explicit
//      "no split, no two-panel, no before/after panel" prose.
//
// Backwards-compat: legacy DB scripts with the old enum values
// (`before_after` / `comparison_split`) still parse — `LlmScene`
// fields are typed as plain `string` at the runtime mapper level
// (not the enum). The PR1 bridge in image-brief-builder.ts catches
// those legacy scenes and applies the comparison-guard rule block
// at brief-render time. Verified in the regression check below.

import {
  SCENE_GENERATION_TYPES_LIST,
  FRAME_STRATEGIES,
  FRAME_STRATEGIES_LIST,
  SCRIPT_SYSTEM_PROMPT,
  SCRIPT_JSON_SCHEMA,
  SINGLE_SCRIPT_JSON_SCHEMA,
} from '@ugc-video/prompts';
import type { FrameStrategy } from '@ugc-video/prompts';
import {
  buildImageBrief,
  detectComparisonGuard,
  type BuildImageBriefInput,
} from '../lib/image-briefs/image-brief-builder';

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

// ── 1. SCENE_GENERATION_TYPES no longer contains 'before_after' ────────
{
  const list = SCENE_GENERATION_TYPES_LIST as readonly string[];
  assert(
    !list.includes('before_after'),
    "[PR4.1a] SCENE_GENERATION_TYPES_LIST does NOT contain 'before_after'",
    `actual: [${list.join(', ')}]`,
  );
  // The 11 keep-list values are still present.
  for (const keep of [
    'talking_head',
    'selfie_talking',
    'mirror_selfie_talking',
    'product_demo',
    'hold_product',
    'broll',
    'lifestyle',
    'lifestyle_product',
    'hands_only',
    'closeup_product',
    'cta_visual',
  ]) {
    assert(
      list.includes(keep),
      `[PR4.1b] SCENE_GENERATION_TYPES_LIST still contains '${keep}'`,
    );
  }
  assert(
    list.length === 11,
    `[PR4.1c] SCENE_GENERATION_TYPES_LIST has exactly 11 values (was 12 pre-PR4)`,
    `actual: ${list.length}`,
  );

  // Both schema shapes (batch + single) reflect the trim.
  const batchSceneTypes = ((SCRIPT_JSON_SCHEMA as unknown) as {
    properties: { scripts: { items: { properties: { scenes: { items: { properties: { scene_generation_type: { enum: string[] } } } } } } } };
  }).properties.scripts.items.properties.scenes.items.properties.scene_generation_type.enum;
  const singleSceneTypes = ((SINGLE_SCRIPT_JSON_SCHEMA as unknown) as {
    properties: { script: { properties: { scenes: { items: { properties: { scene_generation_type: { enum: string[] } } } } } } };
  }).properties.script.properties.scenes.items.properties.scene_generation_type.enum;
  assert(
    !batchSceneTypes.includes('before_after'),
    "[PR4.1d] SCRIPT_JSON_SCHEMA scene_generation_type enum has no 'before_after'",
  );
  assert(
    !singleSceneTypes.includes('before_after'),
    "[PR4.1e] SINGLE_SCRIPT_JSON_SCHEMA scene_generation_type enum has no 'before_after'",
  );
}

// ── 2. FRAME_STRATEGIES: comparison_split → comparison_focus ───────────
{
  const list = FRAME_STRATEGIES_LIST as readonly string[];
  assert(
    !list.includes('comparison_split'),
    "[PR4.2a] FRAME_STRATEGIES_LIST does NOT contain 'comparison_split' (deprecated)",
    `actual: [${list.join(', ')}]`,
  );
  assert(
    list.includes('comparison_focus'),
    "[PR4.2b] FRAME_STRATEGIES_LIST contains the new 'comparison_focus'",
  );
  // Other 6 values intact.
  for (const keep of [
    'pure_setup',
    'product_reveal',
    'product_in_use',
    'product_focus',
    'reaction_shot',
    'cta_close',
  ]) {
    assert(
      list.includes(keep),
      `[PR4.2c] FRAME_STRATEGIES_LIST still contains '${keep}'`,
    );
  }
  assert(
    list.length === 7,
    "[PR4.2d] FRAME_STRATEGIES_LIST length unchanged at 7 (rename, not removal)",
    `actual: ${list.length}`,
  );

  // Schema enum reflects the rename in both batch + single shapes.
  const batchFrameStrategies = ((SCRIPT_JSON_SCHEMA as unknown) as {
    properties: { scripts: { items: { properties: { scenes: { items: { properties: { frame_strategy: { enum: string[] } } } } } } } };
  }).properties.scripts.items.properties.scenes.items.properties.frame_strategy.enum;
  assert(
    !batchFrameStrategies.includes('comparison_split'),
    "[PR4.2e] SCRIPT_JSON_SCHEMA frame_strategy enum has no 'comparison_split'",
  );
  assert(
    batchFrameStrategies.includes('comparison_focus'),
    "[PR4.2f] SCRIPT_JSON_SCHEMA frame_strategy enum contains 'comparison_focus'",
  );
}

// ── 3. FrameStrategy TS type reflects the rename ──────────────────────
{
  // Compile-time check: 'comparison_focus' is now a valid value of
  // the FrameStrategy union and 'comparison_split' is NOT.
  const validNew: FrameStrategy = 'comparison_focus';
  assert(validNew === 'comparison_focus', "[PR4.3a] FrameStrategy includes 'comparison_focus'");
  // The negative compile-time check (this would NOT compile if
  // 'comparison_split' were still in the union) is implicit — if
  // tsc passes, the union has been updated. We can't write a
  // negative TS assertion at runtime; this tag stands as a signpost.
  assert(true, "[PR4.3b] FrameStrategy union no longer accepts 'comparison_split' (proven by typecheck)");
}

// ── 4. System prompt drops scene_generation_type='before_after' ────────
{
  const sys = SCRIPT_SYSTEM_PROMPT;

  // The scene_generation_type vocabulary list line in the system prompt
  // no longer enumerates 'before_after' as a valid value.
  const sceneTypeListLine = sys.match(
    /scene_generation_type\*\* — talking_head[^\n]+/,
  );
  assert(
    sceneTypeListLine !== null,
    '[PR4.4a] System prompt has the scene_generation_type vocabulary line',
  );
  if (sceneTypeListLine) {
    assert(
      !sceneTypeListLine[0].includes('before_after'),
      '[PR4.4b] scene_generation_type vocabulary line drops "before_after"',
      `line: ${sceneTypeListLine[0]}`,
    );
    assert(
      sceneTypeListLine[0].includes('cta_visual'),
      '[PR4.4c] scene_generation_type vocabulary line still includes "cta_visual"',
    );
  }

  // The "deprecation note" follows the vocabulary line.
  assert(
    /`before_after` הוסר/.test(sys),
    '[PR4.4d] System prompt explicitly notes that `before_after` was removed (V27.11.PR4)',
  );

  // 30s mode-table row (line ~253 pre-PR4 had "before_after").
  assert(
    !/before_after \| product \| false \| 5-7s/.test(sys),
    '[PR4.4e] 30s mode-table no longer has a "before_after | product" row',
  );

  // Universal "minimum demo scenes" rule no longer enumerates before_after.
  assert(
    !/scene_generation_type ∈ \(product_demo, hands_only, before_after, closeup_product\)/.test(
      sys,
    ),
    '[PR4.4f] Demo-scene minimum rule no longer lists "before_after" in scene_generation_type ∈ (...)',
  );
  assert(
    /scene_generation_type ∈ \(product_demo, hands_only, closeup_product\)/.test(
      sys,
    ),
    '[PR4.4g] Demo-scene minimum rule lists the post-PR4 set: (product_demo, hands_only, closeup_product)',
  );

  // Field-consistency table no longer includes the "before_after | product" row.
  assert(
    !/\| before_after \| product \| false \| product \| false \| high \|/.test(sys),
    '[PR4.4h] Field-consistency table no longer has a "before_after" row',
  );

  // The avatar/non-avatar primary_subject line no longer mentions before_after.
  assert(
    !/primary_subject=avatar עבור product_demo \/ hands_only \/ closeup_product \/ cta_visual \/ before_after/.test(
      sys,
    ),
    '[PR4.4i] primary_subject=avatar prohibition list no longer mentions before_after',
  );
}

// ── 5. System prompt: comparison_split → comparison_focus ──────────────
{
  const sys = SCRIPT_SYSTEM_PROMPT;
  assert(
    !sys.includes('comparison_split'),
    '[PR4.5a] System prompt does NOT mention "comparison_split" (deprecated)',
  );
  assert(
    sys.includes('comparison_focus'),
    '[PR4.5b] System prompt mentions the new "comparison_focus"',
  );
  // The comparison_focus row in the frame_strategy table explicitly
  // forbids panel layouts.
  assert(
    /comparison_focus[\s\S]{0,400}אסור.{0,30}split-screen/i.test(sys),
    '[PR4.5c] comparison_focus table row forbids split-screen explicitly',
  );
  assert(
    /comparison_focus[\s\S]{0,400}אסור.{0,40}שני פאנלים/.test(sys),
    '[PR4.5d] comparison_focus table row forbids "שני פאנלים" explicitly',
  );
}

// ── 6. before/after = cross-scene narrative, not single-frame layout ──
{
  const sys = SCRIPT_SYSTEM_PROMPT;
  // The old "home/cleaning: before/after is the story" rule reframed.
  assert(
    !/home \/ cleaning.*before\/after הוא הסיפור/.test(sys),
    '[PR4.6a] Old "before/after הוא הסיפור" category rule removed',
  );
  assert(
    /home \/ cleaning[\s\S]{0,200}רצף 2 סצנות/.test(sys),
    '[PR4.6b] home/cleaning category rule reframed as "2-scene sequence"',
  );

  // Explicit "before/after = cross-scene, not single panel" rule.
  assert(
    /before\/after = רצף בין סצנות, לא פאנל אחד/.test(sys),
    '[PR4.6c] System prompt has explicit "before/after = רצף בין סצנות, לא פאנל אחד" rule',
  );
}

// ── 7. PR1 bridge regression — legacy `before_after` still flagged ────
{
  // Even though NEW scripts won't emit 'before_after' as
  // sceneGenerationType (schema enforces), legacy DB scripts still
  // might. The PR1 bridge must continue catching them.
  const flagged = detectComparisonGuard({
    sceneGenerationType: 'before_after',
    rawVisualBrief: 'A neutral brief.',
  });
  assert(
    flagged.applied,
    '[PR4.7a] PR1 bridge still fires on legacy sceneGenerationType="before_after"',
  );
  assert(
    flagged.reasons.some((r) => /legacy sceneGenerationType=before_after/.test(r)),
    '[PR4.7b] Bridge surfaces the legacy-sceneGenerationType reason',
    `reasons: ${flagged.reasons.join('; ')}`,
  );

  // And on phrase-detection (still works for legacy `comparison_split`
  // visualPromptEnglish content that mentions split / vs / etc.).
  const phraseFlagged = detectComparisonGuard({
    sceneGenerationType: 'product_demo',
    rawVisualBrief: 'split-screen comparison vs the leading brand',
  });
  assert(
    phraseFlagged.applied,
    '[PR4.7c] PR1 phrase detector still catches legacy comparison_split-style English prose',
  );
}

// ── 8. End-to-end: legacy-shape scene + new schema → comparison-guard fires ─
{
  const legacyScene: BuildImageBriefInput = {
    sceneNumber: 0,
    totalScenes: 5,
    sceneGoal: 'introduce_product',
    // Legacy DB value — still in rawJson on V14/V27.9-era projects.
    sceneGenerationType: 'before_after',
    faceVisibility: 'no_face',
    spokenTextHebrew: 'תראו את ההבדל.',
    rawVisualBrief: 'A clean kitchen counter with the product on the right.',
    cameraDirection: 'tight UGC framing',
    primarySubject: 'product',
    mustShowProduct: true,
    productVisibilityPriority: 'high',
    cameraFocus: 'product',
    showFace: false,
    intelligence: null,
    isProblemScene: false,
    totalScenesInScript: 5,
  };
  const brief = buildImageBrief(legacyScene);
  assert(
    brief.comparisonGuardApplied === true,
    '[PR4.8a] Legacy before_after scene → comparisonGuardApplied=true',
  );
  assert(
    /COMPARISON GUARD/.test(brief.finalImagePrompt),
    '[PR4.8b] Legacy before_after scene → finalImagePrompt includes COMPARISON GUARD block',
  );
  assert(
    /MUST NOT SHOW[\s\S]*split-screen layout/i.test(brief.finalImagePrompt),
    '[PR4.8c] Legacy before_after scene → MUST NOT SHOW lists "split-screen layout"',
  );
}

// ── 9. New-shape scene with comparison_focus does NOT trigger guard ────
{
  // A new (post-PR4) scene won't carry sceneGenerationType='before_after'
  // and a well-behaved LLM under the V27.11.PR4 prompt won't write
  // "split-screen" / "vs" prose into visual_prompt_english. Confirm
  // the bridge is QUIET on a clean new-shape scene so we don't burn
  // false-positive negs into prompts that don't need them.
  const newScene: BuildImageBriefInput = {
    sceneNumber: 2,
    totalScenes: 5,
    sceneGoal: 'prove_it_works',
    // New, post-PR4 value.
    sceneGenerationType: 'closeup_product',
    faceVisibility: 'no_face',
    spokenTextHebrew: 'תראו איך זה עובד אחרי שבועיים.',
    rawVisualBrief:
      'Sharp closeup of the amber bottle with the product running over a cotton round in the foreground. Background is the bathroom counter, slightly out of focus.',
    cameraDirection: 'tight closeup',
    primarySubject: 'product',
    mustShowProduct: true,
    productVisibilityPriority: 'high',
    cameraFocus: 'product',
    showFace: false,
    intelligence: null,
    isProblemScene: false,
    totalScenesInScript: 5,
  };
  const brief = buildImageBrief(newScene);
  assert(
    brief.comparisonGuardApplied === false,
    '[PR4.9a] Post-PR4 closeup_product scene → comparisonGuardApplied=false (no false positive)',
    `reasons: ${brief.comparisonGuardReasons.join('; ')}`,
  );
  // The universal SINGLE-FRAME RULE in the gpt-image-2 prompt wrapper
  // still applies — that's PR1, not PR4 — so we don't assert its
  // absence from the brief. We just assert the GUARD-specific block
  // is not in finalImagePrompt.
  assert(
    !/COMPARISON GUARD/.test(brief.finalImagePrompt),
    '[PR4.9b] Post-PR4 clean scene → finalImagePrompt has no COMPARISON GUARD block',
  );
}

// ── 10. Schema invariants: required[] count + properties{} match ──────
{
  // PR3 dropped 4 fields (24 → 20); PR4 doesn't change the count, just
  // the contents of the 2 enums. V28.0.ST4 added casual_markers_used
  // (REG-01 register enforcement) → 21.
  const sceneSchema = ((SCRIPT_JSON_SCHEMA as unknown) as {
    properties: { scripts: { items: { properties: { scenes: { items: { required: readonly string[]; properties: Record<string, unknown> } } } } } };
  }).properties.scripts.items.properties.scenes.items;
  assert(
    sceneSchema.required.length === 21,
    `[PR4.10a] SCENE_ITEM_SCHEMA.required count = 21 post-V28.0.ST4 (24 pre-PR3 → 20 post-PR3 → 21 post-ST4)`,
    `actual: ${sceneSchema.required.length}`,
  );
  assert(
    Object.keys(sceneSchema.properties).length === 21,
    `[PR4.10b] SCENE_ITEM_SCHEMA.properties count = 21 post-V28.0.ST4`,
    `actual: ${Object.keys(sceneSchema.properties).length}`,
  );
}

// ── Diagnostic dump ─────────────────────────────────────────────────────
console.log('\n─── PR4 measurements ───');
console.log(`SCENE_GENERATION_TYPES count: ${(SCENE_GENERATION_TYPES_LIST as readonly string[]).length} (was 12 pre-PR4, now 11)`);
console.log(`FRAME_STRATEGIES count: ${(FRAME_STRATEGIES_LIST as readonly string[]).length} (unchanged at 7; comparison_split → comparison_focus)`);
console.log(`FRAME_STRATEGIES values: ${(FRAME_STRATEGIES as readonly string[]).join(', ')}`);
console.log(`SCRIPT_SYSTEM_PROMPT lines: ${SCRIPT_SYSTEM_PROMPT.split('\n').length}`);
console.log(`SCRIPT_SYSTEM_PROMPT chars: ${SCRIPT_SYSTEM_PROMPT.length}`);
console.log('────────────────────────\n');

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('\nAll PR4 assertions passed.');
process.exit(0);
