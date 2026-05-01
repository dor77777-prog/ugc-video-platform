// V13 PR3 verification — same tsx-script pattern as PR1/PR2.
//
// Asserts each PR3 piece in turn. Re-run after every commit on this PR.
// PR3.1: animation-plan-builder pure function. Future commits add
// kling.ts wiring + clip-impl.ts plumbing.

import { buildAnimationPlan } from '../lib/animation/animation-plan-builder';
import { buildKlingPromptFromPlan } from '../lib/animation/kling';
import type { MotionAnalysis } from '../lib/animation/motion-analysis';

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

// ── PR3.1 — Per scene-type defaults match V13 §10.3 table ──────────────
{
  // talking_head — static, person, face_zoom forbidden
  const talk = buildAnimationPlan({ sceneGenerationType: 'talking_head', requiresLipSync: true });
  assert(talk.cameraMotion === 'static', '[PR3.1] talking_head cameraMotion=static');
  assert(talk.motionSubject === 'person', '[PR3.1] talking_head motionSubject=person');
  assert(talk.speakingExpected === true, '[PR3.1] talking_head speakingExpected=true');
  assert(
    talk.forbiddenMotion.includes('face zoom'),
    '[PR3.1] talking_head forbids face zoom (avoidFaceZoom defaults true)',
  );
  assert(
    talk.forbiddenMotion.includes('exaggerated mouth'),
    '[PR3.1] talking_head forbids exaggerated mouth',
  );

  // hold_product — static, product+person
  const hold = buildAnimationPlan({ sceneGenerationType: 'hold_product' });
  assert(hold.cameraMotion === 'static', '[PR3.1] hold_product cameraMotion=static');
  assert(hold.motionSubject === 'product', '[PR3.1] hold_product motionSubject=product');
  assert(hold.secondarySubject === 'person', '[PR3.1] hold_product secondarySubject=person');
  assert(
    hold.forbiddenMotion.some((s) => s.includes('product disappearing')),
    '[PR3.1] hold_product forbids product disappearing',
  );

  // product_demo — subtle_handheld, hands+product
  const demo = buildAnimationPlan({ sceneGenerationType: 'product_demo' });
  assert(demo.cameraMotion === 'subtle_handheld', '[PR3.1] product_demo cameraMotion=subtle_handheld');
  assert(demo.motionSubject === 'hands', '[PR3.1] product_demo motionSubject=hands');
  assert(demo.secondarySubject === 'product', '[PR3.1] product_demo secondarySubject=product');
  assert(
    demo.forbiddenMotion.some((s) => s.includes('product morph')),
    '[PR3.1] product_demo forbids product morph',
  );

  // closeup_product — static, product, morph forbidden
  const closeup = buildAnimationPlan({ sceneGenerationType: 'closeup_product' });
  assert(closeup.cameraMotion === 'static', '[PR3.1] closeup_product cameraMotion=static');
  assert(closeup.motionSubject === 'product', '[PR3.1] closeup_product motionSubject=product');
  assert(
    closeup.forbiddenMotion.some((s) => /morph|label warp/.test(s)),
    '[PR3.1] closeup_product forbids morph + label warp',
  );

  // problem_visual — subtle_handheld, environment, abrupt cut forbidden
  const prob = buildAnimationPlan({ sceneGenerationType: 'problem_visual' });
  assert(prob.cameraMotion === 'subtle_handheld', '[PR3.1] problem_visual cameraMotion=subtle_handheld');
  assert(prob.motionSubject === 'environment', '[PR3.1] problem_visual motionSubject=environment');
  assert(
    prob.forbiddenMotion.some((s) => s.includes('product appearing')),
    '[PR3.1] problem_visual forbids product appearing in frame',
  );

  // cta_visual — slow_push_in, product
  const cta = buildAnimationPlan({ sceneGenerationType: 'cta_visual' });
  assert(cta.cameraMotion === 'slow_push_in', '[PR3.1] cta_visual cameraMotion=slow_push_in');
  assert(cta.motionSubject === 'product', '[PR3.1] cta_visual motionSubject=product');
}

// ── PR3.1 — V4 metadata overrides ──────────────────────────────────────
{
  // showFace=false → avoidFaceZoom=true even on talking_head
  const noFace = buildAnimationPlan({
    sceneGenerationType: 'talking_head',
    requiresLipSync: true,
    showFace: false,
  });
  assert(
    noFace.avoidFaceZoom === true,
    '[PR3.1] showFace=false ⇒ avoidFaceZoom=true',
  );

  // mustShowProduct=true ⇒ preserveProductVisibility=true + forbid disappearing
  const mustShow = buildAnimationPlan({
    sceneGenerationType: 'talking_head',
    mustShowProduct: true,
  });
  assert(
    mustShow.preserveProductVisibility === true,
    '[PR3.1] mustShowProduct=true ⇒ preserveProductVisibility=true',
  );
  assert(
    mustShow.forbiddenMotion.some((s) => s.includes('product disappearing')),
    '[PR3.1] mustShowProduct=true ⇒ forbids product disappearing',
  );

  // primarySubject=product ⇒ motionSubject flips to product even on talking_head
  const prodLed = buildAnimationPlan({
    sceneGenerationType: 'talking_head',
    primarySubject: 'product',
  });
  assert(
    prodLed.motionSubject === 'product',
    '[PR3.1] primarySubject=product ⇒ motionSubject=product',
  );
}

