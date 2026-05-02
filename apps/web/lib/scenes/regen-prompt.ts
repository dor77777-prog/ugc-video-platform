// Single-scene prompt regenerator — V11.5.
//
// Asks gpt-5.4-mini to produce a FRESH visual_prompt_english for one
// scene that:
//   1. Stays aligned with the product (via Product Dossier + Visual Analysis)
//   2. Stays aligned with the script (scene_goal + spoken_text + creative_strategy)
//   3. Respects the scene type (talking_head / product_demo / closeup_product / etc.)
//   4. INTENTIONALLY DIVERGES from the previous prompt (different camera
//      angle / framing / environment beat / time of day) so the user
//      who clicks "🎲 פרומט חדש" actually gets a different shot.
//
// Cost: ~$0.001 per call (one short gpt-5.4-mini text call). Cheap
// enough that we don't charge a Tachles credit for it — the credit
// charge happens later if the user runs the actual image generation.

import OpenAI from 'openai';
import type { ProductIntelligence } from '@/lib/product-intelligence';

export class RegenPromptConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegenPromptConfigError';
  }
}

export interface RegenPromptInput {
  /** What the script says the scene must be about. */
  sceneGoal: string;
  spokenTextHebrew: string;
  /** product_demo / talking_head / closeup_product / hands_only / etc. */
  sceneGenerationType: string;
  faceVisibility: string;
  /** The previous prompt — the new one MUST be different. */
  previousPrompt: string;
  /** Whole-script context the LLM uses to keep the new prompt
   *  internally consistent (e.g. don't put scene 5 in a kitchen if
   *  the rest of the ad is in a bathroom). */
  scriptContext: {
    selectedHook?: string;
    cta?: string;
    targetAudience?: string;
    framework?: string;
  };
  /** V11 product intelligence — drives mustShow / mustAvoid /
   *  Israeli realism in the new prompt. Optional for legacy projects. */
  intelligence?: ProductIntelligence | null;
  productName?: string | null;
}

