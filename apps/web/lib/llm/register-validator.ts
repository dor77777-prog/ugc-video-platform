// V28.0.ST4 — register hard enforcement validator + retry helper.
//
// Wired into BOTH script-gen paths:
//   - concept_interactive (concept-actions.ts → expandPickedConceptsAction)
//   - legacy_full_batch (scripts.ts → generateScripts)
//
// The validator runs AFTER each script comes back from the LLM, BEFORE
// it's persisted/returned. It checks:
//   1. casual_markers_used is non-empty per scene (schema-enforced too,
//      but defensive in case the LLM lies and lists markers it didn't use)
//   2. The markers listed actually APPEAR in spoken_text_hebrew (regex
//      match — catches the "I claimed [תכל'ס] but didn't write it" failure)
//   3. Average markers-per-scene across non-decision_push scenes meets
//      a threshold (default: >= 1.0 to align with REG-04 gate)
//   4. (V28.0.ST4 iter 2) Pure Hebrew enforcement — REG-05.
//      spoken_text_hebrew must contain only Hebrew characters + Hebrew
//      punctuation. Latin chars and digits are flagged. Tolerance:
//      ≤1 single Latin character per scene (e.g. "ויטמין C" is OK
//      because it's idiomatic in Israeli speech and TTS handles it;
//      "PowerCore" or "USB-C" or "459 שקל" are NOT OK).
//
// Failed scripts get ONE retry with an explicit corrective prompt
// listing the offending scenes + the canonical marker list. If still
// failing after retry, return the script with a `register_failed: true`
// annotation in metadata so admin debug surfaces it. Per the user's
// design discipline: never block the user with a hard wall — quality
// improvements are best-effort, not gating.
//
// Design source: STATE.md "Sub-task 3 — side-effect data" section,
// "Mechanism observation" subsection. Schema-level constraints are the
// load-bearing lever; this validator catches the cases where the
// schema's minItems: 1 was satisfied but the LLM gamed it (empty
// quotes, irrelevant tokens, etc.).

import {
  CANONICAL_MARKERS,
  CANONICAL_MARKERS_DISPLAY_HEBREW,
  countMarkersInHebrew,
} from '@ugc-video/shared';

/** Minimal scene shape we need from the LLM output. Matches both
 *  legacy LlmScene and the post-mapper GeneratedScene shape via
 *  scene_order / scene_goal / spoken_text_hebrew + casual_markers_used. */
export interface RegisterValidatorScene {
  scene_order: number;
  scene_goal: string;
  spoken_text_hebrew: string;
  /** What the LLM CLAIMED it used (from the schema field). May lie —
   *  this validator cross-checks against actual text content. */
  casual_markers_used?: string[];
}

export interface RegisterValidatorScript {
  framework: string;
  scenes: RegisterValidatorScene[];
}

export interface PerSceneRegisterResult {
  sceneOrder: number;
  sceneGoal: string;
  /** Markers found via regex in spoken_text_hebrew (ground truth). */
  markersFoundInText: string[];
  /** Markers the LLM claimed in casual_markers_used (may differ from above). */
  markersClaimed: string[];
  /** Did the LLM lie about markers? (claimed N but actually used 0) */
  claimedButMissing: string[];
  /** Excluded from gate average (decision_push scenes are CTA — gate
   *  excludes them per the user's spec). */
  excludedFromGate: boolean;
  /** Pass = excluded OR markersFoundInText.length >= 1. */
  pass: boolean;
  /** V28.0.ST4 iter 2 (REG-05) — Hebrew-purity issues. */
  hebrewPurity: HebrewPurityResult;
}

export interface HebrewPurityResult {
  /** True when the scene contains only Hebrew + acceptable single
   *  Latin chars + zero raw digit sequences. */
  pure: boolean;
  /** Latin sequences (≥2 chars) found mid-text. Each entry is one
   *  contiguous Latin word, e.g. ["PowerCore", "USB-C"]. */
  latinSequences: string[];
  /** Single Latin chars found, e.g. ["C"] (from "ויטמין C"). Counted
   *  separately because tolerance allows ≤1 per scene. */
  singleLatinChars: string[];
  /** Digit sequences found, e.g. ["25", "459", "10:00"]. Each entry
   *  is one contiguous digit/colon/comma run. */
  digitSequences: string[];
  /** Reasons for failure, human-readable, used in retry prompt. */
  reasons: string[];
}

