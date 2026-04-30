// V14 PR2 verification — frame technique snippets.
//
// Same tsx-script pattern as test-v13/-v14 PR scripts. Covers:
//   1. Determinism — every snippet + the selector are pure
//   2. Snippet structure — every snippet ships non-empty positive
//      AND ≥3 negativeLines
//   3. Section-header anchors — each snippet's positive starts with a
//      stable, parseable "<NAME> TECHNIQUE:" header (so admin debug +
//      future re-ordering can reliably grep for them)
//   4. Selector dispatch — mirror selfie / hand-held selfie / product
//      hand hold / safe reflection / consistency anchor each fire on
//      the right scene types
//   5. Mutual exclusion — mirror selfie wins over selfie hand-held when
//      both signals fire
//   6. Single-scene ads → no consistency anchor (it's noise)
//   7. No double-instructions — productHandHold doesn't duplicate
//      PRODUCT_REFERENCE_LOCK's label-shape-color-applicator phrases
//   8. selfie_in_mirror cameraFocus value lives in CAMERA_FOCUS_LIST
//   9. End-to-end landing — buildImageBrief surfaces snippet IDs in
//      frameTechniqueSnippetIds and the snippet text in finalImagePrompt

import {
  consistencyAnchorSnippet,
  chooseFrameTechniqueSnippets,
  mirrorSelfieSnippet,
  productHandHoldSnippet,
  safeReflectionSnippet,
  selfieHandheldSnippet,
  type FrameTechniqueContext,
  type SnippetOutput,
} from '../lib/image-briefs/frame-technique-snippets';
import { buildImageBrief } from '../lib/image-briefs/image-brief-builder';
import { CAMERA_FOCUS_LIST } from '@ugc-video/prompts';

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

// ── 1. Determinism — 100 runs of each snippet are byte-identical ────────────
{
  const runs: Array<[string, () => SnippetOutput]> = [
    [
      'mirrorSelfieSnippet',
      () => mirrorSelfieSnippet({ subjectShort: 'the woman' }),
    ],
    [
      'selfieHandheldSnippet',
      () =>
        selfieHandheldSnippet({
          subjectShort: 'the woman',
          hand: 'right',
          expressionHint: 'frustrated mid-confession',
        }),
    ],
    [
      'productHandHoldSnippet',
      () =>
        productHandHoldSnippet({
          productName: 'Cleansing Oil',
          productForm: 'bottle',
          productHeightCm: 14,
          productColor: 'amber glass',
          productMaterialFinish: 'matte label',
          oneHand: 'right',
        }),
    ],
    [
      'safeReflectionSnippet',
      () =>
        safeReflectionSnippet({
          reflectiveSurface: 'the kitchen window',
          location: 'background of the frame',
        }),
    ],
    [
      'consistencyAnchorSnippet',
      () =>
        consistencyAnchorSnippet({
          totalScenes: 6,
          outfitDescriptionLocked: 'oversized white tee, light denim shorts',
        }),
    ],
  ];
  for (const [name, fn] of runs) {
    const first = JSON.stringify(fn());
    let mismatch = 0;
    for (let i = 0; i < 100; i++) {
      if (JSON.stringify(fn()) !== first) mismatch++;
    }
    assert(
      mismatch === 0,
      `[V14 PR2.1] determinism: ${name} byte-identical across 100 runs`,
      mismatch ? `${mismatch} runs drifted` : '',
    );
  }
}

// ── 2. Every snippet ships non-empty positive AND ≥3 negative lines ─────────
{
  const built: Array<[string, SnippetOutput]> = [
    ['mirror', mirrorSelfieSnippet({ subjectShort: 'her' })],
    ['selfie', selfieHandheldSnippet({ subjectShort: 'her' })],
    [
      'product_hand_hold',
      productHandHoldSnippet({
        productName: 'X',
        productForm: 'bottle',
      }),
    ],
    [
      'safe_reflection',
      safeReflectionSnippet({
        reflectiveSurface: 'window',
        location: 'background',
      }),
    ],
    [
      'consistency',
      consistencyAnchorSnippet({ totalScenes: 5 }),
    ],
  ];
  for (const [tag, snippet] of built) {
    assert(
      snippet.positive.trim().length > 0,
      `[V14 PR2.2] ${tag} snippet has non-empty positive body`,
    );
    assert(
      snippet.negativeLines.length >= 3,
      `[V14 PR2.2] ${tag} snippet ships ≥3 negativeLines`,
      `got ${snippet.negativeLines.length}`,
    );
    assert(
      snippet.id.startsWith('frame-technique.'),
      `[V14 PR2.2] ${tag} snippet id is namespaced "frame-technique.*"`,
    );
  }
}

