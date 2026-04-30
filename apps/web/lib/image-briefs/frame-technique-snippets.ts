// Frame technique snippets — V14 PR2.
//
// Deterministic, pure snippet builders for the failure modes documented
// in docs/v14/FRAME_PROMPT_TECHNIQUES.md. Each snippet takes typed
// inputs and returns a typed { positive, negativeLines } pair so the
// brief builder can append it as one of the ruleBlocks.
//
// The composition order target lives in §7 of FRAME_PROMPT_TECHNIQUES.md
// (consistency anchor → product hand hold → camera framing). Today the
// brief builder appends them as ruleBlocks (which land before MUST SHOW
// and MUST NOT SHOW); strict §7 ordering can be a follow-up if the
// snippet contents alone aren't enough.
//
// What this module DOES NOT do:
//   - It does not reach into OpenAI / Prisma / disk. Pure.
//   - It does not duplicate PRODUCT_REFERENCE_LOCK from
//     packages/prompts/src/scene-image-prompts.ts. The PRL paragraph
//     handles label/shape/color match; productHandHoldSnippet handles
//     anatomical grip mechanics. Complementary, not overlapping.
//   - It does not replace buildHandsPhysicsRule / buildMirrorSafetyRule
//     in scene-rules.ts. Those are generic safeguards; these snippets
//     add specific anatomy + technique on top.

import {
  detectMirrorRisk,
  detectHandsPhysicsRequired,
} from '@/lib/scene-planning/scene-rules';

// ── Output shape ─────────────────────────────────────────────────────────────

export interface SnippetOutput {
  /** Stable identifier; never rendered into the prompt. Used for telemetry,
   *  admin-debug surfacing, and dedupe in the selector. */
  id: string;
  /** Section header + body that ships into the prompt as one ruleBlock. */
  positive: string;
  /** Items appended to mustAvoid / negativeConstraints. */
  negativeLines: string[];
}

// ── Mirror selfie ────────────────────────────────────────────────────────────
//
// FRAME_PROMPT_TECHNIQUES.md §1. The phone-covers-most-of-the-face technique
// resolves the four documented failure modes (no mirror, wrong reflection,
// face-rendered-from-wrong-angle, recursive screen).

export interface MirrorSelfieInput {
  /** "the influencer" / "the woman" / etc. — short third-person handle.
   *  The avatar's full identity-locked description is added by the prompt
   *  wrapper separately; this input only shapes the snippet's prose. */
  subjectShort: string;
  /** Default: "wall-mounted bathroom mirror". */
  mirrorDescription?: string;
  /** Default: "an arm's length". */
  distanceFromMirror?: string;
}

export function mirrorSelfieSnippet(opts: MirrorSelfieInput): SnippetOutput {
  const mirror = opts.mirrorDescription ?? 'wall-mounted bathroom mirror';
  const distance = opts.distanceFromMirror ?? "an arm's length";
  const positive = [
    'MIRROR SELFIE TECHNIQUE (failure-mode-resistant geometry):',
    `- A hyper-realistic smartphone mirror selfie. ${opts.subjectShort} stands ${distance} from a large ${mirror}, holding a vertical smartphone with both hands at chest height.`,
    '- The phone is the photo source — its back faces the mirror, the camera lens is visible.',
    `- The phone covers the lower half of ${opts.subjectShort}\'s face from nose down. Only the eyes, forehead, and hair are visible above the phone.`,
    '- The mirror shows a slightly imperfect reflection with realistic smudges and fingerprints.',
    `- ${opts.subjectShort}\'s reflection is what we see in the frame — there is no second person, no ghosted second reflection, no recursive screen content.`,
  ].join('\n');
  const negativeLines = [
    'NOT two people in the frame',
    'NOT recursive reflection (the phone screen showing the same scene)',
    'NOT a fully-visible face above an arm holding a phone in the air',
    'NOT broken mirror geometry (subject and reflection at impossible angles)',
    'NOT ghosted secondary reflection',
    'NOT mismatched outfit between subject and reflection',
    'NOT a phone floating without hands holding it',
  ];
  return { id: 'frame-technique.mirror_selfie', positive, negativeLines };
}

// ── Hand-held selfie (no mirror) ─────────────────────────────────────────────
//
// FRAME_PROMPT_TECHNIQUES.md §2. Three explicit constraints (camera-on-phone
// perspective, arm visibility, slight wide-angle distortion) collapse the
// "looks like someone else is taking the photo" failure mode.

export interface SelfieHandheldInput {
  subjectShort: string;
  /** Default: 'right'. */
  hand?: 'right' | 'left';
  /** "natural conversational" / "warm smiling" / "frustrated mid-confession". */
  expressionHint?: string;
}

