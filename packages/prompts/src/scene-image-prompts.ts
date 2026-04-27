// Prompt builders for gpt-image-2 scene generation.
//
// Empirically, gpt-image-2 preserves identity best when the prompt is:
//   1. SHORT (long instructions get diluted)
//   2. Framed as "EDIT this image" (not "generate a new scene")
//   3. Lists the bare minimum face features to preserve
//
// We borrow this style from the cookbook section 5.2 (Virtual Try-On), where
// the model holds identity perfectly across major edits to the surrounding
// scene. Convention: avatar is always Image 1 (most influential slot).

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
}

const ASPECT_HINT: Record<SceneImagePromptInput['aspectRatio'], string> = {
  '9:16': 'vertical 9:16',
  '1:1': 'square 1:1',
  '16:9': 'horizontal 16:9',
};

// Scene 0 — references in order: [avatar?, product?]. Avatar is the identity
// anchor; the product is the visual reference. Frame as an edit operation.
export function buildFirstScenePrompt(input: SceneImagePromptInput): string {
  const aspect = ASPECT_HINT[input.aspectRatio];

  if (input.avatarPresent) {
    // Edit-style framing: take the avatar's face and place it in this scene.
    return [
      `Edit Image 1 (the AVATAR) to show this exact same person in a new scene.`,
      ``,
      `Scene: ${input.sceneVisualBrief}`,
      ``,
      `Image 2 = the PRODUCT. Keep its packaging, label, color, and shape exactly. The product is visible in the frame, held or placed naturally.`,
      ``,
      `DO NOT change Image 1's face, facial features, eye color, skin tone, hair color, or hair style.`,
      `DO NOT generate a different person — it must be unmistakably the same person from Image 1.`,
      `You may change pose, body framing, outfit (only if the scene calls for it), and surroundings.`,
      ``,
      `Style: ${aspect} candid UGC phone video, photorealistic, natural daylight, real-person imperfect, no text, no logos, no watermark.`,
    ].join('\n');
  }

  // No avatar — fall back to a generic, descriptive prompt.
  return [
    `Generate a candid UGC phone-video scene.`,
    ``,
    `Scene: ${input.sceneVisualBrief}`,
    ``,
    `Image 1 = the PRODUCT. Keep its packaging, label, color, and shape exactly. Visible in the frame, held or placed naturally.`,
    ``,
    `Style: ${aspect} photorealistic, natural daylight, real-person imperfect, no text, no logos, no watermark.`,
    input.productName ? `Product: ${input.productName}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

// Scenes 1..N — references in order: [avatar?, previousScene, product?].
// Same edit-style framing.
export function buildContinuationScenePrompt(input: SceneImagePromptInput): string {
  const aspect = ASPECT_HINT[input.aspectRatio];

  if (input.avatarPresent) {
    // Image 1 = avatar (identity), Image 2 = previous scene (continuity), Image 3 = product.
    return [
      `Continue the same UGC ad. The character is the same person as Image 1 (AVATAR). The scene continues from Image 2 (PREVIOUS SCENE).`,
      ``,
      `Next beat: ${input.sceneVisualBrief}`,
      ``,
      `Image 3 = the PRODUCT. Keep its packaging, label, color, and shape exactly.`,
      ``,
      `DO NOT change Image 1's face, eye color, skin tone, hair color, or hair style. The face must match Image 1 exactly.`,
      `Mirror the lighting, color temperature, time of day, and outfit from Image 2 (unless the new beat calls for an outfit change).`,
      ``,
      `Style: ${aspect} candid UGC phone video, photorealistic, no text, no logos, no watermark.`,
    ].join('\n');
  }

  // No avatar — anchor purely on previous scene.
  return [
    `Continue the same UGC ad. The character and setting are the same as Image 1 (PREVIOUS SCENE).`,
    ``,
    `Next beat: ${input.sceneVisualBrief}`,
    ``,
    `Image 2 = the PRODUCT. Keep its packaging, label, color, and shape exactly.`,
    ``,
    `DO NOT redesign the character. Mirror the lighting, color temperature, time of day, and outfit from Image 1.`,
    ``,
    `Style: ${aspect} candid UGC phone video, photorealistic, no text, no logos, no watermark.`,
  ].join('\n');
}
