// Prompt builder for gpt-image-2 scene generation.
//
// Architecture:
//   - Avatar image (Image 1) is the single source of truth for who the
//     character is. Same reference is reused for every scene → consistent
//     identity by construction.
//   - LLM-written brief carries setting / action / outfit / mood.
//   - Product image (Image 2 when present) keeps the packaging accurate.
//
// Style of the prompt itself: opening line is a vivid one-shot description
// in the style of awesome-gpt-image-2 / awesome-gpt-image-2-prompts. We
// don't load up the model with a paragraph of bullet rules before saying
// what we want — we tell it what we want first, then add constraints.

export interface SceneImagePromptInput {
  productName: string;
  productBrand?: string | null;
  productDescription?: string | null;
  sceneVisualBrief: string;
  sceneOrder: number;
  totalScenes: number;
  sceneType: string;
  aspectRatio: '9:16' | '1:1' | '16:9';
  avatarDescription?: string;
  avatarPresent?: boolean;
  productPresent?: boolean;
  // Optional safety appendage — set by the wrapper for sensitive categories
  // (fashion / shapewear / fitness / wellness) and bumped to an aggressive
  // version on auto-retry after a safety rejection. See scene-safety.ts.
  safetyTokens?: string;
}

// Camera/lens specs are added up-front so gpt-image-2 commits to a phone-camera
// aesthetic before reading the brief — pattern lifted from awesome-gpt-image-2
// "High-Fidelity Fashion Photography" (No.8): aspect, focal length, aperture,
// grain, depth — all stated in one sentence so the model doesn't drift to
// "stock photo" / "ad banner" looks.
const ASPECT_OPENER: Record<SceneImagePromptInput['aspectRatio'], string> = {
  '9:16':
    'Raw high-fidelity vertical phone photo, 9:16, eye-level, ~35mm equivalent, f/4, sharp subject, natural depth, authentic phone-camera grain',
  '1:1':
    'Raw high-fidelity square phone photo, 1:1, eye-level, ~35mm equivalent, f/4, sharp subject, natural depth, authentic phone-camera grain',
  '16:9':
    'Raw high-fidelity horizontal cinematic photo, 16:9, eye-level, ~35mm equivalent, f/2.8, sharp subject, natural depth, subtle film grain',
};

// Detect framing cues in the LLM-written brief and add an explicit composition
// directive PLUS the right physics rules. The mirror-selfie one is the most
// important because gpt-image-2's default mirror-selfie output gets the
// reflection physics wrong almost every time (phone screen facing camera
// instead of facing the mirror, arms on the wrong side, etc).
function detectFramingHint(brief: string): string | null {
  if (/(mirror selfie|in the mirror|mirror reflection)/i.test(brief)) {
    return [
      'Framing: MIRROR SELFIE — the camera is the MIRROR. We see the subject\'s reflection.',
      'Mirror physics (CRITICAL):',
      '- The subject holds the phone at chest height, arm bent ~90°, phone-holding hand visible in the reflection.',
      '- The phone in the mirror shows its BACK (the camera lens facing the mirror, NOT the screen). The lens points AT the mirror, so we see the lens module in the reflection.',
      '- The subject\'s eyes look at the MIRROR (so in the reflection, they look at the camera).',
      '- Light reflected in the mirror obeys real optics — same shadows on subject and reflection, no contradictory lighting.',
      '- The phone partially occludes the subject\'s face/chest in the reflection where it physically would.',
    ].join('\n');
  }
  if (/\bselfie\b/i.test(brief)) {
    return [
      "Framing: SELFIE (front-camera) — the subject holds their phone at arm's length, ~30cm from face, with a slight upward angle.",
      'Selfie physics (CRITICAL):',
      "- The phone-holding arm is clearly visible at the bottom-right edge of the frame: shoulder → bent elbow → forearm → wrist → hand gripping the phone. No floating arm, no missing forearm.",
      '- Mild wide-angle phone-camera distortion: the closer hand and forehead read slightly larger; nose is gently emphasized.',
      "- Direct eye contact with the lens (both pupils aligned to camera). Subtle catch-light from the room's main light source.",
      '- One face only. No accidental second face in the corner.',
    ].join('\n');
  }
  if (/(\bpov\b|point of view|close[- ]up of (my|her|his) hands?)/i.test(brief)) {
    return [
      "Framing: first-person POV — camera held by the subject, looking down at their own hands and the action.",
      "POV physics: we see the subject's hands/forearms entering the frame from the bottom. The hands have anatomically correct fingers (5 each) gripping objects with visible knuckles. We do NOT see the subject's face.",
    ].join('\n');
  }
  if (/over[- ]?the[- ]?shoulder|over the shoulder/i.test(brief)) {
    return 'Framing: over-the-shoulder — the camera sits behind the subject, looking past their shoulder at the hands / product / screen. We see the back of the head and shoulder in soft focus, the action in sharp focus on the far side.';
  }
  if (/\bclose[- ]?up\b/i.test(brief)) {
    return 'Framing: close-up — tight crop on the action (face, hands, or product); shallow depth of field, intimate feel. Hands visible in close-up MUST have anatomically correct fingers.';
  }
  return null;
}

