// Animation Plan Builder — V13 PR3.
//
// Deterministic (no LLM) — composes a strict animation contract from the
// scene fields + optional vision-grounded motion analysis. The output is
// a typed AnimationPlan that the Kling prompt builder reads to decide
// what should move, what stays still, and what is forbidden.
//
// Why deterministic: same input → same plan, just like the Image Brief
// builder. Prevents the per-call drift where Kling animates a "product
// demo" frame as if it were a talking head because the prompt happened
// to mention the creator. The plan is the contract — the prompt is the
// rendered form of the contract.
//
// No DB column for the plan in PR3 — it lives in memory between
// clip-impl building it and kling.ts reading it. A later debug-panel PR
// may persist it to Scene.animationPlanJson; the type is shaped for that.

import type { MotionAnalysis, NarrativeRole } from './motion-analysis';

export type AnimationMotionSubject =
  | 'hands'
  | 'product'
  | 'person'
  | 'environment'
  | 'camera_only';

export type AnimationCameraMotion =
  | 'static'
  | 'subtle_handheld'
  | 'slow_push_in'
  | 'slow_pull_back';

export interface AnimationPlan {
  /** One-line description of what the animation must accomplish. */
  animationGoal: string;
  /** Primary moving element. One of five canonical subjects. */
  motionSubject: AnimationMotionSubject;
  /** Optional second subject (V13 §10 table notes hands+product etc.). */
  secondarySubject?: AnimationMotionSubject;
  /** Camera vocabulary — kept conservative; aggressive camera ruins lipsync. */
  cameraMotion: AnimationCameraMotion;
  /** Free-text description of object motion (e.g. "product rotates slightly so the label catches the light"). */
  objectMotion: string;
  /** Free-text description of human motion (e.g. "natural breath, occasional blink"). */
  humanMotion: string;
  /** Things Kling MUST NOT do. Merge into the negative_prompt downstream. */
  forbiddenMotion: string[];
  /** When true, the input frame's composition must be preserved through animation. */
  preserveComposition: boolean;
  /** When true, the product must remain visible from start to finish. */
  preserveProductVisibility: boolean;
  /** When true, suppress any tendency for Kling to crop in to the face. */
  avoidFaceZoom: boolean;
  /** When true, the still is a silent talking plate — speak silently. */
  speakingExpected: boolean;
  /** V14+ — physical contact points lifted from MotionAnalysis. The
   *  per-provider renderers fold these into the prompt so the model
   *  understands WHERE the hands are anchored. Empty for non-touching scenes. */
  contactAnchors?: string[];
  /** V14+ — duration in seconds the primary action arc takes.
   *  0 = no arc (static or continuous ambient only). */
  motionTimeframeSeconds?: number;
  /** V14+ — explicit end-state for the primary motion. Without this,
   *  i2v models loop or vibrate at the tail. */
  motionEndpoint?: string;
  /** V14+ — narrative function this scene plays in the script arc. */
  narrativeRole?: NarrativeRole;
  /** V14+ — emotional tone the motion should carry, 2-6 words. */
  emotionalTone?: string;
}

export interface BuildAnimationPlanInput {
  /** Routing-derived scene type (talking_head / product_demo / hands_only / closeup_product / problem_visual / hold_product / cta_visual / lifestyle / broll / mirror_selfie / etc.). */
  sceneGenerationType?: string | null;
  /** When true, the still is a "silent talking plate" — speak silently for downstream lip-sync. */
  requiresLipSync?: boolean;
  /** V4 product-first metadata. */
  primarySubject?: string | null;
  mustShowProduct?: boolean | null;
  productVisibilityPriority?: string | null;
  cameraFocus?: string | null;
  showFace?: boolean | null;
  /** Optional vision-grounded analysis from motion-analysis.ts. When
   *  present, its primaryAction / preserveElements / framingRisks
   *  override the table defaults — it knows what's actually in the frame. */
  motionAnalysis?: MotionAnalysis | null;
  /** Optional flags from the Image Brief — when the brief decided the
   *  scene needs hands physics or mirror safety, the animation plan
   *  carries the same constraint into the motion contract. */
  handsPhysicsRequired?: boolean;
  mirrorRisk?: boolean;
  contactProofRequired?: boolean;
}

const PROBLEM_TYPES = new Set([
  'problem_visual',
  'problem_context',
  'failed_method',
  'before_state',
]);

const TALKING_TYPES = new Set([
  'talking_head',
  'selfie_talking',
  'mirror_selfie_talking',
]);

const PRODUCT_DEMO_TYPES = new Set(['product_demo', 'hands_only']);

/** Scene-type → default cameraMotion / motionSubject / forbiddenMotion.
 *  Mirrors V13 §10.3 table; values remain canonical strings so the
 *  Kling prompt builder can switch on them. */