// ── 3. Section-header anchors — stable parseable headers ───────────────────
{
  const cases: Array<[SnippetOutput, string]> = [
    [mirrorSelfieSnippet({ subjectShort: 'her' }), 'MIRROR SELFIE TECHNIQUE'],
    [selfieHandheldSnippet({ subjectShort: 'her' }), 'SELFIE HAND-HELD TECHNIQUE'],
    [
      productHandHoldSnippet({ productName: 'X', productForm: 'bottle' }),
      'PRODUCT HAND HOLD TECHNIQUE',
    ],
    [
      safeReflectionSnippet({ reflectiveSurface: 'w', location: 'bg' }),
      'SAFE REFLECTION TECHNIQUE',
    ],
    [
      consistencyAnchorSnippet({ totalScenes: 4 }),
      'CONSISTENCY ANCHOR',
    ],
  ];
  for (const [snippet, header] of cases) {
    assert(
      snippet.positive.includes(header),
      `[V14 PR2.3] snippet header "${header}" is present in positive body`,
    );
  }
}

// ── 4. Specific load-bearing anchors per FRAME_PROMPT_TECHNIQUES.md ────────
{
  const m = mirrorSelfieSnippet({ subjectShort: 'the woman' });
  assert(
    m.positive.includes('phone covers the lower half'),
    '[V14 PR2.4] mirror selfie snippet uses the "phone covers most of the face" technique',
  );
  assert(
    m.negativeLines.some((n) => /two people/i.test(n)),
    '[V14 PR2.4] mirror selfie negative includes the "no two people" anchor',
  );
  assert(
    m.negativeLines.some((n) => /recursive reflection/i.test(n)),
    '[V14 PR2.4] mirror selfie negative includes the recursive-reflection anchor',
  );

  const s = selfieHandheldSnippet({ subjectShort: 'the woman', hand: 'right' });
  assert(
    /selfie-camera wide-angle distortion/i.test(s.positive),
    '[V14 PR2.4] selfie hand-held snippet specifies wide-angle distortion',
  );
  assert(
    /five clearly defined fingers/i.test(s.positive),
    '[V14 PR2.4] selfie hand-held snippet specifies five fingers on the phone',
  );
  assert(
    s.negativeLines.some((n) => /third-person portrait/i.test(n)),
    '[V14 PR2.4] selfie hand-held negative blocks third-person portrait reading',
  );

  const p = productHandHoldSnippet({
    productName: 'Cleansing Oil',
    productForm: 'bottle',
    productHeightCm: 14,
    productColor: 'amber glass',
  });
  assert(
    /five clearly defined fingers/i.test(p.positive),
    '[V14 PR2.4] product hand hold spec'+'ifies five fingers wrapping the product',
  );
  assert(
    /thumb on the front-facing surface/i.test(p.positive),
    '[V14 PR2.4] product hand hold specifies thumb on the label side',
  );
  assert(
    p.positive.includes('14 cm tall') || p.positive.includes('approximately 14 cm'),
    '[V14 PR2.4] product hand hold quotes productHeightCm verbatim',
  );
  assert(
    p.negativeLines.some((n) => /six fingers/i.test(n)),
    '[V14 PR2.4] product hand hold negative blocks six-finger failure mode',
  );
  assert(
    p.negativeLines.some((n) => /phantom second hand/i.test(n)),
    '[V14 PR2.4] product hand hold negative blocks phantom second hand',
  );

  const r = safeReflectionSnippet({
    reflectiveSurface: 'the window',
    location: 'background',
  });
  assert(
    /intentionally indistinct/i.test(r.positive),
    '[V14 PR2.4] safe reflection snippet asks for "intentionally indistinct" reflection',
  );
  assert(
    r.negativeLines.some((n) => /readable text/i.test(n)),
    '[V14 PR2.4] safe reflection negative blocks readable text on screens',
  );

  const c = consistencyAnchorSnippet({ totalScenes: 6 });
  assert(
    /6-scene UGC ad series/i.test(c.positive),
    '[V14 PR2.4] consistency anchor inlines totalScenes verbatim',
  );
  assert(
    c.negativeLines.some((n) => /different person/i.test(n)),
    '[V14 PR2.4] consistency anchor negative blocks "different person" drift',
  );
}

