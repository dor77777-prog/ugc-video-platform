// V27.11 PR1 verification — Universal Single-Frame Rule + comparison-guard bridge.
//
// Diagnose-mode root cause for the "scene images come back as collages /
// multi-panel grids" symptom: nothing in the gpt-image-2 prompt pipeline
// explicitly forbade panel layouts, AND the upstream schema actively
// invited two-state visuals via sceneGenerationType='before_after' and
// frame_strategy='comparison_split'. PR1 is stop-the-bleeding:
//
//   1. scene-image-prompts.ts SINGLE_FRAME_RULE is rendered in EVERY
//      prompt (both avatarPresent paths) BEFORE the scene brief, so any
//      comparison language inside the brief is already constrained to a
//      single-state render.
//   2. image-brief-builder.ts detectComparisonGuard() flags scenes whose
//      sceneGenerationType is 'before_after' OR whose rawVisualBrief
//      contains comparison/before-after/vs language. When flagged,
//      buildImageBrief appends COMPARISON_GUARD_RULE_BLOCK to ruleBlocks
//      and pushes COMPARISON_GUARD_NEGATIVES to mustAvoid + the rendered
//      "MUST NOT SHOW" list. Bridge for legacy scripts already in DB.
//
// PR4 will deprecate the upstream signals at the schema/system-prompt
// level. PR1 ensures even if a script-gen call still emits them, the
// image pipeline refuses to render a multi-panel layout.

import {
  buildImageBrief,
  detectComparisonGuard,
  type BuildImageBriefInput,
} from '../lib/image-briefs/image-brief-builder';
import { buildScenePrompt } from '@ugc-video/prompts';
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
    productType: 'cleansing oil',
    packagingType: 'bottle',
    painPoints: ['stubborn makeup'],
    productMechanism: 'oil emulsifies makeup with water',
    mustShowVisuals: ['amber bottle', 'pump applicator'],
    mustAvoidVisuals: ['greasy residue'],
    visualFailureModes: ['cartoon foam'],
    visualEvidenceRequirements: ['clean cotton round'],
    likelyUseEnvironments: ['bathroom counter', 'vanity'],
    israeliRealismCues: ['Israeli-style outlet'],
  } as unknown as ProductDossier;

  const visualAnalysis: ProductVisualAnalysis = {
    objectDescription: 'amber glass bottle with black pump',
    activePart: 'pump head',
    howToHold: 'one hand around bottle, other on pump',
    howToUseVisually: 'press pump, oil dispensed onto palm',
    contactPoint: 'palm of hand',
    substanceVisualType: 'clear amber oil',
    textureAndMaterial: 'glossy glass + matte label',
    mustShowForDemo: ['oil on palm'],
    mustAvoidForDemo: ['white foam'],
    likelyModelMistakes: ['rendered as a cream'],
  } as unknown as ProductVisualAnalysis;

  const audience: AudienceInference = {
    realisticIsraeliSettings: ['Tel Aviv apartment bathroom'],
  } as unknown as AudienceInference;

  return {
    dossier,
    visualAnalysis,
    audience,
  } as unknown as ProductIntelligence;
}

function makeBriefInput(
  overrides: Partial<BuildImageBriefInput> = {},
): BuildImageBriefInput {
  return {
    sceneNumber: 1,
    totalScenes: 5,
    sceneGoal: 'demonstrate how the cleansing oil removes makeup',
    sceneGenerationType: 'product_demo',
    faceVisibility: 'no_face',
    spokenTextHebrew: 'תראו איך זה מסיר את האיפור',
    rawVisualBrief: 'Hands pumping oil onto a cotton round on a bathroom counter.',
    cameraDirection: 'tight UGC framing',
    primarySubject: 'product',
    mustShowProduct: true,
    productVisibilityPriority: 'high',
    cameraFocus: 'product',
    showFace: false,
    intelligence: makeIntelligence(),
    isProblemScene: false,
    totalScenesInScript: 5,
    ...overrides,
  };
}

