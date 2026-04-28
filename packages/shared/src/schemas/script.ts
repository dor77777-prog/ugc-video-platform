import { z } from 'zod';

// V2 Zod schemas mirror the OpenAI structured-output JSON schema in
// packages/prompts/src/script-json-schema.ts. They are validated AFTER the
// LLM response has been parsed and mapped to camelCase.

const FRAMEWORKS = [
  'problem_agitation_solution',
  'skeptical_testimonial',
  'demonstration_proof',
  'price_alternative_anchor',
  'relatable_israeli_moment',
  'fast_direct_response',
] as const;

const SCENE_GOALS = [
  'stop_scroll',
  'establish_pain',
  'introduce_product',
  'prove_it_works',
  'decision_push',
  'other',
] as const;

const LEGACY_ANGLES = [
  'problem_solution',
  'testimonial',
  'product_demo',
  'before_after',
  'price_anchor',
  'fast_benefit',
] as const;

const LEGACY_SCENE_TYPES = ['hook', 'problem', 'product_demo', 'benefit', 'cta', 'other'] as const;

export const creativeStrategySchema = z.object({
  coreInsight: z.string().min(1),
  audiencePain: z.string().min(1),
  emotionalTrigger: z.string().min(1),
  productMechanism: z.string().min(1),
  mainObjection: z.string().min(1),
  persuasionAngle: z.string().min(1),
  whyThisWouldStopScroll: z.string().min(1),
  ugcSituation: z.string().min(1),
  hookType: z.string().min(1),
  scriptPromise: z.string().min(1),
  conversionGoal: z.string().min(1),
  assumptions: z.array(z.string()),
});

export const qualityScoreSchema = z.object({
  hookStrength: z.number().int().min(1).max(10),
  specificity: z.number().int().min(1).max(10),
  israeliAuthenticity: z.number().int().min(1).max(10),
  emotionalPull: z.number().int().min(1).max(10),
  visualClarity: z.number().int().min(1).max(10),
  conversionPotential: z.number().int().min(1).max(10),
  ttsNaturalness: z.number().int().min(1).max(10),
  noGenericCliches: z.number().int().min(1).max(10),
  overall: z.number().min(0).max(10),
  weaknessNote: z.string(),
});

export const sceneSchema = z.object({
  sceneOrder: z.number().int().min(0),
  sceneGoal: z.enum(SCENE_GOALS),
  textHebrew: z.string().min(1),
  onScreenCaptionHebrew: z.string(),
  visualPromptEnglish: z.string().min(1),
  cameraDirection: z.string(),
  performanceNote: z.string(),
  durationSeconds: z.number().int().min(2).max(20),
  // Legacy — populated by the wrapper from sceneGoal.
  sceneType: z.enum(LEGACY_SCENE_TYPES),
});

export const scriptSchema = z.object({
  framework: z.enum(FRAMEWORKS),
  creativeStrategy: creativeStrategySchema,
  hookOptions: z.array(z.string().min(1)).min(1),
  selectedHook: z.string().min(1),
  hookReason: z.string(),
  cta: z.string(),
  targetAudience: z.string(),
  estimatedDurationSeconds: z.number().int().min(10).max(60),
  scenes: z.array(sceneSchema).min(3),
  qualityScore: qualityScoreSchema,
  // Legacy — populated by the wrapper from framework.
  angle: z.enum(LEGACY_ANGLES),
});

export const scriptsResponseSchema = z.object({
  scripts: z.array(scriptSchema).length(6),
});

export type CreativeStrategyParsed = z.infer<typeof creativeStrategySchema>;
export type QualityScoreParsed = z.infer<typeof qualityScoreSchema>;
export type SceneParsed = z.infer<typeof sceneSchema>;
export type ScriptParsed = z.infer<typeof scriptSchema>;
export type ScriptsResponseParsed = z.infer<typeof scriptsResponseSchema>;