export interface RegenPromptResult {
  visualPromptEnglish: string;
  reason: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

const SYSTEM = `You are a UGC director generating ALTERNATIVE scene visual briefs for a Hebrew product ad.

Given a scene's role, the script's hook + CTA + audience, and the product's dossier + visual analysis, produce a NEW visual_prompt_english that is clearly DIFFERENT from the previous one but still satisfies the scene's job.

Hard rules:
- Keep the same scene_generation_type (talking_head stays talking_head; product_demo stays a demo). The CAMERA ANGLE / framing / environment beat / time of day / background context can change.
- For product/demo scenes: cite at least one mustShowVisuals item from the dossier.
- For demo / closeup / hands-only: respect productAccuracy from visualAnalysis (activePart / contactPoint / substanceVisualType). Never contradict mustAvoidVisuals.
- For talking_head: keep selfie UGC framing, mouth visible, Israeli person in a believable Israeli interior. Vary the room beat (kitchen vs bathroom vs living-room corner) when allowed by the script.
- Israeli realism is mandatory: no foreign suburban / oversized US kitchens / non-Israeli outlets / random English signage.
- DIVERGE from the previous prompt — different camera, different beat, different lighting / time-of-day. Don't reuse the same opening clause as the previous one.
- The visual_prompt_english is ENGLISH (the image model is English-language). Spoken text Hebrew stays in the script — never echo it inside the prompt.
- Keep the prompt under ~120 words, dense and visual.
- Output strict JSON matching the schema.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['visual_prompt_english', 'reason'],
  properties: {
    visual_prompt_english: {
      type: 'string',
      description: 'Fresh English visual brief, ~80–120 words, dense and physical.',
    },
    reason: {
      type: 'string',
      description: 'One short sentence explaining what changed vs the previous prompt (camera, beat, environment, lighting, etc.).',
    },
  },
} as const;

const REQUEST_TIMEOUT_MS = 45_000;

export async function regenerateScenePrompt(
  input: RegenPromptInput,
): Promise<RegenPromptResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new RegenPromptConfigError('OPENAI_API_KEY not set');

  const client = new OpenAI({ apiKey });
  // V27.10.17 — fallback bumped 'gpt-5.4-mini' → 'gpt-5.4-mini' to
  // stay aligned with V27.10.15's openai-script-client default.
  const model = process.env.OPENAI_SCRIPT_MODEL ?? 'gpt-5.4-mini';

  const intel = input.intelligence ?? null;
  const dossier = intel?.dossier ?? null;
  const visual = intel && intel.visualAnalysis.activePart ? intel.visualAnalysis : null;
  const audience = intel?.audience ?? null;

  const list = (xs?: string[]) => (xs && xs.length > 0 ? xs.map((x) => `  - ${x}`).join('\n') : '  (none)');

  const userText = [
    `Scene role: scene_goal=${input.sceneGoal} / scene_generation_type=${input.sceneGenerationType} / face_visibility=${input.faceVisibility}.`,
    `Spoken Hebrew (do NOT include in the prompt — it's just context): "${input.spokenTextHebrew.replace(/"/g, "'")}".`,
    `Script context: framework=${input.scriptContext.framework ?? '?'} / hook="${(input.scriptContext.selectedHook ?? '').replace(/"/g, "'").slice(0, 200)}" / cta="${(input.scriptContext.cta ?? '').replace(/"/g, "'").slice(0, 120)}" / targetAudience="${(input.scriptContext.targetAudience ?? '').replace(/"/g, "'").slice(0, 200)}".`,
    input.productName ? `Product name: ${input.productName}` : '',
    '',
    'PREVIOUS visual_prompt_english (you MUST diverge from this):',
    `"""${input.previousPrompt.slice(0, 1200)}"""`,
    '',
    dossier
      ? [
          'PRODUCT DOSSIER (compact):',
          `productMechanism: ${dossier.productMechanism}`,
          `applicationMethod: ${dossier.applicationMethod}`,
          `mustShowVisuals:`,
          list(dossier.mustShowVisuals),
          `mustAvoidVisuals:`,
          list(dossier.mustAvoidVisuals),
          `israeliRealismCues:`,
          list(dossier.israeliRealismCues),
        ].join('\n')
      : '',
    visual
      ? [
          '',
          'PRODUCT VISUAL TRUTH (from hero image):',
          `activePart: ${visual.activePart}`,
          `howToUseVisually: ${visual.howToUseVisually}`,
          `contactPoint: ${visual.contactPoint}`,
          `substanceVisualType: ${visual.substanceVisualType}`,
          `mustAvoidForDemo:`,
          list(visual.mustAvoidForDemo),
        ].join('\n')
      : '',
    audience
      ? [
          '',
          'AUDIENCE:',
          `realisticIsraeliSettings:`,
          list(audience.realisticIsraeliSettings),
          `dailyUseMoments:`,
          list(audience.dailyUseMoments),
        ].join('\n')
      : '',
    '',
    'Return strict JSON. The new visual_prompt_english must be CLEARLY DIFFERENT from the previous one — different camera, different beat, different lighting / time-of-day — while still satisfying the scene role and product/dossier rules.',
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
          json_schema: { name: 'scene_prompt_regen', strict: true, schema: SCHEMA },
        },
      },
      { signal: ac.signal },
    );
  } finally {
    clearTimeout(t);
  }

  const raw = resp.choices?.[0]?.message?.content ?? '';
  let parsed: { visual_prompt_english: string; reason: string };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error(`Prompt-regen response wasn't valid JSON: ${raw.slice(0, 200)}`);
  }

  return {
    visualPromptEnglish: parsed.visual_prompt_english.trim(),
    reason: parsed.reason.trim(),
    usage: {
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
    },
    model,
  };
}
