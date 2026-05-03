// V28.0.ST4 Option E — capture 5 expanded scripts from the post-Sub-task-4
// engine to disk so the user can blind-test whether they (a native Hebrew
// speaker) can identify the framework just from spoken_text. Tests the
// hypothesis that the Sonnet judge is the problem, not the engine.
//
// Hypothesis: framework_signal_match dropped from 0.833 → 0.444 in
// Sub-task 4 iter 1. Is this because:
//   (a) frameworks REALLY merged (engine problem) — user can't ID them either
//   (b) the Sonnet judge is weak on heavily-marker-saturated Hebrew (judge
//       problem, "תכל'ס וואלה" feels OOD relative to its training register)
//
// User reads 5 scripts blind, makes guesses, then peeks at the hidden
// label + judge guess + judge reasoning. Their hit rate decides the
// strategic path:
//   - 4-5/5 correct → Option F: replace judge (Opus 4.7 / GPT-5.4)
//   - 2-3/5 correct → Option A modified: recalibrate gates + Sub-task 6 mandatory
//   - 0-1/5 correct → Option D: rollback + architecture rethink
//
// Cost: ~$0.30 (5 concept batches + 5 expansions + 5 judge calls).

import dotenv from 'dotenv';
import path from 'node:path';
import { promises as fs } from 'node:fs';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { runConceptBatch } from './runners/concept-runner';
import { runExpandConcept } from './runners/expand-runner';
import { measureFrameworkSignalMatch } from './metrics/framework-signal';
import { loadGoldSetEntry } from './lib/gold-set-loader';

// V28.0.ST4 Option E surfaces TWO blind tests in parallel:
//   set A (varied frameworks): tests "is the judge correct when
//          frameworks really differ across the sample?"
//   set B (clustered same framework): tests "is the judge confused
//          when 5 scripts share a framework?"
//
// First-run discovery (during this Option E work): the LLM
// consistently puts problem_agitation_solution in slot 0 across all
// products under the post-Sub-task-4 prompt. Earlier capture pulled
// only slot 0 → 5 PAS scripts → judge 0/5 correct (confused). When we
// vary the slot to get framework diversity, judge → 5/5 correct.
//
// iter 1's 0.444 fwm uses pick=2 → slots 0+1 per product. Half the
// scripts are slot-0-PAS (clustered) + half are slot-1-varied. So
// the iter 1 number likely reflects judge confusion on the
// PAS-cluster half, NOT a real framework merge. The user's blind
// test on BOTH set A + set B will confirm or refute.

const TARGET_SET = process.env.CAPTURE_SET ?? 'varied'; // 'varied' | 'clustered'

const VARIED_TARGETS: Array<{ id: string; slot: number }> = [
  { id: 'cosmetics-1', slot: 0 },     // iter 1 fwm = 0.5
  { id: 'cosmetics-3', slot: 1 },     // iter 1 fwm = 0.5
  { id: 'electronics-2', slot: 2 },   // iter 1 fwm = 0 (most informative)
  { id: 'electronics-3', slot: 3 },   // iter 1 fwm = 0.5
  { id: 'food-2', slot: 4 },          // iter 1 fwm = 0.5
];

// Same products, all slot 0 — likely all problem_agitation_solution
// per the LLM's slot-0 bias. Tests judge confusion on a cluster.
const CLUSTERED_TARGETS: Array<{ id: string; slot: number }> = [
  { id: 'cosmetics-1', slot: 0 },
  { id: 'cosmetics-3', slot: 0 },
  { id: 'electronics-2', slot: 0 },
  { id: 'electronics-3', slot: 0 },
  { id: 'food-2', slot: 0 },
];

const TARGETS = TARGET_SET === 'clustered' ? CLUSTERED_TARGETS : VARIED_TARGETS;
// V28.0.ST4 iter 2 — write into a separate subdir so we can compare
// iter 1 vs iter 2 quality side-by-side. Override via CAPTURE_SUBDIR env.
const SUBDIR = process.env.CAPTURE_SUBDIR ??
  (TARGET_SET === 'clustered' ? 'set-b-clustered' : 'set-a-varied');

const FRAMEWORK_NAMES_HEBREW: Record<string, string> = {
  problem_agitation_solution: 'בעיה → הסלמה → פתרון',
  skeptical_testimonial: 'עדות ספקנית',
  demonstration_proof: 'הוכחה ויזואלית',
  price_alternative_anchor: 'עוגן מחיר/אלטרנטיבה',
  relatable_israeli_moment: 'רגע ישראלי מוכר',
  fast_direct_response: 'תגובה ישירה מהירה',
};

interface ScriptForReview {
  productId: string;
  category: string;
  productName: string;
  scriptIndex: number;       // which slot we expanded (0 or 1)
  scenes: Array<{
    sceneOrder: number;
    sceneGoal: string;
    spokenTextHebrew: string;
  }>;
  // ↓ HIDDEN from the user during blind read
  actualFramework: string;
  judgeGuess: string;
  judgeCorrect: boolean;
  judgeReasoning: string;
}

