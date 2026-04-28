import OpenAI from 'openai';
import {
  SCRIPT_SYSTEM_PROMPT,
  SCRIPT_JSON_SCHEMA,
  SINGLE_SCRIPT_JSON_SCHEMA,
} from '@ugc-video/prompts';

// Script Engine V2 — wrapper.
//
// 1. Builds a structured user prompt from product data + chosen avatar +
//    optional category guidance.
// 2. Asks gpt-4o-mini (or whatever OPENAI_SCRIPT_MODEL points to) to return
//    six scripts that match SCRIPT_JSON_SCHEMA, including a creative_strategy
//    block, 3 hook options, and a self-rated quality_score per script.
// 3. Selectively regenerates any script whose quality_score.overall < 8,
//    feeding the model the original strategy + the weakness_note as a critique.
//    Capped at REGEN_BUDGET total retry calls so a uniformly weak first batch
//    doesn't run up the bill.
// 4. Returns camelCase scripts plus a usage block (model + tokens + duration
//    + how many regen calls fired) so server actions can record the cost
//    accurately and decide whether to surface a "low quality" warning.

const QUALITY_THRESHOLD = 8;
const REGEN_BUDGET = 3; // total regen calls per generateScripts() invocation

export interface ProductInput {
  productName: string;
  description: string;
  brand?: string | null;
  targetAudience?: string | null;
  durationSeconds: number;
  price?: string | null;
  currency?: string | null;
  // The avatar the user already picked (from step 2).
  avatarDescription?: string | null;
  // Product category id (e.g. "skincare", "fashion", "fitness").
  categoryId?: string | null;
  categoryLabel?: string | null;
  categoryGuidance?: string | null;
}

// Snake_case shapes returned by the LLM (match the JSON schemas).
interface LlmCreativeStrategy {
  core_insight: string;
  audience_pain: string;
  emotional_trigger: string;
  product_mechanism: string;
  main_objection: string;
  persuasion_angle: string;
  why_this_would_stop_scroll: string;
  ugc_situation: string;
  hook_type: string;
  script_promise: string;
  conversion_goal: string;
  assumptions: string[];
}
interface LlmQualityScore {
  hook_strength: number;
  specificity: number;
  israeli_authenticity: number;
  emotional_pull: number;
  visual_clarity: number;
  conversion_potential: number;
  tts_naturalness: number;
  no_generic_cliches: number;
  overall: number;
  weakness_note: string;
}
interface LlmScene {
  scene_order: number;
  scene_goal: SceneGoalSlug;
  spoken_text_hebrew: string;
  on_screen_caption_hebrew: string;
  visual_prompt_english: string;
  camera_direction: string;
  performance_note: string;
  duration_seconds: number;
}
interface LlmScript {
  framework: ScriptFrameworkSlug;
  creative_strategy: LlmCreativeStrategy;
  hook_options: string[];
  selected_hook: string;
  hook_reason: string;
  cta: string;
  target_audience: string;
  estimated_duration_seconds: number;
  scenes: LlmScene[];
  quality_score: LlmQualityScore;
}
interface LlmResponse {
  scripts: LlmScript[];
}
interface LlmRegenResponse {
  script: LlmScript;
}

export type ScriptFrameworkSlug =
  | 'problem_agitation_solution'
  | 'skeptical_testimonial'
  | 'demonstration_proof'
  | 'price_alternative_anchor'
  | 'relatable_israeli_moment'
  | 'fast_direct_response';

export type SceneGoalSlug =
  | 'stop_scroll'
  | 'establish_pain'
  | 'introduce_product'
  | 'prove_it_works'
  | 'decision_push'
  | 'other';

// Legacy slugs kept for the Prisma enum columns. Mapped from V2 framework /
// scene_goal so existing readers (worker, admin views) keep working.
export type LegacyAngleSlug =
  | 'problem_solution'
  | 'testimonial'
  | 'product_demo'
  | 'before_after'
  | 'price_anchor'
  | 'fast_benefit';

export type LegacySceneTypeSlug =
  | 'hook'
  | 'problem'
  | 'product_demo'
  | 'benefit'
  | 'cta'
  | 'other';

const FRAMEWORK_TO_LEGACY_ANGLE: Record<ScriptFrameworkSlug, LegacyAngleSlug> = {
  problem_agitation_solution: 'problem_solution',
  skeptical_testimonial: 'testimonial',
  demonstration_proof: 'product_demo',
  price_alternative_anchor: 'price_anchor',
  // No exact legacy match — we tag relatable_israeli_moment as testimonial because
  // both are first-person creator stories, the closest legacy semantic.
  relatable_israeli_moment: 'testimonial',
  fast_direct_response: 'fast_benefit',
};

