// JSON schema for OpenAI structured-outputs (strict mode) — Script Engine V2.
//
// Strict mode constraints:
// - All listed properties must appear in `required`.
// - No min/max/minItems/maxItems/minLength/etc.
// - additionalProperties: false on every object.
// - Optional fields are expressed as nullable types via type: ["string", "null"].
//
// V2 architecture:
// - Each script must declare a `creative_strategy` block BEFORE writing scenes —
//   the model has to choose a strong advertising idea, not just paint scenes.
// - Each script must produce 3 `hook_options` and pick one (`selected_hook`).
// - Each script must self-score across 8 dimensions; the wrapper regenerates
//   any script with `quality_score.overall < 8`.
// - Per-scene fields capture the narrative function (`scene_goal`),
//   on-screen captions, camera direction, and performance notes — not just
//   spoken text.
//
// Backward-compat:
// - `visual_prompt_english` keeps the same key (consumed by the gpt-image-2
//   prompt builder downstream).
// - The wrapper maps `framework` → legacy `Script.angle` enum and `scene_goal`
//   → legacy `Scene.sceneType` enum so existing readers don't break.

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

// Visual-routing vocabularies. These were previously declared only in
// the runtime scene-routing module and inferred via regex on
// cameraDirection — now they're first-class structured-output fields
// so the LLM commits to a frame intent rather than us guessing.
const SCENE_GENERATION_TYPES = [
  'talking_head',
  'selfie_talking',
  'mirror_selfie_talking',
  'product_demo',
  'hold_product',
  'broll',
  'lifestyle',
  'lifestyle_product',
  'hands_only',
  'closeup_product',
  'before_after',
  'cta_visual',
] as const;

const FACE_VISIBILITY = [
  'clear_front_facing',
  'partial_face',
  'profile',
  'no_face',
] as const;

const PRIMARY_SUBJECTS = [
  'avatar',
  'product',
  'product_with_avatar',
  'product_in_use',
  'hands',
] as const;

const PRODUCT_VISIBILITY_PRIORITY = ['high', 'medium', 'low'] as const;

const CAMERA_FOCUS = ['face', 'product', 'action'] as const;

export const SCRIPT_FRAMEWORKS = FRAMEWORKS;
export const SCENE_GOALS_LIST = SCENE_GOALS;
export const SCENE_GENERATION_TYPES_LIST = SCENE_GENERATION_TYPES;
export const FACE_VISIBILITY_LIST = FACE_VISIBILITY;
export const PRIMARY_SUBJECTS_LIST = PRIMARY_SUBJECTS;
export const PRODUCT_VISIBILITY_PRIORITY_LIST = PRODUCT_VISIBILITY_PRIORITY;
export const CAMERA_FOCUS_LIST = CAMERA_FOCUS;

const SCENE_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'scene_order',
    'scene_goal',
    'spoken_text_hebrew',
    'on_screen_caption_hebrew',
    'visual_prompt_english',
    'camera_direction',
    'performance_note',
    'duration_seconds',
    // Visual-routing metadata (was previously implicit in the prompt;
    // now first-class so structured-output forces a commitment).
    'scene_generation_type',
    'face_visibility',
    'requires_lip_sync',
    // Product-first metadata (added Apr 2026 to break the
    // "every scene becomes a talking selfie" failure mode).
    'primary_subject',
    'must_show_product',
    'product_visibility_priority',
    'camera_focus',
    'show_face',
  ],
  properties: {
    scene_order: {
      type: 'integer',
      description: 'Zero-based scene index within the script.',
    },
    scene_goal: {
      type: 'string',
      enum: SCENE_GOALS as unknown as string[],
      description: 'The narrative function of this scene.',
    },
    spoken_text_hebrew: {
      type: 'string',
      description:
        'Voice-over text in spoken Israeli Hebrew. TTS-friendly: numbers spelled out ("חמישים אחוז" not "50%"), no symbols, no emojis, no English abbreviations.',
    },
    on_screen_caption_hebrew: {
      type: 'string',
      description:
        'Short burned-in caption (≤6 words, Hebrew). Can be the same as spoken text or a punchier paraphrase. Empty string if no caption.',
    },
    visual_prompt_english: {
      type: 'string',
      description:
        'Detailed visual description in English for gpt-image-2. Setting / action / camera framing / lighting / outfit. Do NOT describe the avatar — the reference image handles identity.',
    },
    camera_direction: {
      type: 'string',
      description:
        'Short English camera/blocking note (e.g. "selfie POV, slight upward angle", "over-shoulder, hands holding product").',
    },
    performance_note: {
      type: 'string',
      description:
        'Direction for the creator on tone/pacing/energy in 1 short Hebrew phrase.',
    },
    duration_seconds: {
      type: 'integer',
      description: 'Scene duration in seconds, between 3 and 8.',
    },
    scene_generation_type: {
      type: 'string',
      enum: SCENE_GENERATION_TYPES as unknown as string[],
      description:
        'Frame intent. talking_head/selfie_talking/mirror_selfie_talking → creator speaks to camera (face visible). product_demo/hold_product/closeup_product/hands_only/before_after/lifestyle_product/cta_visual → product is the visual hero, no speaking.',
    },
    face_visibility: {
      type: 'string',
      enum: FACE_VISIBILITY as unknown as string[],
      description:
        'How visible the creator\'s face is in this frame. clear_front_facing for talking-head only; no_face for hands/closeup/cta_visual.',
    },
    requires_lip_sync: {
      type: 'boolean',
      description:
        'true ONLY when scene_generation_type ∈ (talking_head, selfie_talking, mirror_selfie_talking) AND face_visibility=clear_front_facing. False everywhere else.',
    },
    primary_subject: {
      type: 'string',
      enum: PRIMARY_SUBJECTS as unknown as string[],
      description:
        'Who/what the camera is on. avatar = creator centered; product / product_with_avatar / product_in_use / hands = product is the hero. For non-talking scenes this MUST NOT be "avatar".',
    },
    must_show_product: {
      type: 'boolean',
      description:
        'true if the product is required to be visible in the frame at the start AND end of the clip. Default true for every scene except scene 0 (hook).',
    },
    product_visibility_priority: {
      type: 'string',
      enum: PRODUCT_VISIBILITY_PRIORITY as unknown as string[],
      description:
        'How dominant the product should be in the frame. high = product fills 30-60%; medium = clearly visible but not dominant; low = peripheral or absent (talking-head only).',
    },
    camera_focus: {
      type: 'string',
      enum: CAMERA_FOCUS as unknown as string[],
      description:
        'Where the camera "wants the eye" to land. face for talking-head, product for closeup/lifestyle, action for demo/hands_only/before_after.',
    },
    show_face: {
      type: 'boolean',
      description:
        'Whether the creator\'s face should appear at all. true for talking_head/selfie_talking/mirror_selfie_talking and lifestyle scenes where the creator is present; false for closeup_product/hands_only/cta_visual.',
    },
  },
} as const;

