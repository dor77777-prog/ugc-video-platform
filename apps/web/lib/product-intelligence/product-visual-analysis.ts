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
import { isOpenAiReasoningModel } from '@/lib/llm/openai-models';

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
  // V27.10.16 — gpt-5.5-mini per the OpenAI migration guide. The
  // dossier is the foundation of every image brief downstream, so
  // pixel detail matters: detail: 'high' keeps the product image up
  // to 2048px (not aggressively resized), and reasoning.effort 'low'
  // gives the model headroom for the multi-field structured analysis
  // without burning extra tokens.
  // V27.10.18 — `gpt-5.5-mini` not yet available; fell back to
  // gpt-5.4-mini (same Responses-API features).
  const model = process.env.OPENAI_PRODUCT_VISION_MODEL ?? 'gpt-5.4-mini';

  const heroUrl = await imageToDataUrl(input.imageUrl);
  const secondaryUrl = input.secondaryImageUrl
    ? await imageToDataUrl(input.secondaryImageUrl).catch(() => null)
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
    // V27.10.16 — Responses API. SDK type cast at the boundary because
    // older typings lack `reasoning` and `detail`.
    const userContent: Array<Record<string, unknown>> = [
      { type: 'input_text', text: userText },
      { type: 'input_image', image_url: heroUrl, detail: 'high' },
    ];
    if (secondaryUrl) {
      userContent.push({ type: 'input_image', image_url: secondaryUrl, detail: 'high' });
    }
    // V27.10.20 — `reasoning.effort` only on reasoning-family models.
    // OPENAI_PRODUCT_VISION_MODEL may point at gpt-4o-mini (env override),
    // which 400s on the param. Conditionally include.
    const supportsReasoning = isOpenAiReasoningModel(model);
    const requestPayload = {
      model,
      instructions: SYSTEM,
      input: [{ role: 'user' as const, content: userContent }],
      ...(supportsReasoning ? { reasoning: { effort: 'low' as const } } : {}),
      text: {
        format: {
          type: 'json_schema' as const,
          name: 'product_visual_analysis',
          strict: true,
          schema: SCHEMA as unknown as Record<string, unknown>,
        },
      },
    };
    const responsesApi = client.responses as unknown as {
      create: (
        args: typeof requestPayload,
        opts?: { signal?: AbortSignal },
      ) => Promise<{
        output_text: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      }>;
    };
    resp = await responsesApi.create(requestPayload, { signal: ac.signal });
  } finally {
    clearTimeout(t);
  }

  const raw = resp.output_text ?? '';
  let parsed: ProductVisualAnalysis;
  try {
    parsed = JSON.parse(raw) as ProductVisualAnalysis;
  } catch {
    throw new Error(`Visual-analysis response wasn't valid JSON: ${raw.slice(0, 200)}`);
  }

  return {
    analysis: parsed,
    usage: {
      inputTokens: resp.usage?.input_tokens ?? 0,
      outputTokens: resp.usage?.output_tokens ?? 0,
    },
    model,
  };
}

async function imageToDataUrl(imageUrl: string): Promise<string> {
  // V27.10.16 — Responses API takes `image_url` as a plain string,
  // not the nested `{ url }` shape Chat Completions used.
  const { readPublicAssetAsDataUrl } = await import('@/lib/storage/read-public-asset');
  return readPublicAssetAsDataUrl(imageUrl);
}