// Anti-AI-tells / physics block. gpt-image-2's most common breakdowns:
//   - Six fingers, fused fingers, melted hands
//   - Phones held in physically impossible grips
//   - Mirror reflections that don't match the subject
//   - Floating products with no visible grip
//   - Inconsistent shadows (sun from left, shadow goes left)
//   - Doll-like skin / vacant eyes (we cover those via the bio-fidelity line)
// Adding this block reduces those failures dramatically. Keep it tight —
// gpt-image-2 weights the END of a long prompt less, and we already have
// a lot of other guidance up top.
const REALISM_CHECK = [
  'REALISM CHECK (critical for UGC believability):',
  '- Anatomy: every visible hand has exactly 5 fingers, natural wrist and elbow articulation, no extra or missing limbs, no fused fingers, ears mirror-symmetric, eyes both correctly aligned with matching catch-light.',
  '- Hand-object contact: when holding a product or phone, fingers visibly grip the object — knuckles visible, finger curvature follows the object\'s shape, no objects floating between fingers, no phantom thumbs.',
  '- Light direction: ONE primary light source. All shadows on subject, product, and surfaces fall in the same consistent direction. No contradictory shadows.',
  '- Surface contact: every object either rests on a surface (visible contact + soft shadow underneath) or is gripped by a visible hand. Nothing floats.',
  '- Scale: products are human-hand sized. A jar is jar-sized in the hand, a phone is phone-sized — not stretched, not shrunken.',
  '- Architecture: walls meet at 90° angles, doors are rectangular, mirrors are flat rectangles, no melted or warped lines on hard surfaces.',
  '- No AI tells: no plastic/wax skin, no glassy doll-eyes, no impossibly smooth gradients on faces, no garbled text on visible signs/labels (other than the product packaging, which stays accurate).',
].join('\n');

export function buildScenePrompt(input: SceneImagePromptInput): string {
  const opener = ASPECT_OPENER[input.aspectRatio];
  const productPresent = input.productPresent ?? true;
  const framingHint = detectFramingHint(input.sceneVisualBrief);

  if (input.avatarPresent) {
    // Open with the punchy framing line, then layer constraints.
    return [
      `${opener} of the EXACT person from Image 1, in this scene:`,
      ``,
      input.sceneVisualBrief,
      ``,
      framingHint ?? '',
      ``,
      `IDENTITY LOCK (most important):`,
      `- Use Image 1 as the ground truth for the person. Preserve ALL facial features: eye shape, eye color, brow shape and density, nose shape, mouth shape, jawline, cheekbones, hairline, hair density, hair color, exact hairstyle, skin tone, and apparent age.`,
      `- Bio-fidelity skin: visible pores, vellus hair, real hydration, refined natural highlights — do NOT smooth, retouch, or airbrush.`,
      `- If the scene description above mentions any character traits (age, gender, ethnicity, hair color, skin tone), IGNORE them. Image 1 is the only source of truth.`,
      `- Do NOT generate a different person.`,
      ``,
      productPresent
        ? `Image 2 = the PRODUCT. Keep its packaging, label, color, and shape exactly accurate. The product is in the frame, held or placed naturally — not pasted in. Hand grip on the product follows the rules in REALISM CHECK below.`
        : `(No product image is provided — describe the product naturally if the brief calls for it. No on-image text.)`,
      ``,
      REALISM_CHECK,
      ``,
      `Style: candid UGC phone-camera aesthetic, photorealistic, natural daylight, real-person imperfect (no glamour, no studio polish, no airbrush). Phone-camera realism: subtle handheld feel, slight overexposure on bright highlights, smartphone depth of field (medium DOF, not extreme bokeh), faint chromatic aberration at frame edges. No on-image text, no logos, no watermark.`,
      input.safetyTokens ? `` : '',
      input.safetyTokens ? `Content safety: ${input.safetyTokens}` : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  // No avatar — describe the scene fully and let the model design the person.
  return [
    `${opener} showing this scene:`,
    ``,
    input.sceneVisualBrief,
    ``,
    framingHint ?? '',
    productPresent
      ? `Image 1 = the PRODUCT. Keep its packaging, label, color, and shape exactly. Visible in the frame, held or placed naturally.`
      : '',
    REALISM_CHECK,
    `Style: candid UGC phone-camera aesthetic, photorealistic, natural daylight, real-person imperfect, no on-image text, no logos, no watermark.`,
    input.productName ? `Product: ${input.productName}.` : '',
    input.safetyTokens ? `Content safety: ${input.safetyTokens}` : '',
  ]
    .filter((l) => l && l !== '')
    .join('\n');
}

// Backwards-compatible aliases — both old names map to the new single builder.
export const buildFirstScenePrompt = buildScenePrompt;
export const buildContinuationScenePrompt = buildScenePrompt;