async function main(): Promise<void> {
  const provider = (process.env.LLM_SCRIPT_PROVIDER ?? 'openai') as
    | 'openai'
    | 'anthropic'
    | 'gemini';
  const model = process.env.OPENAI_SCRIPT_MODEL ?? 'gpt-5.4-mini';

  const outDir = path.resolve(
    __dirname,
    `../../../../.planning/eval/runs/st4-iter1-manual-review/${SUBDIR}`,
  );
  await fs.mkdir(outDir, { recursive: true });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  V28.0.ST4 Option E — manual review capture');
  console.log(`  ${TARGETS.length} products, 1 script each, blind-test format`);
  console.log(`  → ${outDir}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const captured: ScriptForReview[] = [];

  for (const target of TARGETS) {
    console.log(`▶ ${target.id} (slot ${target.slot})`);
    const entry = await loadGoldSetEntry(target.id);

    // Phase 1 — concept batch (yields 6 cards)
    const concept = await runConceptBatch(entry, { provider, model });
    console.log(`    concept batch: ${concept.cards.length} cards (frameworks: ${concept.cards.map((c) => c.framework).join(', ')})`);

    // Pick the requested slot. If LLM returned <6 cards (rare), fall
    // back to the highest-available slot.
    const slotIndex = Math.min(target.slot, concept.cards.length - 1);
    const card = concept.cards[slotIndex];
    if (!card) {
      console.error(`    [SKIP] no card at slot ${slotIndex}`);
      continue;
    }
    console.log(`    expanding slot ${slotIndex} (framework=${card.framework})`);

    // Phase 2 — expand
    const expanded = await runExpandConcept({
      rawCard: card,
      slotIndex,
      systemInstruction: concept.systemInstruction,
      conceptBatchUserPrompt: concept.conceptBatchUserPrompt,
      provider,
      model,
    });

    // Run the framework-signal judge on this single script
    const judgeResult = await measureFrameworkSignalMatch([expanded.script]);
    const judgeRow = judgeResult.perScript[0];
    if (!judgeRow) {
      console.error(`    [SKIP] judge returned no result`);
      continue;
    }

    captured.push({
      productId: target.id,
      category: entry.fixture.category,
      productName: entry.fixture.productData.productName,
      scriptIndex: slotIndex,
      scenes: (expanded.script.scenes ?? []).map((s) => ({
        sceneOrder: s.scene_order,
        sceneGoal: s.scene_goal,
        spokenTextHebrew: s.spoken_text_hebrew,
      })),
      actualFramework: expanded.script.framework,
      judgeGuess: judgeRow.guessedFramework,
      judgeCorrect: judgeRow.correct,
      judgeReasoning: judgeRow.reasoning,
    });
    console.log(
      `    captured: actual=${expanded.script.framework} judge=${judgeRow.guessedFramework} correct=${judgeRow.correct}`,
    );
  }

  console.log('');
  console.log('Writing review files…');
  for (let i = 0; i < captured.length; i++) {
    const c = captured[i];
    if (!c) continue;
    const filename = `${String(i + 1).padStart(2, '0')}-${c.productId}.md`;
    const filepath = path.join(outDir, filename);
    const content = renderMarkdown(c, i + 1);
    await fs.writeFile(filepath, content, 'utf-8');
    console.log(`  → ${filename}`);
  }

  // Also write an INDEX.md for the user with instructions
  const indexContent = renderIndex(captured);
  await fs.writeFile(path.join(outDir, 'INDEX.md'), indexContent, 'utf-8');
  console.log(`  → INDEX.md`);

  // And a summary scoreboard for after the user makes their guesses
  const scoreboardContent = renderScoreboard(captured);
  await fs.writeFile(path.join(outDir, 'JUDGE-RESULTS.md'), scoreboardContent, 'utf-8');
  console.log(`  → JUDGE-RESULTS.md (judge's guesses + reasoning, all scripts)`);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Captured ${captured.length} scripts. Judge correct: ${captured.filter((c) => c.judgeCorrect).length}/${captured.length}.`);
  console.log('  Read each numbered file in order, write down your framework guess,');
  console.log('  then expand the spoiler at the bottom to compare with the actual + judge.');
  console.log('═══════════════════════════════════════════════════════════════');
}

function renderMarkdown(c: ScriptForReview, fileNum: number): string {
  const heb = FRAMEWORK_NAMES_HEBREW;
  const allFrameworks = Object.entries(heb)
    .map(([slug, hebrew]) => `- \`${slug}\` — ${hebrew}`)
    .join('\n');

  return `# Script ${fileNum} — ${c.productId} (${c.category})

**Product:** ${c.productName}

**Your task:** Read the spoken text below. Guess which of the 6 frameworks this script is built around. Then expand the spoiler at the bottom to compare with the actual framework + the Sonnet judge's guess + reasoning.

**The 6 frameworks:**

${allFrameworks}

---

## Spoken text (in scene order)

${c.scenes
  .map(
    (s) =>
      `### Scene ${s.sceneOrder} (\`${s.sceneGoal}\`)\n\n> ${s.spokenTextHebrew}`,
  )
  .join('\n\n')}

---

## Your guess

(Write it down somewhere before peeking below.)

---

<details>
<summary>🔒 SPOILER — actual framework + judge result (click to expand AFTER you guess)</summary>

**Actual framework:** \`${c.actualFramework}\` (${heb[c.actualFramework] ?? '?'})

**Sonnet judge guess:** \`${c.judgeGuess}\` (${heb[c.judgeGuess] ?? '?'})

**Judge correct?** ${c.judgeCorrect ? '✓ YES' : '✗ NO'}

**Judge reasoning:**

> ${c.judgeReasoning}

</details>
`;
}

