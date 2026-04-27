import { z } from 'zod';

export const sceneSchema = z.object({
  sceneOrder: z.number().int().min(0),
  textHebrew: z.string().min(1),
  visualPromptEnglish: z.string().min(1),
  durationSeconds: z.number().int().min(1).max(20),
  sceneType: z.enum(['hook', 'problem', 'product_demo', 'benefit', 'cta', 'other']),
});

export const scriptSchema = z.object({
  angle: z.enum([
    'problem_solution',
    'testimonial',
    'product_demo',
    'before_after',
    'price_anchor',
    'fast_benefit',
  ]),
  hook: z.string().min(1),
  cta: z.string().optional(),
  targetAudience: z.string().optional(),
  estimatedDurationSeconds: z.number().int().min(10).max(60),
  scenes: z.array(sceneSchema).min(1),
});

export const scriptsResponseSchema = z.object({
  scripts: z.array(scriptSchema).length(6),
});

export type ScriptParsed = z.infer<typeof scriptSchema>;
export type ScriptsResponseParsed = z.infer<typeof scriptsResponseSchema>;
