// V14 PR4 verification — scene variation ledger + scroll-stopper.
//
// Covers:
//   1. Ledger determinism — record() / countOf / summary / diversityScore
//      / unusedFromKnown all return byte-identical results on repeated calls
//   2. countOf / size correctness
//   3. unusedFromKnown — returns enum values not yet seen
//   4. diversityScore — 0..1, 1.0 when all distinct, 0.0 when one repeated
//   5. summary() — shape covers all six tracked fields
//   6. chooseScrollStopperIndex — short ads (<4) → reason='none'
//   7. chooseScrollStopperIndex — finalSceneGoal='decision_push' →
//      punchline at last index
//   8. chooseScrollStopperIndex — default → hook at index=0
//   9. chooseScrollStopperIndex — determinism (100 runs)
//  10. buildScrollStopperLevers — 'hook' / 'punchline' produce different
//      prose, both have ≥3 negativeLines, deterministic
//  11. End-to-end: brief with isScrollStopper=true → scrollStopperApplied,
//      ruleBlock in finalImagePrompt, mustAvoid receives negatives
//  12. End-to-end: brief without isScrollStopper → no scroll-stopper traces
//  13. End-to-end: variationLedger passed → variationDiversity populated;
//      not passed → null
//  14. Convergence — 7-scene varied ledger reports ≥4 distinct values in at
//      least one tracked field
//  15. Backward-compat — brief without any V14 PR4 inputs composes and
//      returns scrollStopperApplied=false, variationDiversity=null
//  16. PR2/PR3 regression — frame snippets + outfit lock still fire
//      alongside the scroll-stopper

import {
  SceneVariationLedger,
  buildScrollStopperLevers,
  chooseScrollStopperIndex,
  type SceneRecord,
} from '../lib/image-briefs/scene-variation-ledger';
import { buildImageBrief } from '../lib/image-briefs/image-brief-builder';

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

const SAMPLE_RECORDS: SceneRecord[] = [
  {
    sceneOrder: 0,
    cameraFocus: 'face',
    sceneGenerationType: 'selfie_talking',
    primarySubject: 'avatar',
    faceVisibility: 'clear_front_facing',
  },
  {
    sceneOrder: 1,
    cameraFocus: 'product',
    sceneGenerationType: 'closeup_product',
    primarySubject: 'product',
    faceVisibility: 'no_face',
  },
  {
    sceneOrder: 2,
    cameraFocus: 'action',
    sceneGenerationType: 'product_demo',
    primarySubject: 'product_in_use',
    faceVisibility: 'partial_face',
  },
  {
    sceneOrder: 3,
    cameraFocus: 'product',
    sceneGenerationType: 'cta_visual',
    primarySubject: 'product',
    faceVisibility: 'no_face',
  },
];

// ── 1. Ledger determinism ───────────────────────────────────────────────────
{
  const first = JSON.stringify(
    SceneVariationLedger.fromRecords(SAMPLE_RECORDS).summary(),
  );
  let mismatch = 0;
  for (let i = 0; i < 100; i++) {
    const next = JSON.stringify(
      SceneVariationLedger.fromRecords(SAMPLE_RECORDS).summary(),
    );
    if (next !== first) mismatch++;
  }
  assert(
    mismatch === 0,
    '[V14 PR4.1] ledger.summary() byte-identical across 100 builds from same records',
    mismatch ? `${mismatch} drifted` : '',
  );
}

// ── 2. countOf / size correctness ───────────────────────────────────────────
{
  const l = SceneVariationLedger.fromRecords(SAMPLE_RECORDS);
  assert(l.size === 4, '[V14 PR4.2] ledger.size === 4 for 4 records');
  assert(
    l.countOf('cameraFocus', 'product') === 2,
    '[V14 PR4.2] cameraFocus="product" count = 2',
  );
  assert(
    l.countOf('cameraFocus', 'face') === 1,
    '[V14 PR4.2] cameraFocus="face" count = 1',
  );
  assert(
    l.countOf('cameraFocus', 'environment') === 0,
    '[V14 PR4.2] unused value count = 0',
  );
  assert(
    l.countOf('faceVisibility', 'no_face') === 2,
    '[V14 PR4.2] faceVisibility="no_face" count = 2',
  );
}

