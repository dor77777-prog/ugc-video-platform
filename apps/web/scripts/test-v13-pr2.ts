// V13 PR2 verification — same tsx-script pattern as PR1.
//
// Asserts each PR2 piece in turn. Re-run after every commit on this PR.
// The pieces accumulate: PR2.1 module extraction, PR2.2 hands/mirror
// rules, PR2.3 product-ref lock, PR2.4 demo contact proof.

import {
  buildIsraeliRealismBlock,
} from '../lib/scene-planning/israeli-realism-rules';
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

console.log('');
if (failures === 0) {
  console.log('PR2 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`PR2 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
