// Israeli realism rules — V13 PR2.
//
// Extracted from the inline blocks that lived in image-brief-builder.ts so
// the rules are testable in isolation, applied consistently across every
// place that builds a prompt, and easy to extend without touching the brief
// builder. The rules ARE NOT an aesthetic downgrade — modern, renovated,
// and premium Israeli interiors all qualify. The point is local
// believability: the frame should look like Tel Aviv / Haifa / Beer Sheva
// homes, not American suburbia.
//
// This module is deterministic (no LLM, no I/O) and pure: same input →
// same output.

export interface IsraeliRealismBlock {
  /** Universal mustShow items — added to every brief regardless of scene type. */
  mustShow: string[];
  /** Universal mustAvoid items — added to every brief regardless of scene type. */
  mustAvoid: string[];
  /** A single semicolon-joined paragraph for the ISRAELI CONTEXT prompt section. */
  promptText: string;
}

export interface BuildIsraeliRealismOptions {
  /** When true, relax the "studio portrait look" guard — talking heads are
   *  filmed selfie-style, the studio-portrait warning is the relevant one. */
  isTalking?: boolean;
  /** When true, relax forced product-context cues so the room can read as
   *  the user's actual messy moment, not a polished demo. */
  isProblem?: boolean;
}

const REQUIRED_PROMPT_LINES = [
  'every visible interior must feel like a believable Israeli home (modern apartment is fine, foreign suburban is NOT)',
  'visible wall outlets / switches / plug sockets must be Israeli-pattern (Type H)',
  'any visible text or signage must be Hebrew or neutral — no random English shop signs',
  'apartment proportions must be realistic Israeli scale, not oversized US kitchens',
] as const;

const FORBIDDEN_BASE = [
  'foreign suburban / oversized US-style kitchen',
  'foreign-looking outlets, switches, or plug sockets',
  "random English signage that doesn't match an Israeli setting",
  'stock-photo polish — over-clean staged composition',
] as const;

const TALKING_HEAD_FORBIDDEN = 'studio portrait look on selfie/talking-head scenes';

export function buildIsraeliRealismBlock(
  opts: BuildIsraeliRealismOptions = {},
): IsraeliRealismBlock {
  const mustAvoid: string[] = [...FORBIDDEN_BASE];
  // The studio-portrait guard is meaningful for selfie/talking scenes; on
  // problem/demo scenes the camera framing already excludes a "studio"
  // look so it adds noise. Apply when talking explicitly true OR when
  // unspecified (legacy callers that don't know the scene type).
  if (opts.isTalking !== false) {
    mustAvoid.push(TALKING_HEAD_FORBIDDEN);
  }

  // Currently no positive mustShow items belong here — REQUIRED_PROMPT_LINES
  // are constraints expressed via the prompt text rather than the
  // mustShow list (which is for camera-frame requirements). Returning an
  // empty array makes the contract clear and keeps room for future rules
  // (e.g. "Israeli light quality" if we ever push the realism further).
  const mustShow: string[] = [];

  const promptText = REQUIRED_PROMPT_LINES.join('; ');

  return { mustShow, mustAvoid, promptText };
}