export interface RegisterValidatorResult {
  /** Script-level pass = total markers in [1,3] AND no scene has >1 marker
   *  AND every scene passes Hebrew-purity AND no LLM lied about claimed
   *  markers. (V28.0.ST4 iter 3 — REVERSED from "more is better".) */
  pass: boolean;
  /** Average markers per non-decision_push scene (kept for telemetry
   *  + eval-metric backwards compatibility). */
  avgMarkersPerScene: number;
  /** V28.0.ST4 iter 3 — TOTAL markers across all scenes (the new
   *  load-bearing measure). Target: 1 ≤ totalMarkersPerScript ≤ 3. */
  totalMarkersPerScript: number;
  /** V28.0.ST4 iter 3 — scene_order values that contain >1 marker
   *  (stacking violation, must be slimmed down). */
  stackedSceneOrders: number[];
  /** Threshold the LEGACY per-scene gate was checked against (kept for
   *  backwards compat; iter 3 doesn't gate on this). */
  threshold: number;
  /** Per-scene breakdown for forensics + retry-prompt construction. */
  perScene: PerSceneRegisterResult[];
  /** scene_order values that need rewriting on retry. */
  failedSceneOrders: number[];
  /** Scenes where the LLM lied (claimed marker, didn't use it). Worth
   *  surfacing separately in admin debug. */
  liedSceneOrders: number[];
}

/** V28.0.ST4 iter 3 — per-script targets. */
export const MIN_MARKERS_PER_SCRIPT = 1;
export const MAX_MARKERS_PER_SCRIPT = 3;
export const MAX_MARKERS_PER_SCENE = 1;

/** V28.0.ST4 iter 2 (REG-05) — Detects non-Hebrew tokens in
 *  spoken_text_hebrew. Hebrew unicode range is U+0590 - U+05FF. We
 *  check for:
 *    - Latin character runs (≥2 chars) — always flagged
 *    - Single Latin chars — flagged only if >1 in the scene (one is
 *      idiomatic — "ויטמין C")
 *    - Digit sequences — always flagged (must be spelled out for TTS)
 *
 *  Pure function. No LLM. Cheap. */
