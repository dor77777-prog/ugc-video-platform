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

// V14 PR2 added 'selfie_in_mirror' so the script can commit a scene to the
// mirror-selfie technique upstream and the brief builder can deterministically
// dispatch the mirror_selfie_snippet (FRAME_PROMPT_TECHNIQUES.md §1).
const CAMERA_FOCUS = [
  'face',
  'product',
  'action',
  'environment',
  'selfie_in_mirror',
] as const;

// V5 Israeli-realism vocabulary. The image prompt always prepends a
// generic Israeli-realism boilerplate, but committing the LLM to a
// specific environment_type + environment_style upstream means the
// visual_prompt_english itself describes a believable Israeli setting
// (kitchen vs bathroom vs balcony, modern vs practical) rather than
// drifting to a generic "kitchen counter" stock-photo composition.
const ENVIRONMENT_TYPES = [
  'kitchen',
  'bathroom',
  'bedroom',
  'living_room',
  'balcony',
  'office',
  'car',
  'street',
  'store',
  'family_home',
  'kids_room',
  'neutral_indoor',
] as const;

const ENVIRONMENT_STYLES = [
  'modern_israeli_apartment',
  'practical_family_home_israel',
  'urban_israeli_home',
  'premium_modern_israeli_home',
  'israeli_bathroom_modern',
  'israeli_kitchen_modern',
  'israeli_home_office',
  'israeli_city_street',
  'israeli_balcony',
  'neutral_israeli_indoor',
] as const;

// V14 PR5 — six canonical genres. Maps 1:1 to the FRAMEWORKS list but uses
// the plain-English genre names from HEBREW_SCRIPT_CREATIVE_RULES.md §2 so
// downstream UI / admin debug can show the genre without translating from
// the framework slug. Optional in the schema for back-compat with V5
// scripts saved before V6.
const GENRES = [
  'problem_solution',
  'ugc_review_mock_confession',
  'listicle',
  'day_in_the_life',
  'comparison',
  'tutorial',
] as const;

// V14 PR5 — eight voice-profile archetypes. Drives downstream voice
// selection in lib/voice/voice-presets.ts. Optional for back-compat.
const VOICE_PROFILES = [
  'young_female_warm',
  'young_female_energetic',
  'young_male_warm',
  'young_male_energetic',
  'mature_female_authoritative',
  'mature_female_intimate',
  'mature_male_authoritative',
  'mature_male_intimate',
] as const;

// V14 PR5 — eight canonical Israeli setting cue IDs. The deterministic
// image-brief-builder (israeli-realism-rules.ts SCENE_PRESETS) expands
// these into atomic cues. Per-scene field, optional. The string '' or
// null both signal "no preset, use environment_type defaults".
const ISRAELI_SETTING_CUES = [
  'kitchen_with_morning_light',
  'bathroom_morning_routine',
  'bedroom_evening',
  'living_room_couch',
  'tel_aviv_street_evening',
  'supermarket_aisle',
  'gym_modern',
  'outdoor_park_afternoon',
] as const;

export const SCRIPT_FRAMEWORKS = FRAMEWORKS;
export const SCENE_GOALS_LIST = SCENE_GOALS;
export const SCENE_GENERATION_TYPES_LIST = SCENE_GENERATION_TYPES;
export const FACE_VISIBILITY_LIST = FACE_VISIBILITY;
export const PRIMARY_SUBJECTS_LIST = PRIMARY_SUBJECTS;

