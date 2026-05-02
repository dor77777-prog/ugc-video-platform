// Framework structural signatures — STUB for Sub-task 6.
//
// In Sub-task 1 the framework_signal_match metric is computed by
// asking a Sonnet judge "which of {6 framework names} is this?" given
// only the spoken text. No structural-signature regex is used yet.
//
// In Sub-task 6 (CONDITIONAL — only fires if baseline framework_signal_match
// < 0.80) this file is expanded with one structural signature per
// framework (e.g. skeptical_testimonial requires confession in scene 0
// + vindication in last scene). That work is intentionally NOT planned
// upfront — see PLAN.md Sub-task 6 for the trigger condition.

import type { ScriptFrameworkSlug } from '../../../lib/llm/scripts';

export const FRAMEWORK_NAMES_HEBREW: Record<ScriptFrameworkSlug, string> = {
  problem_agitation_solution: 'בעיה → החרפה → פתרון',
  skeptical_testimonial: 'עדות ספקנית',
  demonstration_proof: 'הוכחה ויזואלית',
  price_alternative_anchor: 'עוגן מחיר/אלטרנטיבה',
  relatable_israeli_moment: 'רגע ישראלי מוכר',
  fast_direct_response: 'תגובה ישירה מהירה',
};

/** Verbatim list — used by the framework_signal_match judge to know
 *  the closed-set of allowed answers. */
export const FRAMEWORK_SLUGS: ScriptFrameworkSlug[] = [
  'problem_agitation_solution',
  'skeptical_testimonial',
  'demonstration_proof',
  'price_alternative_anchor',
  'relatable_israeli_moment',
  'fast_direct_response',
];