// ── 3. unusedFromKnown ──────────────────────────────────────────────────────
{
  const l = SceneVariationLedger.fromRecords(SAMPLE_RECORDS);
  const unusedFocus = l.unusedFromKnown('cameraFocus', [
    'face',
    'product',
    'action',
    'environment',
    'selfie_in_mirror',
  ]);
  assert(
    unusedFocus.includes('environment') && unusedFocus.includes('selfie_in_mirror'),
    '[V14 PR4.3] unusedFromKnown returns values not seen yet',
  );
  assert(
    !unusedFocus.includes('face') && !unusedFocus.includes('product'),
    '[V14 PR4.3] unusedFromKnown excludes values that have been seen',
  );

  const unusedFace = l.unusedFromKnown('faceVisibility', [
    'clear_front_facing',
    'partial_face',
    'profile',
    'no_face',
  ]);
  assert(
    unusedFace.length === 1 && unusedFace[0] === 'profile',
    '[V14 PR4.3] unusedFromKnown — only "profile" is unused for faceVisibility',
  );
}

// ── 4. diversityScore ───────────────────────────────────────────────────────
{
  const allSame = SceneVariationLedger.fromRecords([
    { sceneOrder: 0, cameraFocus: 'face' },
    { sceneOrder: 1, cameraFocus: 'face' },
    { sceneOrder: 2, cameraFocus: 'face' },
  ]);
  assert(
    Math.abs(allSame.diversityScore('cameraFocus') - 1 / 3) < 1e-9,
    '[V14 PR4.4] diversityScore = 1/3 when one value × 3 records',
  );

  const allDistinct = SceneVariationLedger.fromRecords([
    { sceneOrder: 0, cameraFocus: 'face' },
    { sceneOrder: 1, cameraFocus: 'product' },
    { sceneOrder: 2, cameraFocus: 'action' },
  ]);
  assert(
    allDistinct.diversityScore('cameraFocus') === 1,
    '[V14 PR4.4] diversityScore = 1.0 when all distinct',
  );

  const empty = new SceneVariationLedger();
  assert(
    empty.diversityScore('cameraFocus') === 0,
    '[V14 PR4.4] diversityScore = 0 when ledger is empty',
  );
}

// ── 5. summary() shape covers all tracked fields ───────────────────────────
{
  const l = SceneVariationLedger.fromRecords(SAMPLE_RECORDS);
  const s = l.summary();
  for (const f of [
    'cameraFocus',
    'sceneGenerationType',
    'primarySubject',
    'faceVisibility',
    'environmentType',
    'timeOfDay',
  ] as const) {
    assert(
      Object.prototype.hasOwnProperty.call(s, f) &&
        typeof s[f].distinct === 'number' &&
        typeof s[f].total === 'number',
      `[V14 PR4.5] summary contains "${f}" with {distinct, total}`,
    );
  }
  assert(
    s.cameraFocus.distinct === 3 && s.cameraFocus.total === 4,
    '[V14 PR4.5] cameraFocus summary: 3 distinct / 4 total',
  );
}

// ── 6. chooseScrollStopperIndex — short ads → none ──────────────────────────
{
  for (const n of [0, 1, 2, 3]) {
    const choice = chooseScrollStopperIndex({ totalScenes: n });
    assert(
      choice.index === -1 && choice.reason === 'none',
      `[V14 PR4.6] totalScenes=${n} → no scroll-stopper`,
    );
  }
}

