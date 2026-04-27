// Prompt builders for gpt-image-2 scene generation.
// The continuity strategy follows OpenAI's docs section 6.4 (Children's Book —
// Character Consistency): the previous scene's image is passed in as Image 1
// (anchor), the product image as Image 2 (reference), and the prompt instructs
// the model to keep the character/style/lighting from Image 1 while advancing
// the narrative.

export interface SceneImagePromptInput {
  productName: string;
  productBrand?: string | null;
  productDescription?: string | null;
  // The user-editable English visual brief (from the LLM script).
  sceneVisualBrief: string;
  // 0-based scene index. Scene 0 has no previous-scene anchor.
  sceneOrder: number;
  totalScenes: number;
  sceneType: string;
  aspectRatio: '9:16' | '1:1' | '16:9';
  // Free-form descriptor of the chosen avatar ("late-twenties Israeli woman, casual style").
  // Empty string when no avatar was selected.
  avatarDescription?: string;
  // True when an avatar reference image is being passed alongside.
  avatarPresent?: boolean;
}

const ASPECT_HINTS: Record<SceneImagePromptInput['aspectRatio'], string> = {
  '9:16': 'Vertical 9:16 mobile portrait composition (the kind you see in TikTok / Reels / Stories).',
  '1:1': 'Square 1:1 composition.',
  '16:9': 'Horizontal 16:9 composition.',
};

const STYLE_BASE = [
  'Photorealistic candid UGC style: shot on a real phone, natural daylight (not studio).',
  'Imperfect, real, lived-in. No glossy retouching, no clip art, no stock-photo composition.',
  'No on-image text, no captions, no logos, no watermarks (the product label may stay visible).',
].join(' ');

// Scene 0: no previous scene to anchor on. Inputs (in order):
//   [avatar?, product?]
// The avatar (when provided) is the identity anchor for the entire ad. The
// product image is the appearance reference.
export function buildFirstScenePrompt(input: SceneImagePromptInput): string {
  // Build "Image 1 / Image 2" labels based on which references are passed.
  const labels: string[] = [];
  if (input.avatarPresent) {
    labels.push(
      `**Image ${labels.length + 1}** = the avatar reference. The character in the scene must match this person closely — same face, same approximate age, same hair, same skin tone, same general look. ${input.avatarDescription ? `Descriptor: ${input.avatarDescription}.` : ''}`,
    );
  }
  // (Product image label, when applicable.)
  labels.push(
    `**Image ${labels.length + 1}** = the product reference photo. Its packaging, label, color, and shape must remain visually accurate.`,
  );

  return [
    `# Scene ${input.sceneOrder + 1} of ${input.totalScenes} — ${input.sceneType}`,
    ``,
    `**Brand / Product:** ${input.productName}${input.productBrand ? ` (${input.productBrand})` : ''}.`,
    input.productDescription ? `**Product context:** ${input.productDescription.slice(0, 400)}` : '',
    ``,
    `**Image inputs:**`,
    ...labels.map((l) => `- ${l}`),
    ``,
    `**Scene brief:** ${input.sceneVisualBrief}`,
    ``,
    `**Style:** ${STYLE_BASE}`,
    `**Composition:** ${ASPECT_HINTS[input.aspectRatio]}`,
    `**Continuity note:** This is the first scene — establish the main character clearly (their face, hair, outfit, surroundings) so the next scenes can preserve them. ${input.avatarPresent ? 'Treat the avatar reference as the canonical identity.' : 'The character feels Israeli / Mediterranean unless the brief says otherwise.'}`,
    ``,
    `Do NOT change the product appearance, packaging, or label. Do NOT add extra text in the image. Do NOT redraw the avatar's face — preserve it.`,
  ]
    .filter(Boolean)
    .join('\n');
}

// Scenes 1..N. Inputs (in order):
//   [previousSceneImage, avatar?, product?]
// Image 1 (previous scene) is the strongest continuity anchor. Avatar (if
// provided) reinforces face/identity. Product preserves packaging fidelity.
export function buildContinuationScenePrompt(input: SceneImagePromptInput): string {
  const labels: string[] = [
    `**Image 1** = the previous scene of this exact ad. Treat it as the visual anchor.`,
  ];
  if (input.avatarPresent) {
    labels.push(
      `**Image ${labels.length + 1}** = the avatar reference. The face/identity in the new scene must match this person and Image 1.`,
    );
  }
  labels.push(
    `**Image ${labels.length + 1}** = the product reference photo. Packaging, label, color, and shape must remain visually accurate.`,
  );

  return [
    `# Scene ${input.sceneOrder + 1} of ${input.totalScenes} — ${input.sceneType}`,
    ``,
    `**Image inputs:**`,
    ...labels.map((l) => `- ${l}`),
    ``,
    `**Goal:** Continue the same story to the next narrative beat without breaking visual continuity.`,
    ``,
    `**Hard continuity rules from Image 1 (the previous scene):**`,
    `- Same person / character (same gender, age, ethnicity, body type, hair, skin tone, expression style).`,
    `- Same outfit and accessories unless the new beat explicitly changes them.`,
    `- Same lighting direction, color temperature, and time of day.`,
    `- Same location category (kitchen → kitchen counter → kitchen island is fine; kitchen → beach is NOT — only allow location changes if the brief explicitly demands one).`,
    input.avatarPresent
      ? `- Cross-check the face with the avatar reference image — both must agree.`
      : '',
    ``,
    `**Hard rules from the product reference:**`,
    `- Product packaging, label, color, and shape remain visually accurate.`,
    `- The product is held / placed naturally in the scene (not pasted in).`,
    ``,
    `**Scene brief (the new beat):** ${input.sceneVisualBrief}`,
    ``,
    `**Style:** ${STYLE_BASE}`,
    `**Composition:** ${ASPECT_HINTS[input.aspectRatio]}`,
    ``,
    `Do NOT redesign the character. Do NOT change the product appearance. Do NOT add extra text in the image. The result must read as the next moment in the same ad, captured by the same phone, in the same scene.`,
  ]
    .filter(Boolean)
    .join('\n');
}
