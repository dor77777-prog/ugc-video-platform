// framework_signal_match — for each expanded script, hide the framework
// label and ask Sonnet "which of {6 framework names} is this?" given
// only the spoken_text_hebrew of every scene. Score = correct / total.
//
// Target: >= 0.80. If baseline is below this, Sub-task 6 (Framework
// Validators) is green-lit per the PLAN.md decision rule.

import { judgeCall } from '../judges/sonnet-judge';
import type { ExpandedScriptShape } from '../runners/expand-runner';
import {
  FRAMEWORK_NAMES_HEBREW,
  FRAMEWORK_SLUGS,
} from '../anchors/framework-signatures';

const FRAMEWORK_GUESS_SCHEMA = {
  type: 'object',
  required: ['framework', 'reasoning'],
  additionalProperties: false,
  properties: {
    framework: {
      type: 'string',
      enum: FRAMEWORK_SLUGS,
      description: 'The framework slug you believe this script is built around.',
    },
    reasoning: {
      type: 'string',
      description: 'One short Hebrew sentence on why you guessed this framework.',
    },
  },
} as const;

interface FrameworkGuess {
  framework: string;
  reasoning: string;
}

export interface FrameworkSignalResult {
  /** Fraction of scripts whose framework was correctly identified. */
  matchRate: number;
  /** Per-script outcomes for forensics. */
  perScript: Array<{
    actualFramework: string;
    guessedFramework: string;
    correct: boolean;
    reasoning: string;
  }>;
}

const FRAMEWORK_LIST_FOR_PROMPT = FRAMEWORK_SLUGS.map(
  (slug) => `- ${slug}: ${FRAMEWORK_NAMES_HEBREW[slug]}`,
).join('\n');

export async function measureFrameworkSignalMatch(
  scripts: ExpandedScriptShape[],
): Promise<FrameworkSignalResult> {
  const perScript: FrameworkSignalResult['perScript'] = [];

  for (const script of scripts) {
    const spokenText = (script.scenes ?? [])
      .map((s, i) => `סצנה ${i + 1}: ${s.spoken_text_hebrew ?? ''}`)
      .join('\n');

    const systemInstruction = [
      'אתה מומחה לכתיבה יצירתית של פרסומות UGC בעברית ישראלית.',
      'בחר את ה-framework היחיד שהכי מתאים לתסריט הבא, מתוך הרשימה הסגורה הזאת:',
      '',
      FRAMEWORK_LIST_FOR_PROMPT,
      '',
      'תקבל רק את הטקסט המדובר של הסצנות (ללא תוויות, ללא visual_prompt, ללא מטא-דאטה).',
      'בחר את ה-framework שמסביר הכי טוב את המבנה הנרטיבי + הזווית הרגשית.',
      'אם שני frameworks נראים מתאימים — בחר את החזק יותר על פי הסצנה הראשונה.',
      'החזר JSON עם המפתח framework (slug מדויק מהרשימה) ועם reasoning בעברית, משפט אחד.',
    ].join('\n');

    const userPrompt = [
      'הטקסט המדובר של התסריט:',
      '',
      spokenText,
      '',
      'איזה framework זה? החזר רק את ה-slug המדויק.',
    ].join('\n');

    let guessed = '__judge_failed__';
    let reasoning = '';
    try {
      const r = await judgeCall<FrameworkGuess>({
        systemInstruction,
        userPrompt,
        responseSchema: FRAMEWORK_GUESS_SCHEMA,
      });
      guessed = r.parsed.framework;
      reasoning = r.parsed.reasoning;
    } catch (err) {
      reasoning = `judge failed: ${(err as Error).message}`;
    }

    perScript.push({
      actualFramework: script.framework,
      guessedFramework: guessed,
      correct: guessed === script.framework,
      reasoning,
    });
  }

  const correct = perScript.filter((p) => p.correct).length;
  return {
    matchRate: scripts.length > 0 ? correct / scripts.length : 0,
    perScript,
  };
}