// ── 1. SINGLE_FRAME_RULE renders in every prompt path ───────────────────
{
  const baseProps = {
    productName: 'Cleansing Oil',
    sceneVisualBrief: 'Hands pumping oil onto a cotton round.',
    sceneOrder: 0,
    totalScenes: 5,
    sceneType: 'product_demo',
    aspectRatio: '9:16' as const,
  };

  // (a) avatarPresent=true + product
  const a = buildScenePrompt({
    ...baseProps,
    avatarPresent: true,
    productPresent: true,
    avatarDescription: 'Israeli woman, 28, dark hair',
  });
  assert(
    /SINGLE-FRAME RULE \(mandatory/i.test(a),
    '[PR1.1a] SINGLE-FRAME RULE renders in avatarPresent=true + product path',
  );

  // (b) avatarPresent=true + problem scene (no product)
  const b = buildScenePrompt({
    ...baseProps,
    avatarPresent: true,
    productPresent: true,
    isProblemScene: true,
    avatarDescription: 'Israeli woman, 28, dark hair',
  });
  assert(
    /SINGLE-FRAME RULE \(mandatory/i.test(b),
    '[PR1.1b] SINGLE-FRAME RULE renders in avatarPresent=true + problem-scene path',
  );

  // (c) avatarPresent=true, no product (LLM-described)
  const c = buildScenePrompt({
    ...baseProps,
    avatarPresent: true,
    productPresent: false,
    avatarDescription: 'Israeli woman, 28, dark hair',
  });
  assert(
    /SINGLE-FRAME RULE \(mandatory/i.test(c),
    '[PR1.1c] SINGLE-FRAME RULE renders when no product image is provided',
  );

  // (d) avatarPresent=false (no avatar reference)
  const d = buildScenePrompt({
    ...baseProps,
    avatarPresent: false,
    productPresent: true,
  });
  assert(
    /SINGLE-FRAME RULE \(mandatory/i.test(d),
    '[PR1.1d] SINGLE-FRAME RULE renders in avatarPresent=false path',
  );

  // (e) avatarPresent=false + problem scene
  const e = buildScenePrompt({
    ...baseProps,
    avatarPresent: false,
    productPresent: true,
    isProblemScene: true,
  });
  assert(
    /SINGLE-FRAME RULE \(mandatory/i.test(e),
    '[PR1.1e] SINGLE-FRAME RULE renders in avatarPresent=false + problem-scene path',
  );
}

// ── 2. SINGLE_FRAME_RULE is anchored BEFORE the scene brief ─────────────
{
  const SENTINEL = 'BRIEF_SENTINEL_BEFORE_AFTER_VS_COMPARISON';
  const prompt = buildScenePrompt({
    productName: 'Cleansing Oil',
    sceneVisualBrief: SENTINEL,
    sceneOrder: 0,
    totalScenes: 5,
    sceneType: 'product_demo',
    aspectRatio: '9:16',
    avatarPresent: true,
    productPresent: true,
    avatarDescription: 'Israeli woman, 28, dark hair',
  });
  const ruleIdx = prompt.indexOf('SINGLE-FRAME RULE');
  const briefIdx = prompt.indexOf(SENTINEL);
  assert(
    ruleIdx > -1 && briefIdx > -1 && ruleIdx < briefIdx,
    '[PR1.2] SINGLE-FRAME RULE precedes the scene brief in the rendered prompt',
    `rule@${ruleIdx} vs brief@${briefIdx}`,
  );
  const noAvatarPrompt = buildScenePrompt({
    productName: 'Cleansing Oil',
    sceneVisualBrief: SENTINEL,
    sceneOrder: 0,
    totalScenes: 5,
    sceneType: 'product_demo',
    aspectRatio: '9:16',
    avatarPresent: false,
    productPresent: true,
  });
  const r2 = noAvatarPrompt.indexOf('SINGLE-FRAME RULE');
  const b2 = noAvatarPrompt.indexOf(SENTINEL);
  assert(
    r2 > -1 && b2 > -1 && r2 < b2,
    '[PR1.2b] SINGLE-FRAME RULE precedes the brief in avatarPresent=false path',
    `rule@${r2} vs brief@${b2}`,
  );
}

// ── 3. SINGLE_FRAME_RULE explicitly forbids every collage variant ───────
{
  const prompt = buildScenePrompt({
    productName: 'Cleansing Oil',
    sceneVisualBrief: 'Single moment.',
    sceneOrder: 0,
    totalScenes: 5,
    sceneType: 'product_demo',
    aspectRatio: '9:16',
    avatarPresent: true,
    productPresent: true,
    avatarDescription: 'Israeli woman, 28, dark hair',
  });
  const required = [
    'multi-panel',
    'split-screen',
    'before-and-after panels',
    'side-by-side comparison',
    'comic strip',
    'contact sheet',
    'storyboard',
    'grid layout',
    'collage',
    'photo mosaic',
    'diptych',
    'two-panel layout',
    'inset image-within-image',
    'picture-in-picture',
  ];
  for (const phrase of required) {
    assert(
      new RegExp(phrase.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&'), 'i').test(prompt),
      `[PR1.3] SINGLE-FRAME RULE explicitly forbids "${phrase}"`,
    );
  }
}

// ── 4. detectComparisonGuard — purity + sceneType signal ────────────────
{
  // Pure: same input → same output, no shared mutable state
  const sample = {
    sceneGenerationType: 'before_after',
    rawVisualBrief: 'a single frame',
  };
  const out1 = detectComparisonGuard(sample);
  const out2 = detectComparisonGuard(sample);
  assert(
    out1.applied === out2.applied && out1.reasons.length === out2.reasons.length,
    '[PR1.4a] detectComparisonGuard is pure (identical input → identical output)',
  );

  // Legacy sceneGenerationType triggers
  assert(
    detectComparisonGuard({
      sceneGenerationType: 'before_after',
      rawVisualBrief: 'A neutral brief.',
    }).applied,
    '[PR1.4b] detectComparisonGuard fires on sceneGenerationType="before_after"',
  );

  // Other scene types stay quiet on neutral briefs
  for (const t of [
    'product_demo',
    'hands_only',
    'closeup_product',
    'talking_head',
    'selfie_talking',
    'mirror_selfie_talking',
    'cta_visual',
    'problem_visual',
  ]) {
    const r = detectComparisonGuard({
      sceneGenerationType: t,
      rawVisualBrief: 'A neutral brief showing the product on a clean counter.',
    });
    assert(
      !r.applied,
      `[PR1.4c] detectComparisonGuard quiet on benign sceneGenerationType="${t}"`,
      `reasons=${r.reasons.join('; ')}`,
    );
  }
}

// ── 5. detectComparisonGuard — phrase signals ──────────────────────────
{
  const cases: Array<[string, RegExp]> = [
    ['She tries the before and after — totally different.', /before-and-after/i],
    ['before/after split — the proof.', /before\/after/i],
    ['shows the before & after of the routine', /before-and-after/i],
    ['split screen comparison of the two', /split-screen/i],
    ['split-screen — left bare, right glowing', /split-screen/i],
    ['side by side: bottle on left, jar on right', /side-by-side/i],
    ['side-by-side comparison of brands', /side-by-side/i],
    ['old method vs the new way', /vs \/ versus/i],
    ['the old way versus this product', /vs \/ versus/i],
    ['compared to the leading brand', /compared-to/i],
    ['compare with the previous routine', /compare-with/i],
    ['two-panel split: dirty vs clean', /two-panel/i],
    ['multi-panel comic-style edit', /multi-panel/i],
    ['classic diptych composition of two states', /diptych/i],
    ['arranged like a comic strip', /comic strip/i],
    ['contact sheet of three takes', /contact sheet/i],
    ['storyboard of the morning routine', /storyboard/i],
    ['photo collage of products', /collage/i],
    ['mosaic of close-ups', /mosaic/i],
  ];
  for (const [brief, expectedReason] of cases) {
    const r = detectComparisonGuard({
      sceneGenerationType: 'product_demo',
      rawVisualBrief: brief,
    });
    assert(
      r.applied,
      `[PR1.5a] detectComparisonGuard fires on phrase: "${brief}"`,
      `reasons=${r.reasons.join('; ')}`,
    );
    assert(
      r.reasons.some((reason) => expectedReason.test(reason)),
      `[PR1.5b] detectComparisonGuard reports correct reason for: "${brief}"`,
      `got reasons=${r.reasons.join('; ')}`,
    );
  }
}

// ── 6. detectComparisonGuard — false-positive guard ────────────────────
{
  const benign = [
    "She's holding the bottle on the bathroom counter.",
    'A pump dispenses clear amber oil onto her palm.',
    'Tight close-up of fingers around the cap.',
    'Morning light through the window catches the bottle.',
    'Hand lifts a clean cotton round.',
    'A person in a kitchen, cooking.',
    'The kitchen has a hood over the stove.',
  ];
  for (const brief of benign) {
    const r = detectComparisonGuard({
      sceneGenerationType: 'product_demo',
      rawVisualBrief: brief,
    });
    assert(
      !r.applied,
      `[PR1.6] detectComparisonGuard does NOT fire on benign brief: "${brief}"`,
      `reasons=${r.reasons.join('; ')}`,
    );
  }
}

// ── 7. buildImageBrief surfaces comparisonGuardApplied/Reasons ─────────
{
  const fired = buildImageBrief(
    makeBriefInput({
      sceneGenerationType: 'before_after',
      rawVisualBrief: 'A single frame.',
    }),
  );
  assert(
    fired.comparisonGuardApplied === true,
    '[PR1.7a] buildImageBrief sets comparisonGuardApplied=true on legacy scene type',
  );
  assert(
    fired.comparisonGuardReasons.length > 0,
    '[PR1.7b] buildImageBrief surfaces comparisonGuardReasons',
  );

  const fromBrief = buildImageBrief(
    makeBriefInput({
      sceneGenerationType: 'product_demo',
      rawVisualBrief: 'before and after of the cleansing routine',
    }),
  );
  assert(
    fromBrief.comparisonGuardApplied === true,
    '[PR1.7c] buildImageBrief detects comparison phrase in brief prose',
  );

  const benign = buildImageBrief(
    makeBriefInput({
      sceneGenerationType: 'product_demo',
      rawVisualBrief: 'Hands lifting a clean cotton round in soft morning light.',
    }),
  );
  assert(
    benign.comparisonGuardApplied === false,
    '[PR1.7d] buildImageBrief does NOT flag benign briefs',
    `reasons=${benign.comparisonGuardReasons.join('; ')}`,
  );
  assert(
    benign.comparisonGuardReasons.length === 0,
    '[PR1.7e] benign brief has empty comparisonGuardReasons',
  );
}

// ── 8. When fired, COMPARISON_GUARD_RULE_BLOCK + negatives are in prompt ─
{
  const fired = buildImageBrief(
    makeBriefInput({
      sceneGenerationType: 'before_after',
      rawVisualBrief: 'before and after — same person.',
    }),
  );
  assert(
    /COMPARISON GUARD/i.test(fired.finalImagePrompt),
    '[PR1.8a] COMPARISON_GUARD_RULE_BLOCK is in finalImagePrompt when guard fires',
  );
  assert(
    /Render only ONE state/i.test(fired.finalImagePrompt),
    '[PR1.8b] guard rule contains the single-state instruction',
  );
  // Negatives should appear in MUST NOT SHOW too (we push to both arrays)
  assert(
    /MUST NOT SHOW[\s\S]*split-screen layout/i.test(fired.finalImagePrompt),
    '[PR1.8c] MUST NOT SHOW lists "split-screen layout"',
  );
  assert(
    /MUST NOT SHOW[\s\S]*before-and-after panel composition/i.test(fired.finalImagePrompt),
    '[PR1.8d] MUST NOT SHOW lists "before-and-after panel composition"',
  );
  assert(
    /MUST NOT SHOW[\s\S]*diptych composition/i.test(fired.finalImagePrompt),
    '[PR1.8e] MUST NOT SHOW lists "diptych composition"',
  );
}

// ── 9. When NOT fired, guard block is absent ───────────────────────────
{
  const benign = buildImageBrief(
    makeBriefInput({
      sceneGenerationType: 'product_demo',
      rawVisualBrief: 'Hands lifting a clean cotton round in soft morning light.',
    }),
  );
  assert(
    !/COMPARISON GUARD/i.test(benign.finalImagePrompt),
    '[PR1.9a] benign brief: COMPARISON_GUARD_RULE_BLOCK absent from finalImagePrompt',
  );
  assert(
    !/split-screen layout/i.test(benign.finalImagePrompt),
    '[PR1.9b] benign brief: guard-only negatives absent from finalImagePrompt',
  );
}

// ── 10. End-to-end — pipeline shape preserved ──────────────────────────
{
  const brief = buildImageBrief(
    makeBriefInput({
      sceneGenerationType: 'product_demo',
      rawVisualBrief: 'before and after — clean cotton round on the right.',
    }),
  );
  // The brief.finalImagePrompt is what generate-impl.ts hands to
  // buildScenePrompt as sceneVisualBrief. Verify the full assembled
  // prompt shape: SINGLE_FRAME_RULE is present and precedes the brief
  // text (which now contains COMPARISON GUARD).
  const assembled = buildScenePrompt({
    productName: 'Cleansing Oil',
    sceneVisualBrief: brief.finalImagePrompt,
    sceneOrder: 0,
    totalScenes: 5,
    sceneType: 'product_demo',
    aspectRatio: '9:16',
    avatarPresent: true,
    productPresent: true,
    avatarDescription: 'Israeli woman, 28, dark hair',
  });
  const single = assembled.indexOf('SINGLE-FRAME RULE');
  const guard = assembled.indexOf('COMPARISON GUARD');
  assert(
    single > -1 && guard > -1 && single < guard,
    '[PR1.10] full pipeline: SINGLE-FRAME RULE renders before COMPARISON GUARD (anchor first, then scene-level reinforcement)',
    `single@${single} vs guard@${guard}`,
  );
}

// ── Diagnostic side-by-side dump ───────────────────────────────────────
console.log('\n─── Before / After example (legacy before_after scene) ───');
const exampleBenign = buildImageBrief(
  makeBriefInput({
    sceneGenerationType: 'product_demo',
    rawVisualBrief: 'Hands lifting a clean cotton round in soft morning light.',
  }),
);
const exampleFired = buildImageBrief(
  makeBriefInput({
    sceneGenerationType: 'before_after',
    rawVisualBrief: 'before and after — same person, same kitchen.',
  }),
);
console.log(`benign brief comparisonGuardApplied: ${exampleBenign.comparisonGuardApplied}`);
console.log(`legacy brief comparisonGuardApplied: ${exampleFired.comparisonGuardApplied}`);
console.log(`legacy brief reasons: ${exampleFired.comparisonGuardReasons.join('; ')}`);
console.log(`legacy brief mustAvoid (last 5): ${exampleFired.mustAvoid.slice(-5).join(' | ')}`);
console.log('───────────────────────────────────────────────────────────\n');

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('\nAll PR1 assertions passed.');
process.exit(0);