// V27.9 — frame strategy enum used by both the schema (above) and
// downstream consumers (image-brief-builder, scene-rules, admin debug).
export const FRAME_STRATEGIES = [
  'pure_setup',
  'product_reveal',
  'product_in_use',
  'product_focus',
  'comparison_split',
  'reaction_shot',
  'cta_close',
] as const;
export const FRAME_STRATEGIES_LIST = FRAME_STRATEGIES;
export type FrameStrategy = (typeof FRAME_STRATEGIES)[number];
export const PRODUCT_VISIBILITY_PRIORITY_LIST = PRODUCT_VISIBILITY_PRIORITY;
export const CAMERA_FOCUS_LIST = CAMERA_FOCUS;
export const ENVIRONMENT_TYPES_LIST = ENVIRONMENT_TYPES;
export const ENVIRONMENT_STYLES_LIST = ENVIRONMENT_STYLES;
export const GENRES_LIST = GENRES;
export const VOICE_PROFILES_LIST = VOICE_PROFILES;
export const ISRAELI_SETTING_CUES_LIST = ISRAELI_SETTING_CUES;

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
    // V5 Israeli realism + scene-purpose justification.
    'environment_type',
    'environment_style',
    'israeli_environment_required',
    'local_realism_notes',
    'why_this_scene_exists',
    // V14 PR5 — optional Israeli setting cue ID. Maps to one of the 8
    // canonical scene presets in apps/web/lib/scene-planning/israeli-realism-rules.ts.
    'israeli_setting_cue',
    // V27.9 — narrative coherence between scenes. Forces the LLM to
    // commit to a 1-line link explaining how this scene continues
    // from the previous one. Nullable for scene_order=0 and for
    // back-compat with V14 scripts already saved in DB.
    'narrative_link_from_previous',
    // V27.9 — frame strategy. Decouples "is the product visible?"
    // from "how prominent is it?" — answers a third question:
    // "what does this frame DO with the product?" Comparison scenes
    // need it dominant; pain scenes shouldn't have it at all.
    'frame_strategy',
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
        'true if the product is required to be visible in the frame at the start AND end of the clip. V27.9 — coordinate with frame_strategy: pure_setup (pain/hook before product introduced) → false; everything else → true. Do NOT force product into a pain/setup scene; it reads as desperate ad copy.',
    },
    product_visibility_priority: {
      type: 'string',
      enum: PRODUCT_VISIBILITY_PRIORITY as unknown as string[],
      description:
        'How dominant the product should be in the frame. V27.9 mapping by frame_strategy: comparison_split / product_focus / cta_close → high (product fills 40-70%); product_reveal / product_in_use → high or medium depending on whether the demo IS the product (high) or context is needed (medium); reaction_shot → low (peripheral); pure_setup → low (none). The image-brief-builder reads this directly.',
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
    environment_type: {
      type: 'string',
      enum: ENVIRONMENT_TYPES as unknown as string[],
      description:
        'High-level location category. Drives Israeli-realism boilerplate selection downstream (kitchen → Israeli kitchen layout, bathroom → Israeli bathroom proportions + tile style, etc.).',
    },
    environment_style: {
      type: 'string',
      enum: ENVIRONMENT_STYLES as unknown as string[],
      description:
        'Specific Israeli home/lifestyle aesthetic. Modern, practical, premium, or urban — but always locally realistic. Foreign suburban or American showroom looks are forbidden.',
    },
    israeli_environment_required: {
      type: 'boolean',
      description:
        'Should be true for every scene by default. Set to false ONLY for scenes deliberately set abroad (rare). When true, the image prompt forces Israeli outlets, switches, apartment proportions, and Hebrew-friendly visible text.',
    },
    local_realism_notes: {
      type: 'string',
      description:
        'Free-form Hebrew or English notes about local realism cues for this specific scene (e.g. "trissim shutters visible on the balcony", "Israeli outlet next to the sink", "Hebrew note on the fridge"). Empty string allowed but discouraged.',
    },
    why_this_scene_exists: {
      type: 'string',
      description:
        '1 short Hebrew sentence — what conversion-job does this specific scene do? ("hook stops the scroll", "establishes the daily pain", "shows the product solving it in one tap"). Used by the editor + admin forensics to spot redundant scenes.',
    },
    israeli_setting_cue: {
      type: ['string', 'null'] as unknown as 'string',
      enum: [...ISRAELI_SETTING_CUES, null] as unknown as string[],
      description:
        'V14 PR5. One of the 8 canonical Israeli scene preset IDs (kitchen_with_morning_light / bathroom_morning_routine / bedroom_evening / living_room_couch / tel_aviv_street_evening / supermarket_aisle / gym_modern / outdoor_park_afternoon) or null when no preset fits. The deterministic image-brief-builder expands this into atomic Israeli realism cues.',
    },
    narrative_link_from_previous: {
      type: ['string', 'null'] as unknown as 'string',
      description:
        'V27.9 — 1-sentence Hebrew description of how this scene continues from the previous one. Examples: "ממשיך את הכאב שהוצג בסצנה 0 ומכניס את הראייה הראשונה של המוצר", "תגובה רגשית למה שעשה המוצר בסצנה 2", "עוצר את הסיפור ומציע לצופה החלטה". MUST be null only for scene_order=0 (the first scene has no previous). For every other scene this MUST be a real, specific link — not a generic "continues the script". A reader should be able to read scene N-1 then scene N and feel the bridge. If you can\'t describe the link in one sentence, the scene is a non-sequitur — rewrite it.',
    },
    frame_strategy: {
      type: 'string',
      enum: FRAME_STRATEGIES as unknown as string[],
      description:
        'V27.9 — what does this frame DO with the product? Decouples "is product visible" (must_show_product) from "how prominent" (product_visibility_priority) by answering a third question. pure_setup = pain/hook before product is introduced (must_show_product=false). product_reveal = first time the product appears, frame composed around it. product_in_use = demo / hands. product_focus = closeup / detail. comparison_split = the scene compares the product to a category alternative — the product MUST be dominant in the frame, not implied. reaction_shot = creator reacting to a result; product peripheral. cta_close = final decision push; product is hero. Drives the deterministic image-brief-builder downstream.',
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
    'diversity_notes',
    'music_profile',
    // V14 PR5 — new top-level metadata. All nullable for back-compat
    // with V5 scripts already saved in DB.
    'genre',
    'voice_profile',
    'hook_alternatives',
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
        // V2 fields (kept for back-compat).
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
        // V5 fields — force the model to commit to a real ad concept
        // before writing any scene text.
        'big_idea',
        'specific_situation',
        'product_role',
        'proof_moment',
        'why_this_is_different_from_other_scripts',
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
        big_idea: {
          type: 'string',
          description:
            'One Hebrew sentence that names the creative concept of THIS ad. Not a benefits list.',
        },
        specific_situation: {
          type: 'string',
          description:
            'A concrete Israeli daily situation in 1-2 sentences (e.g. "ערב שישי, חמישה אורחים, הכיריים נראות כמו זירת פשע"). Must feel local.',
        },
        product_role: {
          type: 'string',
          description:
            'How the product enters the story naturally. Not "the product is amazing" — what role it plays in the situation.',
        },
        proof_moment: {
          type: 'string',
          description:
            'The visual moment that makes the product believable. What the viewer SEES that converts skepticism to interest.',
        },
        why_this_is_different_from_other_scripts: {
          type: 'string',
          description:
            'One short Hebrew sentence — what makes THIS script structurally different from the other 5 in this batch (different hook archetype, different emotional trigger, different proof angle, etc.).',
        },
      },
    },
    hook_options: {
      type: 'array',
      description:
        'Exactly 5 distinct opening-line options in spoken Israeli Hebrew, under ~12 words each. Each option should come from a different hook archetype (confession / frustration / curiosity / mistake / skeptical / price_shock / wish_i_knew / i_stopped_doing / nobody_tells_you).',
      items: { type: 'string' },
    },
    selected_hook: {
      type: 'string',
      description: 'The strongest of the 5 hook_options. Must match one verbatim.',
    },
    hook_reason: {
      type: 'string',
      description: 'Why the selected hook is the strongest. 1 short Hebrew sentence.',
    },
    genre: {
      type: ['string', 'null'] as unknown as 'string',
      enum: [...GENRES, null] as unknown as string[],
      description:
        'V14 PR5. One of 6 plain-English genre labels (problem_solution / ugc_review_mock_confession / listicle / day_in_the_life / comparison / tutorial). Maps 1:1 to framework. Optional for back-compat with V5 scripts.',
    },
    voice_profile: {
      type: ['string', 'null'] as unknown as 'string',
      enum: [...VOICE_PROFILES, null] as unknown as string[],
      description:
        'V14 PR5. One of 8 voice archetypes — drives downstream voice selection (gender × age × tone). Pick to match the script\'s persona / age / tone. Optional for back-compat.',
    },
    hook_alternatives: {
      type: 'array',
      items: { type: 'string' },
      description:
        'V14 PR5. The 4 hook_options that were NOT selected (the script\'s hook_options minus selected_hook). For future A/B testing surfaces. Length should be 4 when hook_options has 5; OK to be empty for back-compat.',
    },
    diversity_notes: {
      type: 'string',
      description:
        '1 short Hebrew sentence — what makes this script feel DIFFERENT from the other 5 scripts in the batch (different hook archetype, different emotional trigger, different proof angle, different scene rhythm). Used by the regen step to spot duplicates.',
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
        // V5 quality dimensions.
        'creative_originality',
        'product_visibility',
        'israeli_visual_realism',
        'duration_fit',
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
        creative_originality: {
          type: 'integer',
          description:
            '1–10. How fresh is the angle? Is this a NEW idea vs. one of the other 5 scripts in the batch? <8 means too similar to siblings — regen.',
        },
        product_visibility: {
          type: 'integer',
          description:
            '1–10. Is the product the visual hero in most scenes? Does it appear by Scene 2? <8 means avatar-dominant — regen.',
        },
        israeli_visual_realism: {
          type: 'integer',
          description:
            '1–10. Do the visual_prompt_english + environment_type fields commit to a believable Israeli setting? Foreign suburban / showroom interiors = <5.',
        },
        duration_fit: {
          type: 'integer',
          description:
            '1–10. Does the scene count + scene durations + spoken word total match the selected video_duration_mode? 30s pacing on a 15s ad = <5.',
        },
        overall: {
          type: 'number',
          description: 'Average of the 12 sub-scores. The wrapper regenerates if < 8.',
        },
        weakness_note: {
          type: 'string',
          description: 'One Hebrew sentence about the weakest aspect.',
        },
      },
    },
    music_profile: {
      type: 'object',
      additionalProperties: false,
      description:
        'Background-music intent. The downstream selector picks a local track from apps/web/public/music/ that best matches this profile. Choose mood/energy/style based on product category, emotional_trigger, framework, and audience. Bias LOW or MEDIUM energy — the Hebrew voice-over must stay dominant. Only use "high" energy when the product is fitness / sports / direct response.',
      required: [
        'enabled_by_default',
        'mood',
        'energy',
        'style',
        'reason',
        'target_volume',
        'duck_under_voice',
      ],
      properties: {
        enabled_by_default: {
          type: 'boolean',
          description:
            'Whether this script *would* benefit from music if the user has the toggle on. Almost always true. The user toggle still wins.',
        },
        mood: {
          type: 'string',
          enum: [
            'warm_lifestyle',
            'clean_premium',
            'playful_family',
            'tech_minimal',
            'energetic_demo',
            'soft_beauty',
            'calm_wellness',
            'direct_response_light',
            'luxury_elegant',
            'general_ugc',
          ],
        },
        energy: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
        },
        style: {
          type: 'string',
          enum: [
            'soft_pop',
            'ambient',
            'minimal_electronic',
            'playful',
            'premium',
            'acoustic',
            'cinematic_light',
            'upbeat',
            'general_ugc',
          ],
        },
        reason: {
          type: 'string',
          description:
            'One short sentence explaining why this mood/energy fits this product + script. Used in admin debug output.',
        },
        target_volume: {
          type: 'number',
          description:
            'Music gain target in linear units. Defaults to 0.08. Clamped to [0.06, 0.12] downstream — voice must stay dominant.',
        },
        duck_under_voice: {
          type: 'boolean',
          description:
            'Hint to the mixer to duck music when voice is active. May be ignored by the MVP mixer; safe default true.',
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