export function selfieHandheldSnippet(opts: SelfieHandheldInput): SnippetOutput {
  const hand = opts.hand ?? 'right';
  const cornerSide = hand === 'right' ? 'right' : 'left';
  const expression = opts.expressionHint ?? 'natural conversational';
  const positive = [
    'SELFIE HAND-HELD TECHNIQUE (front-camera perspective lock):',
    `- ${opts.subjectShort} taking a vertical selfie with their smartphone, shot on the phone\'s front-facing camera held at approximately arm\'s length and slightly above eye level.`,
    `- Their ${hand} arm holding the phone is partially visible at the bottom-${cornerSide} of the frame, with five clearly defined fingers gripping the side of the phone.`,
    '- The phone is a modern vertical smartphone with a thin black bezel.',
    '- Subtle selfie-camera wide-angle distortion: the nose appears slightly larger, the background subtly stretched at the edges.',
    '- Natural daylight from one side, soft warm bounce on the face.',
    `- ${opts.subjectShort}\'s face fills the upper-center of the frame, expression: ${expression}.`,
  ].join('\n');
  const negativeLines = [
    'NOT a third-person portrait (this is a phone-camera selfie, not a photographer\'s shot)',
    'NOT a fully-detached arm (the phone-holding arm must connect to the body)',
    'NOT a six-fingered or three-fingered hand on the phone',
    'NOT a comically oversized phone',
    'NOT a professional studio look (this is casual UGC)',
  ];
  return { id: 'frame-technique.selfie_handheld', positive, negativeLines };
}

// ── Product hand hold ────────────────────────────────────────────────────────
//
// FRAME_PROMPT_TECHNIQUES.md §3 — the largest documented failure category.
// Specifies anatomical fingers, contact points, scale, label-side and one-hand
// vs two-hand explicitly. Complementary to PRODUCT_REFERENCE_LOCK
// (which locks shape/color/label-PLACEMENT) and to buildContactProofRule
// (which locks active-part / contact-point / substance — the activation
// questions, not the grip questions).

export interface ProductHandHoldInput {
  productName: string;
  /** "bottle" | "tube" | "jar" | "box" | "device" | "sachet" | "can" | "stick". */
  productForm: string;
  productHeightCm?: number | null;
  productColor?: string | null;
  productMaterialFinish?: string | null;
  /** Where the label faces. Default: 'front'. */
  labelSide?: 'front' | 'left' | 'right';
  /** Default: scale word inferred from productHeightCm. */
  scaleReference?: string;
  /** Default: 'right'. */
  oneHand?: 'right' | 'left' | 'both';
  /** "out of frame" / "rests on the kitchen counter". */
  secondHandDisposition?: string;
}

export function productHandHoldSnippet(opts: ProductHandHoldInput): SnippetOutput {
  const labelSide = opts.labelSide ?? 'front';
  const oneHand = opts.oneHand ?? 'right';
  const secondHand =
    opts.secondHandDisposition ??
    (oneHand === 'both' ? 'fingers interlaced around the bottle' : 'out of frame');
  const scaleRef = opts.scaleReference ?? inferScaleReference(opts.productHeightCm);
  const sizeBit = opts.productHeightCm
    ? `, approximately ${opts.productHeightCm} cm tall`
    : '';
  const colorBit = opts.productColor ? ` (${opts.productColor})` : '';
  const finishBit = opts.productMaterialFinish ? `, ${opts.productMaterialFinish}` : '';

  const handDescription =
    oneHand === 'both'
      ? 'held with both hands, fingers interlaced around the product. Both hands have anatomically correct five fingers each, visible knuckles, and obvious contact pressure on the product.'
      : `held in the ${oneHand} hand only — ${oneHand === 'right' ? 'left' : 'right'} hand is ${secondHand}.`;

  const positive = [
    'PRODUCT HAND HOLD TECHNIQUE (anatomical grip lock):',
    `- ${opts.productName} is a ${opts.productForm}${sizeBit}${colorBit}${finishBit}. It is ${handDescription}`,
    '- Five clearly defined fingers wrap the product: thumb on the ' + labelSide + '-facing surface, four fingers behind, slight downward grip — the natural way a real person picks up this object.',
    '- Visible contact between fingertips and product surface, with the thumb pad slightly compressed against the label area.',
    `- The product is approximately the size of a ${scaleRef} in the hand, sitting from the base of the palm toward roughly mid-finger.`,
    '- Label is in frame but no specific brand text is required to be readable here — the silhouette, color, and proportions match the product reference; the label glyphs are out of focus or partially turned.',
  ].join('\n');
  const negativeLines = [
    'NOT six fingers, NOT three fingers, NOT melted or merged fingers',
    'NOT floating product without visible hand contact',
    'NOT product label with garbled text or invented brand glyphs',
    'NOT oversized hand or oversized product (scale must read like a real human grip)',
    'NOT a phantom second hand appearing for "safety" when the snippet specifies one hand',
    'NOT fingers passing through the product surface as if both are ghostly',
  ];
  return { id: 'frame-technique.product_hand_hold', positive, negativeLines };
}