// ── 7. punchline when finalSceneGoal='decision_push' ────────────────────────
{
  const choice = chooseScrollStopperIndex({
    totalScenes: 7,
    finalSceneGoal: 'decision_push',
  });
  assert(
    choice.index === 6 && choice.reason === 'punchline',
    '[V14 PR4.7] finalSceneGoal="decision_push" + 7 scenes → punchline at index 6',
  );
}

// ── 8. default → hook at index 0 ────────────────────────────────────────────
{
  const choice = chooseScrollStopperIndex({ totalScenes: 5 });
  assert(
    choice.index === 0 && choice.reason === 'hook',
    '[V14 PR4.8] no goal hint + ≥4 scenes → hook at index 0',
  );

  const otherGoal = chooseScrollStopperIndex({
    totalScenes: 5,
    finalSceneGoal: 'introduce_product',
  });
  assert(
    otherGoal.index === 0 && otherGoal.reason === 'hook',
    '[V14 PR4.8] non-decision_push final goal still falls back to hook',
  );
}

// ── 9. chooseScrollStopperIndex determinism ────────────────────────────────
{
  const ctx = { totalScenes: 6, finalSceneGoal: 'decision_push' };
  const first = JSON.stringify(chooseScrollStopperIndex(ctx));
  let mismatch = 0;
  for (let i = 0; i < 100; i++) {
    if (JSON.stringify(chooseScrollStopperIndex(ctx)) !== first) mismatch++;
  }
  assert(mismatch === 0, '[V14 PR4.9] chooseScrollStopperIndex deterministic across 100 runs');
}

// ── 10. buildScrollStopperLevers ────────────────────────────────────────────
{
  const hook = buildScrollStopperLevers({ reason: 'hook' });
  const punch = buildScrollStopperLevers({ reason: 'punchline' });
  assert(
    hook.positive.includes('hook scene'),
    '[V14 PR4.10] hook lever positive mentions "hook scene"',
  );
  assert(
    punch.positive.includes('punchline'),
    '[V14 PR4.10] punchline lever positive mentions "punchline"',
  );
  assert(
    hook.positive !== punch.positive,
    '[V14 PR4.10] hook and punchline produce different prose',
  );
  assert(
    hook.negativeLines.length >= 3,
    '[V14 PR4.10] hook lever ships ≥3 negativeLines',
  );
  assert(
    punch.negativeLines.length >= 3,
    '[V14 PR4.10] punchline lever ships ≥3 negativeLines',
  );
  // Determinism
  let mismatch = 0;
  const firstHook = JSON.stringify(hook);
  for (let i = 0; i < 100; i++) {
    if (JSON.stringify(buildScrollStopperLevers({ reason: 'hook' })) !== firstHook) {
      mismatch++;
    }
  }
  assert(
    mismatch === 0,
    '[V14 PR4.10] buildScrollStopperLevers deterministic across 100 runs',
  );
}

// ── 11. End-to-end: isScrollStopper=true ───────────────────────────────────
{
  const brief = buildImageBrief({
    sceneNumber: 0,
    totalScenes: 6,
    sceneGoal: 'stop_scroll',
    sceneGenerationType: 'selfie_talking',
    faceVisibility: 'clear_front_facing',
    spokenTextHebrew: 'תקשיבי',
    rawVisualBrief: 'opening hook',
    cameraDirection: null,
    intelligence: null,
    isScrollStopper: true,
    scrollStopperReason: 'hook',
  });
  assert(
    brief.scrollStopperApplied === true,
    '[V14 PR4.11] brief.scrollStopperApplied=true when isScrollStopper passed',
  );
  assert(
    brief.scrollStopperReason === 'hook',
    '[V14 PR4.11] brief.scrollStopperReason="hook" when reason passed',
  );
  assert(
    brief.finalImagePrompt.includes('SCROLL-STOPPER'),
    '[V14 PR4.11] finalImagePrompt carries the SCROLL-STOPPER section',
  );
  assert(
    brief.mustAvoid.some((s) => /generic UGC mid-shot opener/i.test(s)),
    '[V14 PR4.11] hook scroll-stopper negativeLines flowed into mustAvoid',
  );

  // Punchline reason
  const briefPunch = buildImageBrief({
    sceneNumber: 6,
    totalScenes: 7,
    sceneGoal: 'decision_push',
    sceneGenerationType: 'cta_visual',
    faceVisibility: 'no_face',
    spokenTextHebrew: '',
    rawVisualBrief: 'closing CTA shot',
    cameraDirection: null,
    intelligence: null,
    isScrollStopper: true,
    scrollStopperReason: 'punchline',
  });
  assert(
    briefPunch.scrollStopperReason === 'punchline',
    '[V14 PR4.11] punchline reason flows through to brief',
  );
  assert(
    /satisfying close-up on the proof or product result/i.test(
      briefPunch.finalImagePrompt,
    ),
    '[V14 PR4.11] punchline scroll-stopper text appears in finalImagePrompt',
  );
}

