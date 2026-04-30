// Scene variation ledger + scroll-stopper selection — V14 PR4.
//
// Two pure utilities that work together:
//
// 1. SceneVariationLedger — a per-script in-memory record of which
//    cameraFocus / sceneGenerationType / primarySubject values have been
//    used by the earlier scenes of the same script. The brief builder
//    can consult it to:
//      - log diagnostic counts (PR6 admin debug surface)
//      - bias toward unused values when the script LLM didn't pin one
//      - flag low-diversity ads (six scenes all in the kitchen, all
//        product_demo) that won't read well on a TikTok feed
//
// 2. Scroll-stopper selection — exactly one scene per ad is promoted to
//    "scroll-stopper" status: an unusual angle, tight framing, or color
//    contrast meant to be the memorable beat. Chosen deterministically
//    from scene order (hook scene 0 OR final scene, whichever the
//    chooseScrollStopperIndex policy says). The buildScrollStopperLevers
//    helper emits the prompt fragment + negative lines to apply.
//
// Pure: no LLM, no I/O, no Math.random / Date.now. Same input → byte-
// identical output, asserted in test-v14-pr4.ts.

// ── Records / shape ──────────────────────────────────────────────────────────

export interface SceneRecord {
  /** Zero-based scene order within the script. */
  sceneOrder: number;
  cameraFocus?: string | null;
  sceneGenerationType?: string | null;
  primarySubject?: string | null;
  faceVisibility?: string | null;
  /** Optional. The env type isn't a Scene column today, so callers pass it
   *  from Script.rawJson when they have it. */
  environmentType?: string | null;
  /** Optional. Same — callers pass it when available. */
  timeOfDay?: string | null;
}

export type LedgerField =
  | 'cameraFocus'
  | 'sceneGenerationType'
  | 'primarySubject'
  | 'faceVisibility'
  | 'environmentType'
  | 'timeOfDay';

const TRACKED_FIELDS: readonly LedgerField[] = [
  'cameraFocus',
  'sceneGenerationType',
  'primarySubject',
  'faceVisibility',
  'environmentType',
  'timeOfDay',
];

// ── Ledger ──────────────────────────────────────────────────────────────────

export class SceneVariationLedger {
  private records: SceneRecord[] = [];

  static fromRecords(records: readonly SceneRecord[]): SceneVariationLedger {
    const l = new SceneVariationLedger();
    for (const r of records) l.record(r);
    return l;
  }

  record(scene: SceneRecord): void {
    this.records.push(scene);
  }

  get size(): number {
    return this.records.length;
  }

  /** How many earlier scenes used a specific value for `field`. */
  countOf(field: LedgerField, value: string): number {
    let n = 0;
    for (const r of this.records) {
      if (r[field] === value) n++;
    }
    return n;
  }

  /** Returns the values from `knownValues` that the ledger has not yet seen.
   *  Used by the brief builder to bias toward variation when the script
   *  LLM didn't pin the field for this scene. */
  unusedFromKnown(field: LedgerField, knownValues: readonly string[]): string[] {
    const seen = new Set<string>();
    for (const r of this.records) {
      const v = r[field];
      if (typeof v === 'string') seen.add(v);
    }
    return knownValues.filter((v) => !seen.has(v));
  }

  /** Distinct-value-to-record ratio (0..1). 1.0 means every scene used a
   *  different value; 0.0 means all scenes shared one value. */
  diversityScore(field: LedgerField): number {
    if (this.records.length === 0) return 0;
    const seen = new Set<string>();
    for (const r of this.records) {
      const v = r[field];
      if (typeof v === 'string' && v.length > 0) seen.add(v);
    }
    return seen.size / this.records.length;
  }

  /** Per-field diversity summary — used by admin debug surfaces (PR6). */
  summary(): Record<LedgerField, { distinct: number; total: number }> {
    const out = {} as Record<LedgerField, { distinct: number; total: number }>;
    for (const f of TRACKED_FIELDS) {
      const seen = new Set<string>();
      for (const r of this.records) {
        const v = r[f];
        if (typeof v === 'string' && v.length > 0) seen.add(v);
      }
      out[f] = { distinct: seen.size, total: this.records.length };
    }
    return out;
  }
}

// ── Scroll-stopper selection ────────────────────────────────────────────────
//
// Policy: for any ad ≥4 scenes, promote ONE scene to scroll-stopper. By
// default the hook scene at index 0 (the most TikTok-relevant beat).
// Single-scene and very-short ads (<4 scenes) skip the promotion — adding
// "scroll-stopping" levers to a tutorial first-scene noisily contradicts the
// scene's narrative role.

export interface ScrollStopperChoice {
  index: number;
  reason: 'hook' | 'punchline' | 'none';
}

export function chooseScrollStopperIndex(opts: {
  totalScenes: number;
  /** Optional. When provided and the last scene's goal is 'decision_push',
   *  promote it as the punchline instead of the hook. */
  finalSceneGoal?: string | null;
}): ScrollStopperChoice {
  if (opts.totalScenes < 4) {
    return { index: -1, reason: 'none' };
  }
  if (opts.finalSceneGoal === 'decision_push') {
    return { index: opts.totalScenes - 1, reason: 'punchline' };
  }
  return { index: 0, reason: 'hook' };
}

// ── Scroll-stopper levers ───────────────────────────────────────────────────
//
// Prompt fragments that push the picked scene toward an unusual angle / tight
// framing / color contrast WITHOUT breaking the scene's narrative role.
// Hook scenes get a "tight, surprising open" lever; punchline scenes get a
// "satisfying close-up + saturated color" lever. Both pure deterministic.

export interface ScrollStopperLeversInput {
  reason: 'hook' | 'punchline';
}

export interface ScrollStopperLevers {
  positive: string;
  negativeLines: string[];
}

export function buildScrollStopperLevers(
  opts: ScrollStopperLeversInput,
): ScrollStopperLevers {
  if (opts.reason === 'hook') {
    return {
      positive: [
        'SCROLL-STOPPER (this is the hook scene — make it unmistakably stop a scrolling feed):',
        '- Tight, slightly surprising framing — closer than a default mid-shot, an angle the viewer doesn\'t see in their feed every day.',
        '- One visual element punches above the rest: a saturated color spot, an unexpected gesture mid-action, or a moment of genuine surprise on the subject\'s face.',
        '- The frame must read as "wait, what?" in the first 0.3 seconds — a viewer scrolling at speed should pause involuntarily.',
        '- Stay within UGC believability: real moment, real person, real environment. NO surreal / abstract / stylized look.',
      ].join('\n'),
      negativeLines: [
        'NOT a generic UGC mid-shot opener (this is the hook — give it something memorable)',
        'NOT a posed model expression — the scroll-stopper must read as a real moment',
        'NOT abstract / surreal / stylized composition that breaks UGC believability',
      ],
    };
  }
  // punchline
  return {
    positive: [
      'SCROLL-STOPPER (this is the punchline — give it the satisfying landing):',
      '- A tight, satisfying close-up on the proof or product result. Color saturation slightly elevated — warm, not artificial.',
      '- The composition resolves the ad: it\'s the moment a viewer stops scrolling because they want to see what just happened.',
      '- Subject\'s expression carries the conviction — relief, satisfaction, or quiet confidence.',
    ].join('\n'),
    negativeLines: [
      'NOT a wide environmental shot (this is the punchline close)',
      'NOT a flat, unsaturated CTA tile look',
      'NOT a posed sales smile — keep the expression genuine',
    ],
  };
}
