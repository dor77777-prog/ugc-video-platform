import OpenAI from 'openai';
import { SCRIPT_SYSTEM_PROMPT, SCRIPT_JSON_SCHEMA } from '@ugc-video/prompts';

export interface ProductInput {
  productName: string;
  description: string;
  brand?: string | null;
  targetAudience?: string | null;
  durationSeconds: number;
  price?: string | null;
  currency?: string | null;
  // The avatar the user already picked (from step 2). When present, the LLM
  // writes visual_prompt_english consistent with this person — no description
  // mismatch downstream when gpt-image-2 generates the actual scene image.
  avatarDescription?: string | null;
  // Product category id (e.g. "skincare", "fashion", "fitness"). Drives the
  // category-specific guidance the system prompt looks for.
  categoryId?: string | null;
  categoryLabel?: string | null;
  categoryGuidance?: string | null;
}

// Snake_case shape returned by the LLM (matches SCRIPT_JSON_SCHEMA).
interface LlmScene {
  scene_order: number;
  text_hebrew: string;
  visual_prompt_english: string;
  duration_seconds: number;
  scene_type: 'hook' | 'problem' | 'product_demo' | 'benefit' | 'cta' | 'other';
}
interface LlmScript {
  angle:
    | 'problem_solution'
    | 'testimonial'
    | 'product_demo'
    | 'before_after'
    | 'price_anchor'
    | 'fast_benefit';
  hook: string;
  cta: string;
  target_audience: string;
  estimated_duration_seconds: number;
  scenes: LlmScene[];
}
interface LlmResponse {
  scripts: LlmScript[];
}

// Camel-case shape used everywhere else (Prisma, frontend).
export interface GeneratedScene {
  sceneOrder: number;
  textHebrew: string;
  visualPromptEnglish: string;
  durationSeconds: number;
  sceneType: LlmScene['scene_type'];
}
export interface GeneratedScript {
  angle: LlmScript['angle'];
  hook: string;
  cta: string;
  targetAudience: string;
  estimatedDurationSeconds: number;
  scenes: GeneratedScene[];
  raw: LlmScript; // preserve original for audit
}

export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmConfigError';
  }
}

export interface ScriptGenerationOutput {
  scripts: GeneratedScript[];
  usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
  };
}

export async function generateScripts(input: ProductInput): Promise<ScriptGenerationOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LlmConfigError(
      'OPENAI_API_KEY is not set. Add it to .env to enable script generation.',
    );
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_SCRIPT_MODEL || 'gpt-4o-mini';

  const userPrompt = buildUserPrompt(input);

  const startedAt = Date.now();
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'scripts_response',
        strict: true,
        schema: SCRIPT_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });
  const durationMs = Date.now() - startedAt;

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('LLM returned an empty response');

  let parsed: LlmResponse;
  try {
    parsed = JSON.parse(content) as LlmResponse;
  } catch (err) {
    throw new Error(`Failed to parse LLM JSON: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed.scripts) || parsed.scripts.length === 0) {
    throw new Error('LLM returned no scripts');
  }

  return {
    scripts: parsed.scripts.map(toGenerated),
    usage: {
      model,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      durationMs,
    },
  };
}

function buildUserPrompt(p: ProductInput): string {
  const lines = [
    `שם המוצר: ${p.productName}`,
    p.brand ? `מותג: ${p.brand}` : null,
    p.targetAudience ? `קהל יעד עיקרי: ${p.targetAudience}` : null,
    p.price ? `מחיר: ${p.price}${p.currency ? ' ' + p.currency : ''}` : null,
    `אורך הסרטון הסופי: ${p.durationSeconds} שניות`,
    '',
    'תיאור המוצר:',
    p.description,
    '',
    p.categoryLabel || p.categoryGuidance
      ? [
          `קטגוריה: ${p.categoryLabel ?? p.categoryId ?? 'unknown'}`,
          p.categoryGuidance ? `הנחיות per-category: ${p.categoryGuidance}` : null,
          '',
        ]
          .filter(Boolean)
          .join('\n')
      : null,
    p.avatarDescription
      ? [
          `דמות הקריינות שכבר נבחרה: ${p.avatarDescription}.`,
          '⚠ אל תכתוב את תיאור הדמות בתוך visual_prompt_english — תמונת הרפרנס תטופל ע"י ה-image model. ב-visual_prompt_english תכתוב רק setting / action / camera framing / lighting / outfit (אם רלוונטי).',
          '',
        ].join('\n')
      : null,
    'הפק עכשיו את 6 התסריטים בפורמט ה-JSON המבוקש.',
  ].filter(Boolean);
  return lines.join('\n');
}

function toGenerated(s: LlmScript): GeneratedScript {
  return {
    angle: s.angle,
    hook: s.hook,
    cta: s.cta,
    targetAudience: s.target_audience,
    estimatedDurationSeconds: s.estimated_duration_seconds,
    scenes: s.scenes
      .map((sc) => ({
        sceneOrder: sc.scene_order,
        textHebrew: sc.text_hebrew,
        visualPromptEnglish: sc.visual_prompt_english,
        durationSeconds: sc.duration_seconds,
        sceneType: sc.scene_type,
      }))
      .sort((a, b) => a.sceneOrder - b.sceneOrder),
    raw: s,
  };
}
