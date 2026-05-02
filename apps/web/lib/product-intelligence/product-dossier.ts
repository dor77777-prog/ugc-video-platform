// Product Dossier builder — V11.
//
// Single LLM call (text-only, gpt-5.4-mini) that turns scraped product
// data into a strict 32-field dossier. Mirrors the pattern in
// motion-analysis.ts — strict JSON schema response, sets usage tokens
// for cost forensics, returns a typed object the rest of the pipeline
// can consume without runtime parsing.
//
// IMPORTANT: this prompt does NOT see product images. Visual analysis
// runs separately in product-visual-analysis.ts and the two pieces
// are stitched together by the orchestrator. Splitting them lets the
// dossier rerun cheaply when only the text changes (price update,
// re-scrape) without paying the vision call again.

import OpenAI from 'openai';
import type { ProductDossier } from './types';

export class DossierConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DossierConfigError';
  }
}

export interface DossierInput {
  productName: string;
  brand?: string | null;
  description?: string | null;
  features?: string[];
  price?: string | null;
  currency?: string | null;
  sourceUrl?: string | null;
  /** Free-form Hebrew/English notes the user typed in Step 1 — captured
   *  into the dossier as soft signal, never hard claim. */
  userNotes?: string | null;
  /** Optional category guess from the existing categories module. We
   *  forward it to the LLM as a hint but the LLM may overrule it. */
  categoryGuess?: string | null;
}

