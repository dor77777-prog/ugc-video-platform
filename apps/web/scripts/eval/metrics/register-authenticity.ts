// register_authenticity_score — Sonnet judge rates each scene's
// spoken_text_hebrew on a 1-10 scale ("how much does this sound like a
// real Israeli speaking, not translation-Hebrew?"). The judge sees 5
// ❌ + 5 ✅ category-anchored exemplars first so its scale is calibrated.
//
// Target post-Sub-task-4: avg >= baseline + 1.5 across all scenes
// (also avg >= 7 absolute as the V14 register-lock target).
//
// ⚠ INTERPRETATION CAVEAT (recorded post-Sub-task-2 baseline review):
//
// At the V27.11.PR6 baseline, register_authenticity_score = 7.673
// while casual_markers_per_scene = 0.144 — the two metrics did NOT
// correlate as expected. The Sonnet judge gave passing register scores
// even when 86% of scenes contained ZERO casual markers
// (תכל'ס/וואלה/סבבה/אחותי/...).
//
// Working hypothesis: the judge anchors more heavily on "is this Hebrew
// correctly written / not a direct EN→HE translation" than on "does
// this contain casual register markers specifically". Neutral
// non-translated Hebrew passes the judge's 7-bar even without explicit
// markers — the anchor exemplars in register-anchors.ts demonstrate
// CONTRAST with translation-Hebrew but not absence-of-markers.
//
// Implication for Sub-task 4 (Register Hard Enforcement):
// - casual_markers_per_scene >= 1.0 is the LOAD-BEARING gate. It
//   directly measures the user's stated pain ("תכל'ס/וואלה/סבבה
//   appear ~0 times"). This metric WILL move when the schema field
//   + post-gen retry land.
// - register_authenticity_score >= baseline + 1.5 is a SECONDARY signal
//   that catches further improvement on top. A failed delta here while
//   markers passes its gate should NOT fail the sub-task by itself —
//   the judge anchoring can absorb meaningful improvement without
//   shifting much. Investigate the judge anchors before treating a
//   register-only failure as a regression.
//
// Future-me: if you're tempted to treat a register_authenticity_score
// drop as evidence that a change made things worse — check
// casual_markers_per_scene first. The markers metric is mechanical and
// stable; the register score is a noisy human-style proxy.

import { judgeCall } from '../judges/sonnet-judge';
import {
  REGISTER_ANCHORS,
  type AnchorCategory,
} from '../anchors/register-anchors';
import type { ExpandedScriptShape } from '../runners/expand-runner';

const REGISTER_RATING_SCHEMA = {
  type: 'object',
  required: ['score', 'reasoning'],
  additionalProperties: false,
  properties: {
    score: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      description: '1-10 rating: how authentically spoken-Israeli does this sound.',
    },
    reasoning: {
      type: 'string',
      description: 'One short Hebrew sentence on why this score (cite a phrase).',
    },
  },
} as const;

interface RegisterRating {
  score: number;
  reasoning: string;
}

export interface RegisterAuthenticityResult {
  /** Average score across every NON-decision_push scene from every script. */
  avgScore: number;
  scenesScored: number;
  perScript: Array<{
    framework: string;
    avgScore: number;
    perScene: Array<{
      sceneOrder: number;
      sceneGoal: string;
      excluded: boolean;
      score: number | null;
      reasoning: string;
    }>;
  }>;
}

function buildAnchorPrimer(category: AnchorCategory): string {
  const anchors = REGISTER_ANCHORS.filter((a) => a.category === category);
  const lines: string[] = [];
  lines.push('דוגמאות מכוילות (anchor exemplars) לפני שתדרג:');
  lines.push('');
  anchors.forEach((a, i) => {
    lines.push(`דוגמה ${i + 1} (קטגוריה: ${category}):`);
    lines.push(`  ❌ "${a.bad}"  → ציון 2-3 (${a.whyBadIsBad})`);
    lines.push(`  ✅ "${a.good}" → ציון 8-9 (${a.whyGoodIsGood})`);
    lines.push('');
  });
  return lines.join('\n');
}

