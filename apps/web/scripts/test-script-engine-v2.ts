// Smoke test for Script Engine V2.
//
// Runs `generateScripts()` against three product fixtures (skincare, kitchen
// gadget, tech) and asserts the V2 quality contract:
//   - exactly 6 scripts back, one per framework, in the canonical order
//   - each script has a creative_strategy block and a 3-option hook list
//   - each scene has spoken_text_hebrew + visual_prompt_english
//   - no forbidden cliché phrases appear in any spoken text
//   - quality_score.overall >= 8 for all scripts (or scripts_below_threshold==0)
//
// Run from apps/web:
//   npx tsx scripts/test-script-engine-v2.ts
//
// Real OpenAI calls — costs ~$0.01–0.03 per fixture (3 fixtures total).

import dotenv from 'dotenv';
import path from 'path';
import { generateScripts, type ProductInput } from '../lib/llm/scripts';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

interface Fixture {
  name: string;
  input: ProductInput;
}

const FIXTURES: Fixture[] = [
  {
    name: 'skincare — vitamin C serum',
    input: {
      productName: 'סרום ויטמין C מוקצף',
      brand: 'Glow Lab',
      description:
        'סרום פנים יומי המבוסס על ויטמין C יציב בריכוז 15%, חומצה היאלורונית ופרוביוטיקה. מיועד לעור עייף, להפחתת כתמי שמש, חידוש קולגן והבהרה כללית. מתאים לבוקר, מתחת לקרם לחות. בקבוקון 30 מ"ל.',
      targetAudience: 'נשים 28-45 שמרגישות שהעור איבד את הזוהר אחרי לידות / שינה לקויה',
      durationSeconds: 30,
      price: '189',
      currency: 'שקלים',
      avatarDescription: 'late-twenties Israeli woman (region: Tel Aviv, style: casual)',
      categoryId: 'skincare',
      categoryLabel: 'skincare',
      categoryGuidance:
        'mirror selfies בבית, vanity, bathroom. outfit: רובוץ או חולצה רחבה. אור בוקר רך.',
    },
  },
  {
    name: 'kitchen — silicone food cover set',
    input: {
      productName: 'סט כיסויי סיליקון לשמירת אוכל',
      brand: 'KeepFresh',
      description:
        'שישה כיסויי סיליקון בגדלים שונים שנמתחים על קעריות, סלטים, פלחים של חצי לימון/בצל ושאריות. מחליפים את ניילון הנצמד, נשטפים ומחזירים שוב לשימוש. עמידים במקפיא ובמיקרוגל. אריזה קומפקטית במגירה.',
      targetAudience: 'משפחות שמכינות הרבה ארוחות ומשליכות הרבה ניילון נצמד ושקיות',
      durationSeconds: 25,
      price: '79',
      currency: 'שקלים',
      avatarDescription: 'thirties Israeli woman (region: Ramat Gan, style: casual)',
      categoryId: 'kitchen',
      categoryLabel: 'kitchen tool',
      categoryGuidance: 'מטבח כעיקר. action shots על השיש, פתיחת מקרר. outfit: יומיומי בבית.',
    },
  },
  {
    name: 'tech — magsafe phone stand for car',
    input: {
      productName: 'מעמד מגנטי MagSafe לרכב עם טעינה אלחוטית',
      brand: 'Aurion',
      description:
        'מעמד טלפון לאחיזת תושבת הצינון של הרכב, עם מגנט MagSafe חזק וטעינה אלחוטית 15W. הטלפון נצמד בתנועה אחת. מסתובב 360°. מתאים לכל רכב.',
      targetAudience: 'נהגים שמשתמשים ב-Waze ושוכחים לחבר את הטלפון לטעינה',
      durationSeconds: 22,
      price: '149',
      currency: 'שקלים',
      avatarDescription: 'thirties Israeli man (region: Tel Aviv, style: professional)',
      categoryId: 'tech',
      categoryLabel: 'tech / gadget',
      categoryGuidance: 'רכב פרטי + שולחן עבודה + on-the-go. סיטואציות של "כאב טכני" → "פתרון".',
    },
  },
];

const FORBIDDEN_PHRASES = [
  'שינה לי את החיים',
  'לא האמנתי שזה עובד',
  'כולם מדברים על זה',
  'הפתרון המושלם',
  'חייבים לנסות',
  'זה בדיוק מה שחיפשתי',
  'מוצר חובה בכל בית',
  'פשוט וואו',
];

const EXPECTED_FRAMEWORKS = [
  'problem_agitation_solution',
  'skeptical_testimonial',
  'demonstration_proof',
  'price_alternative_anchor',
  'relatable_israeli_moment',
  'fast_direct_response',
];

interface AssertionResult {
  name: string;
  passed: boolean;
  detail?: string;
}

function assertOne(
  results: AssertionResult[],
  name: string,
  cond: boolean,
  detail = '',
) {
  results.push({ name, passed: cond, detail: cond ? '' : detail });
}

