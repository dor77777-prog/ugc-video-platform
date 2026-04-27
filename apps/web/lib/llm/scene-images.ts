import OpenAI, { toFile } from 'openai';
import { buildScenePrompt, type SceneImagePromptInput } from '@ugc-video/prompts';
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
  productImageUrl: string | null; // hero image URL from step 1 (optional)
  avatarImageUrl: string | null;  // selected avatar from step 2 (the identity anchor)
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

// Architecture: every scene is generated independently from the avatar
// reference. We do NOT pass the previous scene as a reference image — that
// approach caused identity drift to compound. Instead, we trust:
//   1. The avatar image (Image 1) for the character — same source ref for all scenes.
//   2. The LLM-written scene description for setting/lighting continuity.
//   3. The product image (Image 2 when present) for product fidelity.
export async function generateSceneImage(input: SceneImageInput): Promise<SceneImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LlmConfigError(
      'OPENAI_API_KEY is not set. Add it to .env to enable scene image generation.',
    );
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  const quality: ImageQuality = input.quality ?? 'high';
  const size = SIZES[input.promptInput.aspectRatio];
  const prompt = buildScenePrompt(input.promptInput);

  // References in the order the prompt refers to:
  //   Image 1 = avatar (when present)
  //   Image 2 = product (when present)
  const referenceFiles: Awaited<ReturnType<typeof toFile>>[] = [];
  if (input.avatarImageUrl) {
    referenceFiles.push(await urlToFile(input.avatarImageUrl, 'avatar.png'));
  }
  if (input.productImageUrl) {
    referenceFiles.push(await urlToFile(input.productImageUrl, 'product.png'));
  }

  const startedAt = Date.now();
  let result;
  if (referenceFiles.length === 0) {
    // No reference images — pure text-to-image.
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