export function detectNonHebrewInSpokenText(text: string): HebrewPurityResult {
  // Latin sequences ≥2 chars (PowerCore, USB-C, LCD, Glow Lab as two
  // separate runs separated by space).
  const latinSeqRegex = /[A-Za-z][A-Za-z\-']*[A-Za-z]/g;
  const latinSequences = Array.from(text.matchAll(latinSeqRegex)).map((m) => m[0]);

  // Single Latin chars NOT part of a longer run.
  // Strip the long-run matches first, then look for stragglers.
  const textMinusRuns = text.replace(latinSeqRegex, ' ');
  const singleLatinRegex = /(?:^|[^A-Za-z])([A-Za-z])(?=[^A-Za-z]|$)/g;
  const singleLatinChars = Array.from(textMinusRuns.matchAll(singleLatinRegex))
    .map((m) => m[1] ?? '')
    .filter((s) => s.length === 1);

  // Digit sequences — match runs of [0-9] possibly with colon/comma/dot
  // (catches "10:00", "1,500", "3.14"). Hyphens used as Hebrew prefix
  // separators ("מ-25") are not part of the digit run.
  const digitSeqRegex = /\d[\d:.,]*/g;
  const digitSequences = Array.from(text.matchAll(digitSeqRegex)).map((m) => m[0]);

  const reasons: string[] = [];
  if (latinSequences.length > 0) {
    reasons.push(`${latinSequences.length} מילה/מילים באנגלית: ${latinSequences.join(', ')}`);
  }
  if (singleLatinChars.length > 1) {
    reasons.push(`${singleLatinChars.length} אותיות בודדות באנגלית (מותר עד 1 לסצנה): ${singleLatinChars.join(', ')}`);
  }
  if (digitSequences.length > 0) {
    reasons.push(`${digitSequences.length} ספרה/ספרות לא מאויתות: ${digitSequences.join(', ')}`);
  }

  const pure =
    latinSequences.length === 0 &&
    singleLatinChars.length <= 1 &&
    digitSequences.length === 0;

  return {
    pure,
    latinSequences,
    singleLatinChars,
    digitSequences,
    reasons,
  };
}

/** Validates one script's register quality. Pure function — no LLM,
 *  no I/O. Cheap to call after every LLM response.
 *
 *  V28.0.ST4 iter 3 — REVERSED the "more markers = better" framing
 *  from iter 1. Native-speaker feedback: 5 markers in a 5-scene script
 *  reads as fake. Real influencer speech is sparse: 1-2 markers per
 *  WHOLE script, not per scene. The validator now enforces:
 *    - script-level: 1 ≤ totalMarkers ≤ 3
 *    - scene-level: at most 1 marker per scene (no stacking)
 *    - Hebrew-purity: per-scene REG-05 check (unchanged from iter 2)
 *    - lying check: claimed markers must actually appear in text */
export function validateScriptRegister(
  script: RegisterValidatorScript,
  threshold = 1.0,
): RegisterValidatorResult {
  const perScene: PerSceneRegisterResult[] = [];
  let totalMarkers = 0;
  let countedScenes = 0;
  const stackedSceneOrders: number[] = [];

  for (const scene of script.scenes ?? []) {
    const text = scene.spoken_text_hebrew ?? '';
    const claimed = scene.casual_markers_used ?? [];
    const found = countMarkersInHebrew(text);
    const claimedButMissing = claimed.filter((m) => {
      // Normalize the apostrophe variants when checking.
      const normalized = m.replace(/[׳']/g, '׳');
      return !found.unique.includes(normalized);
    });
    const hebrewPurity = detectNonHebrewInSpokenText(text);
    const excludedFromGate = scene.scene_goal === 'decision_push';

    // V28.0.ST4 iter 3 — scene-level rules:
    //   - At most MAX_MARKERS_PER_SCENE markers (no stacking).
    //   - Hebrew-purity required regardless.
    //   - No min-per-scene rule anymore (sparse is the target).
    const isStacked = found.total > MAX_MARKERS_PER_SCENE;
    if (isStacked) stackedSceneOrders.push(scene.scene_order);
    const pass = !isStacked && hebrewPurity.pure;

    perScene.push({
      sceneOrder: scene.scene_order,
      sceneGoal: scene.scene_goal,
      markersFoundInText: found.unique,
      markersClaimed: claimed,
      claimedButMissing,
      excludedFromGate,
      pass,
      hebrewPurity,
    });

    if (!excludedFromGate) {
      totalMarkers += found.total;
      countedScenes++;
    }
  }

  const avgMarkersPerScene = countedScenes > 0 ? totalMarkers / countedScenes : 0;

  // V28.0.ST4 iter 3 — script-level pass:
  //   1. totalMarkersPerScript in [MIN..MAX]
  //   2. No scene exceeds MAX_MARKERS_PER_SCENE (no stacking)
  //   3. Every scene passes Hebrew-purity
  //   4. No LLM lying (claimed markers actually present)
  const totalInRange =
    totalMarkers >= MIN_MARKERS_PER_SCRIPT &&
    totalMarkers <= MAX_MARKERS_PER_SCRIPT;
  const noStacking = stackedSceneOrders.length === 0;
  const allHebrewPure = perScene.every((s) => s.hebrewPurity.pure);
  const noLying = perScene.every((s) => s.claimedButMissing.length === 0);
  const scriptPass = totalInRange && noStacking && allHebrewPure && noLying;

  return {
    pass: scriptPass,
    avgMarkersPerScene,
    totalMarkersPerScript: totalMarkers,
    stackedSceneOrders,
    threshold,
    perScene,
    failedSceneOrders: perScene.filter((s) => !s.pass).map((s) => s.sceneOrder),
    liedSceneOrders: perScene
      .filter((s) => s.claimedButMissing.length > 0)
      .map((s) => s.sceneOrder),
  };
}

/** Builds a Hebrew corrective prompt to append after the original
 *  user prompt, instructing the LLM to rewrite specific scenes that
 *  failed the register check OR the Hebrew-purity check (REG-05).
 *  V28.0.ST4 iter 3 — REVERSED for sparse markers (1-3 per script). */
export function buildRegisterRetryPrompt(
  originalUserPrompt: string,
  result: RegisterValidatorResult,
  script: RegisterValidatorScript,
): string {
  const tooFewMarkers = result.totalMarkersPerScript < MIN_MARKERS_PER_SCRIPT;
  const tooManyMarkers = result.totalMarkersPerScript > MAX_MARKERS_PER_SCRIPT;
  const stackingScenes = result.stackedSceneOrders;
  const failed = result.perScene.filter(
    (s) => !s.pass || s.claimedButMissing.length > 0,
  );
  if (failed.length === 0 && !tooFewMarkers && !tooManyMarkers) {
    return originalUserPrompt;
  }

  const hasLiedFailures = failed.some((s) => s.claimedButMissing.length > 0);
  const hasPurityFailures = failed.some((s) => !s.hebrewPurity.pure);
  const hasMarkerCountIssue = tooFewMarkers || tooManyMarkers || stackingScenes.length > 0;

  const lines: string[] = [
    originalUserPrompt,
    '',
    '═══════════════════════════════════════════',
    '⚠ V28.0.ST4 iter 3 — תיקון register + עברית טהורה (חובה)',
    '═══════════════════════════════════════════',
    '',
    `התסריט שהחזרת לא עובר את בדיקות ה-register / Hebrew-purity.`,
    `סך markers בכל התסריט: ${result.totalMarkersPerScript} (יעד: ${MIN_MARKERS_PER_SCRIPT}-${MAX_MARKERS_PER_SCRIPT}).`,
    failed.length > 0 ? `${failed.length} סצנות עם בעיות ספציפיות:` : '',
    '',
  ].filter((l) => l !== '');

  for (const f of failed) {
    const scene = script.scenes.find((s) => s.scene_order === f.sceneOrder);
    if (!scene) continue;
    lines.push(`  • סצנה ${f.sceneOrder} (scene_goal=${f.sceneGoal}):`);
    lines.push(`    spoken_text_hebrew נוכחי: "${scene.spoken_text_hebrew}"`);
    if (f.markersFoundInText.length > MAX_MARKERS_PER_SCENE) {
      lines.push(
        `    [register] ${f.markersFoundInText.length} markers בסצנה אחת — מקסימום ${MAX_MARKERS_PER_SCENE} לסצנה. הסר את העודפים, השאר אחד טבעי או אפס.`,
      );
    }
    if (f.claimedButMissing.length > 0) {
      lines.push(
        `    [register] רשמת ב-casual_markers_used את [${f.claimedButMissing.join(', ')}] אבל הם לא מופיעים בטקסט בפועל. אסור לרמות.`,
      );
    }
    if (!f.hebrewPurity.pure) {
      for (const reason of f.hebrewPurity.reasons) {
        lines.push(`    [hebrew-purity] ${reason}`);
      }
    }
    lines.push('');
  }

  // Targeted guidance — only include the rules that fired.
  lines.push('═══════════════════════════════════════════');
  lines.push('הוראות תיקון מדויקות');
  lines.push('═══════════════════════════════════════════');
  lines.push('');

  if (hasMarkerCountIssue) {
    lines.push('**Register markers — SPARSE & NATURAL (V28.0.ST4 iter 3):**');
    lines.push(
      `סך markers לכל התסריט חייב להיות ${MIN_MARKERS_PER_SCRIPT}-${MAX_MARKERS_PER_SCRIPT} (לא לסצנה!). כל סצנה: מקסימום ${MAX_MARKERS_PER_SCENE} marker.`,
    );
    if (tooManyMarkers) {
      lines.push(
        `כעת יש ${result.totalMarkersPerScript} markers — יותר מדי. תוריד עד שיהיו ${MAX_MARKERS_PER_SCRIPT} לכל היותר. השאר אחד-שניים שזורמים הכי טבעי, מחק את היתר.`,
      );
    }
    if (tooFewMarkers) {
      lines.push(
        `כעת יש ${result.totalMarkersPerScript} markers — חסר. הוסף 1-2 markers מהרשימה ${CANONICAL_MARKERS_DISPLAY_HEBREW} בסצנה אחת או שתיים. אל תוסיף לכל סצנה.`,
      );
    }
    if (stackingScenes.length > 0) {
      lines.push(
        `סצנות עם stacking (יותר מ-${MAX_MARKERS_PER_SCENE} marker): ${stackingScenes.join(', ')}. השאר marker אחד בכל אחת — מחק את היתר.`,
      );
    }
    lines.push(
      'זכור: רוב הסצנות יכילו אפס markers. רק 1-2 סצנות לכל התסריט יכילו marker בודד. casual_markers_used של רוב הסצנות יהיה [].',
    );
    lines.push('');
  }

  if (hasLiedFailures) {
    lines.push('**אסור לרמות ב-casual_markers_used:**');
    lines.push(
      'הרשימה חייבת להכיל אך ורק markers שמופיעים בפועל ב-spoken_text_hebrew של אותה סצנה. אם השתמשת בפועל ב-"וואלה" — תרשום "וואלה". אם לא השתמשת בו — אל תרשום אותו ברשימה.',
    );
    lines.push('');
  }

  if (hasPurityFailures) {
    lines.push('**Pure Hebrew (REG-05) — חוק קשיח:**');
    lines.push('spoken_text_hebrew = עברית בלבד. ה-validator סורק regex על:');
    lines.push('  - אותיות באנגלית (A-Z, a-z) — ≥2 אותיות ברצף = פסילה. אות בודדת — מותר עד 1 לסצנה.');
    lines.push('  - ספרות (0-9) — אסורות. כתוב מספרים במילים.');
    lines.push('');
    lines.push('תיקונים נדרשים לפי סוג:');
    lines.push('');
    lines.push('🔢 ספרות → מילים:');
    lines.push('  - "25 דקות" → "עשרים וחמש דקות"');
    lines.push('  - "459 שקל" → "ארבע מאות חמישים ותשעה שקל"');
    lines.push('  - "10:00" → "עשר בבוקר" / "עשר וחצי"');
    lines.push('  - "מ-0 ל-50" → "מאפס לחמישים"');
    lines.push('  - "15%" → "חמישה עשר אחוז"');
    lines.push('');
    lines.push('🏷 שמות מותגים → תעתיק עברי:');
    lines.push('  - "PowerCore" → "פאוורקור"');
    lines.push('  - "Glow Lab" → "גלו לאב"');
    lines.push('  - "Tea Pop" → "טי פופ"');
    lines.push('  - "Soft Touch" → "סופט טאץ׳"');
    lines.push('  - "RoadEye" → "רואדאיי"');
    lines.push('  - כל שם מותג אחר באנגלית: תעתיק לעברית.');
    lines.push('');
    lines.push('⚙ מונחים טכניים → לתרגם או לתעתק:');
    lines.push('  - "USB-C" → "כבל מטעין" / "כבל יו-אס-בי"');
    lines.push('  - "LCD" → "מסך" / "מסך עם אחוזים"');
    lines.push('  - "4K" → "ארבע קיי"');
    lines.push('  - "Bluetooth" → "בלוטות׳"');
    lines.push('  - "Wi-Fi" → "וויי-פיי" / "אינטרנט אלחוטי"');
    lines.push('');
    lines.push('📱 שמות אפליקציות → תעתיק:');
    lines.push('  - "WhatsApp" → "וואטסאפ", "TikTok" → "טיקטוק", "Instagram" → "אינסטגרם"');
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════');
  lines.push(
    'שמור על אותו big_idea, hook, scene_outline, framework, scene_generation_type, וכל המטא-דאטה האחרת. שנה רק את spoken_text_hebrew (ואת casual_markers_used אם צריך) של הסצנות הבעייתיות. סצנות שכבר עוברות — אל תיגע.',
  );
  lines.push('');
  lines.push(
    'החזר את התסריט המתוקן בפורמט { "script": { ... } } תואם לסכמה (כל השדות נדרשים).',
  );

  return lines.join('\n');
}

/** Convenience helper for the canonical markers list — used by retry
 *  prompts and admin-debug labels. Re-export so callers don't need to
 *  reach into @ugc-video/shared. */
export { CANONICAL_MARKERS, CANONICAL_MARKERS_DISPLAY_HEBREW };