function tableDefaults(sceneType: string): {
  cameraMotion: AnimationCameraMotion;
  motionSubject: AnimationMotionSubject;
  secondarySubject?: AnimationMotionSubject;
  forbidden: string[];
} {
  if (TALKING_TYPES.has(sceneType)) {
    return {
      cameraMotion: 'static',
      motionSubject: 'person',
      forbidden: ['face zoom', 'exaggerated mouth', 'cartoon lips'],
    };
  }
  if (sceneType === 'hold_product' || sceneType === 'product_intro') {
    return {
      cameraMotion: 'static',
      motionSubject: 'product',
      secondarySubject: 'person',
      forbidden: ['face zoom', 'product disappearing', 'product cropped'],
    };
  }
  if (sceneType === 'product_demo') {
    return {
      cameraMotion: 'subtle_handheld',
      motionSubject: 'hands',
      secondarySubject: 'product',
      forbidden: ['face zoom', 'selfie pivot', 'product morph', 'label warp'],
    };
  }
  if (sceneType === 'hands_only') {
    return {
      cameraMotion: 'subtle_handheld',
      motionSubject: 'hands',
      secondarySubject: 'product',
      forbidden: ['face zoom', 'face appearing in frame', 'selfie pivot', 'product morph'],
    };
  }
  if (sceneType === 'closeup_product') {
    return {
      cameraMotion: 'static',
      motionSubject: 'product',
      forbidden: ['morph', 'label warp', 'shape distortion', 'face zoom'],
    };
  }
  if (PROBLEM_TYPES.has(sceneType)) {
    return {
      cameraMotion: 'subtle_handheld',
      motionSubject: 'environment',
      secondarySubject: 'hands',
      forbidden: ['abrupt cut', 'product appearing in frame', 'overproduced motion'],
    };
  }
  if (sceneType === 'cta_visual') {
    return {
      cameraMotion: 'slow_push_in',
      motionSubject: 'product',
      forbidden: ['face zoom', 'motion clutter', 'multiple competing focal points'],
    };
  }
  if (sceneType === 'lifestyle' || sceneType === 'broll') {
    return {
      cameraMotion: 'subtle_handheld',
      motionSubject: 'environment',
      forbidden: ['dramatic camera movement', 'face zoom', 'overproduced motion'],
    };
  }
  // Unknown — conservative default.
  return {
    cameraMotion: 'static',
    motionSubject: 'person',
    forbidden: ['exaggerated motion', 'dramatic camera movement'],
  };
}

function dedupe<T>(xs: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of xs) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