// ── PR3.1 — Image-Brief flag pass-through ──────────────────────────────
{
  // mirrorRisk → forbidden gets duplicated-reflection guard
  const mirror = buildAnimationPlan({
    sceneGenerationType: 'mirror_selfie_talking',
    mirrorRisk: true,
  });
  assert(
    mirror.forbiddenMotion.some((s) => s.includes('duplicated mirror reflection')),
    '[PR3.1] mirrorRisk ⇒ forbiddenMotion includes duplicated-reflection guard',
  );

  // handsPhysicsRequired → forbid floating product + deformed fingers
  const hands = buildAnimationPlan({
    sceneGenerationType: 'hands_only',
    handsPhysicsRequired: true,
  });
  assert(
    hands.forbiddenMotion.some((s) => s.includes('floating off the hand')),
    '[PR3.1] handsPhysicsRequired ⇒ forbids floating product',
  );
  assert(
    hands.forbiddenMotion.some((s) => s.includes('deformed or extra fingers')),
    '[PR3.1] handsPhysicsRequired ⇒ forbids deformed fingers',
  );

  // contactProofRequired → forbid losing contact mid-clip
  const contact = buildAnimationPlan({
    sceneGenerationType: 'product_demo',
    contactProofRequired: true,
  });
  assert(
    contact.forbiddenMotion.some((s) => s.includes('active part lifting off')),
    '[PR3.1] contactProofRequired ⇒ forbids active part lifting off mid-clip',
  );
}

// ── PR3.1 — Vision-grounded motion analysis takes precedence ───────────
{
  const motion: MotionAnalysis = {
    sceneGist: 'a hand rotating the product near a kitchen counter',
    subjects: 'one hand, no face visible',
    primaryAction: 'hands rotate the product so the label faces the camera',
    secondaryMotions: ['light catch on packaging'],
    cameraIntent: 'static, no zoom',
    preserveElements: ['product label readable', 'hands in frame'],
    framingRisks: ['face appearing at top edge'],
    faceState: 'no_face',
    usage: { inputTokens: 0, outputTokens: 0 },
  };

  const planned = buildAnimationPlan({
    sceneGenerationType: 'product_demo',
    motionAnalysis: motion,
  });
  assert(
    planned.humanMotion.includes('hands rotate the product'),
    '[PR3.1] motion-analysis primaryAction populates humanMotion when subject is hands',
  );
  assert(
    planned.forbiddenMotion.includes('face appearing at top edge'),
    '[PR3.1] motion-analysis framingRisks merge into forbiddenMotion',
  );
}

// ── PR3.1 — Output shape sanity ────────────────────────────────────────
{
  const plan = buildAnimationPlan({ sceneGenerationType: 'product_demo' });
  assert(typeof plan.animationGoal === 'string' && plan.animationGoal.length > 5, '[PR3.1] animationGoal is a non-empty string');
  assert(
    ['static', 'subtle_handheld', 'slow_push_in', 'slow_pull_back'].includes(plan.cameraMotion),
    '[PR3.1] cameraMotion is one of the canonical enum values',
  );
  assert(plan.preserveComposition === true, '[PR3.1] preserveComposition defaults true');
  assert(Array.isArray(plan.forbiddenMotion), '[PR3.1] forbiddenMotion is an array');
  // dedupe — face zoom only appears once even when multiple flags add it
  const dupCheck = buildAnimationPlan({
    sceneGenerationType: 'product_demo',
    showFace: false,
    mustShowProduct: true,
  });
  const faceZoomCount = dupCheck.forbiddenMotion.filter((s) => s === 'face zoom').length;
  assert(faceZoomCount === 1, '[PR3.1] forbiddenMotion is deduped (face zoom appears once)');
}

