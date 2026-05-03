// Single source of truth for the "spoken / casual / Israeli" register
// markers used by:
//   - apps/web/scripts/eval/lib/canonical-markers.ts (re-exports from here)
//   - apps/web/lib/llm/register-validator.ts (Sub-task 4 production gate)
//
// Extracted to packages/shared in V28.0.ST4 so the eval (which measures
// the metric) and production code (which enforces it) cannot drift.
//
// When tweaking this list, every consumer recompiles automatically —
// no copy-paste between packages.

/** Frozen list of canonical "spoken Israeli" markers. Counted on
 *  spoken_text_hebrew per scene. The presence of >= 1 marker per
 *  non-decision_push scene is the load-bearing register signal
 *  Sub-task 4's gate (REG-04) measures (`casual_markers_per_scene >= 1.0`). */
export const CANONICAL_MARKERS = Object.freeze([
  'תכל\'ס',     // tachles — straight talk
  'תכל׳ס', // same with hebrew geresh codepoint U+05F3 (production sometimes mixes)
  'וואלה',      // walla — really / well
  'סבבה',       // sababa — okay / cool
  'פשוט',       // pashut — simply / just
  'בכלל',       // bichlal — at all / completely
  'אחותי',      // ahoti — sister / girl (only female-register; OK for our use)
  'תקשיבי',     // takshivi — listen up (female imperative)
  'תקשיב',      // takshiv — listen up (male imperative)
  'לא נורמלי',  // lo normali — insanely (often paired with adj.)
] as const);

export type CanonicalMarker = (typeof CANONICAL_MARKERS)[number];

/** Match a marker on word boundaries with tolerance for the apostrophe
 *  variant (`'` ASCII vs `׳` Hebrew geresh). The Hebrew text rendering
 *  pipeline doesn't normalize either so we count both. */
const MARKER_REGEXES = CANONICAL_MARKERS.map(
  (m) =>
    // \\p{L} = unicode letter; surrounding char must NOT be a letter.
    new RegExp(`(?:^|[^\\p{L}])(${escapeRegex(m)})(?=$|[^\\p{L}])`, 'gu'),
);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface MarkerCount {
  /** Total raw matches across all canonical markers. */
  total: number;
  /** Distinct markers that fired at least once in this text. */
  unique: string[];
  /** Per-marker breakdown. */
  perMarker: Record<string, number>;
}

/** Count canonical markers in a Hebrew text. Designed for short
 *  spoken_text_hebrew strings (one scene at a time); not optimized
 *  for paragraphs. */
export function countMarkersInHebrew(text: string): MarkerCount {
  const perMarker: Record<string, number> = {};
  let total = 0;
  for (let i = 0; i < CANONICAL_MARKERS.length; i++) {
    const marker = CANONICAL_MARKERS[i];
    const re = MARKER_REGEXES[i];
    if (!marker || !re) continue;
    re.lastIndex = 0;
    let matches = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches++;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (matches > 0) {
      // Both `'` and `׳` variants of tachles share the same logical key.
      const key = marker.replace(/[׳']/g, '׳');
      perMarker[key] = (perMarker[key] ?? 0) + matches;
      total += matches;
    }
  }
  return {
    total,
    unique: Object.keys(perMarker),
    perMarker,
  };
}

/** Hebrew-formatted display list of the canonical markers — used in
 *  prompts so the LLM sees the exact list it's expected to draw from. */
export const CANONICAL_MARKERS_DISPLAY_HEBREW =
  '[תכל\'ס / וואלה / סבבה / פשוט / בכלל / אחותי / תקשיבי / תקשיב / לא נורמלי]';
