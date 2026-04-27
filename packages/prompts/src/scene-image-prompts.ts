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

export function buildScenePrompt(input: SceneImagePromptInput): string {
  const aspect = ASPECT_HINT[input.aspectRatio];
  const productPresent = input.productPresent ?? true;

  if (input.avatarPresent) {
    // Avatar is Image 1; product (if present) is Image 2.
    return [
      `Edit Image 1 (the AVATAR) to show this exact same person in a new scene.`,
      ``,
      `IDENTITY (most important rule):`,
      `- The person in the result is the EXACT person from Image 1. Same face, eyes, skin tone, hair color, hair style, age.`,
      `- If the scene description below mentions any character traits (age, gender, hair color, skin tone), IGNORE THOSE — Image 1 is the only source of truth for who the person is.`,
      `- Do NOT generate a different person.`,
      ``,
      `Scene (use ONLY for setting, action, composition — ignore any character details):`,
      input.sceneVisualBrief,
      ``,
      productPresent
        ? `Image 2 = the PRODUCT. Keep its packaging, label, color, and shape exactly. Visible in the frame, held or placed naturally.`
        : `(No product image is provided for this scene — describe the product naturally if the brief calls for it, but no on-image text or logos.)`,
      ``,
      `Style: ${aspect} candid UGC phone video, photorealistic, natural daylight, real-person imperfect, no text, no logos, no watermark.`,
    ].join('\n');
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