const SCENE_GOAL_TO_LEGACY_TYPE: Record<SceneGoalSlug, LegacySceneTypeSlug> = {
  stop_scroll: 'hook',
  establish_pain: 'problem',
  introduce_product: 'product_demo',
  prove_it_works: 'benefit',
  decision_push: 'cta',
  other: 'other',
};

// Camel-case shape used everywhere else (Prisma, frontend).
export interface GeneratedCreativeStrategy {
  coreInsight: string;
  audiencePain: string;
  emotionalTrigger: string;
  productMechanism: string;
  mainObjection: string;
  persuasionAngle: string;
  whyThisWouldStopScroll: string;
  ugcSituation: string;
  hookType: string;
  scriptPromise: string;
  conversionGoal: string;
  assumptions: string[];
}
export interface GeneratedQualityScore {
  hookStrength: number;
  specificity: number;
  israeliAuthenticity: number;
  emotionalPull: number;
  visualClarity: number;
  conversionPotential: number;
  ttsNaturalness: number;
  noGenericCliches: number;
  overall: number;
  weaknessNote: string;
}
export interface GeneratedScene {
  sceneOrder: number;
  sceneGoal: SceneGoalSlug;
  textHebrew: string; // = spoken_text_hebrew
  onScreenCaptionHebrew: string;
  visualPromptEnglish: string;
  cameraDirection: string;
  performanceNote: string;
  durationSeconds: number;
  // Derived for the legacy Prisma enum.
  sceneType: LegacySceneTypeSlug;
}
export interface GeneratedScript {
  framework: ScriptFrameworkSlug;
  creativeStrategy: GeneratedCreativeStrategy;
  hookOptions: string[];
  selectedHook: string;
  hookReason: string;
  hook: string; // alias for selectedHook (legacy DB column)
  cta: string;
  targetAudience: string;
  estimatedDurationSeconds: number;
  scenes: GeneratedScene[];
  qualityScore: GeneratedQualityScore;
  regenerated: boolean; // true if this script went through one regen pass
  raw: LlmScript; // preserve original for audit
  // Derived for the legacy Prisma enum.
  angle: LegacyAngleSlug;
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
    regenCalls: number;
    scriptsBelowThreshold: number; // count after retries — should be 0 ideally
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

  const startedAt = Date.now();

  // Pass 1 — generate all 6 scripts in one call.
  const userPrompt = buildUserPrompt(input);
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

  let totalInputTokens = response.usage?.prompt_tokens ?? 0;
  let totalOutputTokens = response.usage?.completion_tokens ?? 0;
  let regenCalls = 0;

  // Pass 2 — selectively regenerate any script with quality_score.overall < THRESHOLD,
  // bounded by REGEN_BUDGET total calls. Lowest-scoring scripts go first so the
  // budget is spent where it matters most.
  const indexedByScore = parsed.scripts
    .map((s, i) => ({ index: i, overall: s.quality_score?.overall ?? 0 }))
    .filter((x) => x.overall < QUALITY_THRESHOLD)
    .sort((a, b) => a.overall - b.overall);

  const regenStarted: number[] = [];
  for (const { index } of indexedByScore) {
    if (regenCalls >= REGEN_BUDGET) break;
    const original = parsed.scripts[index];
    if (!original) continue;
    const regenPrompt = buildRegenUserPrompt(input, original);
    try {
      const regenResp = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
          { role: 'user', content: regenPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'single_script_response',
            strict: true,
            schema: SINGLE_SCRIPT_JSON_SCHEMA as unknown as Record<string, unknown>,
          },
        },
      });
      regenCalls++;
      regenStarted.push(index);
      totalInputTokens += regenResp.usage?.prompt_tokens ?? 0;
      totalOutputTokens += regenResp.usage?.completion_tokens ?? 0;
      const regenContent = regenResp.choices[0]?.message?.content;
      if (!regenContent) continue;
      const regenParsed = JSON.parse(regenContent) as LlmRegenResponse;
      if (!regenParsed.script) continue;

      // Replace only if the new script scores higher than the original.
      const newOverall = regenParsed.script.quality_score?.overall ?? 0;
      const oldOverall = original.quality_score?.overall ?? 0;
      if (newOverall >= oldOverall) {
        parsed.scripts[index] = regenParsed.script;
      }
    } catch (err) {
      // Don't fail the whole generation if regen fails — keep the original script.
      console.warn(`[scripts] regen for index ${index} failed:`, (err as Error).message);
    }
  }

  const durationMs = Date.now() - startedAt;
  const scriptsBelowThreshold = parsed.scripts.filter(
    (s) => (s.quality_score?.overall ?? 0) < QUALITY_THRESHOLD,
  ).length;

  return {
    scripts: parsed.scripts.map((s, i) => toGenerated(s, regenStarted.includes(i))),
    usage: {
      model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      durationMs,
      regenCalls,
      scriptsBelowThreshold,
    },
  };
}