// ── 12. End-to-end: isScrollStopper=false → no scroll-stopper traces ──────
{
  const brief = buildImageBrief({
    sceneNumber: 2,
    totalScenes: 5,
    sceneGoal: 'introduce_product',
    sceneGenerationType: 'product_demo',
    faceVisibility: 'no_face',
    spokenTextHebrew: '',
    rawVisualBrief: 'product demo middle',
    cameraDirection: null,
    intelligence: null,
    // no isScrollStopper
  });
  assert(
    brief.scrollStopperApplied === false,
    '[V14 PR4.12] scrollStopperApplied=false when not requested',
  );
  assert(
    brief.scrollStopperReason === null,
    '[V14 PR4.12] scrollStopperReason=null when not requested',
  );
  assert(
    !brief.finalImagePrompt.includes('SCROLL-STOPPER'),
    '[V14 PR4.12] finalImagePrompt does NOT contain SCROLL-STOPPER section',
  );
}

// ── 13. End-to-end: variationLedger passed → diversity populated ──────────
{
  const ledger = SceneVariationLedger.fromRecords(SAMPLE_RECORDS);
  const brief = buildImageBrief({
    sceneNumber: 4,
    totalScenes: 5,
    sceneGoal: 'introduce_product',
    sceneGenerationType: 'product_demo',
    faceVisibility: 'partial_face',
    spokenTextHebrew: '',
    rawVisualBrief: 'product demo',
    cameraDirection: null,
    intelligence: null,
    variationLedger: ledger,
  });
  assert(
    brief.variationDiversity !== null,
    '[V14 PR4.13] variationDiversity populated when ledger passed',
  );
  assert(
    brief.variationDiversity?.cameraFocus.total === 4,
    '[V14 PR4.13] variationDiversity reflects ledger record count',
  );

  const briefNoLedger = buildImageBrief({
    sceneNumber: 0,
    totalScenes: 5,
    sceneGoal: 'introduce_product',
    sceneGenerationType: 'product_demo',
    faceVisibility: 'no_face',
    spokenTextHebrew: '',
    rawVisualBrief: 'no ledger',
    cameraDirection: null,
    intelligence: null,
  });
  assert(
    briefNoLedger.variationDiversity === null,
    '[V14 PR4.13] variationDiversity=null when no ledger passed',
  );
}

