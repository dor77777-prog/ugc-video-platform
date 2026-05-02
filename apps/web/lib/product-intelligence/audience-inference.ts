// Audience Inference — V11.
//
// Single LLM call (text-only) that takes the dossier + visual analysis
// and returns a production-ready audience map: who the ad is for, what
// daily Israeli moments trigger interest, what objections come up, what
// frameworks fit best, what tone to use.
//
// Could be derived deterministically from the dossier + a category
// table, but the LLM picks better defaults — especially for the
// "realisticIsraeliSettings" + "toneRecommendation" fields where a
// small dictionary would always feel generic.

import OpenAI from 'openai';
import type {
  AudienceInference,
  ProductDossier,
  ProductVisualAnalysis,
} from './types';

export class AudienceInferenceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudienceInferenceConfigError';
  }
}

export interface AudienceInferenceInput {
  dossier: ProductDossier;
  visualAnalysis?: ProductVisualAnalysis | null;
}

export interface AudienceInferenceResult {
  audience: AudienceInference;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

const SYSTEM = `You are an Israeli market researcher + UGC creative director. Given a product dossier (and optionally a visual analysis), output a strict JSON Audience Inference for Hebrew UGC ads.

Hard rules:
- primaryAudience[] / secondaryAudience[] are CONCRETE people personas in Israel — "אמהות צעירות עם תינוק", "סטודנטים בתל אביב", "גברים בני 35–45 עם שיער מידלדל". Never abstract.
- dailyUseMoments[] are short Hebrew (or English) phrases describing the SPECIFIC moment in the day when the audience would feel the pain or notice the product opportunity.
- realisticIsraeliSettings[] = realistic Israeli locations the ad can shoot in. Apartment bathroom, family kitchen at Friday-night cooking, car at morning commute, balcony, etc. Modern OK. American suburban NOT OK.
- bestAdFrameworks[] should be drawn from: skeptical_tryout, problem_agitation_solution, wish_i_knew_earlier, mistake_regret, product_demo_proof, price_alternative_anchor, relatable_israeli_moment, objection_handling, fast_direct_response, social_proof_without_saying_social_proof. List 3-5 best fits, strongest first.
- toneRecommendation = one short sentence describing the voice (e.g. "Calm, slightly tired Israeli mom — warm honest tone, not influencer-perky").
- visualStrategyRecommendation = one short sentence ("Stay close to product action; show the parted scalp and the brush head; never wide bathroom shots").
- Output strict JSON. All fields required.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'category',
    'subcategory',
    'primaryAudience',
    'secondaryAudience',
    'dailyUseMoments',
    'problemContext',
    'emotionalTriggers',
    'purchaseObjections',
    'realisticIsraeliSettings',
    'bestAdFrameworks',
    'toneRecommendation',
    'visualStrategyRecommendation',
  ],
  properties: {
    category: { type: 'string' },
    subcategory: { type: 'string' },
    primaryAudience: { type: 'array', items: { type: 'string' } },
    secondaryAudience: { type: 'array', items: { type: 'string' } },
    dailyUseMoments: { type: 'array', items: { type: 'string' } },
    problemContext: { type: 'array', items: { type: 'string' } },
    emotionalTriggers: { type: 'array', items: { type: 'string' } },
    purchaseObjections: { type: 'array', items: { type: 'string' } },
    realisticIsraeliSettings: { type: 'array', items: { type: 'string' } },
    bestAdFrameworks: { type: 'array', items: { type: 'string' } },
    toneRecommendation: { type: 'string' },
    visualStrategyRecommendation: { type: 'string' },
  },
} as const;

const REQUEST_TIMEOUT_MS = 60_000;

export async function inferAudience(
  input: AudienceInferenceInput,
): Promise<AudienceInferenceResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AudienceInferenceConfigError('OPENAI_API_KEY not set');

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_AUDIENCE_MODEL ?? process.env.OPENAI_SCRIPT_MODEL ?? 'gpt-5.5-mini';

  // Send a compressed dossier (skip arrays we don't need for audience
  // reasoning to keep tokens down).
  const compactDossier = {
    productName: input.dossier.productName,
    brand: input.dossier.brand,
    category: input.dossier.category,
    subcategory: input.dossier.subcategory,
    productType: input.dossier.productType,
    productMechanism: input.dossier.productMechanism,
    painPoints: input.dossier.painPoints,
    desiredOutcomes: input.dossier.desiredOutcomes,
    purchaseTriggers: input.dossier.purchaseTriggers,
    mainObjections: input.dossier.mainObjections,
    likelyUseEnvironments: input.dossier.likelyUseEnvironments,
    israeliRealismCues: input.dossier.israeliRealismCues,
  };

  const userText = [
    'DOSSIER (compact JSON):',
    JSON.stringify(compactDossier),
    input.visualAnalysis
      ? `\nVISUAL_ANALYSIS_PARTIAL: activePart="${input.visualAnalysis.activePart}", contactPoint="${input.visualAnalysis.contactPoint}", howToUseVisually="${input.visualAnalysis.howToUseVisually}"`
      : '',
    '',
    'Return strict Audience Inference JSON. Israeli market only.',
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
          json_schema: { name: 'audience_inference', strict: true, schema: SCHEMA },
        },
      },
      { signal: ac.signal },
    );
  } finally {
    clearTimeout(t);
  }

  const raw = resp.choices?.[0]?.message?.content ?? '';
  let parsed: AudienceInference;
  try {
    parsed = JSON.parse(raw) as AudienceInference;
  } catch {
    throw new Error(`Audience-inference response wasn't valid JSON: ${raw.slice(0, 200)}`);
  }

  return {
    audience: parsed,
    usage: {
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
    },
    model,
  };
}
