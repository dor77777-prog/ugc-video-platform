// Product Visual Analyzer — V11.
//
// Vision pass on the product hero image (gpt-4o-mini). Returns the
// physical truth: what the product IS, where the active part lives,
// how a person would hold it, what surface the active part touches,
// what substance comes out, common visual mistakes a generic image
// model would make. All downstream image briefs cite these fields,
// and the image QA pass uses them as the ground truth for "is the
// product being used correctly in this generated frame?".
//
// Single shot. If the hero image is missing we return null upstream
// rather than block the dossier — the script engine still gets the
// text-only dossier; image QA just can't enforce the visual mistakes.

import OpenAI from 'openai';
import type { ProductVisualAnalysis } from './types';

export class VisualAnalysisConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisualAnalysisConfigError';
  }
}

export interface VisualAnalysisInput {
  /** Hero product image — local /uploads/... or remote https://...
   *  Local paths are read from disk and base64-encoded. Remote URLs
   *  pass through (cheaper for big images). */
  imageUrl: string;
  /** Optional second image (e.g. lifestyle / packaging shot) — passed
   *  alongside the hero so the model can disambiguate ambiguous parts. */
  secondaryImageUrl?: string | null;
  /** Loose text from the dossier so the model can ground its answer. */
  productName?: string;
  productDescription?: string;
  /** Optional category guess to bias scoring (e.g. "haircare/scalp serum"). */
  categoryHint?: string | null;
}

export interface VisualAnalysisResult {
  analysis: ProductVisualAnalysis;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

const SYSTEM = `You are a product photographer + UGC ad director combined. Your job is to look at a product photo and describe — in physical, demonstrable terms — what the product IS, how it is held, where its active part touches the body or surface, and what visual mistakes a generic image model would make when asked to depict it in use.

Hard rules:
- Be PHYSICAL, not poetic. "Silicone bristles pressed directly on scalp" beats "applies serum gently".
- activePart = the SINGLE most important physical part for a demo shot. Not "the bottle" unless the bottle IS the active part (e.g. spray nozzle).
- contactPoint = WHERE on the body / surface / object the active part touches. Be specific ("exposed scalp at the parting line", not "head").
- substanceVisualType = if the product dispenses a substance, describe COLOR + OPACITY + VISCOSITY ("transparent watery serum, clear glossy"). If nothing comes out, leave this empty string.
- mustShowForDemo[] = the camera REQUIREMENTS for a believable demo: what must be in frame and unambiguous.
- mustAvoidForDemo[] = the visual lies a generic model loves to produce (white cream where it should be transparent; brush floating instead of touching; foreign-looking product that contradicts the actual packaging).
- likelyModelMistakes[] = call out specific image-model failure modes for THIS product. These feed image QA downstream — be paranoid.
- Output strict JSON matching the schema. All fields required even when empty.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'objectDescription',
    'visibleParts',
    'activePart',
    'howToHold',
    'howToUseVisually',
    'contactPoint',
    'substanceVisualType',
    'textureAndMaterial',
    'scaleRelativeToHand',
    'bestDemoAngles',
    'mustShowForDemo',
    'mustAvoidForDemo',
    'likelyModelMistakes',
    'productAccuracyNotes',
  ],
  properties: {
    objectDescription: { type: 'string' },
    visibleParts: { type: 'array', items: { type: 'string' } },
    activePart: { type: 'string' },
    howToHold: { type: 'string' },
    howToUseVisually: { type: 'string' },
    contactPoint: { type: 'string' },
    substanceVisualType: { type: 'string' },
    textureAndMaterial: { type: 'string' },
    scaleRelativeToHand: { type: 'string' },
    bestDemoAngles: { type: 'array', items: { type: 'string' } },
    mustShowForDemo: { type: 'array', items: { type: 'string' } },
    mustAvoidForDemo: { type: 'array', items: { type: 'string' } },
    likelyModelMistakes: { type: 'array', items: { type: 'string' } },
    productAccuracyNotes: { type: 'array', items: { type: 'string' } },
  },
} as const;

const REQUEST_TIMEOUT_MS = 60_000;

export async function analyzeProductVisual(
  input: VisualAnalysisInput,
): Promise<VisualAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new VisualAnalysisConfigError('OPENAI_API_KEY not set');

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_PRODUCT_VISION_MODEL ?? 'gpt-4o-mini';

  const heroPart = await imageToContent(input.imageUrl);
  const secondaryPart = input.secondaryImageUrl
    ? await imageToContent(input.secondaryImageUrl).catch(() => null)
    : null;

  const userText = [
    'Analyse the product image(s) below and return the strict visual-analysis JSON.',
    input.productName ? `Product name (text-side): ${input.productName}` : '',
    input.productDescription
      ? `Product description (text-side): ${input.productDescription.slice(0, 1500)}`
      : '',
    input.categoryHint ? `Category hint: ${input.categoryHint}` : '',
    '',
    'Be PHYSICAL. Imagine a UGC creator filming this product — what must their camera CATCH for it to be believable, and what CHEAP fakes will a generic image model produce?',
  ]
    .filter(Boolean)
    .join('\n');

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  let resp;
  try {
    resp = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: userText },
              heroPart,
              ...(secondaryPart ? [secondaryPart] : []),
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'product_visual_analysis', strict: true, schema: SCHEMA },
        },
      },
      { signal: ac.signal },
    );
  } finally {
    clearTimeout(t);
  }

  const raw = resp.choices?.[0]?.message?.content ?? '';
  let parsed: ProductVisualAnalysis;
  try {
    parsed = JSON.parse(raw) as ProductVisualAnalysis;
  } catch {
    throw new Error(`Visual-analysis response wasn't valid JSON: ${raw.slice(0, 200)}`);
  }

  return {
    analysis: parsed,
    usage: {
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
    },
    model,
  };
}

interface ImageContentPart {
  type: 'image_url';
  image_url: { url: string };
}

async function imageToContent(imageUrl: string): Promise<ImageContentPart> {
  const { readPublicAssetAsDataUrl } = await import('@/lib/storage/read-public-asset');
  const dataUrl = await readPublicAssetAsDataUrl(imageUrl);
  return { type: 'image_url', image_url: { url: dataUrl } };
}