// ── 5. Selector dispatch — each scene type triggers the right snippets ─────
{
  // Mirror selfie via cameraFocus="selfie_in_mirror"
  const ms1 = chooseFrameTechniqueSnippets({
    cameraFocus: 'selfie_in_mirror',
    sceneGenerationType: 'selfie_talking',
    totalScenes: 6,
  });
  assert(
    ms1.some((s) => s.id === 'frame-technique.mirror_selfie'),
    '[V14 PR2.5] selector activates mirror_selfie snippet for cameraFocus="selfie_in_mirror"',
  );
  assert(
    !ms1.some((s) => s.id === 'frame-technique.selfie_handheld'),
    '[V14 PR2.5] selector suppresses selfie_handheld when mirror is set',
  );

  // Mirror selfie via sceneGenerationType="mirror_selfie_talking"
  const ms2 = chooseFrameTechniqueSnippets({
    sceneGenerationType: 'mirror_selfie_talking',
    totalScenes: 5,
  });
  assert(
    ms2.some((s) => s.id === 'frame-technique.mirror_selfie'),
    '[V14 PR2.5] selector activates mirror_selfie for sceneGenerationType="mirror_selfie_talking"',
  );

  // Selfie hand-held via sceneGenerationType="selfie_talking" + face visible
  const sf = chooseFrameTechniqueSnippets({
    sceneGenerationType: 'selfie_talking',
    faceVisibility: 'clear_front_facing',
    totalScenes: 6,
  });
  assert(
    sf.some((s) => s.id === 'frame-technique.selfie_handheld'),
    '[V14 PR2.5] selector activates selfie_handheld for selfie_talking + clear_front_facing',
  );
  assert(
    !sf.some((s) => s.id === 'frame-technique.mirror_selfie'),
    '[V14 PR2.5] selector skips mirror_selfie when scene is selfie_talking (no mirror signals)',
  );

  // Product hand hold for hands_only / closeup_product / product_demo
  for (const t of ['hands_only', 'closeup_product', 'product_demo']) {
    const ph = chooseFrameTechniqueSnippets({
      sceneGenerationType: t,
      mustShowProduct: true,
      productName: 'TestSerum',
      productForm: 'bottle',
      totalScenes: 5,
    });
    assert(
      ph.some((s) => s.id === 'frame-technique.product_hand_hold'),
      `[V14 PR2.5] selector activates product_hand_hold for sceneType="${t}"`,
    );
  }

  // Product hand hold does NOT activate without productName
  const noProd = chooseFrameTechniqueSnippets({
    sceneGenerationType: 'product_demo',
    mustShowProduct: true,
    totalScenes: 5,
  });
  assert(
    !noProd.some((s) => s.id === 'frame-technique.product_hand_hold'),
    '[V14 PR2.5] product_hand_hold does NOT fire when productName missing',
  );

  // Safe reflection only when opted-in
  const noRefl = chooseFrameTechniqueSnippets({
    sceneGenerationType: 'product_demo',
    mustShowProduct: true,
    productName: 'X',
    productForm: 'bottle',
    totalScenes: 5,
  });
  assert(
    !noRefl.some((s) => s.id === 'frame-technique.safe_reflection'),
    '[V14 PR2.5] safe_reflection is opt-in: does NOT fire by default',
  );
  const withRefl = chooseFrameTechniqueSnippets({
    sceneGenerationType: 'product_demo',
    mustShowProduct: true,
    productName: 'X',
    productForm: 'bottle',
    totalScenes: 5,
    windowOrReflectiveSurfaceVisible: true,
    reflectiveSurfaceLabel: 'the bathroom mirror',
    reflectiveSurfaceLocation: 'behind her',
  });
  assert(
    withRefl.some((s) => s.id === 'frame-technique.safe_reflection'),
    '[V14 PR2.5] safe_reflection fires when windowOrReflectiveSurfaceVisible=true',
  );
}