function inferScaleReference(heightCm: number | null | undefined): string {
  if (!heightCm) return 'small bottle of water';
  if (heightCm < 6) return 'lipstick tube';
  if (heightCm < 10) return 'deck of cards';
  if (heightCm < 16) return 'smartphone';
  if (heightCm < 22) return 'small bottle of water';
  return 'half-litre soda bottle';
}

// ── Safe reflection ──────────────────────────────────────────────────────────
//
// FRAME_PROMPT_TECHNIQUES.md §4. The lever isn't to render reflections
// correctly — it's to ask for indistinct reflections so failures don't
// telegraph themselves. Phone screens specifically should never carry
// readable text (Hebrew or English) — abstract UI shapes only.

export interface SafeReflectionInput {
  /** "the window" / "the bathroom mirror behind her" / "the kettle's chrome surface". */
  reflectiveSurface: string;
  /** "background of the frame" / "edge of the table" / "behind the subject". */
  location: string;
}

export function safeReflectionSnippet(opts: SafeReflectionInput): SnippetOutput {
  const positive = [
    'SAFE REFLECTION TECHNIQUE (avoid reflection-rendering failures):',
    `- ${opts.reflectiveSurface} in the ${opts.location}: the reflection is intentionally indistinct — soft warm daylight bouncing off the surface, no recognizable second scene rendered.`,
    '- Any phone screen visible in the frame is dim and shows abstract pastel UI shapes with no readable text in any language.',
  ].join('\n');
  const negativeLines = [
    'NOT a recognizable reflected scene that contradicts the actual setting',
    'NOT readable text (Hebrew, English, or otherwise) on any screen in the frame',
    'NOT mismatched reflection geometry (subject on the right but reflection appears on the left edge)',
    'NOT Lorem-ipsum-style placeholder text on any screen',
  ];
  return { id: 'frame-technique.safe_reflection', positive, negativeLines };
}

// ── Consistency anchor ───────────────────────────────────────────────────────
//
// FRAME_PROMPT_TECHNIQUES.md §5. Locks "this is the same person across the
// whole ad". The avatar's identity-locked description block is added by
// scene-image-prompts.ts (one source of truth — don't duplicate the avatar's
// physical features here). The outfit-locked phrase becomes load-bearing in
// V14 PR3 once Project.productData.lockedOutfit is computed; for PR2 the
// snippet still emits the consistency instruction with a generic outfit
// placeholder so it lands on every multi-scene ad today.

export interface ConsistencyAnchorInput {
  totalScenes: number;
  /** When provided, the snippet quotes it verbatim (PR3+). Otherwise emits a
   *  generic instruction that still pushes the model toward continuity. */
  outfitDescriptionLocked?: string | null;
}

export function consistencyAnchorSnippet(
  opts: ConsistencyAnchorInput,
): SnippetOutput {
  const outfitClause = opts.outfitDescriptionLocked
    ? `The subject is wearing ${opts.outfitDescriptionLocked} (identical across all scenes in this ad).`
    : 'The subject\'s outfit must remain identical across all scenes in this ad — same shirt, same pants/skirt, same shoes, same jewelry. Outfit drift is a distraction and must not happen.';
  const positive = [
    'CONSISTENCY ANCHOR (the subject is the same person across the whole ad):',
    `- This frame is part of a ${opts.totalScenes}-scene UGC ad series. Treat the avatar reference image as a strict identity anchor.`,
    '- Preserve identical facial features (eye shape, nose shape, jawline, eyebrow shape), identical hair length and color, identical skin tone, identical earrings/jewelry across every scene.',
    `- ${outfitClause}`,
  ].join('\n');
  const negativeLines = [
    'NOT a different person from the previous scene',
    'NOT a different hairstyle or hair length',
    'NOT a different age',
    'NOT a different ethnicity from the avatar reference',
    'NOT mismatched eye color',
    'NOT a mismatched outfit between scenes in this same ad',
  ];
  return { id: 'frame-technique.consistency_anchor', positive, negativeLines };
}

// ── Selector ─────────────────────────────────────────────────────────────────
//
// chooseFrameTechniqueSnippets aggregates context and dispatches to the right
// snippet builders. Pure: same input → byte-identical output (asserted in
// test-v14-pr2.ts).

