// V13 PR2 verification — same tsx-script pattern as PR1.
//
// Asserts each PR2 piece in turn. Re-run after every commit on this PR.
// The pieces accumulate: PR2.1 module extraction, PR2.2 hands/mirror
// rules, PR2.3 product-ref lock, PR2.4 demo contact proof.

import {
  buildIsraeliRealismBlock,
} from '../lib/scene-planning/israeli-realism-rules';
import {
  detectHandsPhysicsRequired,
  detectMirrorRisk,
} from '../lib/scene-planning/scene-rules';
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

// ── PR2.1 — Israeli realism module is wired correctly ───────────────────
{
  const block = buildIsraeliRealismBlock({});
  assert(
    block.mustAvoid.length >= 4,
    '[PR2.1] israeli-realism mustAvoid lists ≥4 forbidden patterns',
  );
  assert(
    block.mustAvoid.some((s) => /Type H|outlet|plug/i.test(s) || s.includes('foreign-looking')),
    '[PR2.1] israeli-realism mustAvoid mentions foreign outlets / plugs',
  );
  assert(
    block.mustAvoid.some((s) => s.includes('US-style kitchen') || s.includes('suburban')),
    '[PR2.1] israeli-realism mustAvoid forbids US-style suburbia / kitchens',
  );
  assert(
    block.promptText.includes('Type H') && block.promptText.includes('Israeli'),
    '[PR2.1] israeli-realism promptText mentions Type H + Israeli framing',
  );

  // The studio-portrait guard should switch off when isTalking=false
  const noTalking = buildIsraeliRealismBlock({ isTalking: false });
  assert(
    !noTalking.mustAvoid.some((s) => s.includes('studio portrait')),
    '[PR2.1] israeli-realism omits studio-portrait guard when isTalking=false',
  );
  const talking = buildIsraeliRealismBlock({ isTalking: true });
  assert(
    talking.mustAvoid.some((s) => s.includes('studio portrait')),
    '[PR2.1] israeli-realism includes studio-portrait guard when isTalking=true',
  );
}

// ── PR2.1 — buildImageBrief still emits the same realism instruction ────
{
  const brief = buildImageBrief({
    sceneNumber: 1,
    totalScenes: 4,
    sceneGoal: 'demo the product',
    sceneGenerationType: 'product_demo',
    faceVisibility: 'no_face',
    spokenTextHebrew: 'תראו איך זה עובד',
    rawVisualBrief: 'hands holding the product near a sink',
    cameraDirection: null,
    intelligence: null,
  });
  assert(
    brief.israeliContextInstruction.includes('Type H'),
    '[PR2.1] image-brief still emits Type H Israeli outlet rule',
  );
  assert(
    brief.mustAvoid.some((s) => s.includes('US-style kitchen') || s.includes('suburban')),
    '[PR2.1] image-brief still emits the US-suburbia mustAvoid guard',
  );
  assert(
    brief.finalImagePrompt.includes('ISRAELI CONTEXT'),
    '[PR2.1] finalImagePrompt still labels its Israeli-context section',
  );
}