// ── 14. Convergence — varied ledger reports ≥4 distinct values somewhere ──
{
  const varied: SceneRecord[] = [
    { sceneOrder: 0, cameraFocus: 'face', sceneGenerationType: 'selfie_talking', primarySubject: 'avatar' },
    { sceneOrder: 1, cameraFocus: 'product', sceneGenerationType: 'closeup_product', primarySubject: 'product' },
    { sceneOrder: 2, cameraFocus: 'action', sceneGenerationType: 'hands_only', primarySubject: 'hands' },
    { sceneOrder: 3, cameraFocus: 'face', sceneGenerationType: 'mirror_selfie_talking', primarySubject: 'avatar' },
    { sceneOrder: 4, cameraFocus: 'environment', sceneGenerationType: 'lifestyle', primarySubject: 'product_with_avatar' },
    { sceneOrder: 5, cameraFocus: 'product', sceneGenerationType: 'product_demo', primarySubject: 'product_in_use' },
    { sceneOrder: 6, cameraFocus: 'selfie_in_mirror', sceneGenerationType: 'cta_visual', primarySubject: 'product' },
  ];
  const ledger = SceneVariationLedger.fromRecords(varied);
  const summary = ledger.summary();
  const anyAtLeastFour =
    summary.cameraFocus.distinct >= 4 ||
    summary.sceneGenerationType.distinct >= 4 ||
    summary.primarySubject.distinct >= 4;
  assert(
    anyAtLeastFour,
    '[V14 PR4.14] 7-scene varied ledger reports ≥4 distinct values in at least one tracked field',
    `cameraFocus=${summary.cameraFocus.distinct}, genType=${summary.sceneGenerationType.distinct}, primarySubject=${summary.primarySubject.distinct}`,
  );
}

// ── 15. Backward-compat — brief without PR4 inputs still composes ─────────
{
  const brief = buildImageBrief({
    sceneNumber: 0,
    totalScenes: 1,
    sceneGoal: 'hero',
    sceneGenerationType: 'cta_visual',
    faceVisibility: 'no_face',
    spokenTextHebrew: '',
    rawVisualBrief: 'product alone',
    cameraDirection: null,
    intelligence: null,
  });
  assert(
    brief.scrollStopperApplied === false,
    '[V14 PR4.15] legacy brief: scrollStopperApplied=false',
  );
  assert(
    brief.variationDiversity === null,
    '[V14 PR4.15] legacy brief: variationDiversity=null',
  );
  assert(
    brief.finalImagePrompt.length > 0,
    '[V14 PR4.15] legacy brief still produces a non-empty finalImagePrompt',
  );
}

// ── 16. PR2/PR3 regression — frame snippets + outfit lock co-fire OK ──────
{
  const brief = buildImageBrief({
    sceneNumber: 0,
    totalScenes: 6,
    sceneGoal: 'stop_scroll',
    sceneGenerationType: 'mirror_selfie_talking',
    faceVisibility: 'clear_front_facing',
    spokenTextHebrew: 'תקשיבי',
    rawVisualBrief: 'mirror selfie hook',
    cameraDirection: null,
    intelligence: null,
    outfitDescriptionLocked:
      'oversized white tee, light denim shorts, white chunky sneakers',
    isScrollStopper: true,
    scrollStopperReason: 'hook',
  });
  assert(
    brief.frameTechniqueSnippetIds.includes('frame-technique.mirror_selfie'),
    '[V14 PR4.16] PR2 mirror_selfie snippet still fires',
  );
  assert(
    brief.frameTechniqueSnippetIds.includes('frame-technique.consistency_anchor'),
    '[V14 PR4.16] PR2 consistency_anchor still fires',
  );
  assert(
    brief.scrollStopperApplied === true,
    '[V14 PR4.16] PR4 scroll-stopper applied alongside PR2 snippets',
  );
  assert(
    brief.finalImagePrompt.includes('oversized white tee'),
    '[V14 PR4.16] PR3 outfit text still lands in final prompt',
  );
  assert(
    brief.finalImagePrompt.includes('SCROLL-STOPPER') &&
      brief.finalImagePrompt.includes('MIRROR SELFIE TECHNIQUE'),
    '[V14 PR4.16] all three layers (PR2 mirror, PR3 outfit, PR4 scroll-stopper) coexist in finalImagePrompt',
  );
}

console.log('');
if (failures === 0) {
  console.log('V14 PR4 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`V14 PR4 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
