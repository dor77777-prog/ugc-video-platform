// V27.11.PR5 — Concept-cards schema. Phase 1 of the concept-first
// architecture (gated behind SCRIPT_ENGINE_MODE=concept_first).
//
// The phase-1 LLM call returns 6 short concept cards — one per
// framework — in a single roundtrip. Each card commits to the
// CREATIVE concept (big_idea, specific_situation, hook, emotional
// trigger, persuasion angle, why_this_is_different) plus a 4-5
// bullet scene outline + a self-rated quality score. NO full
// spoken_text_hebrew, NO visual_prompt_english, NO full
// creative_strategy block.
//
// Phase 2 picks top N concepts by `estimated_quality` and expands
// each into a FULL script via the existing SINGLE_SCRIPT_JSON_SCHEMA
// (same shape as the legacy_full_batch path).
//
// Cost math (vs legacy_full_batch):
//   - Phase 1: 1 call × ~1.5K output tokens (6 cards × ~250 tokens)
//   - Phase 2: 3 parallel calls × ~5K output tokens each
//   - Net output: ~16.5K tokens vs legacy ~30K = ~45% cheaper.
//   - Net latency: phase-1 wait + max(phase-2 calls) — slightly
//     longer than legacy but the user can be shown phase-1 cards
//     immediately as a "thinking" preview.
//
// Token-cost trade: phase 1 still needs the system prompt + PI in
// its input. Both providers cache the system block, so phase 1's
// cache write also benefits phase 2 (within the 5-min cache window).

import { SCRIPT_FRAMEWORKS } from './script-json-schema';

const CONCEPT_CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'framework',
    'big_idea',
    'specific_situation',
    'selected_hook',
    'emotional_trigger',
    'persuasion_angle',
    'why_this_is_different_from_other_scripts',
    'scene_outline',
    'estimated_quality',
    'why_this_quality_score',
  ],
  properties: {
    framework: {
      type: 'string',
      enum: SCRIPT_FRAMEWORKS as unknown as string[],
      description:
        'The ad framework this concept commits to. One of the 6 in FRAMEWORK_ORDER. Each card in the batch must use a different framework.',
    },
    big_idea: {
      type: 'string',
      description:
        'One Hebrew sentence — the creative concept of THIS ad. Not a benefits list. Specific, sharp, ownable. Drives every scene below.',
    },
    specific_situation: {
      type: 'string',
      description:
        'A concrete Israeli daily situation in 1-2 sentences (e.g. "ערב שישי, חמישה אורחים, הכיריים נראות כמו זירת פשע"). Must feel local — the hook of the entire script depends on it.',
    },
    selected_hook: {
      type: 'string',
      description:
        'The strongest opening line for this concept in spoken Israeli Hebrew, under ~12 words. The same register as the final spoken_text_hebrew will use — natural, influencer-coded, NOT translated.',
    },
    emotional_trigger: {
      type: 'string',
      description:
        'One of: frustration / relief / pride / FOMO / curiosity / vindication / soft anger. Pick one.',
    },
    persuasion_angle: {
      type: 'string',
      description:
        'One of: skeptic-converts / price-anchor / authority / social-proof / quick-win / loss-aversion. Pick one.',
    },
    why_this_is_different_from_other_scripts: {
      type: 'string',
      description:
        'One short Hebrew sentence — what makes THIS concept structurally different from the other 5 in this batch (different hook archetype, different emotional trigger, different proof angle, different rhythm).',
    },
    scene_outline: {
      type: 'array',
      description:
        '4-5 ultra-short bullet sketches of how the script will unfold. Each item is one sentence in Hebrew describing what HAPPENS in that scene — NOT the spoken text, NOT the visual prompt. Just the narrative beat. Used by phase 2 to expand into full scenes that respect this outline.',
      items: { type: 'string' },
    },
    estimated_quality: {
      type: 'integer',
      description:
        'LLM self-rating 1-10 of how strong THIS concept is. Be honest — phase 2 expands the highest-rated concepts first. Inflating the score doesn\'t improve the final ad, it just spends compute on weak concepts.',
    },
    why_this_quality_score: {
      type: 'string',
      description:
        'One short Hebrew sentence about the strengths or weaknesses that drove the estimated_quality value. Goes to admin debug.',
    },
  },
} as const;

export const CONCEPT_CARDS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts'],
  properties: {
    concepts: {
      type: 'array',
      description:
        'Exactly 6 concept cards, one per framework, in this order: problem_agitation_solution, skeptical_testimonial, demonstration_proof, price_alternative_anchor, relatable_israeli_moment, fast_direct_response.',
      items: CONCEPT_CARD_SCHEMA,
    },
  },
} as const;