export async function measureRegisterAuthenticity(
  scripts: ExpandedScriptShape[],
  category: AnchorCategory,
): Promise<RegisterAuthenticityResult> {
  const anchorPrimer = buildAnchorPrimer(category);
  const systemInstruction = [
    'אתה מומחה לכתיבת פרסומות UGC ישראליות.',
    'דרג כמה הטקסט הבא נשמע כאינפלואנסר ישראלי אמיתי שמדבר במצלמה,',
    'בניגוד לטקסט שיווקי שתורגם מאנגלית לעברית.',
    '',
    'סקלה (1-10):',
    '1-3 = תרגום ישיר מאנגלית, מילים ארוכות מהמילון, אפס תכל\'ס.',
    '4-6 = פושר. נשמע נכון, אבל בלי register ישראלי ספציפי.',
    '7-8 = משכנע. עם marker ישראלי לפחות אחד (תכל\'ס/וואלה/סבבה/אחותי) או cadence דיבורי ברור.',
    '9-10 = יוצא דופן. נשמע כאילו צילמת חברה אמיתית מדברת. כמה markers, רגעים מיידיים.',
    '',
    anchorPrimer,
    '',
    'דרג את הטקסט הבא לפי אותה סקלה. החזר JSON עם score (integer 1-10) ו-reasoning (משפט עברית).',
  ].join('\n');

  const perScript: RegisterAuthenticityResult['perScript'] = [];
  let totalScore = 0;
  let scenesScored = 0;

  for (const script of scripts) {
    const perScene: RegisterAuthenticityResult['perScript'][number]['perScene'] = [];
    let scriptTotal = 0;
    let scriptScored = 0;
    for (const scene of script.scenes ?? []) {
      const excluded = scene.scene_goal === 'decision_push';
      if (excluded) {
        perScene.push({
          sceneOrder: scene.scene_order,
          sceneGoal: scene.scene_goal,
          excluded: true,
          score: null,
          reasoning: 'excluded — decision_push CTA',
        });
        continue;
      }
      const text = scene.spoken_text_hebrew ?? '';
      if (!text.trim()) {
        perScene.push({
          sceneOrder: scene.scene_order,
          sceneGoal: scene.scene_goal,
          excluded: false,
          score: 1,
          reasoning: 'empty spoken_text_hebrew → minimum score',
        });
        scriptTotal += 1;
        scriptScored++;
        totalScore += 1;
        scenesScored++;
        continue;
      }
      try {
        const r = await judgeCall<RegisterRating>({
          systemInstruction,
          userPrompt: `דרג את הטקסט הזה:\n"${text}"`,
          responseSchema: REGISTER_RATING_SCHEMA,
        });
        perScene.push({
          sceneOrder: scene.scene_order,
          sceneGoal: scene.scene_goal,
          excluded: false,
          score: r.parsed.score,
          reasoning: r.parsed.reasoning,
        });
        scriptTotal += r.parsed.score;
        scriptScored++;
        totalScore += r.parsed.score;
        scenesScored++;
      } catch (err) {
        perScene.push({
          sceneOrder: scene.scene_order,
          sceneGoal: scene.scene_goal,
          excluded: false,
          score: null,
          reasoning: `judge failed: ${(err as Error).message}`,
        });
        // LOUD: surface the first judge failure (see same comment in
        // framework-signal.ts) so a config error doesn't return silent 0s.
        console.warn(
          `[register-authenticity] judge call failed for "${script.framework}" scene ${scene.scene_order}: ${(err as Error).message}`,
        );
      }
    }
    perScript.push({
      framework: script.framework,
      avgScore: scriptScored > 0 ? scriptTotal / scriptScored : 0,
      perScene,
    });
  }

  return {
    avgScore: scenesScored > 0 ? totalScore / scenesScored : 0,
    scenesScored,
    perScript,
  };
}
