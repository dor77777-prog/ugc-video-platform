// V27.11.PR6 — Concept-cards schema (interactive mode).
//
// Replaces PR5's lighter auto-pick schema. PR6's interactive UX
// shows these cards to the USER for human selection (1-3 to expand
// into full scripts), so each card carries a richer creative/audience/
// proof breakdown than PR5 had:
//   - selected_hook + hook_direction         (creative angle)
//   - target_audience_moment                 (audience specificity)
//   - product_proof_moment                   (the visual that converts)
//   - why_it_fits_product / why_it_fits_audience (justification visible to user)
//   - risk_notes                             (when the LLM flags a risk)
//
// Server-side wrapper (NOT in this schema, added at storage time
// in concept-storage.ts): concept_id (UUID), slot_index, status,
// regenerationCount, regeneratedFromConceptId.
//
// Phase 2 (expand) consumes the stored card directly via
// buildExpansionPromptFragment in concept-engine.ts and produces a
// full script via the existing SINGLE_SCRIPT_JSON_SCHEMA path.
//
// Anti-collage rules (PR1/PR4) and Israeli realism (V14) are
// enforced at the system-prompt + image-brief layer — concept cards
// don't repeat them.

import { SCRIPT_FRAMEWORKS } from './script-json-schema';

const CONCEPT_CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'framework',
    'big_idea',
    'selected_hook',
    'hook_direction',
    'target_audience_moment',
    'emotional_trigger',
    'product_proof_moment',
    'scene_outline',
    'why_it_fits_product',
    'why_it_fits_audience',
    'estimated_quality',
    'risk_notes',
  ],
  properties: {
    framework: {
      type: 'string',
      enum: SCRIPT_FRAMEWORKS as unknown as string[],
      description:
        'The ad framework this concept commits to. One of the 6 in FRAMEWORK_ORDER. Across the batch every framework must appear at least once if possible.',
    },
    big_idea: {
      type: 'string',
      description:
        'One Hebrew sentence — the creative concept of THIS ad. Not a benefits list. Specific, sharp, ownable. Drives every scene below.',
    },
    selected_hook: {
      type: 'string',
      description:
        'Strongest opening line in spoken Israeli Hebrew, under ~12 words. Same register as the final spoken_text_hebrew — natural, influencer-coded, NOT translated.',
    },
    hook_direction: {
      type: 'string',
      description:
        'One short Hebrew sentence describing the hook archetype: confession / frustration / mistake / curiosity / price_shock / wish_i_knew / i_stopped_doing / nobody_tells_you. Helps the user compare cards and avoids two cards picking the same hook flavor.',
    },
    target_audience_moment: {
      type: 'string',
      description:
        'A concrete Israeli daily situation that THIS audience is in when they need the product. 1-2 short sentences. ("ערב שישי, חמישה אורחים, הכיריים נראות כמו זירת פשע" — not "אמהות עסוקות".) Drives every scene\'s grounding.',
    },
    emotional_trigger: {
      type: 'string',
      description:
        'One of: frustration / relief / pride / FOMO / curiosity / vindication / soft anger. The single emotion this concept rides.',
    },
    product_proof_moment: {
      type: 'string',
      description:
        'The visual moment that makes the product believable. What the viewer SEES that converts skepticism to interest. Specific (closeup, label, before-state vs result-state across two scenes, reaction). Cross-scene narrative — never a single-frame split.',
    },
    scene_outline: {
      type: 'array',
      description:
        '4-5 ultra-short bullet sketches of how the script will unfold. Each item is one Hebrew sentence describing what HAPPENS in that scene — NOT the spoken text, NOT the visual prompt. Used by phase 2 to expand into full scenes respecting this skeleton.',
      items: { type: 'string' },
    },
    why_it_fits_product: {
      type: 'string',
      description:
        'One short Hebrew sentence — why THIS concept fits THIS product specifically (not a generic ad). References the dossier, mechanism, or audience-pain.',
    },
    why_it_fits_audience: {
      type: 'string',
      description:
        'One short Hebrew sentence — why THIS concept lands with the Israeli audience targeted by this product. References specific moments, register, or local realism.',
    },
    estimated_quality: {
      type: 'integer',
      description:
        'LLM self-rating 1-10 of how strong this concept is. Used to preselect top 3 in the UI; user can override. Be honest — inflating the score just hides weak concepts.',
    },
    risk_notes: {
      type: ['string', 'null'] as unknown as 'string',
      description:
        'When this concept has a known risk (cliché hook, weak proof moment, audience mismatch), one short Hebrew sentence describing it. null when no risk noted.',
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
        'Exactly 6 concept cards. The framework distribution should hit each of the 6 frameworks at least once when feasible; the model may double up only when a framework is genuinely unsuited to the product.',
      items: CONCEPT_CARD_SCHEMA,
    },
  },
} as const;

/** V27.11.PR6 — schema for partial regeneration. The LLM receives
 *  conceptsToKeep + conceptsToReplace context and must return EXACTLY
 *  N replacement cards (N = conceptsToReplace.length), in slot order
 *  matching the request. Server side stitches them back into the
 *  pendingConcepts array preserving slot_index. */
export const CONCEPT_REGEN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts'],
  properties: {
    concepts: {
      type: 'array',
      description:
        'Replacement concept cards in the same order as requested. Each must use a hook archetype + framework + big_idea that does NOT duplicate any kept concept and does NOT repeat the weakness of the rejected concept it replaces.',
      items: CONCEPT_CARD_SCHEMA,
    },
  },
} as const;