// ── 6. Mirror takes priority over selfie when both signals fire ────────────
{
  const both: FrameTechniqueContext = {
    cameraFocus: 'selfie_in_mirror',
    sceneGenerationType: 'selfie_talking',
    faceVisibility: 'clear_front_facing',
    totalScenes: 5,
  };
  const out = chooseFrameTechniqueSnippets(both);
  const ids = out.map((s) => s.id);
  assert(
    ids.includes('frame-technique.mirror_selfie') &&
      !ids.includes('frame-technique.selfie_handheld'),
    '[V14 PR2.6] mirror_selfie takes priority over selfie_handheld when both signals fire',
  );
}

// ── 7. Single-scene ads → consistency anchor suppressed ────────────────────
{
  const single = chooseFrameTechniqueSnippets({
    sceneGenerationType: 'product_demo',
    mustShowProduct: true,
    productName: 'X',
    productForm: 'bottle',
    totalScenes: 1,
  });
  assert(
    !single.some((s) => s.id === 'frame-technique.consistency_anchor'),
    '[V14 PR2.7] consistency_anchor suppressed when totalScenes=1',
  );
  const multi = chooseFrameTechniqueSnippets({
    sceneGenerationType: 'product_demo',
    mustShowProduct: true,
    productName: 'X',
    productForm: 'bottle',
    totalScenes: 6,
  });
  assert(
    multi.some((s) => s.id === 'frame-technique.consistency_anchor'),
    '[V14 PR2.7] consistency_anchor fires when totalScenes>1',
  );
}

// ── 8. No double-instructions — productHandHold doesn't repeat PRL phrases ─
{
  const p = productHandHoldSnippet({
    productName: 'X',
    productForm: 'bottle',
    productHeightCm: 14,
  });
  // PRODUCT_REFERENCE_LOCK signature phrases (from
  // packages/prompts/src/scene-image-prompts.ts) that must NOT be duplicated.
  const PRL_SIGNATURES = [
    'same shape, same color, same proportions',
    'same applicator',
    'same label placement',
    'do not invent a different product',
    'do not replace it with a generic',
    'label text and brand mark from image 2',
    'image 2 is the source of truth',
  ];
  for (const sig of PRL_SIGNATURES) {
    assert(
      !p.positive.toLowerCase().includes(sig),
      `[V14 PR2.8] product_hand_hold positive does NOT duplicate PRL signature "${sig}"`,
    );
  }
}

// ── 9. selfie_in_mirror is in the CAMERA_FOCUS enum ────────────────────────
{
  assert(
    (CAMERA_FOCUS_LIST as readonly string[]).includes('selfie_in_mirror'),
    '[V14 PR2.9] CAMERA_FOCUS_LIST exports the new "selfie_in_mirror" value',
  );
}

