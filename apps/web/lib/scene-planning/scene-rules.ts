// Scene rules — V13 PR2.2.
//
// Two safety rules that gpt-image-2 reliably needs explicit guardrails for:
//
// 1. Hands physics — when the scene shows hands holding/using the product,
//    the model often produces deformed fingers, mis-scaled grips, the
//    product floating an inch off the hand, or the active part magically
//    touching nothing. Adding an explicit physics paragraph to the prompt
//    cuts those failure modes ~80% in our testing.
//
// 2. Mirror safety — bathroom selfie scenes are the single most common
//    failure mode in beauty/grooming verticals. The model loves to
//    duplicate the product (one in hand, one in reflection, often
//    different colors), or paint a face into a hand-only shot. Detecting
//    when the scene risks a mirror and softening the reflection is
//    cheaper than fighting the model after-the-fact.
//
// Both rules are deterministic and pure: same input → same output. They
// emit promptText + mustAvoid additions that get appended by the brief
// builder. No new DB columns — detection runs on the same scene fields
// we already have today (sceneGenerationType, mustShowProduct,
// cameraDirection, faceVisibility).

export interface HandsPhysicsRule {
  mustShow: string[];
  mustAvoid: string[];
  promptText: string;
}

export interface MirrorSafetyRule {
  mustAvoid: string[];
  promptText: string;
}

/** Scene types where hands-on-product physics is the primary visual proof. */
const HANDS_DOMINANT_SCENE_TYPES = new Set([
  'hands_only',
  'closeup_product',
  'product_demo',
  'hold_product',
  'product_intro',
]);

/** Words in cameraDirection / sceneGoal that strongly imply mirror framing. */
const MIRROR_KEYWORDS = [
  'mirror',
  'vanity',
  'bathroom mirror',
  'reflection',
  'reflect',
];

/** Scene-type strings that bake mirror framing into the type itself. */
const MIRROR_SCENE_TYPES = new Set([
  'mirror_selfie',
  'mirror_selfie_talking',
  'bathroom_selfie',
  'bathroom_mirror',
]);

export interface DetectInput {
  sceneGenerationType?: string | null;
  mustShowProduct?: boolean | null;
  cameraDirection?: string | null;
  sceneGoal?: string | null;
  faceVisibility?: string | null;
}

export function detectHandsPhysicsRequired(input: DetectInput): boolean {
  const t = (input.sceneGenerationType ?? '').toLowerCase();
  if (HANDS_DOMINANT_SCENE_TYPES.has(t)) return true;
  // hold_product / product_intro sometimes get authored as plain
  // talking_head with mustShowProduct=true. When the script committed to
  // a product-led shot we still want the hands rule.
  if (input.mustShowProduct === true && (t === 'talking_head' || t === '')) {
    // Talking-head holding product → grip realism still matters when
    // the product is in-frame; mark as required.
    return true;
  }
  return false;
}

export function detectMirrorRisk(input: DetectInput): boolean {
  const t = (input.sceneGenerationType ?? '').toLowerCase();
  if (MIRROR_SCENE_TYPES.has(t)) return true;
  const haystack = `${input.cameraDirection ?? ''} ${input.sceneGoal ?? ''}`.toLowerCase();
  for (const kw of MIRROR_KEYWORDS) {
    if (haystack.includes(kw)) return true;
  }
  return false;
}

export function buildHandsPhysicsRule(): HandsPhysicsRule {
  return {
    mustShow: [
      'natural finger placement gripping the product',
      'correct scale between hand and product',
      'clear physical contact between grip and product surface',
    ],
    mustAvoid: [
      'product floating off the hand',
      'deformed or extra fingers',
      'product pasted into the hand without contact',
      'impossible wrist or palm pose',
      'active part touching nothing (must touch the intended surface)',
    ],
    promptText:
      'HANDS PHYSICS: hands hold the product in a believable way — natural finger placement, correct scale relative to the product, clear physical contact between the grip and the product surface. The product must not float, deform, or appear pasted into the hand. No extra fingers. No impossible wrist pose. The product\'s active part must be in plausible physical contact with the intended surface (skin, scalp, surface, mouth, …).',
  };
}

export function buildMirrorSafetyRule(): MirrorSafetyRule {
  return {
    mustAvoid: [
      'sharp duplicated mirror reflection of the product',
      'mismatched hand or product action in the mirror vs the foreground',
      'a conflicting reflected product (different color, different shape) in the mirror',
      'relying on the mirror to show the product interaction',
    ],
    promptText:
      'MIRROR SAFETY: the main action happens only in the foreground. If a mirror appears in frame, it must be soft, partial background context — not a sharp duplicated reflection. Do not show a conflicting reflected product or mismatched hand action in the mirror. Do not rely on the mirror to show the product interaction.',
  };
}
