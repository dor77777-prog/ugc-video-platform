// Canonical Hebrew "spoken / casual / Israeli" register markers.
// Single source of truth used by:
//   - apps/web/scripts/eval/metrics/casual-markers.ts (the eval metric)
//   - apps/web/lib/llm/register-validator.ts (Sub-task 4 production gate)
//
// When tweaking this list, update both consumers. Promotion to
// packages/shared/src/register/markers.ts happens in Sub-task 4 to
// avoid duplicating the constant across packages — for Sub-task 1 the
// list lives here only, since production code doesn't import it yet.

/** Frozen list of canonical "spoken Israeli" markers. Counted on
 *  spoken_text_hebrew per scene. The presence of >= 1 marker per
 *  non-decision_push scene is a hard contract REG-04 gates against. */
export const CANONICAL_MARKERS = Object.freeze([
  'תכל\'ס',     // tachles  — straight talk
  'תכל׳ס', // same with hebrew geresh codepoint U+05F3 (production sometimes mixes)
  'וואלה',      // walla    — really / well
  'סבבה',       // sababa   — okay / cool
  'פשוט',       // pashut   — simply / just
  'בכלל',       // bichlal  — at all / completely
  'אחותי',      // ahoti    — sister / girl (only female-register; OK for our use)
  'תקשיבי',     // takshivi — listen up (female imperative)
  'תקשיב',      // takshiv  — listen up (male imperative)
  'לא נורמלי',  // lo normali — insanely (often paired with adj.)
] as const);

/** Match a marker on word boundaries with tolerance for the apostrophe
 *  variant (`'` ASCII vs `׳` Hebrew geresh). The Hebrew text rendering
 *  pipeline doesn't normalize either so we count both. */
const MARKER_REGEXES = CANONICAL_MARKERS.map(
  (m) =>
    // \\p{L} = unicode letter; surrounding char must NOT be a letter.
    // We allow leading/trailing whitespace, punctuation, line ends.
    new RegExp(`(?:^|[^\\p{L}])(${escapeRegex(m)})(?=$|[^\\p{L}])`, 'gu'),
);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface MarkerCount {
  /** Total raw matches across all canonical markers (one substring may
   *  hit multiple markers if it overlaps; we sum independently per marker). */
  total: number;
  /** Distinct markers that fired at least once in this text. */
  unique: string[];
  /** Per-marker breakdown — the marker key plus how many times it hit. */
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
      // Avoid zero-length-match infinite loop for safety
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