// ── PR3.2 — Kling prompt from plan ─────────────────────────────────────
{
  // Talking-head plan emits silent talking plate + talking-head negatives.
  const talkPlan = buildAnimationPlan({
    sceneGenerationType: 'talking_head',
    requiresLipSync: true,
  });
  const talkPrompt = buildKlingPromptFromPlan(talkPlan);
  // V14+ — silent-speaking beats use physics language (lips part Nmm,
  // single blink at mid-clip, tiny chin-dip nod). The exact phrase
  // "looks into the phone camera" was retired with the verbose V13
  // tokens; we now check for an unambiguous physics signal.
  assert(
    /lips part \d-\d?mm as if mid-word/.test(talkPrompt.positive) ||
      /one natural blink at mid-clip/.test(talkPrompt.positive),
    '[PR3.2] talking-head plan emits silent-speaking physics tokens in positive',
  );
  assert(
    /plastic skin|distorted mouth|frozen face/.test(talkPrompt.negative),
    '[PR3.2] talking-head plan inherits trimmed talking-head negatives baseline',
  );
  assert(
    /face zoom/.test(talkPrompt.negative),
    '[PR3.2] talking-head plan negative includes plan-level face zoom forbidden',
  );

  // V14+ — non-talking anti-drift guards moved from the POSITIVE prompt
  // to the NEGATIVE list (Kling weights leading positive tokens highest;
  // burning them on "DO NOT" was wasteful). Verify the guards now live
  // in negatives, not in positive.
  const demoPlan = buildAnimationPlan({ sceneGenerationType: 'product_demo' });
  const demoPrompt = buildKlingPromptFromPlan(demoPlan);
  assert(
    /talking selfie|mouth speaking|face zoom/.test(demoPrompt.negative),
    '[PR3.2] product_demo plan moves anti-talking-selfie guard to negatives',
  );
  assert(
    !/looks into the phone camera and appears to speak silently/.test(demoPrompt.positive),
    '[PR3.2] product_demo plan does NOT emit silent talking block',
  );
  assert(
    !/NOT speaking to the camera|do not turn this into a selfie/.test(demoPrompt.positive),
    '[PR3.2] product_demo plan does NOT lead positive prompt with anti-drift guard',
  );
  assert(
    /product morph|cropped product/.test(demoPrompt.negative),
    '[PR3.2] product_demo plan negative includes product-shape guards',
  );

  // showFace=false + closeup_product → preserveProductVisibility +
  // avoidFaceZoom surface as POSITIVE-framed clauses ("product remains
  // in frame and readable") + negative tokens ("face zoom"). No more
  // verbose all-caps "PRODUCT VISIBILITY GATE" or "face must not be
  // zoomed into" in the positive — those were V13 wordings retired
  // with the per-provider renderer split.
  const closeupPlan = buildAnimationPlan({
    sceneGenerationType: 'closeup_product',
    showFace: false,
    mustShowProduct: true,
  });
  const closeupPrompt = buildKlingPromptFromPlan(closeupPlan);
  assert(
    /Product remains in frame and readable/.test(closeupPrompt.positive),
    '[PR3.2] closeup_product plan emits product-visibility positive clause',
  );
  assert(
    /face zoom/.test(closeupPrompt.negative),
    '[PR3.2] closeup_product plan moves face-zoom guard to negatives',
  );

  // cameraMotion enum renders correctly per camera vocabulary.
  const ctaPlan = buildAnimationPlan({ sceneGenerationType: 'cta_visual' });
  const ctaPrompt = buildKlingPromptFromPlan(ctaPlan);
  assert(
    /Slow Zoom In/.test(ctaPrompt.positive),
    '[PR3.2] cta_visual plan renders cameraMotion=slow_push_in as "Slow Zoom In"',
  );

  // Free-text camera direction folds in as a hint after the enum token.
  const promptWithHint = buildKlingPromptFromPlan(demoPlan, {
    cameraDirection: 'over the shoulder, slight handheld',
  });
  assert(
    promptWithHint.positive.includes('over the shoulder'),
    '[PR3.2] cameraDirection hint folds into positive prompt',
  );

  // Forbidden motion items dedupe — even if "face zoom" appears in both
  // baseline negatives and plan.forbiddenMotion, it shows up once.
  const dupePrompt = buildKlingPromptFromPlan(closeupPlan);
  const faceZoomMatches = dupePrompt.negative.match(/\bface zoom\b/g) ?? [];
  assert(
    faceZoomMatches.length === 1,
    '[PR3.2] negative prompt is deduped (face zoom appears once)',
  );
}

// ── PR3.3 — clip-impl.ts plumbs the plan correctly ─────────────────────
{
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const clipImpl = fs.readFileSync(
    path.resolve(__dirname, '../lib/scenes/clip-impl.ts'),
    'utf8',
  );
  assert(
    clipImpl.includes('buildAnimationPlan'),
    '[PR3.3] clip-impl.ts imports/uses buildAnimationPlan',
  );
  assert(
    clipImpl.includes('buildPromptFromPlan'),
    '[PR3.3] clip-impl.ts uses buildPromptFromPlan (V14 provider-aware plan-driven path)',
  );
  assert(
    !clipImpl.includes('buildKlingMotionPrompt('),
    '[PR3.3] clip-impl.ts no longer calls the legacy buildKlingMotionPrompt',
  );
  assert(
    clipImpl.includes('detectHandsPhysicsRequired'),
    '[PR3.3] clip-impl.ts plumbs detectHandsPhysicsRequired into the plan',
  );
  assert(
    clipImpl.includes('detectMirrorRisk'),
    '[PR3.3] clip-impl.ts plumbs detectMirrorRisk into the plan',
  );
  assert(
    clipImpl.includes('detectContactProofRequired'),
    '[PR3.3] clip-impl.ts plumbs detectContactProofRequired into the plan',
  );
}

console.log('');
if (failures === 0) {
  console.log('PR3 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`PR3 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
