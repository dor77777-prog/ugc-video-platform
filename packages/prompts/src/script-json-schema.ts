// JSON schema for OpenAI structured-outputs (strict mode).
// Strict mode constraints:
// - All listed properties must appear in `required`.
// - No min/max/minItems/maxItems/minLength/etc.
// - additionalProperties: false on every object.
// - Optional fields are expressed as nullable types via type: ["string", "null"].

export const SCRIPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scripts'],
  properties: {
    scripts: {
      type: 'array',
      description: 'Exactly 6 scripts, one per angle, in the order: problem_solution, testimonial, product_demo, before_after, price_anchor, fast_benefit.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'angle',
          'hook',
          'cta',
          'target_audience',
          'estimated_duration_seconds',
          'scenes',
        ],
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
          hook: {
            type: 'string',
            description: 'Punchy opening line in Hebrew, under ~12 words.',
          },
          cta: {
            type: 'string',
            description: 'Short call-to-action in Hebrew. Must not invent codes/discounts.',
          },
          target_audience: {
            type: 'string',
            description: 'One short sentence in Hebrew describing the persona.',
          },
          estimated_duration_seconds: {
            type: 'integer',
            description: 'Total spoken duration, between 20 and 35 seconds.',
          },
          scenes: {
            type: 'array',
            description: '3-5 scenes per script.',
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
                scene_order: {
                  type: 'integer',
                  description: 'Zero-based scene index within the script.',
                },
                text_hebrew: {
                  type: 'string',
                  description:
                    'Voice-over text in spoken Israeli Hebrew. TTS-friendly (numbers spelled out, no symbols, no emojis).',
                },
                visual_prompt_english: {
                  type: 'string',
                  description:
                    'Detailed visual description in English for an AI video model. Include framing, setting, lighting, vertical 9:16 UGC handheld style.',
                },
                duration_seconds: {
                  type: 'integer',
                  description: 'Scene duration in seconds, between 3 and 7.',
                },
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
