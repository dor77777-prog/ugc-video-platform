// Prompt builder for gpt-image-2 scene generation.
//
// New architecture (2026-04-28): every scene is generated independently from
// the avatar reference. We don't pass the previous scene as a reference image,
// because empirically that caused identity drift to compound across scenes.
// Instead:
//   - Avatar image (always Image 1) is the single source of truth for who
//     the character is. Same reference is used for every scene → consistent
//     identity by construction.
//   - The scene description (text-only) carries setting/lighting/outfit
//     continuity hints (the LLM already writes "same kitchen as scene 1,
//     same warm evening lamp light, same outfit").
//   - Product image (Image 2 when present) keeps the packaging accurate.
//
// One builder for all scenes — there's no longer a meaningful difference
// between scene 0 and scene N>0 because each is anchored to the avatar
// directly.

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

const ASPECT_HINT: Record<SceneImagePromptInput['aspectRatio'], string> = {
  '9:16': 'vertical 9:16',
  '1:1': 'square 1:1',
  '16:9': 'horizontal 16:9',
};

// Detect framing cues in the LLM-written brief and add explicit composition
// instructions. Without this, gpt-image-2 might say "selfie" but render a
// third-person shot of the person standing still.
function detectFramingHints(brief: string): string[] {
  const hints: string[] = [];
  if (/(mirror selfie|in the mirror|mirror reflection)/i.test(brief)) {
    hints.push(
      'FRAMING: This is a MIRROR SELFIE. The person stands in front of a mirror and HOLDS THEIR PHONE at chest height with arm slightly extended. The phone is clearly visible in their hand. The view is the reflection — we see the person looking at the mirror with the phone visible.',
    );
  } else if (/\bselfie\b/i.test(brief)) {
    hints.push(
      "FRAMING: This is a SELFIE shot. The person HOLDS THEIR PHONE at arm's length with the camera pointed at themselves. The arm holding the phone is visible at the bottom or edge of the frame. They look directly into the camera, slight upward angle.",
    );
  } else if (/(\bpov\b|point of view|close[- ]up of (my|her|his) hands?)/i.test(brief)) {
    hints.push(
      "FRAMING: This is a first-person POV shot. The camera is held by the person, looking down at their own hands and the action. We don't see the person's face — we see what they see.",
    );
  } else if (/over[- ]?the[- ]?shoulder|over the shoulder/i.test(brief)) {
    hints.push(
      'FRAMING: Over-the-shoulder shot — the camera sits behind the person, looking at the hands / product / screen.',
    );
  }
  return hints;
}

export function buildScenePrompt(input: SceneImagePromptInput): string {
  const aspect = ASPECT_HINT[input.aspectRatio];
  const productPresent = input.productPresent ?? true;
  const framingHints = detectFramingHints(input.sceneVisualBrief);

  if (input.avatarPresent) {
    // Avatar is Image 1; product (if present) is Image 2.
    const lines: (string | null)[] = [
      `Edit Image 1 (the AVATAR) to show this exact same person in a new scene.`,
      ``,
      `IDENTITY (most important rule):`,
      `- The person in the result is the EXACT person from Image 1. Same face, eyes, skin tone, hair color, hair style, age.`,
      `- If the scene description below mentions any character traits (age, gender, hair color, skin tone), IGNORE THOSE — Image 1 is the only source of truth for who the person is.`,
      `- Do NOT generate a different person.`,
      ``,
      ...framingHints.map((h) => h),
      framingHints.length > 0 ? '' : null,
      `Scene (use ONLY for setting, action, composition — ignore any character details):`,
      input.sceneVisualBrief,
      ``,
      productPresent
        ? `Image 2 = the PRODUCT. Keep its packaging, label, color, and shape exactly. Visible in the frame, held or placed naturally.`
        : `(No product image — describe the product if the brief calls for it.)`,
      ``,
      `Style: ${aspect} candid UGC phone video, photorealistic, natural daylight, real-person imperfect, no text, no logos, no watermark.`,
    ];
    return lines.filter((l) => l !== null).join('\n');
  }

  // No avatar — fall back to a fully descriptive prompt.
  return [
    `Generate a candid UGC phone-video scene.`,
    ``,
    `Scene: ${input.sceneVisualBrief}`,
    ``,
    productPresent
      ? `Image 1 = the PRODUCT. Keep its packaging, label, color, and shape exactly. Visible in the frame, held or placed naturally.`
      : '',
    `Style: ${aspect} photorealistic, natural daylight, real-person imperfect, no text, no logos, no watermark.`,
    input.productName ? `Product: ${input.productName}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// Backwards-compatible aliases — both old names map to the new single builder.
export const buildFirstScenePrompt = buildScenePrompt;
export const buildContinuationScenePrompt = buildScenePrompt;