const SCRIPT_ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'framework',
    'creative_strategy',
    'hook_options',
    'selected_hook',
    'hook_reason',
    'cta',
    'target_audience',
    'estimated_duration_seconds',
    'scenes',
    'quality_score',
  ],
  properties: {
    framework: {
      type: 'string',
      enum: FRAMEWORKS as unknown as string[],
      description: 'The ad framework used for this script.',
    },
    creative_strategy: {
      type: 'object',
      additionalProperties: false,
      description:
        'The advertising idea behind this script. Choose a strong angle BEFORE writing any scenes.',
      required: [
        'core_insight',
        'audience_pain',
        'emotional_trigger',
        'product_mechanism',
        'main_objection',
        'persuasion_angle',
        'why_this_would_stop_scroll',
        'ugc_situation',
        'hook_type',
        'script_promise',
        'conversion_goal',
        'assumptions',
      ],
      properties: {
        core_insight: { type: 'string' },
        audience_pain: { type: 'string' },
        emotional_trigger: { type: 'string' },
        product_mechanism: { type: 'string' },
        main_objection: { type: 'string' },
        persuasion_angle: { type: 'string' },
        why_this_would_stop_scroll: { type: 'string' },
        ugc_situation: { type: 'string' },
        hook_type: { type: 'string' },
        script_promise: { type: 'string' },
        conversion_goal: { type: 'string' },
        assumptions: { type: 'array', items: { type: 'string' } },
      },
    },
    hook_options: {
      type: 'array',
      description:
        'Exactly 3 distinct opening-line options in spoken Israeli Hebrew, under ~12 words each.',
      items: { type: 'string' },
    },
    selected_hook: {
      type: 'string',
      description: 'The strongest of the 3 hook_options. Must match one verbatim.',
    },
    hook_reason: {
      type: 'string',
      description: 'Why the selected hook is the strongest. 1 short Hebrew sentence.',
    },
    cta: {
      type: 'string',
      description:
        'Short human-sounding call-to-action in Hebrew. No invented codes/discounts. No "המהפכה" / "מבצע" hype.',
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
      description:
        '4–5 scenes for most frameworks. fast_direct_response may use 3. Order: stop_scroll → establish_pain → introduce_product → prove_it_works → decision_push.',
      items: SCENE_ITEM_SCHEMA,
    },
    quality_score: {
      type: 'object',
      additionalProperties: false,
      description:
        'Honest self-evaluation of this script (1–10 each). The wrapper regenerates any script whose `overall` is below 8. Do not inflate scores.',
      required: [
        'hook_strength',
        'specificity',
        'israeli_authenticity',
        'emotional_pull',
        'visual_clarity',
        'conversion_potential',
        'tts_naturalness',
        'no_generic_cliches',
        'overall',
        'weakness_note',
      ],
      properties: {
        hook_strength: { type: 'integer', description: '1–10' },
        specificity: { type: 'integer', description: '1–10' },
        israeli_authenticity: { type: 'integer', description: '1–10' },
        emotional_pull: { type: 'integer', description: '1–10' },
        visual_clarity: { type: 'integer', description: '1–10' },
        conversion_potential: { type: 'integer', description: '1–10' },
        tts_naturalness: { type: 'integer', description: '1–10' },
        no_generic_cliches: { type: 'integer', description: '1–10' },
        overall: {
          type: 'number',
          description: 'Average of the 8 sub-scores. The wrapper regenerates if < 8.',
        },
        weakness_note: {
          type: 'string',
          description: 'One Hebrew sentence about the weakest aspect.',
        },
      },
    },
  },
} as const;

export const SCRIPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scripts'],
  properties: {
    scripts: {
      type: 'array',
      description:
        'Exactly 6 scripts, one per framework, in this order: problem_agitation_solution, skeptical_testimonial, demonstration_proof, price_alternative_anchor, relatable_israeli_moment, fast_direct_response.',
      items: SCRIPT_ITEM_SCHEMA,
    },
  },
} as const;

// Single-script schema for selective regeneration: the wrapper sends a
// targeted "rewrite this one stronger" prompt and gets back ONE script.
export const SINGLE_SCRIPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['script'],
  properties: {
    script: SCRIPT_ITEM_SCHEMA,
  },
} as const;
