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

export interface SceneInput {
  sceneOrder: number;
  textHebrew: string;
  visualPromptEnglish: string;
  durationSeconds: number;
  sceneType: SceneTypeSlug;
}

export interface ScriptInput {
  angle: ScriptAngleSlug;
  hook: string;
  cta?: string;
  targetAudience?: string;
  estimatedDurationSeconds: number;
  scenes: SceneInput[];
}

export interface ScriptsResponse {
  scripts: ScriptInput[];
}
