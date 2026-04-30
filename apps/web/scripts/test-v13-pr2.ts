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
  detectContactProofRequired,
  buildContactProofRule,
} from '../lib/scene-planning/scene-rules';
import { buildImageBrief } from '../lib/image-briefs/image-brief-builder';
import { buildScenePrompt } from '@ugc-video/prompts';

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

// ── PR2.3 — Product reference lock language ─────────────────────────────
{
  // Product scene with avatar — should include the lock language.
  const productPrompt = buildScenePrompt({
    productName: 'TestProduct',
    sceneVisualBrief: 'hands using the product over a vanity',
    sceneOrder: 1,
    totalScenes: 4,
    sceneType: 'product_demo',
    aspectRatio: '9:16',
    avatarPresent: true,
    productPresent: true,
    avatarDescription: 'a 32-year-old Israeli woman',
    primarySubject: 'product_in_use',
    mustShowProduct: true,
    productVisibilityPriority: 'high',
    isProblemScene: false,
  });
  assert(
    productPrompt.includes('PRODUCT REFERENCE LOCK'),
    '[PR2.3] product scene prompt contains PRODUCT REFERENCE LOCK section',
  );
  assert(
    /same shape, same color, same proportions/.test(productPrompt),
    '[PR2.3] product scene prompt enforces shape/color/proportion match',
  );
  assert(
    /Do NOT invent a different product/.test(productPrompt),
    '[PR2.3] product scene prompt forbids inventing a different product',
  );
  assert(
    /Do NOT replace it with a generic bottle/.test(productPrompt),
    '[PR2.3] product scene prompt forbids generic bottle replacement',
  );

  // Problem scene — should NOT include the lock + should NOT mention product.
  const problemPrompt = buildScenePrompt({
    productName: 'TestProduct',
    sceneVisualBrief: 'a tired person staring at a messy bathroom counter',
    sceneOrder: 0,
    totalScenes: 4,
    sceneType: 'problem_visual',
    aspectRatio: '9:16',
    avatarPresent: true,
    productPresent: true, // hero image exists, but problem scenes ignore it
    avatarDescription: 'a 32-year-old Israeli woman',
    isProblemScene: true,
  });
  assert(
    !problemPrompt.includes('PRODUCT REFERENCE LOCK'),
    '[PR2.3] problem scene prompt does NOT include PRODUCT REFERENCE LOCK',
  );
  assert(
    !problemPrompt.includes('Image 2 = the PRODUCT'),
    '[PR2.3] problem scene prompt does NOT introduce Image 2 as the product',
  );
  assert(
    /Problem scene — the product is NOT in this frame/.test(problemPrompt),
    '[PR2.3] problem scene prompt explicitly states the product is absent',
  );
  assert(
    !/PRODUCT VISIBILITY:/.test(problemPrompt),
    '[PR2.3] problem scene prompt skips PRODUCT VISIBILITY guard',
  );

  // No-avatar product scene — lock should still appear.
  const noAvatarProduct = buildScenePrompt({
    productName: 'TestProduct',
    sceneVisualBrief: 'product on a kitchen counter, morning light',
    sceneOrder: 3,
    totalScenes: 4,
    sceneType: 'cta_visual',
    aspectRatio: '9:16',
    avatarPresent: false,
    productPresent: true,
    isProblemScene: false,
  });
  assert(
    noAvatarProduct.includes('PRODUCT REFERENCE LOCK'),
    '[PR2.3] no-avatar product scene also includes PRODUCT REFERENCE LOCK',
  );
}

// ── PR2.4 — Product demo contact proof rule ────────────────────────────
{
  for (const t of ['product_demo', 'hands_only', 'closeup_product']) {
    assert(
      detectContactProofRequired({ sceneGenerationType: t }),
      `[PR2.4] detectContactProofRequired === true for sceneType="${t}"`,
    );
  }
  for (const t of ['talking_head', 'problem_visual', 'cta_visual', 'hold_product']) {
    assert(
      !detectContactProofRequired({ sceneGenerationType: t }),
      `[PR2.4] detectContactProofRequired === false for sceneType="${t}"`,
    );
  }

  // Contact-proof rule with full visual analysis fields.
  const rich = buildContactProofRule({
    activePart: 'rotating brush head',
    contactPoint: 'scalp at the part line',
    substanceVisualType: 'transparent serum',
  });
  assert(
    rich.promptText.includes('rotating brush head') && rich.promptText.includes('scalp at the part line'),
    '[PR2.4] contact-proof rule weaves activePart + contactPoint into the prompt',
  );
  assert(
    rich.promptText.includes('transparent serum'),
    '[PR2.4] contact-proof rule weaves substanceVisualType into the prompt',
  );
  assert(
    rich.mustShow.some((s) => s.includes('rotating brush head')),
    '[PR2.4] contact-proof mustShow names the active part',
  );
  assert(
    rich.mustAvoid.some((s) => s.includes('hovering above scalp at the part line')),
    '[PR2.4] contact-proof mustAvoid names the contact-point hover failure mode',
  );

  // Degraded path: visual analysis fields missing — rule still emits
  // generic but useful language.
  const generic = buildContactProofRule({});
  assert(
    generic.promptText.includes('PRODUCT DEMO CONTACT PROOF'),
    '[PR2.4] contact-proof rule emits the section header even with null fields',
  );
  assert(
    /the intended surface — direct physical contact/.test(generic.promptText),
    '[PR2.4] contact-proof rule emits a generic surface-contact line when fields missing',
  );

  // Brief integration: product_demo → contactProofRequired flag + section in prompt.
  const demoBrief = buildImageBrief({
    sceneNumber: 3,
    totalScenes: 4,
    sceneGoal: 'demo the product',
    sceneGenerationType: 'product_demo',
    faceVisibility: 'partial_face',
    spokenTextHebrew: 'תראו',
    rawVisualBrief: 'product demo',
    cameraDirection: null,
    intelligence: null,
  });
  assert(
    demoBrief.contactProofRequired === true,
    '[PR2.4] product_demo brief.contactProofRequired=true',
  );
  assert(
    demoBrief.finalImagePrompt.includes('PRODUCT DEMO CONTACT PROOF'),
    '[PR2.4] product_demo finalImagePrompt contains contact-proof section',
  );
  assert(
    /1\. Where is the product/.test(demoBrief.finalImagePrompt),
    '[PR2.4] contact-proof prompt poses all 5 questions (numbered list visible)',
  );

  // Talking head brief should NOT trigger the rule.
  const talkBrief = buildImageBrief({
    sceneNumber: 0,
    totalScenes: 4,
    sceneGoal: 'hook',
    sceneGenerationType: 'talking_head',
    faceVisibility: 'clear_front_facing',
    spokenTextHebrew: 'שלום',
    rawVisualBrief: 'opening hook',
    cameraDirection: null,
    intelligence: null,
  });
  assert(
    talkBrief.contactProofRequired === false,
    '[PR2.4] talking_head brief.contactProofRequired=false',
  );
  assert(
    !talkBrief.finalImagePrompt.includes('PRODUCT DEMO CONTACT PROOF'),
    '[PR2.4] talking_head finalImagePrompt does NOT include contact-proof section',
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