export interface FrameTechniqueContext {
  cameraFocus?: string | null;
  sceneGenerationType: string;
  primarySubject?: string | null;
  mustShowProduct?: boolean | null;
  faceVisibility?: string | null;
  cameraDirection?: string | null;
  /** Used by the consistency anchor; pass the project's total scene count. */
  totalScenes?: number;
  /** Avatar's locked outfit (PR3+). When null, consistency anchor still
   *  emits a generic continuity instruction. */
  outfitDescriptionLocked?: string | null;
  /** Subject handle for the mirror/selfie snippets. Default: 'the subject'. */
  subjectShort?: string | null;
  /** Product details for productHandHoldSnippet. Pulled from
   *  ProductIntelligence (visualAnalysis + dossier) by the brief builder. */
  productName?: string | null;
  productForm?: string | null;
  productHeightCm?: number | null;
  productColor?: string | null;
  productMaterialFinish?: string | null;
  /** Opt-in flags for safeReflectionSnippet. Off by default — don't ask for
   *  reflections unless the scene requires them. */
  windowOrReflectiveSurfaceVisible?: boolean;
  reflectiveSurfaceLabel?: string | null;
  reflectiveSurfaceLocation?: string | null;
}

const MIRROR_SELFIE_SCENE_TYPES = new Set([
  'mirror_selfie_talking',
  'mirror_selfie',
  'bathroom_selfie',
]);

const SELFIE_SCENE_TYPES = new Set([
  'selfie_talking',
  'talking_head',
]);

const PRODUCT_HAND_HOLD_SCENE_TYPES = new Set([
  'hands_only',
  'closeup_product',
  'product_demo',
  'hold_product',
]);

export function chooseFrameTechniqueSnippets(
  ctx: FrameTechniqueContext,
): SnippetOutput[] {
  const out: SnippetOutput[] = [];
  const subjectShort = ctx.subjectShort ?? 'the subject';

  // Consistency anchor: fires for any multi-scene ad. The whole point is to
  // bind the same person across the series; if there's only one scene, the
  // anchor adds noise.
  if ((ctx.totalScenes ?? 0) > 1) {
    out.push(
      consistencyAnchorSnippet({
        totalScenes: ctx.totalScenes ?? 0,
        outfitDescriptionLocked: ctx.outfitDescriptionLocked ?? null,
      }),
    );
  }

  // Product hand hold: when the scene is product-led AND product must show.
  // Reuse the same predicate the brief builder uses for hands-physics so the
  // snippet fires on the same scenes the existing rule does.
  const isProductLed =
    PRODUCT_HAND_HOLD_SCENE_TYPES.has(ctx.sceneGenerationType) ||
    (ctx.sceneGenerationType === 'lifestyle_product' && ctx.mustShowProduct === true);
  if (
    isProductLed &&
    ctx.productName &&
    ctx.productForm &&
    detectHandsPhysicsRequired({
      sceneGenerationType: ctx.sceneGenerationType,
      mustShowProduct: ctx.mustShowProduct,
      cameraDirection: ctx.cameraDirection,
    })
  ) {
    out.push(
      productHandHoldSnippet({
        productName: ctx.productName,
        productForm: ctx.productForm,
        productHeightCm: ctx.productHeightCm ?? null,
        productColor: ctx.productColor ?? null,
        productMaterialFinish: ctx.productMaterialFinish ?? null,
      }),
    );
  }

  // Mirror selfie OR hand-held selfie — mutually exclusive. Mirror takes
  // priority when both signals fire (the mirror scene is the harder one).
  const mirrorScene =
    ctx.cameraFocus === 'selfie_in_mirror' ||
    MIRROR_SELFIE_SCENE_TYPES.has(ctx.sceneGenerationType) ||
    detectMirrorRisk({
      sceneGenerationType: ctx.sceneGenerationType,
      mustShowProduct: ctx.mustShowProduct,
      cameraDirection: ctx.cameraDirection,
    });
  if (mirrorScene) {
    out.push(mirrorSelfieSnippet({ subjectShort }));
  } else if (
    SELFIE_SCENE_TYPES.has(ctx.sceneGenerationType) &&
    (ctx.faceVisibility === 'clear_front_facing' || ctx.faceVisibility === 'partial_face')
  ) {
    out.push(selfieHandheldSnippet({ subjectShort }));
  }

  // Safe reflection: opt-in only — most ad scenes don't need it.
  if (ctx.windowOrReflectiveSurfaceVisible) {
    out.push(
      safeReflectionSnippet({
        reflectiveSurface: ctx.reflectiveSurfaceLabel ?? 'the reflective surface',
        location: ctx.reflectiveSurfaceLocation ?? 'in the background of the frame',
      }),
    );
  }

  return out;
}
