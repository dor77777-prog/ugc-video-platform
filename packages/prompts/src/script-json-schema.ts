// JSON schema enforced on the LLM response.
// Mirrors packages/shared/src/schemas/script.ts. When the script engine is built,
// this is the schema we'll pass to OpenAI's structured-output API.

export const SCRIPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scripts'],
  properties: {
    scripts: {
      type: 'array',
      minItems: 6,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['angle', 'hook', 'estimated_duration_seconds', 'scenes'],
        properties: {
          angle: {
            type: 'string',
            enum: [
              'problem_solution',
              'testimonial',
              'product_demo',
              'before_after',
              'price_anchor',
              'fast_benefit',
            ],
          },
          hook: { type: 'string', minLength: 1 },
          cta: { type: 'string' },
          target_audience: { type: 'string' },
          estimated_duration_seconds: { type: 'integer', minimum: 10, maximum: 60 },
          scenes: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'scene_order',
                'text_hebrew',
                'visual_prompt_english',
                'duration_seconds',
                'scene_type',
              ],
              properties: {
                scene_order: { type: 'integer', minimum: 0 },
                text_hebrew: { type: 'string', minLength: 1 },
                visual_prompt_english: { type: 'string', minLength: 1 },
                duration_seconds: { type: 'integer', minimum: 1, maximum: 20 },
                scene_type: {
                  type: 'string',
                  enum: ['hook', 'problem', 'product_demo', 'benefit', 'cta', 'other'],
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
