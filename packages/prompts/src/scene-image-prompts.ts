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
}

const ASPECT_OPENER: Record<SceneImagePromptInput['aspectRatio'], string> = {
  '9:16': 'A realistic vertical smartphone photo',
  '1:1': 'A realistic square smartphone photo',
  '16:9': 'A realistic horizontal cinematic photo',
};

// Detect framing cues in the LLM-written brief and add an explicit composition
// directive. Without this, gpt-image-2 might say "selfie" but render a
// third-person shot of someone standing still.
function detectFramingHint(brief: string): string | null {
  if (/(mirror selfie|in the mirror|mirror reflection)/i.test(brief)) {
    return 'Framing: MIRROR SELFIE — the person stands in front of a mirror and holds their phone at chest height, arm slightly extended; the phone is clearly visible in their hand; the view is the reflection (we see them looking at the mirror with the phone visible).';
  }
  if (/\bselfie\b/i.test(brief)) {
    return "Framing: SELFIE — the person holds their phone at arm's length with the camera pointed at themselves; the phone-holding arm is visible at the edge of the frame; eye contact with the camera, slight upward angle.";
  }
  if (/(\bpov\b|point of view|close[- ]up of (my|her|his) hands?)/i.test(brief)) {
    return "Framing: first-person POV — camera held by the person, looking down at their own hands and the action; we don't see the person's face, we see what they see.";
  }
  if (/over[- ]?the[- ]?shoulder|over the shoulder/i.test(brief)) {
    return 'Framing: over-the-shoulder — the camera sits behind the person, looking at the hands / product / screen.';
  }
  if (/\bclose[- ]?up\b/i.test(brief)) {
    return 'Framing: close-up — tight crop on the action (face, hands, or product); shallow depth of field, intimate feel.';
  }
  return null;
}

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
      `- Use Image 1 as the ground truth for the person — same face, eyes, skin tone, hair color, hair style, age.`,
      `- If the scene description above mentions any character traits (age, gender, hair color, skin tone), IGNORE them. Image 1 is the only source of truth.`,
      `- Do NOT generate a different person.`,
      ``,
      productPresent
        ? `Image 2 = the PRODUCT. Keep its packaging, label, color, and shape exactly accurate. The product is in the frame, held or placed naturally — not pasted in.`
        : `(No product image is provided — describe the product naturally if the brief calls for it. No on-image text.)`,
      ``,
      `Style: candid UGC phone-camera aesthetic, photorealistic, natural daylight, real-person imperfect (no glamour, no studio polish, no airbrush), no on-image text, no logos, no watermark.`,
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
    `Style: candid UGC phone-camera aesthetic, photorealistic, natural daylight, real-person imperfect, no on-image text, no logos, no watermark.`,
    input.productName ? `Product: ${input.productName}.` : '',
  ]
    .filter((l) => l && l !== '')
    .join('\n');
}

// Backwards-compatible aliases — both old names map to the new single builder.
export const buildFirstScenePrompt = buildScenePrompt;
export const buildContinuationScenePrompt = buildScenePrompt;