function renderIndex(captured: ScriptForReview[]): string {
  return `# V28.0.ST4 Option E — Manual Review Index

**5 expanded scripts captured from the post-Sub-task-4 engine** (concept_interactive mode, gpt-5.4-mini). Use this to test whether the framework_signal_match drop (0.833 → 0.444) is a real engine regression or a Sonnet judge artifact.

## How to use

1. Open each numbered file in order (\`01-\` → \`05-\`).
2. Read the spoken text. Write down which framework you think it's built around.
3. Expand the spoiler at the bottom of each file to see the actual framework + the Sonnet judge's guess + reasoning.
4. Tally your hit rate at the end.

## Decision rule

- **You hit 4-5 / 5 correct** → the Sonnet judge is weak on heavily-marker-saturated Hebrew (it's out-of-distribution for the model). Path forward: **Option F** — replace the judge with Opus 4.7 or GPT-5.4 and re-run the eval. If fwm jumps to ≥0.7, Sub-task 4 ships GREEN.
- **You hit 2-3 / 5 correct** → frameworks really did partially merge. Path forward: **Option A modified** — recalibrate Sub-task 4 gates + make Sub-task 6 mandatory + reorder Sub-task 6 BEFORE Sub-task 5.
- **You hit 0-1 / 5 correct** → frameworks fully merged. Path forward: **Option D** — rollback Sub-task 4 + architecture rethink before retrying.

## Files in this directory

${captured
  .map(
    (c, i) =>
      `${i + 1}. \`${String(i + 1).padStart(2, '0')}-${c.productId}.md\` — ${c.category} | ${c.productName}`,
  )
  .join('\n')}

Plus \`JUDGE-RESULTS.md\` — all 5 actual frameworks + judge guesses in one table (don't open until after you've made your 5 guesses).

## Capture metadata

- Engine: \`SCRIPT_ENGINE_MODE=concept_interactive\`
- Provider: \`openai:gpt-5.4-mini\`
- Code SHA: post-Sub-task-4 iter 1 (uncommitted, ~ a47c80d + ST4 changes)
- Capture cost: ~$0.30 (5 concept batches + 5 expansions + 5 judge calls)
- These are FRESH scripts, not the exact ones from iter 1 (LLM is nondeterministic).
  But they're drawn from the same post-Sub-task-4 distribution.
`;
}

function renderScoreboard(captured: ScriptForReview[]): string {
  const correct = captured.filter((c) => c.judgeCorrect).length;
  const lines: string[] = [
    '# V28.0.ST4 Manual Review — Judge Scoreboard',
    '',
    `**⚠ DO NOT OPEN until you\'ve made your 5 guesses.**`,
    '',
    `**Sonnet judge result on this 5-script sample:** ${correct}/5 correct (${((correct / captured.length) * 100).toFixed(0)}%).`,
    '',
    'For comparison: full 9-product iter 1 eval scored 0.444 (4/9 correct on average across pick=2 expansions per product).',
    '',
    '## Per-script results',
    '',
    '| # | Product | Actual framework | Judge guess | Correct? | Judge reasoning (Hebrew) |',
    '|---|---|---|---|---|---|',
    ...captured.map(
      (c, i) =>
        `| ${i + 1} | ${c.productId} | \`${c.actualFramework}\` | \`${c.judgeGuess}\` | ${c.judgeCorrect ? '✓' : '✗'} | ${c.judgeReasoning.replace(/\|/g, '\\|').slice(0, 100)}${c.judgeReasoning.length > 100 ? '…' : ''} |`,
    ),
    '',
    '## Decision rule (from INDEX.md)',
    '',
    '- Your hit rate 4-5/5 → Option F (replace judge)',
    '- Your hit rate 2-3/5 → Option A modified (recalibrate + Sub-task 6 mandatory)',
    '- Your hit rate 0-1/5 → Option D (rollback)',
  ];
  return lines.join('\n');
}

main().catch((err) => {
  console.error('[capture] fatal:', err);
  process.exit(1);
});