export function buildAnimationPlan(input: BuildAnimationPlanInput): AnimationPlan {
  const sceneType = (input.sceneGenerationType ?? '').toLowerCase();
  const defaults = tableDefaults(sceneType);

  let cameraMotion: AnimationCameraMotion = defaults.cameraMotion;
  let motionSubject: AnimationMotionSubject = defaults.motionSubject;
  const secondarySubject: AnimationMotionSubject | undefined = defaults.secondarySubject;
  const forbiddenMotion: string[] = [...defaults.forbidden];

  // V4 cameraFocus overrides the camera vocabulary when the script LLM
  // committed to a specific frame intent.
  if (input.cameraFocus === 'product') {
    cameraMotion = 'static';
  } else if (input.cameraFocus === 'action') {
    cameraMotion = 'subtle_handheld';
  } else if (input.cameraFocus === 'face') {
    cameraMotion = 'static';
  }

  // V4 primarySubject can flip motionSubject when the script tilted the
  // composition toward the product even on a talking-type scene.
  if (input.primarySubject === 'product' || input.primarySubject === 'product_with_avatar') {
    motionSubject = 'product';
  } else if (input.primarySubject === 'product_in_use' || input.primarySubject === 'hands') {
    motionSubject = 'hands';
  }

  // showFace=false → suppress any face-zoom risk regardless of scene type.
  const avoidFaceZoom =
    input.showFace === false ||
    motionSubject === 'product' ||
    motionSubject === 'hands' ||
    motionSubject === 'environment' ||
    PRODUCT_DEMO_TYPES.has(sceneType) ||
    sceneType === 'closeup_product' ||
    sceneType === 'cta_visual';
  if (avoidFaceZoom) forbiddenMotion.push('face zoom');

  // Mirror risk → forbid duplicated reflection animation in the clip.
  if (input.mirrorRisk) {
    forbiddenMotion.push('duplicated mirror reflection of the product');
    forbiddenMotion.push('mismatched hand or product action in the mirror vs the foreground');
  }

  // Hands physics → forbid impossible hand poses appearing as the clip animates.
  if (input.handsPhysicsRequired) {
    forbiddenMotion.push('product floating off the hand');
    forbiddenMotion.push('deformed or extra fingers');
    forbiddenMotion.push('active part touching nothing');
  }

  // Contact proof → forbid the active part losing contact during the clip.
  if (input.contactProofRequired) {
    forbiddenMotion.push('active part lifting off the contact surface mid-clip');
  }

  // mustShowProduct → product must remain visible end-to-end.
  const preserveProductVisibility =
    input.mustShowProduct === true ||
    motionSubject === 'product' ||
    secondarySubject === 'product';
  if (preserveProductVisibility) {
    forbiddenMotion.push('product disappearing from frame');
    forbiddenMotion.push('product cropped out by camera move');
  }

  // Vision-grounded analysis: when present, override objectMotion /
  // humanMotion with the analysis-derived primaryAction so Kling
  // animates what's REALLY in the frame.
  let humanMotion: string;
  let objectMotion: string;
  if (input.motionAnalysis) {
    const a = input.motionAnalysis;
    const primary = a.primaryAction ?? '';
    const secondary = a.secondaryMotions?.length ? ` (also: ${a.secondaryMotions.join(', ')})` : '';
    if (motionSubject === 'product' || motionSubject === 'environment' || motionSubject === 'camera_only') {
      objectMotion = `${primary}${secondary}`;
      humanMotion = sceneType === 'talking_head' ? 'silent natural breath, occasional blink' : 'minimal supporting movement';
    } else {
      humanMotion = `${primary}${secondary}`;
      objectMotion = 'product remains stable, no morphing, no warping';
    }
    if (a.framingRisks?.length) {
      for (const risk of a.framingRisks) forbiddenMotion.push(risk);
    }
  } else {
    // Fall-back vocabulary when no vision analysis is available.
    humanMotion =
      input.requiresLipSync || TALKING_TYPES.has(sceneType)
        ? 'subtle silent speaking — small breath, mouth forms words, natural blink, micro-eyebrow raise'
        : sceneType === 'product_demo' || sceneType === 'hands_only'
          ? 'hands move with intent, smooth grip, no jerky motion'
          : 'minimal supporting movement, natural breath';
    objectMotion =
      sceneType === 'closeup_product'
        ? 'very slow drift, surface highlights shift across packaging'
        : sceneType === 'product_demo' || sceneType === 'hands_only'
          ? 'product is held steady, label catches the light, smooth purposeful motion'
          : 'product remains stable in frame, no morphing, no warping';
  }

  const speakingExpected =
    input.requiresLipSync === true ||
    (input.requiresLipSync !== false && TALKING_TYPES.has(sceneType));

  // Animation goal — short human-readable summary used by the Kling
  // prompt and surfaced in admin debug.
  const animationGoal = (() => {
    if (speakingExpected) return 'silent talking plate that downstream lip-sync can drive';
    if (sceneType === 'product_demo') return 'show the product mechanism in motion';
    if (sceneType === 'hands_only') return 'show hands using the product correctly';
    if (sceneType === 'closeup_product') return 'reveal product detail through subtle light shift';
    if (PROBLEM_TYPES.has(sceneType)) return 'communicate the pain through subtle environmental motion';
    if (sceneType === 'cta_visual') return 'clean product-led closing motion with slight push-in';
    if (sceneType === 'hold_product' || sceneType === 'product_intro')
      return 'introduce the product with steady framing';
    return 'natural ambient motion that preserves composition';
  })();

  // V14+ — carry physics + narrative fields straight off the
  // MotionAnalysis when present. The renderers downstream fold them
  // into the per-provider prompt; if the analysis is absent (legacy
  // cache or vision call failed), these stay undefined and the
  // renderers fall back to the existing humanMotion / objectMotion text.
  const contactAnchors = input.motionAnalysis?.contactAnchors?.length
    ? [...input.motionAnalysis.contactAnchors]
    : undefined;
  const motionTimeframeSeconds =
    typeof input.motionAnalysis?.motionTimeframeSeconds === 'number'
      ? input.motionAnalysis.motionTimeframeSeconds
      : undefined;
  const motionEndpoint = input.motionAnalysis?.motionEndpoint?.trim()
    ? input.motionAnalysis.motionEndpoint.trim()
    : undefined;
  const narrativeRole = input.motionAnalysis?.narrativeRole;
  const emotionalTone = input.motionAnalysis?.emotionalTone?.trim()
    ? input.motionAnalysis.emotionalTone.trim()
    : undefined;

  return {
    animationGoal,
    motionSubject,
    secondarySubject,
    cameraMotion,
    objectMotion,
    humanMotion,
    forbiddenMotion: dedupe(forbiddenMotion),
    preserveComposition: true,
    preserveProductVisibility,
    avoidFaceZoom,
    speakingExpected,
    contactAnchors,
    motionTimeframeSeconds,
    motionEndpoint,
    narrativeRole,
    emotionalTone,
  };
}
