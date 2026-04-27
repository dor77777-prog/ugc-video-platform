// Prompt builders for gpt-image-2 scene generation.
// The continuity strategy follows OpenAI's docs section 6.4 (Children's Book —
// Character Consistency) and section 5.2 (Virtual Try-On — identity lock).
//
// Convention: when an avatar is selected, we ALWAYS pass it as Image 1 (the
// model anchors most strongly on the first input). Previous-scene image (when
// present) and product image follow as Image 2 / Image 3.

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

// IDENTITY block — borrowed from OpenAI's own Virtual Try-On example (section
// 5.2). This is the language the model responds to most strongly when we want
// it to preserve a face from a reference image.
function identityLock(image: 'avatar' | 'previous' | 'both'): string {
  const subject = image === 'avatar' ? 'avatar reference' : image === 'previous' ? 'previous scene' : 'avatar reference and previous scene';
  return [
    `IDENTITY (CRITICAL — do not violate):`,
    `- The character in this image must be THE EXACT SAME PERSON as the ${subject}.`,
    `- Do NOT change their face, facial features, skin tone, body shape, hair color, hair style, eye color, or identity in any way.`,
    `- Preserve their exact likeness, expression style, and proportions.`,
    `- You may change pose, body framing, outfit (only if the scene brief calls for it), and surroundings — but the face must be unmistakably the same person.`,
    `- If the generated face is even slightly different from the reference, the result is wrong. Re-generate with the reference face if needed.`,
  ].join('\n');
}

// Scene 0 — inputs in order: [avatar?, product?].
export function buildFirstScenePrompt(input: SceneImagePromptInput): string {
  const labels: string[] = [];
  if (input.avatarPresent) {
    labels.push(
      `**Image ${labels.length + 1}** = the AVATAR reference. This is the locked identity for the entire ad — every scene must show this same person.${input.avatarDescription ? ` Descriptor: ${input.avatarDescription}.` : ''}`,
    );
  }
  labels.push(
    `**Image ${labels.length + 1}** = the PRODUCT reference photo. Its packaging, label, color, and shape must remain visually accurate; the product is the hero of the frame.`,
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
    input.avatarPresent ? identityLock('avatar') : '',
    ``,
    `**Scene brief:** ${input.sceneVisualBrief}`,
    ``,
    `**Style:** ${STYLE_BASE}`,
    `**Composition:** ${ASPECT_HINTS[input.aspectRatio]}`,
    ``,
    `**Continuity note:** This is the first scene of the ad. Establish the surroundings (location, lighting, time of day) clearly so subsequent scenes can echo them. ${input.avatarPresent ? 'The avatar IS the canonical character — preserve their face exactly.' : ''}`,
    ``,
    `Do NOT change the product appearance, packaging, or label. Do NOT add extra text in the image.`,
  ]
    .filter(Boolean)
    .join('\n');
}

// Scenes 1..N — inputs in order: [avatar?, previousSceneImage, product?].
// Avatar is Image 1 (when present) — most influential — so the face stays
// consistent. Previous scene is Image 2, providing setting/lighting continuity.
export function buildContinuationScenePrompt(input: SceneImagePromptInput): string {
  const labels: string[] = [];
  let n = 0;
  if (input.avatarPresent) {
    n++;
    labels.push(
      `**Image ${n}** = the AVATAR reference (the locked identity for the whole ad).${input.avatarDescription ? ` Descriptor: ${input.avatarDescription}.` : ''}`,
    );
  }
  n++;
  labels.push(
    `**Image ${n}** = the PREVIOUS scene of this exact ad. Mirror its setting, lighting, color temperature, and outfit (unless the new beat explicitly changes the outfit or location).`,
  );
  n++;
  labels.push(
    `**Image ${n}** = the PRODUCT reference photo. Packaging, label, color, and shape must remain visually accurate.`,
  );

  return [
    `# Scene ${input.sceneOrder + 1} of ${input.totalScenes} — ${input.sceneType}`,
    ``,
    `**Image inputs:**`,
    ...labels.map((l) => `- ${l}`),
    ``,
    input.avatarPresent ? identityLock('both') : identityLock('previous'),
    ``,
    `**Scene continuity (from the previous scene):**`,
    `- Same outfit and accessories unless the new beat explicitly changes them.`,
    `- Same lighting direction, color temperature, and time of day.`,
    `- Same location category (kitchen → kitchen counter is fine; kitchen → beach is NOT, unless the brief explicitly demands a location change).`,
    ``,
    `**Hard rules from the product reference:**`,
    `- Product packaging, label, color, and shape remain visually accurate.`,
    `- The product is held or placed naturally in the scene (not pasted in).`,
    ``,
    `**Scene brief (the new beat):** ${input.sceneVisualBrief}`,
    ``,
    `**Style:** ${STYLE_BASE}`,
    `**Composition:** ${ASPECT_HINTS[input.aspectRatio]}`,
    ``,
    `Do NOT redesign the character. Do NOT change the product appearance. Do NOT add extra text in the image. The result must read as the next moment in the same ad, captured by the same phone, in the same scene, with the same person.`,
  ].join('\n');
}
