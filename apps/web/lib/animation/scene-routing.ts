// Scene-routing rules: decide which scenes need a lip-sync pass.
//
// The rule is conservative: only treat a scene as "talking head" when
// the cameraDirection and sceneGoal both point to a clearly-visible
// speaking face. When in doubt, return false — a silent clip with
// audio muxed at composition is always recoverable, while a bad
// lip-sync pass on a hands-only scene is wasted Kling spend.

export type SceneGenerationType =
  | 'talking_head'
  | 'selfie_talking'
  | 'mirror_selfie_talking'
  | 'product_demo'
  | 'broll'
  | 'lifestyle'
  | 'hands_only'
  | 'closeup_product'
  | 'before_after';

export type FaceVisibility =
  | 'clear_front_facing'
  | 'partial_face'
  | 'profile'
  | 'no_face';

export interface SceneRouting {
  sceneGenerationType: SceneGenerationType;
  faceVisibility: FaceVisibility;
  requiresLipSync: boolean;
}

// Words that indicate the scene is product-focused / hands-on, even if
// "selfie" appears in the camera direction. Common LLM pattern: "selfie
// POV of hand pouring HydroPure into a tier-elevated on the kitchen counter" —
// this is a PRODUCT DEMO with selfie framing, NOT a talking head. Apply
// these as a HARD VETO before routing to selfie_talking.
const PRODUCT_DEMO_VETO_PATTERNS = [
  /\bhand(s)?\b/,           // "hand holding", "hands pouring"
  /\bhold(?:ing|s)?\b/,
  /\bpour(?:ing|s)?\b/,
  /\bmix(?:ing|es)?\b/,
  /\bspray(?:ing|s)?\b/,
  /\bappl(?:y|ies|ying)\b/, // applying serum
  /\btip(?:ping|s)?\b/,
  /\bopen(?:ing|s)?\b/,     // opening package
  /\bsqueez(?:ing|es)?\b/,
  /\bclose[- ]?up\b/,
  /\bcounter\b/,
  /\bcountertop\b/,
  /\bvanity\b/,
  /\bproduct\b/,
  /\bbottle\b/,
  /\bjar\b/,
  /\btube\b/,
  /\bbox\b/,
  /\bpackag(?:e|ing)\b/,
  /\bfridge\b/,
  /\bkitchen\b/,
  /\bbathroom\b/,
];

function looksLikeProductDemoFraming(cd: string): boolean {
  return PRODUCT_DEMO_VETO_PATTERNS.some((re) => re.test(cd));
}

// Derive routing from the scene's existing fields. Used at script-parse
// time and as a fallback for legacy scenes that don't have explicit
// scene_generation_type set.
//
// Conservatism rule: only classify as talking-head when the camera
// direction is UNAMBIGUOUSLY about the speaking face. "selfie POV"
// alone doesn't qualify — the LLM uses that phrasing for almost
// everything. We veto any selfie line that mentions hands, product,
// surfaces, or close-up framing (typical product-demo language).
export function deriveSceneRouting(input: {
  cameraDirection?: string | null;
  sceneGoal?: string | null;
  sceneType?: string | null;
}): SceneRouting {
  const cd = (input.cameraDirection ?? '').toLowerCase();
  const goal = (input.sceneGoal ?? '').toLowerCase();

  // Hands / product / surface mentions → never talking-head, regardless
  // of "selfie" wording. Route to product_demo / hands_only / closeup
  // based on the most specific signal we can read.
  if (looksLikeProductDemoFraming(cd)) {
    if (/hands?[- ]?only|tight close[- ]?up of hands/.test(cd)) {
      return { sceneGenerationType: 'hands_only', faceVisibility: 'no_face', requiresLipSync: false };
    }
    if (/close[- ]?up.*(product|bottle|jar|tube|box|packag)/.test(cd)) {
      return { sceneGenerationType: 'closeup_product', faceVisibility: 'no_face', requiresLipSync: false };
    }
    if (/before.?after|split[- ]?screen/.test(cd)) {
      return { sceneGenerationType: 'before_after', faceVisibility: 'partial_face', requiresLipSync: false };
    }
    return { sceneGenerationType: 'product_demo', faceVisibility: 'partial_face', requiresLipSync: false };
  }

  // Pure selfie talking — face only. cameraDirection mentions selfie AND
  // doesn't mention any product/hand/surface (cleared by the veto above).
  if (/mirror selfie/.test(cd)) {
    return {
      sceneGenerationType: 'mirror_selfie_talking',
      faceVisibility: 'clear_front_facing',
      requiresLipSync: true,
    };
  }
  if (/selfie/.test(cd) && !/no.?face|profile/.test(cd)) {
    return {
      sceneGenerationType: 'selfie_talking',
      faceVisibility: 'clear_front_facing',
      requiresLipSync: true,
    };
  }

  // Other signals.
  if (/over[- ]?the[- ]?shoulder|over.?shoulder/.test(cd)) {
    return { sceneGenerationType: 'lifestyle', faceVisibility: 'partial_face', requiresLipSync: false };
  }
  if (/before.?after|split[- ]?screen/.test(cd)) {
    return { sceneGenerationType: 'before_after', faceVisibility: 'partial_face', requiresLipSync: false };
  }
  if (/demo|demonstrat/.test(cd) || /demonstrate|prove_it_works/.test(goal)) {
    return { sceneGenerationType: 'product_demo', faceVisibility: 'partial_face', requiresLipSync: false };
  }

  // Default: ambiguous → safer not to lip-sync.
  return { sceneGenerationType: 'broll', faceVisibility: 'partial_face', requiresLipSync: false };
}