export interface DossierResult {
  dossier: ProductDossier;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

const SYSTEM = `You are a senior creative strategist for Hebrew UGC product video ads in the Israeli market.

Your job: take a scraped product page + optional user notes and return a STRUCTURED PRODUCT DOSSIER that will drive script generation, scene planning, and image briefs.

Hard rules:
- Never invent hard claims about ingredients, dosage, medical effects, or guarantees the source data does not support.
- When the source is silent on something, make a CONSERVATIVE assumption and record it in conservativeAssumptions[]. Downstream must treat assumptions as soft, not as proof.
- Prefer practical, visual, demonstrable benefits over vague marketing language.
- Always think about what the VIEWER MUST SEE on screen to believe the product works (visualEvidenceRequirements).
- mustShowVisuals[] are positive (what the camera SHOULD show in product/demo scenes); mustAvoidVisuals[] are negative (what the camera MUST NOT show even if the model defaults to it).
- israeliRealismCues[] should reflect realistic Israeli daily-life environments (modern Israeli apartment, bathroom/kitchen proportions, Israeli outlets/switches, Hebrew/neutral on-screen text). Modern is fine. Foreign suburban / oversized US kitchens are not.
- productMechanism must explain HOW the product physically delivers its benefit, not WHAT the benefit is.
- visualFailureModes[] are the visual mistakes a generic image model would make (e.g. for a scalp serum: "white cream where it should be transparent", "brush floating above hair instead of on scalp"). These feed image QA downstream.
- All fields are required even when empty arrays / strings.
- Output must match the JSON schema exactly. Strict mode.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'productName',
    'brand',
    'category',
    'subcategory',
    'productType',
    'targetAudiencePrimary',
    'targetAudienceSecondary',
    'audienceHypotheses',
    'painPoints',
    'desiredOutcomes',
    'purchaseTriggers',
    'productMechanism',
    'keyClaims',
    'proofPoints',
    'mainObjections',
    'ingredientsOrMaterials',
    'applicationMethod',
    'usageSteps',
    'applicatorType',
    'packagingType',
    'textureType',
    'outputSubstance',
    'mustShowVisuals',
    'mustAvoidVisuals',
    'likelyUseEnvironments',
    'israeliRealismCues',
    'productParts',
    'visualFailureModes',
    'visualEvidenceRequirements',
    'creativeOpportunities',
    'conservativeAssumptions',
  ],
  properties: {
    productName: { type: 'string' },
    brand: { type: 'string' },
    category: { type: 'string' },
    subcategory: { type: 'string' },
    productType: { type: 'string' },
    targetAudiencePrimary: { type: 'array', items: { type: 'string' } },
    targetAudienceSecondary: { type: 'array', items: { type: 'string' } },
    audienceHypotheses: { type: 'array', items: { type: 'string' } },
    painPoints: { type: 'array', items: { type: 'string' } },
    desiredOutcomes: { type: 'array', items: { type: 'string' } },
    purchaseTriggers: { type: 'array', items: { type: 'string' } },
    productMechanism: { type: 'string' },
    keyClaims: { type: 'array', items: { type: 'string' } },
    proofPoints: { type: 'array', items: { type: 'string' } },
    mainObjections: { type: 'array', items: { type: 'string' } },
    ingredientsOrMaterials: { type: 'array', items: { type: 'string' } },
    applicationMethod: { type: 'string' },
    usageSteps: { type: 'array', items: { type: 'string' } },
    applicatorType: { type: 'string' },
    packagingType: { type: 'string' },
    textureType: { type: 'string' },
    outputSubstance: { type: 'string' },
    mustShowVisuals: { type: 'array', items: { type: 'string' } },
    mustAvoidVisuals: { type: 'array', items: { type: 'string' } },
    likelyUseEnvironments: { type: 'array', items: { type: 'string' } },
    israeliRealismCues: { type: 'array', items: { type: 'string' } },
    productParts: { type: 'array', items: { type: 'string' } },
    visualFailureModes: { type: 'array', items: { type: 'string' } },
    visualEvidenceRequirements: { type: 'array', items: { type: 'string' } },
    creativeOpportunities: { type: 'array', items: { type: 'string' } },
    conservativeAssumptions: { type: 'array', items: { type: 'string' } },
  },
} as const;

const REQUEST_TIMEOUT_MS = 60_000;

export async function buildProductDossier(input: DossierInput): Promise<DossierResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new DossierConfigError('OPENAI_API_KEY not set');

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_DOSSIER_MODEL ?? process.env.OPENAI_SCRIPT_MODEL ?? 'gpt-5.5-mini';

  const userText = [
    `Product page facts:`,
    `- Product name: ${input.productName || '(missing)'}`,
    `- Brand: ${input.brand || '(missing)'}`,
    `- Description: ${(input.description || '(missing)').slice(0, 4000)}`,
    `- Features bullets: ${(input.features ?? []).slice(0, 30).join(' | ') || '(none)'}`,
    `- Price: ${input.price || '(missing)'} ${input.currency ?? ''}`.trim(),
    `- Category guess (heuristic): ${input.categoryGuess || '(unknown)'}`,
    `- Source URL: ${input.sourceUrl || '(missing)'}`,
    input.userNotes ? `- User-supplied notes (Hebrew or English): ${input.userNotes.slice(0, 1500)}` : '',
    '',
    'Build the strict dossier per the schema. Israeli market. Hebrew UGC ads downstream.',
    'mustShowVisuals + mustAvoidVisuals + visualFailureModes are CRITICAL — they directly feed image QA. Be specific and physical, not abstract.',
    "Don't repeat the same item across mustShowVisuals and visualEvidenceRequirements; the latter is the AUDIENCE'S burden of proof, the former is the CAMERA's responsibility.",
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
          { role: 'user', content: userText },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'product_dossier', strict: true, schema: SCHEMA },
        },
      },
      { signal: ac.signal },
    );
  } finally {
    clearTimeout(t);
  }

  const raw = resp.choices?.[0]?.message?.content ?? '';
  let parsed: ProductDossier;
  try {
    parsed = JSON.parse(raw) as ProductDossier;
  } catch {
    throw new Error(`Dossier response wasn't valid JSON: ${raw.slice(0, 200)}`);
  }

  return {
    dossier: parsed,
    usage: {
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
    },
    model,
  };
}
