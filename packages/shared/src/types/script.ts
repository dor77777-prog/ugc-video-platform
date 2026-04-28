// Script Engine V2 — TS types.
//
// V2 introduces frameworks (replacing legacy "angles"), a creative_strategy
// block, hook options + selection, per-scene narrative fields, and quality
// scoring. The legacy angle / sceneType slugs are kept here so existing readers
// (Prisma enum mappers, admin views) compile during the migration.

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

// Legacy V1 vocabulary — kept for the Prisma enum columns. The wrapper maps
// V2 framework / sceneGoal → these legacy slugs when persisting.
export type ScriptAngleSlug =
  | 'problem_solution'
  | 'testimonial'
  | 'product_demo'
  | 'before_after'
  | 'price_anchor'
  | 'fast_benefit';

export type SceneTypeSlug =
  | 'hook'
  | 'problem'
  | 'product_demo'
  | 'benefit'
  | 'cta'
  | 'other';

export interface CreativeStrategy {
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

export interface QualityScore {
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

export interface SceneInput {
  sceneOrder: number;
  sceneGoal: SceneGoalSlug;
  textHebrew: string;
  onScreenCaptionHebrew: string;
  visualPromptEnglish: string;
  cameraDirection: string;
  performanceNote: string;
  durationSeconds: number;
  // Legacy field — derived from sceneGoal by the wrapper for the Prisma enum.
  sceneType: SceneTypeSlug;
}

export interface ScriptInput {
  framework: ScriptFrameworkSlug;
  creativeStrategy: CreativeStrategy;
  hookOptions: string[];
  selectedHook: string;
  hookReason: string;
  cta: string;
  targetAudience: string;
  estimatedDurationSeconds: number;
  scenes: SceneInput[];
  qualityScore: QualityScore;
  // Legacy field — derived from framework by the wrapper for the Prisma enum.
  angle: ScriptAngleSlug;
}

export interface ScriptsResponse {
  scripts: ScriptInput[];
}