// ── PR2.2 — Hands physics + Mirror safety detectors ────────────────────
{
  // Hands-dominant scene types must trigger the rule.
  for (const t of ['hands_only', 'closeup_product', 'product_demo', 'hold_product']) {
    assert(
      detectHandsPhysicsRequired({ sceneGenerationType: t }),
      `[PR2.2] detectHandsPhysicsRequired === true for sceneType="${t}"`,
    );
  }
  // Talking-head with mustShowProduct=true should also trigger (script
  // committed to a product-led shot even though scene type is talking).
  assert(
    detectHandsPhysicsRequired({ sceneGenerationType: 'talking_head', mustShowProduct: true }),
    '[PR2.2] talking_head + mustShowProduct=true triggers hands rule',
  );
  // Pure problem / talking scenes without product should NOT trigger.
  assert(
    !detectHandsPhysicsRequired({ sceneGenerationType: 'problem_visual' }),
    '[PR2.2] problem_visual does NOT trigger hands rule',
  );
  assert(
    !detectHandsPhysicsRequired({ sceneGenerationType: 'talking_head', mustShowProduct: false }),
    '[PR2.2] talking_head without product does NOT trigger hands rule',
  );

  // Mirror risk — explicit mirror scene types.
  for (const t of ['mirror_selfie', 'mirror_selfie_talking', 'bathroom_selfie']) {
    assert(
      detectMirrorRisk({ sceneGenerationType: t }),
      `[PR2.2] detectMirrorRisk === true for sceneType="${t}"`,
    );
  }
  // Camera direction keyword.
  assert(
    detectMirrorRisk({
      sceneGenerationType: 'product_demo',
      cameraDirection: 'over the bathroom mirror, vanity angle',
    }),
    '[PR2.2] mirror keyword in cameraDirection triggers mirror risk',
  );
  // Pure non-mirror scenes do not.
  assert(
    !detectMirrorRisk({
      sceneGenerationType: 'product_demo',
      cameraDirection: 'over the shoulder POV in the kitchen',
    }),
    '[PR2.2] non-mirror cameraDirection does NOT trigger mirror risk',
  );
}

// ── PR2.2 — buildImageBrief surfaces flags + appends prompt blocks ─────
{
  const handsBrief = buildImageBrief({
    sceneNumber: 2,
    totalScenes: 4,
    sceneGoal: 'show product in use',
    sceneGenerationType: 'hands_only',
    faceVisibility: 'no_face',
    spokenTextHebrew: 'תראו',
    rawVisualBrief: 'POV of hands using the device',
    cameraDirection: null,
    mustShowProduct: true,
    intelligence: null,
  });
  assert(handsBrief.handsPhysicsRequired === true, '[PR2.2] hands_only brief.handsPhysicsRequired=true');
  assert(handsBrief.mirrorRisk === false, '[PR2.2] hands_only brief.mirrorRisk=false');
  assert(
    handsBrief.finalImagePrompt.includes('HANDS PHYSICS'),
    '[PR2.2] hands_only finalImagePrompt contains HANDS PHYSICS section',
  );
  assert(
    handsBrief.mustAvoid.some((s) => s.includes('floating off the hand')),
    '[PR2.2] hands_only mustAvoid includes "floating off the hand"',
  );

  const mirrorBrief = buildImageBrief({
    sceneNumber: 1,
    totalScenes: 4,
    sceneGoal: 'apply in front of bathroom mirror',
    sceneGenerationType: 'mirror_selfie_talking',
    faceVisibility: 'clear_front_facing',
    spokenTextHebrew: 'אני בודקת מול המראה',
    rawVisualBrief: 'selfie video framed with vanity mirror behind',
    cameraDirection: 'mirror selfie',
    intelligence: null,
  });
  assert(mirrorBrief.mirrorRisk === true, '[PR2.2] mirror_selfie brief.mirrorRisk=true');
  assert(
    mirrorBrief.finalImagePrompt.includes('MIRROR SAFETY'),
    '[PR2.2] mirror_selfie finalImagePrompt contains MIRROR SAFETY section',
  );
  assert(
    mirrorBrief.mustAvoid.some((s) => s.includes('duplicated mirror reflection')),
    '[PR2.2] mirror_selfie mustAvoid includes duplicated-reflection guard',
  );

  // QA-era wording cleanup — finalImagePrompt no longer says "fails QA".
  assert(
    !handsBrief.finalImagePrompt.includes('fails QA'),
    '[PR2.2] finalImagePrompt no longer mentions "fails QA" (V13 PR1 removed QA)',
  );
  assert(
    typeof handsBrief.ruleBlocks !== 'undefined' && Array.isArray(handsBrief.ruleBlocks),
    '[PR2.2] ImageBrief.ruleBlocks is an array',
  );
}

console.log('');
if (failures === 0) {
  console.log('PR2 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`PR2 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
