import OpenAI, { toFile } from 'openai';
import {
  buildFirstScenePrompt,
  buildContinuationScenePrompt,
  type SceneImagePromptInput,
} from '@ugc-video/prompts';
import { LlmConfigError } from './scripts';

export type ImageQuality = 'low' | 'medium' | 'high';
export type AspectRatio = '9:16' | '1:1' | '16:9';

// Resolution choices that satisfy gpt-image-2 constraints (multiples of 16,
// total pixels in the legal range). 1024x1792 is closest to true 9:16.
const SIZES: Record<AspectRatio, `${number}x${number}`> = {
  '9:16': '1024x1792',
  '1:1': '1024x1024',
  '16:9': '1792x1024',
};

export interface SceneImageInput {
  productImageUrl: string | null; // hero image URL from step 1
  previousSceneImageUrl: string | null; // null for scene 0
  promptInput: SceneImagePromptInput;
  quality?: ImageQuality;
}

export interface SceneImageResult {
  base64: string;
  promptUsed: string;
  model: string;
  quality: ImageQuality;
  size: string;
  durationMs: number;
}

export async function generateSceneImage(input: SceneImageInput): Promise<SceneImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LlmConfigError(
      'OPENAI_API_KEY is not set. Add it to .env to enable scene image generation.',
    );
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  const isFirstScene = input.previousSceneImageUrl == null || input.promptInput.sceneOrder === 0;
  // Scene 0 uses high quality so the identity gets locked in cleanly — that
  // image then becomes the anchor for every subsequent scene. Scenes 1+ stay
  // at medium since they inherit identity from scene 0 + the avatar.
  const quality: ImageQuality = input.quality ?? (isFirstScene ? 'high' : 'medium');
  const size = SIZES[input.promptInput.aspectRatio];
  const prompt = isFirstScene
    ? buildFirstScenePrompt(input.promptInput)
    : buildContinuationScenePrompt(input.promptInput);

  // Fetch + convert reference URLs to File objects for the SDK's images.edit.
  // For scene 0: only the product image (if available).
  // For scene N: [previousScene, product] — order matters because the prompt
  // refers to "Image 1" / "Image 2".
  const referenceFiles: Awaited<ReturnType<typeof toFile>>[] = [];
  if (!isFirstScene && input.previousSceneImageUrl) {
    referenceFiles.push(await urlToFile(input.previousSceneImageUrl, 'previous-scene.png'));
  }
  if (input.productImageUrl) {
    referenceFiles.push(await urlToFile(input.productImageUrl, 'product.png'));
  }

  const startedAt = Date.now();
  let result;
  if (referenceFiles.length === 0) {
    // No reference at all (no product image, no previous scene) — pure text-to-image.
    result = await openai.images.generate({
      model,
      prompt,
      size,
      quality,
    });
  } else {
    result = await openai.images.edit({
      model,
      image: referenceFiles,
      prompt,
      size,
      quality,
    });
  }
  const durationMs = Date.now() - startedAt;

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image API returned no base64 data');

  return {
    base64: b64,
    promptUsed: prompt,
    model,
    quality,
    size,
    durationMs,
  };
}

// Helper: download a (relative or absolute) URL and wrap in a File for the SDK.
async function urlToFile(url: string, fallbackName: string): Promise<Awaited<ReturnType<typeof toFile>>> {
  const absolute = url.startsWith('http') ? url : new URL(url, baseUrl()).toString();
  const res = await fetch(absolute);
  if (!res.ok) throw new Error(`Failed to fetch reference image: ${absolute} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') ?? 'image/png';
  return toFile(buf, fallbackName, { type: ct });
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}