// ── 10. End-to-end — buildImageBrief surfaces snippet IDs + prompt text ────
{
  // Multi-scene mirror selfie → consistency + mirror snippets in finalImagePrompt
  const briefMirror = buildImageBrief({
    sceneNumber: 3,
    totalScenes: 6,
    sceneGoal: 'apply in front of bathroom mirror',
    sceneGenerationType: 'mirror_selfie_talking',
    faceVisibility: 'clear_front_facing',
    spokenTextHebrew: 'אני בודקת מול המראה',
    rawVisualBrief: 'mirror selfie talking head',
    cameraDirection: null,
    intelligence: null,
  });
  assert(
    briefMirror.frameTechniqueSnippetIds.includes('frame-technique.mirror_selfie'),
    '[V14 PR2.10] brief.frameTechniqueSnippetIds includes mirror_selfie for mirror scene',
  );
  assert(
    briefMirror.frameTechniqueSnippetIds.includes('frame-technique.consistency_anchor'),
    '[V14 PR2.10] brief.frameTechniqueSnippetIds includes consistency_anchor for multi-scene ad',
  );
  assert(
    briefMirror.finalImagePrompt.includes('MIRROR SELFIE TECHNIQUE'),
    '[V14 PR2.10] finalImagePrompt carries the mirror snippet section verbatim',
  );
  assert(
    briefMirror.finalImagePrompt.includes('CONSISTENCY ANCHOR'),
    '[V14 PR2.10] finalImagePrompt carries the consistency anchor section verbatim',
  );
  // The mirror snippet's negativeLines should land in mustAvoid.
  assert(
    briefMirror.mustAvoid.some((s) => /two people in the frame/i.test(s)),
    '[V14 PR2.10] mirror snippet negativeLines flowed into brief.mustAvoid',
  );

  // Single-scene non-mirror brief → no consistency anchor, no mirror snippet
  const briefSingle = buildImageBrief({
    sceneNumber: 0,
    totalScenes: 1,
    sceneGoal: 'product hero',
    sceneGenerationType: 'cta_visual',
    faceVisibility: 'no_face',
    spokenTextHebrew: '',
    rawVisualBrief: 'product alone on a counter',
    cameraDirection: null,
    intelligence: null,
  });
  assert(
    !briefSingle.frameTechniqueSnippetIds.includes(
      'frame-technique.consistency_anchor',
    ),
    '[V14 PR2.10] single-scene brief skips consistency_anchor',
  );
  assert(
    !briefSingle.frameTechniqueSnippetIds.includes(
      'frame-technique.mirror_selfie',
    ),
    '[V14 PR2.10] non-mirror single-scene brief skips mirror_selfie',
  );

  // Product hand hold needs intelligence to fire — without intelligence,
  // selector can't get productName, so it skips. Verify gracefully.
  const briefProductDemo = buildImageBrief({
    sceneNumber: 2,
    totalScenes: 5,
    sceneGoal: 'demo',
    sceneGenerationType: 'product_demo',
    faceVisibility: 'no_face',
    spokenTextHebrew: '',
    rawVisualBrief: 'hands using the device',
    cameraDirection: null,
    mustShowProduct: true,
    intelligence: null,
  });
  assert(
    !briefProductDemo.frameTechniqueSnippetIds.includes(
      'frame-technique.product_hand_hold',
    ),
    '[V14 PR2.10] product_hand_hold needs productName — gracefully skipped without intelligence',
  );
  assert(
    briefProductDemo.frameTechniqueSnippetIds.includes(
      'frame-technique.consistency_anchor',
    ),
    '[V14 PR2.10] consistency_anchor still fires for multi-scene product_demo brief',
  );
}

// ── 11. Output array order is deterministic ─────────────────────────────────
{
  const ctx: FrameTechniqueContext = {
    cameraFocus: 'selfie_in_mirror',
    sceneGenerationType: 'mirror_selfie_talking',
    faceVisibility: 'clear_front_facing',
    mustShowProduct: true,
    productName: 'Cleansing Oil',
    productForm: 'bottle',
    totalScenes: 6,
  };
  const a = chooseFrameTechniqueSnippets(ctx).map((s) => s.id);
  const b = chooseFrameTechniqueSnippets(ctx).map((s) => s.id);
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    '[V14 PR2.11] selector returns identical id-order across runs',
  );
}

// ── 12. Outfit lock — when provided, anchor quotes it; when not, generic ───
{
  const locked = consistencyAnchorSnippet({
    totalScenes: 5,
    outfitDescriptionLocked: 'oversized white tee, light denim shorts',
  });
  assert(
    /oversized white tee, light denim shorts/.test(locked.positive),
    '[V14 PR2.12] consistency anchor quotes locked outfit description verbatim',
  );
  const generic = consistencyAnchorSnippet({ totalScenes: 5 });
  assert(
    !/oversized white tee/.test(generic.positive),
    '[V14 PR2.12] consistency anchor without lock omits specific outfit text',
  );
  assert(
    /Outfit drift is a distraction/.test(generic.positive),
    '[V14 PR2.12] consistency anchor without lock falls back to a generic continuity instruction',
  );
}

// ── 13. Form inference fallback — productForm gets a sane default ──────────
{
  // The brief builder's inferProductForm helper falls back to "bottle" when
  // dossier/visual fields don't map to any of the known forms. The selector
  // should still fire product_hand_hold with the fallback form.
  const out = chooseFrameTechniqueSnippets({
    sceneGenerationType: 'product_demo',
    mustShowProduct: true,
    productName: 'TestProduct',
    productForm: 'bottle',
    totalScenes: 5,
  });
  const phSnippet = out.find((s) => s.id === 'frame-technique.product_hand_hold');
  assert(
    Boolean(phSnippet) && phSnippet!.positive.includes('bottle'),
    '[V14 PR2.13] product_hand_hold fires with form="bottle" fallback',
  );
}

console.log('');
if (failures === 0) {
  console.log('V14 PR2 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`V14 PR2 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