async function runFixture(f: Fixture): Promise<{
  results: AssertionResult[];
  output: Awaited<ReturnType<typeof generateScripts>>;
}> {
  const results: AssertionResult[] = [];
  const output = await generateScripts(f.input);
  const scripts = output.scripts;

  assertOne(results, '6 scripts returned', scripts.length === 6, `got ${scripts.length}`);

  const frameworksSeen = new Set(scripts.map((s) => s.framework));
  assertOne(
    results,
    'each framework present exactly once',
    frameworksSeen.size === 6,
    `got [${[...frameworksSeen].join(', ')}]`,
  );
  for (const fw of EXPECTED_FRAMEWORKS) {
    assertOne(
      results,
      `framework ${fw} present`,
      frameworksSeen.has(fw as never),
      'missing',
    );
  }

  for (const s of scripts) {
    const tag = `[${s.framework}]`;
    assertOne(
      results,
      `${tag} has creative_strategy.coreInsight`,
      typeof s.creativeStrategy.coreInsight === 'string' && s.creativeStrategy.coreInsight.length > 5,
    );
    assertOne(
      results,
      `${tag} has 3 hook_options`,
      Array.isArray(s.hookOptions) && s.hookOptions.length === 3,
      `got ${s.hookOptions.length}`,
    );
    assertOne(
      results,
      `${tag} selected_hook is one of hook_options`,
      s.hookOptions.includes(s.selectedHook),
    );
    assertOne(
      results,
      `${tag} has scenes (>=3)`,
      Array.isArray(s.scenes) && s.scenes.length >= 3,
      `got ${s.scenes.length}`,
    );
    for (const sc of s.scenes) {
      assertOne(
        results,
        `${tag} scene ${sc.sceneOrder} has spoken text`,
        typeof sc.textHebrew === 'string' && sc.textHebrew.length > 0,
      );
      assertOne(
        results,
        `${tag} scene ${sc.sceneOrder} has visual_prompt_english`,
        typeof sc.visualPromptEnglish === 'string' && sc.visualPromptEnglish.length > 10,
      );
    }
    assertOne(
      results,
      `${tag} quality_score.overall is a number 1–10`,
      typeof s.qualityScore.overall === 'number' &&
        s.qualityScore.overall >= 1 &&
        s.qualityScore.overall <= 10,
      `got ${s.qualityScore.overall}`,
    );
    assertOne(
      results,
      `${tag} quality_score.overall >= 8`,
      s.qualityScore.overall >= 8,
      `got ${s.qualityScore.overall}; weakness: ${s.qualityScore.weaknessNote}`,
    );

    // Cliché scan across all spoken text and the selected hook.
    const allText = [s.selectedHook, ...s.scenes.map((sc) => sc.textHebrew)].join(' ');
    for (const phrase of FORBIDDEN_PHRASES) {
      assertOne(
        results,
        `${tag} no forbidden cliché "${phrase}"`,
        !allText.includes(phrase),
        `found in: "${allText.slice(0, 100)}…"`,
      );
    }
  }

  return { results, output };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY missing in .env');
    process.exit(1);
  }

  console.log(`\n🧪 Script Engine V2 — running ${FIXTURES.length} fixtures\n`);

  let totalPassed = 0;
  let totalFailed = 0;
  let totalRegen = 0;
  let totalLatencyMs = 0;
  const summaries: string[] = [];

  for (const f of FIXTURES) {
    const startedAt = Date.now();
    console.log(`▶ ${f.name}`);
    try {
      const { results, output } = await runFixture(f);
      const dur = Date.now() - startedAt;
      const passed = results.filter((r) => r.passed).length;
      const failed = results.filter((r) => !r.passed);
      totalPassed += passed;
      totalFailed += failed.length;
      totalRegen += output.usage.regenCalls;
      totalLatencyMs += dur;

      console.log(
        `  ${failed.length === 0 ? '✅' : '❌'} ${passed}/${results.length} assertions ` +
          `· ${(dur / 1000).toFixed(1)}s · regen=${output.usage.regenCalls} ` +
          `· tokens=${output.usage.inputTokens}+${output.usage.outputTokens}`,
      );

      const overalls = output.scripts
        .map((s) => `${s.framework}=${s.qualityScore.overall.toFixed(1)}`)
        .join(', ');
      console.log(`  scores: ${overalls}`);

      if (failed.length > 0) {
        for (const r of failed.slice(0, 8)) {
          console.log(`    ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
        }
        if (failed.length > 8) {
          console.log(`    … and ${failed.length - 8} more failures.`);
        }
      }

      summaries.push(`${f.name}: ${passed}/${results.length}`);
    } catch (err) {
      totalFailed++;
      console.log(`  ❌ FIXTURE FAILED: ${(err as Error).message}`);
      summaries.push(`${f.name}: ERROR`);
    }
  }

  console.log(
    `\n📊 ${totalPassed} passed, ${totalFailed} failed, ${totalRegen} regen calls, ` +
      `${(totalLatencyMs / 1000).toFixed(1)}s total\n`,
  );
  for (const s of summaries) console.log(`  · ${s}`);

  process.exit(totalFailed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
