// V27.11.PR6 / V28.0.ST3 — Concept-cards schema (interactive mode).
//
// Schema evolved at V28.0.ST3 (Diversity Enforcement) per the
// milestone audit:
//   - ADDED:    big_idea_axis (enum, required) — orthogonality lever.
//               6 axes; the LLM MUST use 6 distinct axes across the
//               batch (post-gen validation + retry in concept-engine.ts).
//   - REMOVED:  estimated_quality (LLM self-rated 8-9 on every card;
//               gating on it was meaningless — see baseline review
//               in .planning/STATE.md). Replaced as the preselection
//               signal by axis coverage.
//   - KEPT:     risk_notes (free-text "I see a risk" ≠ self-quality;
//               this remains useful for the user's review).
//
// Backwards compat: legacy pendingConcepts blobs in DB persisted with
// estimated_quality but without big_idea_axis are normalized at read
// time in concept-storage.ts (axis defaults to 'unknown', which the UI
// renders without a chip and the validator treats as ungated).
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

/** V28.0.ST3 — orthogonal axes the LLM commits to per concept card.
 *  Sub-task 3's load-bearing diversity lever: the prompt + post-gen
 *  validator together enforce that the 6-card batch uses 6 distinct
 *  axis values, so two concepts can't share a "big_idea direction"
 *  even when they pick different frameworks/hooks. */
export const BIG_IDEA_AXES = [
  'convenience',         // saves time / effort / clicks / steps
  'proof',               // visible result / before-after across scenes / demo
  'price',               // value / anchor against alternative cost
  'emotion',             // relief / pride / vindication / soft anger lands
  'mechanism',           // HOW it works (ingredient / engineering / design)
  'social_validation',   // others use it / community / trust signal
] as const;

export type BigIdeaAxis = (typeof BIG_IDEA_AXES)[number];

const CONCEPT_CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'framework',
    'big_idea',
    'big_idea_axis',
    'selected_hook',
    'hook_direction',
    'target_audience_moment',
    'emotional_trigger',
    'product_proof_moment',
    'scene_outline',
    'why_it_fits_product',
    'why_it_fits_audience',
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
    big_idea_axis: {
      type: 'string',
      enum: BIG_IDEA_AXES as unknown as string[],
      description:
        'V28.0.ST3 — the orthogonal axis this big_idea rides. One of 6: convenience (saves time/effort), proof (visible result/demo), price (value/anchor), emotion (relief/pride/vindication), mechanism (HOW it works), social_validation (others use it/trust). EVERY card in the 6-card batch MUST use a DIFFERENT axis. The system prompt enforces this at generation time; the engine validates post-generation and retries on duplicates.',
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
        'Replacement concept cards in the same order as requested. Each must use a hook archetype + framework + big_idea that does NOT duplicate any kept concept and does NOT repeat the weakness of the rejected concept it replaces. V28.0.ST3: each replacement must use a big_idea_axis NOT used by any conceptsToKeep — the user prompt carries the forbidden axis list.',
      items: CONCEPT_CARD_SCHEMA,
    },
  },
} as const;
