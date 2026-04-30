// V13 PR1 verification — no test runner yet (vitest comes in a later PR),
// so this is a tsx-runnable smoke test that asserts the Image-QA
// auto-regeneration loop has been fully removed from the active path
// while the upstream creative-planning artifacts (and the OTHER vision
// calls — face-gate, motion-analysis, product-visual-analysis) remain
// intact.
//
// Run: `npx tsx apps/web/scripts/test-v13-pr1.ts` from repo root
// (or from anywhere — paths are absolute).

import fs from 'node:fs';
import path from 'node:path';
import { buildImageBrief, isProblemSceneType } from '../lib/image-briefs/image-brief-builder';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const WEB = path.join(REPO_ROOT, 'apps/web');

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

// ── 1. lib/image-qa/ no longer exists ────────────────────────────────────
const imageQaDir = path.join(WEB, 'lib/image-qa');
assert(
  !fs.existsSync(imageQaDir),
  '[1] lib/image-qa/ directory is deleted',
  `still present at ${imageQaDir}`,
);

// ── 2. generate-impl.ts has no QA imports / calls / env reads ────────────
const generateImpl = fs.readFileSync(
  path.join(WEB, 'lib/scenes/generate-impl.ts'),
  'utf8',
);
const forbiddenInGenerateImpl = [
  'image-qa',
  'ImageQa',
  'evaluateImageQa',
  'buildCorrectiveBrief',
  'IMAGE_QA_ENABLED',
  'IMAGE_QA_MAX_RETRIES',
  'OPENAI_IMAGE_QA_MODEL',
  // No `while (true)` regen loop. Single-pass image gen has no loop.
  'while (true)',
];
for (const term of forbiddenInGenerateImpl) {
  assert(
    !generateImpl.includes(term),
    `[2] generate-impl.ts does not contain '${term}'`,
    `found in ${path.join(WEB, 'lib/scenes/generate-impl.ts')}`,
  );
}

// ── 3. generate-impl.ts still persists imageBriefJson + imageUrl ─────────
assert(
  /imageBriefJson:\s*brief/.test(generateImpl),
  '[3] generate-impl.ts still writes imageBriefJson',
);
assert(
  /imageUrl:\s*url/.test(generateImpl),
  '[3] generate-impl.ts still writes imageUrl',
);
assert(
  /imagePromptUsed:\s*result\.promptUsed/.test(generateImpl),
  '[3] generate-impl.ts still writes imagePromptUsed (the final prompt sent to gpt-image-2)',
);

// ── 4. image-brief-builder.ts: buildCorrectiveBrief is gone, buildImageBrief works ──
const briefBuilder = fs.readFileSync(
  path.join(WEB, 'lib/image-briefs/image-brief-builder.ts'),
  'utf8',
);
assert(
  !briefBuilder.includes('buildCorrectiveBrief'),
  '[4] buildCorrectiveBrief is removed from image-brief-builder.ts',
);

// Pure unit: build a brief with minimal input and verify finalImagePrompt
// is populated. The brief builder is the V11/V13 contract — it must
// always emit a finalImagePrompt even with null intelligence (degraded
// path) so the image gen call still has something to send.
const brief = buildImageBrief({
  sceneNumber: 1,
  totalScenes: 4,
  sceneGoal: 'demo the product',
  sceneGenerationType: 'product_demo',
  faceVisibility: 'clear_front_facing',
  spokenTextHebrew: 'תראו איך זה עובד',
  rawVisualBrief: 'hands holding the product near a sink',
  cameraDirection: null,
  intelligence: null,
});
assert(
  typeof brief.finalImagePrompt === 'string' && brief.finalImagePrompt.length > 50,
  '[4] buildImageBrief still emits a non-trivial finalImagePrompt',
  `got length=${brief.finalImagePrompt?.length ?? 0}`,
);
assert(
  Array.isArray(brief.mustShow) && Array.isArray(brief.mustAvoid),
  '[4] buildImageBrief still emits mustShow/mustAvoid arrays',
);
assert(
  typeof isProblemSceneType('problem_visual') === 'boolean',
  '[4] isProblemSceneType still exported',
);

// ── 5. .env.example has no IMAGE_QA_* env vars ───────────────────────────
const envExample = fs.readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8');
for (const term of ['IMAGE_QA_ENABLED', 'IMAGE_QA_MAX_RETRIES', 'OPENAI_IMAGE_QA_MODEL']) {
  assert(
    !envExample.includes(term),
    `[5] .env.example does not document '${term}'`,
  );
}

// ── 6. Vision calls we KEEP are still importable (face-gate / motion / product-visual) ──
async function importStillWorks() {
  const faceGate = await import('../lib/animation/face-gate');
  assert(
    typeof faceGate.runFaceGate === 'function',
    '[6] face-gate.runFaceGate still exported',
  );

  const motion = await import('../lib/animation/motion-analysis');
  assert(
    typeof motion.analyzeSceneForMotion === 'function',
    '[6] motion-analysis.analyzeSceneForMotion still exported',
  );

  const visual = await import('../lib/product-intelligence/product-visual-analysis');
  assert(
    typeof visual.analyzeProductVisual === 'function',
    '[6] product-visual-analysis.analyzeProductVisual still exported',
  );
}

(async () => {
  try {
    await importStillWorks();
  } catch (err) {
    fail('[6] vision modules import without errors', (err as Error).message);
  }

  console.log('');
  if (failures === 0) {
    console.log(`PR1 verification: ALL CHECKS PASSED`);
    process.exit(0);
  } else {
    console.error(`PR1 verification: ${failures} CHECK(S) FAILED`);
    process.exit(1);
  }
})();