function buildUserPrompt(p: ProductInput): string {
  const lines: (string | null)[] = [
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
    'הפק עכשיו את 6 התסריטים בפורמט ה-JSON המבוקש (Script Engine V2: creative_strategy מלא, 3 hook_options, scene_goal לכל סצנה, quality_score כן).',
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

function buildRegenUserPrompt(p: ProductInput, original: LlmScript): string {
  // Compact recap of the product so the model has the same context as pass 1,
  // plus the weak script + its self-criticism so it knows what to fix.
  const productLines = [
    `שם המוצר: ${p.productName}`,
    p.brand ? `מותג: ${p.brand}` : null,
    p.price ? `מחיר: ${p.price}${p.currency ? ' ' + p.currency : ''}` : null,
    `אורך: ${p.durationSeconds}s`,
    '',
    'תיאור:',
    p.description,
    p.categoryLabel ? `קטגוריה: ${p.categoryLabel}` : null,
    p.avatarDescription ? `דמות הרפרנס: ${p.avatarDescription}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  return `הסקריפט הזה (framework="${original.framework}") קיבל ציון overall=${original.quality_score?.overall ?? '?'} — מתחת לסף 8.

החולשה שזיהית בעצמך: "${original.quality_score?.weakness_note ?? '(לא צוין)'}"

${productLines}

צור גרסה **חזקה יותר** של אותו תסריט (אותו framework, אותו creative_strategy core_insight אם הוא חזק — אבל מותר לחדד אותו), כך שהציון yes-self יהיה ≥8 בכל הצירים. תן דגש לתיקון הצד החלש שצוין למעלה.

אסור להחזיר את אותו טקסט. אסור להשאיר קלישאות. אם ה-hook חלש — תכתוב 3 hook_options שונים לחלוטין. אם ה-visual_prompt_english גנרי — תכתוב משהו ספציפי וחי.

החזר { "script": {...} } תואם לסכמה — סקריפט אחד בלבד.`;
}

function toGenerated(s: LlmScript, regenerated: boolean): GeneratedScript {
  return {
    framework: s.framework,
    creativeStrategy: {
      coreInsight: s.creative_strategy.core_insight,
      audiencePain: s.creative_strategy.audience_pain,
      emotionalTrigger: s.creative_strategy.emotional_trigger,
      productMechanism: s.creative_strategy.product_mechanism,
      mainObjection: s.creative_strategy.main_objection,
      persuasionAngle: s.creative_strategy.persuasion_angle,
      whyThisWouldStopScroll: s.creative_strategy.why_this_would_stop_scroll,
      ugcSituation: s.creative_strategy.ugc_situation,
      hookType: s.creative_strategy.hook_type,
      scriptPromise: s.creative_strategy.script_promise,
      conversionGoal: s.creative_strategy.conversion_goal,
      assumptions: s.creative_strategy.assumptions,
    },
    hookOptions: s.hook_options,
    selectedHook: s.selected_hook,
    hookReason: s.hook_reason,
    hook: s.selected_hook,
    cta: s.cta,
    targetAudience: s.target_audience,
    estimatedDurationSeconds: s.estimated_duration_seconds,
    scenes: s.scenes
      .map((sc) => ({
        sceneOrder: sc.scene_order,
        sceneGoal: sc.scene_goal,
        textHebrew: sc.spoken_text_hebrew,
        onScreenCaptionHebrew: sc.on_screen_caption_hebrew,
        visualPromptEnglish: sc.visual_prompt_english,
        cameraDirection: sc.camera_direction,
        performanceNote: sc.performance_note,
        durationSeconds: sc.duration_seconds,
        sceneType: SCENE_GOAL_TO_LEGACY_TYPE[sc.scene_goal] ?? 'other',
      }))
      .sort((a, b) => a.sceneOrder - b.sceneOrder),
    qualityScore: {
      hookStrength: s.quality_score.hook_strength,
      specificity: s.quality_score.specificity,
      israeliAuthenticity: s.quality_score.israeli_authenticity,
      emotionalPull: s.quality_score.emotional_pull,
      visualClarity: s.quality_score.visual_clarity,
      conversionPotential: s.quality_score.conversion_potential,
      ttsNaturalness: s.quality_score.tts_naturalness,
      noGenericCliches: s.quality_score.no_generic_cliches,
      overall: s.quality_score.overall,
      weaknessNote: s.quality_score.weakness_note,
    },
    regenerated,
    raw: s,
    angle: FRAMEWORK_TO_LEGACY_ANGLE[s.framework] ?? 'problem_solution',
  };
}
