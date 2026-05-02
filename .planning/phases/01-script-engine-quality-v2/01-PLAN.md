---
phase: 01-script-engine-quality-v2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/eval/script-engine-eval.ts
  - apps/web/scripts/eval/metrics/big-idea-diversity.ts
  - apps/web/scripts/eval/metrics/casual-markers.ts
  - apps/web/scripts/eval/metrics/framework-signal.ts
  - apps/web/scripts/eval/metrics/register-authenticity.ts
  - apps/web/scripts/eval/judges/sonnet-judge.ts
  - apps/web/scripts/eval/runners/concept-runner.ts
  - apps/web/scripts/eval/runners/expand-runner.ts
  - apps/web/scripts/eval/lib/canonical-markers.ts
  - apps/web/scripts/eval/lib/embeddings.ts
  - apps/web/scripts/eval/lib/timing-collector.ts
  - apps/web/scripts/eval/lib/output-writer.ts
  - apps/web/scripts/eval/anchors/register-anchors.ts
  - apps/web/scripts/eval/anchors/framework-signatures.ts
  - .planning/eval/gold-set/cosmetics-1.json
  - .planning/eval/gold-set/cosmetics-2.json
  - .planning/eval/gold-set/cosmetics-3.json
  - .planning/eval/gold-set/electronics-1.json
  - .planning/eval/gold-set/electronics-2.json
  - .planning/eval/gold-set/electronics-3.json
  - .planning/eval/gold-set/food-1.json
  - .planning/eval/gold-set/food-2.json
  - .planning/eval/gold-set/food-3.json
  - apps/web/package.json
autonomous: true
requirements: [EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVAL-05, EVAL-06, EVAL-07, EVAL-09, DIV-01, DIV-02, DIV-03, DIV-04, DIV-05, REG-01, REG-02, REG-03, REG-04, LAT-01, LAT-02, LAT-03, LAT-04, LAT-05, FW-01, FW-02, FW-03, FW-04, EVAL-08]

must_haves:
  truths:
    - "npm run eval:script-engine runs end-to-end on the gold set and emits 4 metrics + per-stage timings"
    - "After Sub-task 3 commits, generating 6 concepts on any gold-set product yields 6 distinct big_idea_axis values"
    - "After Sub-task 4 commits, every scene's spoken_text_hebrew contains >= 1 casual marker"
    - "After Sub-task 5 commits, wall-clock from concept-button-click to expanded-script-display <= baseline * 0.7"
  artifacts:
    - "apps/web/scripts/eval/script-engine-eval.ts"
    - ".planning/eval/baselines/v27.11.PR6.json"
    - ".planning/eval/gold-set/ with 8-10 pinned product JSONs"
    - "Schema changes in packages/prompts/src/concept-cards-schema.ts (big_idea_axis added, quality_score removed)"
    - "Schema changes in packages/prompts/src/script-json-schema.ts (casual_markers_used added; music_profile removed)"
  key_links:
    - "Eval harness reads from same concept-engine.ts code path as production - no parallel-truth code"
    - "Each sub-task commit is the rollback anchor for the next sub-task's gate"
    - "PI prefetch shares the same buildProductIntelligence() implementation - prefetch is scheduling, not duplication"
---

<objective>
Phase 1 of milestone v28.0 (Script Engine Quality v2). Land six sub-tasks
sequentially in one session: build an eval harness, baseline V27.11.PR6,
then enforce diversity, register, and latency one-by-one — each gated by
a concrete eval delta against baseline. Sub-task 6 (framework validators)
is conditional and remains a placeholder until baseline data decides.

Purpose: kill the three production failure modes the user observed —
generic concepts (4/6 share big_idea), Hebrew-as-translation (~0 casual
markers), and ~2-minute total time per product. Each fix proves itself
on numbers, not vibes.

Output: working eval harness, captured baseline, three improvement
sub-tasks shipped to main with their respective metric gates passing.
</objective>

<execution_context>
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md
@.planning/ROADMAP.md
@.planning/debug/v27-script-quality-audit.md
@.claude/CLAUDE.md
</execution_context>

<context>
**Anchor documents (READ THESE FIRST in any new session resuming this plan):**
- `.planning/PROJECT.md` — milestone scope, the three production problems
- `.planning/REQUIREMENTS.md` — REQ-IDs (EVAL-/DIV-/REG-/LAT-/FW-)
- `.planning/debug/v27-script-quality-audit.md` — diagnose-only root cause report (the source for everything)
- `.claude/CLAUDE.md` — V27.11.PR1..PR6 ground state, key conventions
- `.planning/STATE.md` — current sub-task progress (UPDATE this after each commit)

**Production code anchors (do not modify outside the sub-task scope listed):**
- `apps/web/lib/llm/concept-engine.ts` — phase 1 + phase 2 orchestrator (V27.11.PR5)
- `apps/web/lib/llm/scripts.ts` — 6-framework batch + buildIntelligencePromptBlock + retry loop
- `apps/web/lib/llm/openai-script-client.ts` — Responses API wrapper, instructions field
- `packages/prompts/src/concept-cards-schema.ts` — 12-field card schema (V27.11.PR6)
- `packages/prompts/src/concept-system-prompt.ts` — ~6K char concept prompt
- `packages/prompts/src/script-system-prompt.ts` — ~37K char V6 system prompt
- `packages/prompts/src/script-json-schema.ts` — V6 schema, 20 required fields per scene (V27.11.PR3)
- `apps/web/lib/product-intelligence/` — dossier + visual-analysis + audience-inference

**Baseline anchor (the SHA every sub-task gate is measured against):**
After Sub-task 2 commits, record the baseline-run SHA in `.planning/STATE.md`
under `Baseline SHA:`. Every later sub-task's eval comparison uses
`.planning/eval/baselines/v27.11.PR6.json` as the numeric reference.
</context>

---

# Phase Plan — six sub-tasks, sequential, single session

Each sub-task has:
- **Scope** — files added/changed
- **DoD** — explicit gate it must pass to be considered done
- **Commit** — single squash commit subject (the rollback anchor for the next sub-task)
- **If gate fails** — explicit recovery move (rollback target SHA, what to retry)

If `/clear` is needed mid-phase, the resume protocol is at the bottom of this file.

---

## Sub-task 1 — Eval Harness (foundation)

**Requirements:** EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVAL-05, EVAL-06, EVAL-07, EVAL-09

**Scope (files to create):**

```
apps/web/scripts/eval/
├── script-engine-eval.ts          # main orchestrator (CLI entrypoint)
├── runners/
│   ├── concept-runner.ts          # calls real generateConceptCardsAction with pinned PI
│   └── expand-runner.ts           # calls real expandPickedConceptsAction
├── metrics/
│   ├── big-idea-diversity.ts      # 1 - mean(cosine similarity of big_idea embeddings)
│   ├── casual-markers.ts          # regex count over CANONICAL_MARKERS per scene
│   ├── framework-signal.ts        # Sonnet judge guesses framework from spoken text
│   └── register-authenticity.ts   # Sonnet judge scores 1-10 with anchor exemplars
├── judges/
│   └── sonnet-judge.ts            # thin Anthropic wrapper, structured output
├── lib/
│   ├── canonical-markers.ts       # ['תכל'ס','וואלה','סבבה','פשוט','בכלל','אחותי','תקשיבי','לא נורמלי']
│   ├── embeddings.ts              # OpenAI text-embedding-3-small wrapper + cosine
│   ├── timing-collector.ts        # captures pi_duration_ms / concept_batch_duration_ms / concept_expand_duration_ms
│   └── output-writer.ts           # writes .planning/eval/runs/<ts>.json + console summary
└── anchors/
    ├── register-anchors.ts        # 5 ❌ + 5 ✅ exemplar pairs per category (judge primer)
    └── framework-signatures.ts    # used in Sub-task 6 — empty stub now

.planning/eval/gold-set/
├── cosmetics-1.json … cosmetics-3.json     # { url, productData (pinned), intel (pinned PI JSON) }
├── electronics-1.json … electronics-3.json
└── food-1.json … food-3.json
                                            # 9 total. Use real product URLs + pre-computed
                                            # buildProductIntelligence output (one-time fetch,
                                            # frozen to disk for determinism)

apps/web/package.json                       # add "eval:script-engine": "tsx scripts/eval/script-engine-eval.ts"
```

**Implementation notes (load-bearing):**

- The runners call the **same** code paths as production (`generateConceptCardsAction` / `expandPickedConceptsAction`) — no eval-only forks of the engine. The gold-set JSONs inject the pinned PI via the existing intel param so we skip the 30s scrape + dossier on every run.
- `canonical-markers.ts` exports a frozen list. Markers are matched with word-boundary regex tolerant to nikud and the Hebrew geresh (`׳` and `'`). CTA-style closing scenes (`scene_goal === 'decision_push'`) are EXCLUDED from the per-scene-marker average so we don't penalize the "click here" beat.
- Embedding step uses `text-embedding-3-small` ($0.02 / MTok). 6 concepts × 9 products × 1 embedding each = 54 embeddings per run, ~$0.0001. Cosine similarity matrix is 6x6 per product; diversity score = `1 - mean(off-diagonal)`. Higher = more diverse.
- Sonnet judge for `framework_signal_match`: feed 6 expanded scripts WITHOUT framework label, ask "which of {6 framework names} is this?". Score = (correct guesses / 6). Average across 9 products. Target ≥ 0.80.
- Sonnet judge for `register_authenticity_score`: feed each scene's `spoken_text_hebrew` plus the 5 ❌ + 5 ✅ category-anchored exemplars, ask "rate 1-10 how spoken-Israeli this sounds". Average per-scene per-product. Target ≥ 7/10.
- `output-writer.ts` writes a structured JSON per run to `.planning/eval/runs/<ISO-timestamp>.json` AND prints a console table with one row per metric showing `value | baseline (if any) | delta`.
- `timing-collector.ts` wraps the runner stages with `performance.now()` boundaries — captures BOTH wall-clock (real elapsed including any background-job waits) AND machine-time (sum of compute spans). Per-stage breakdown matches the user's measurement framing.

**DoD:** `npm run eval:script-engine` exits 0 on the full gold set, writes a JSON, and prints all 4 metrics + per-stage timings. (No baseline comparison yet — that's Sub-task 2.)

**Verification commands:**

```bash
cd apps/web
npm run eval:script-engine 2>&1 | tee /tmp/eval-st1-smoketest.log
test -f ../../.planning/eval/runs/*.json
grep -E "big_idea_diversity|casual_markers_per_scene|framework_signal_match|register_authenticity_score" /tmp/eval-st1-smoketest.log
grep -E "pi_duration_ms|concept_batch_duration_ms|concept_expand_duration_ms" /tmp/eval-st1-smoketest.log
npm run typecheck
```

**Commit:** `feat(eval): script-engine eval harness — 4 metrics + gold set (sub-task 1)`

  → tag this commit's SHA in `.planning/STATE.md` as `Sub-task 1 SHA: <sha>` for rollback reference.

**If smoke test fails:** Sub-task 1 is foundation — there's nothing to roll back to. Fix forward. Do not advance to Sub-task 2 until smoke test passes.

---

## Sub-task 2 — Baseline Run (capture V27.11.PR6 numbers)

**Requirements:** EVAL-08

**Scope:**

- Run the harness from Sub-task 1 against the **current production code path** (whatever is on `main` at this commit — the V27.11.PR4 + PR6's concept_interactive code, with `SCRIPT_ENGINE_MODE=concept_interactive` forced for the run regardless of env default).
- Capture results to `.planning/eval/baselines/v27.11.PR6.json` (the filename refers to the latest shipped concept work, not a literal git tag — clarify this in a header comment inside the JSON).
- Also capture a parallel baseline of the `legacy_full_batch` path to `.planning/eval/baselines/v27.11.PR6-legacy.json`. We don't gate against this one but having both lets us verify later sub-tasks don't degrade legacy as a side-effect.
- Update `.planning/STATE.md`:
  - `Baseline SHA: <current main SHA>`
  - `Baseline numbers:` table with all 4 metrics + 3 per-stage timings.

**DoD:** Both baseline files exist, all 4 metrics + 3 timings populated for both engine modes, STATE.md updated.

**Verification commands:**

```bash
SCRIPT_ENGINE_MODE=concept_interactive npm run eval:script-engine -- --baseline-out=.planning/eval/baselines/v27.11.PR6.json
SCRIPT_ENGINE_MODE=legacy_full_batch    npm run eval:script-engine -- --baseline-out=.planning/eval/baselines/v27.11.PR6-legacy.json
test -f .planning/eval/baselines/v27.11.PR6.json
test -f .planning/eval/baselines/v27.11.PR6-legacy.json
jq '.metrics | keys' .planning/eval/baselines/v27.11.PR6.json
jq '.timings | keys' .planning/eval/baselines/v27.11.PR6.json
```

**Decision point — Sub-task 6 trigger:**

After this commit, read `framework_signal_match` from the concept_interactive baseline:
- **If < 0.80** → Sub-task 6 (Framework Validators) is GREEN-LIT for execution. Expand the placeholder section into a full sub-task before Sub-task 5 ships (it can be planned in parallel with Sub-task 3..5 work). Note in STATE.md: `Sub-task 6 status: required — baseline framework_signal_match = X`.
- **If ≥ 0.80** → Sub-task 6 is validated-by-baseline. Mark `Sub-task 6 status: skipped — baseline already passes` in STATE.md. The placeholder stays unexpanded in PLAN.md.

**Commit:** `eval(baseline): capture V27.11.PR6 baseline numbers (sub-task 2)`

  → tag this commit's SHA in STATE.md as `Sub-task 2 SHA: <sha>` (= the BASELINE SHA — every later sub-task is gated against numbers captured at this commit).

**If gate fails (i.e. eval crashes mid-baseline):** Roll back to `Sub-task 1 SHA`. Fix the harness. Re-run.

---

## Sub-task 3 — Diversity Enforcement

**Requirements:** DIV-01, DIV-02, DIV-03, DIV-04, DIV-05

**Scope:**

```
packages/prompts/src/concept-cards-schema.ts
  + add 'big_idea_axis' enum field (required, strict): 'convenience' | 'proof' | 'price' | 'emotion' | 'mechanism' | 'social_validation'
  - remove 'estimated_quality' (the LLM rates 8-9 on every card; gating on it is meaningless)
  - remove 'why_this_quality_score' if present (related)
  → bump CONCEPT_CARDS_JSON_SCHEMA version comment

packages/prompts/src/concept-system-prompt.ts
  + new section "AXIS DIVERSITY (כיוונים אורתוגונליים)" explaining the 6 axes with one Hebrew sentence each
  + new section explaining: "כשאתה מקבל forbidden_axes — אסור להשתמש בהם. בחר axis אחר."
  → CONCEPT_REGEN_SYSTEM_PROMPT also updated symmetrically (delta-rule additions for forbidden_axes)

apps/web/lib/llm/concept-engine.ts
  + buildPerSlotPrompt(slot_index, alreadyChosenAxes): appends a "FORBIDDEN AXES FOR THIS SLOT: [...]" block to the user prompt
  - generateConceptCards: change from "1 LLM call returning 6" to "6 LLM calls in series, each seeing prior axes" — accept the latency cost here (Sub-task 5 wins it back via streaming + parallelism)
    OR (preferred): keep the single call but include a JSON array spec "slot 0 must use axis X (or any), slot 1 must NOT use axis-of-slot-0, slot 2 must NOT use axes-of-slots-0-1, ..." in the prompt and rely on structured output to enforce. Implement BOTH and pick whichever the eval shows as more diverse.
  - replace pickTopConceptsByQuality → pickTopConceptsByDiversity:
    * if 6 cards have 6 distinct axes → return [card_0, card_2, card_4] (or any 3 distinct; first-3 is fine after diversity is enforced)
    * if duplicates somehow leak through → prefer the unique axes for top-3
    * remove 'estimated_quality' references; sort by axis-coverage instead
  - delete pickTopConceptsByQuality and any callers

apps/web/lib/llm/concept-storage.ts
  → field migration shim: when reading legacy pendingConcepts blobs that have estimated_quality, ignore the field; do not enforce big_idea_axis on legacy cards (treat as 'unknown' axis for backwards compat — only NEW cards get the strict enum)

apps/web/app/(dashboard)/projects/[id]/scripts/concept-card.tsx
  → drop the 1-10 quality badge UI; surface big_idea_axis as a small label instead (Hebrew labels: convenience='נוחות', proof='הוכחה', price='מחיר', emotion='רגש', mechanism='איך זה עובד', social_validation='מה אחרים אומרים')
  → if axis === 'unknown' (legacy data), render no axis chip

apps/web/scripts/test-concept-interactive-pr6.ts
  → existing PR6 test script: replace any quality_score assertions with big_idea_axis assertions
  → add a new "diversity" subsection: 6 generated cards must have 6 distinct big_idea_axis values
```

**DoD (gate against baseline):**

```
big_idea_diversity_concept_interactive >= baseline.big_idea_diversity + 0.15
```

Verified by running `npm run eval:script-engine` after the diff lands and comparing JSON output to `.planning/eval/baselines/v27.11.PR6.json`. If the harness is well-built, also:
- `register_authenticity_score` and `casual_markers_per_scene` MUST NOT regress > 0.5 / 0.2 respectively (regression guard — diversity work shouldn't break Hebrew quality).

**Verification commands:**

```bash
npm run typecheck
cd apps/web && npm test -- test-concept-interactive-pr6  # PR6 regression must stay green
npm run eval:script-engine -- --compare=.planning/eval/baselines/v27.11.PR6.json
# Expect green on:  big_idea_diversity delta >= +0.15
# Expect green on:  casual_markers_per_scene delta >= -0.2
# Expect green on:  register_authenticity_score delta >= -0.5
```

**Commit:** `feat(script-engine): big_idea_axis diversity enforcement (sub-task 3, gate +0.15)`

  → tag SHA in STATE.md: `Sub-task 3 SHA: <sha>`. **This is the rollback target if Sub-task 4 breaks Sub-task 3's gate.**

**If gate fails:**
- First retry: re-prompt the LLM with stronger axis-locking language (e.g. quote the forbidden axes verbatim into the system instruction, not just user prompt). Re-run eval.
- Second retry: switch from "single call with array spec" to "6 series calls each seeing prior axes". Higher latency, stronger guarantee. Re-run eval.
- If both fail: **roll back to `Sub-task 2 SHA`**, re-investigate. The diversity hypothesis (axis enum + ban-list) is wrong; the engine is converging on the same big_idea for a deeper reason (uncached PI biasing, framework prompt overlap). Open a new audit before retrying.

---

## Sub-task 4 — Register Hard Enforcement

**Requirements:** REG-01, REG-02, REG-03, REG-04

**Scope:**

```
packages/prompts/src/script-json-schema.ts
  + add 'casual_markers_used' to SCENE_ITEM_SCHEMA: { type: 'array', items: { type: 'string' }, minItems: 1 } UNLESS scene_goal === 'decision_push'
    (express the conditional in the prompt, not the schema, since OpenAI strict mode doesn't support conditional required)
  → schema description: "List the casual Hebrew markers (תכל'ס/וואלה/סבבה/פשוט/בכלל/אחותי/תקשיבי/לא נורמלי) you actually used in spoken_text_hebrew. Empty array allowed only on decision_push scenes."
  → schema-required count: 20 → 21 per scene (PR3 trim baseline was 20)

packages/prompts/src/script-system-prompt.ts
  + new section "REGISTER ANTI-EXAMPLES (3 paired samples)" with:
    - Cosmetics ❌: "אף אחד לא אומר כמה זה מבלבל לבחור serum נכון" → ✅: "תקשיבי, אחותי, אף אחד לא יגיד לך תכל'ס איזה סרום באמת עובד"
    - Electronics ❌: "המוצר הזה משלב טכנולוגיה מתקדמת" → ✅: "וואלה, פשוט תסתכלי על זה — זה לא נורמלי כמה זה זריז"
    - Food ❌: "הטעם המיוחד של המוצר מקנה חוויה ייחודית" → ✅: "סבבה אז תכל'ס אני אמרה לך — הטעם הזה פשוט לא נגמר"
  + at top of prompt (right after REGISTER LOCK), one explicit instruction: "כל סצנה (חוץ מ-decision_push האחרון) חייבת לכלול לפחות marker אחד מהרשימה. תרשום אותם ב-casual_markers_used."
  → these anti-examples come from the production failure logs; if .planning/evidence/ has the actual PDRN script use those verbatim for the ❌ row

apps/web/lib/llm/register-validator.ts          # NEW
  + runRegisterValidator(rawScripts: GeneratedScript[]): {
      pass: boolean,
      avgMarkersPerScene: number,
      perScript: { framework: string, avgMarkersPerScene: number, failedSceneOrders: number[] }[]
    }
  + validation rule: average across non-decision_push scenes; flag failure if avg < 1.0
  + uses the same canonical markers list as apps/web/scripts/eval/lib/canonical-markers.ts (extract to packages/shared/src/register/markers.ts to avoid duplication)

apps/web/lib/llm/scripts.ts
  + after the 6-framework parallel batch resolves, run runRegisterValidator on the 6 scripts
  + for each failed script: re-issue the SAME framework call ONCE with an additional system message: "REWRITE: הסצנות הבאות לא עוברות register check. תכתוב מחדש את spoken_text_hebrew של כל סצנה ובכל סצנה (חוץ מ-decision_push) השתמש בלפחות marker אחד מ-[רשימה]. שמור על אותו big_idea / hook / scene_outline. החזר JSON תואם לסכמה."
  + per-script retry budget: 1. If still failing after retry, ship the script with a `register_failed: true` annotation in metadata; admin debug surfaces it. Do NOT block the user — quality lift not a hard wall.
  → record in ApiCall metadata: `register_validator: { ran: true, retried: number, finalPass: boolean }`

packages/shared/src/register/markers.ts        # NEW (extracted)
  + export const CANONICAL_MARKERS = [...]  (frozen, single source of truth)
  + export function countMarkersInHebrew(text: string): { total: number, hits: string[] }
  → both eval/lib/canonical-markers.ts and lib/llm/register-validator.ts import from here
```

**DoD (gate against baseline):**

```
casual_markers_per_scene >= 1.0  AND  register_authenticity_score >= baseline.register_authenticity_score + 1.5
```

ALSO regression guard: `big_idea_diversity` MUST NOT regress > 0.05 below the value captured at end of Sub-task 3.

**Verification commands:**

```bash
npm run typecheck
cd apps/web && npm test -- test-concept-interactive-pr6
npm run eval:script-engine -- --compare=.planning/eval/baselines/v27.11.PR6.json
# Expect green on:  casual_markers_per_scene >= 1.0 (absolute, not delta)
# Expect green on:  register_authenticity_score delta >= +1.5
# Expect green on:  big_idea_diversity does NOT regress > 0.05 vs sub-task 3 result
```

**Commit:** `feat(script-engine): casual_markers_used schema + post-gen retry + anti-examples (sub-task 4, gate +1.5)`

  → tag SHA in STATE.md: `Sub-task 4 SHA: <sha>`.

**If gate fails:**
- First retry: increase the retry budget from 1 to 2 (some long Hebrew completions need a second rewrite pass to hit the marker quota).
- Second retry: add the markers requirement INTO the cached system block (not just user prompt) — load-bearing instruction belongs at the top.
- If both fail: **roll back to `Sub-task 3 SHA`**. Diversity work is preserved; register work is reverted. Re-investigate — anti-examples may not be category-correct. Pull more failure samples from production logs and try again.

---

## Sub-task 5 — Latency Reduction

**Requirements:** LAT-01, LAT-02, LAT-03, LAT-04, LAT-05

**Scope (4 independent levers — implement in this order, commit in one squash):**

**5.1 PI prefetch (LAT-01) — biggest single win, ~30s wall-clock**

```
apps/web/app/api/products/extract/route.ts
  → after scrape resolves AND BEFORE returning the response, kick off
    `void buildProductIntelligence(productData)` as a fire-and-forget background promise
  → store the promise handle in a Redis key keyed by projectId: `pi:in_flight:<projectId>` with status 'running'
  → on resolve, write the PI JSON to `pi:result:<projectId>` (TTL 1h) and update status 'ready'
  → on reject, write status 'failed' with error message
apps/web/lib/product-intelligence/prefetch-cache.ts          # NEW
  + getPiOrWait(projectId, timeoutMs=45000): checks Redis cache first, awaits the in-flight promise, falls back to fresh build
apps/web/lib/llm/concept-engine.ts
apps/web/lib/llm/scripts.ts
  → both call sites swap their direct `await buildProductIntelligence()` for `await getPiOrWait(projectId)`
apps/web/app/(dashboard)/projects/[id]/scripts/concept-actions.ts
  → use getPiOrWait at the top of generateConceptsAction (avatar select + concept-button-click is the parallel window)
```

**5.2 music_profile consolidation (LAT-02)**

```
packages/prompts/src/script-json-schema.ts
  - remove music_profile from SCRIPT_ITEM_SCHEMA (was 7 sub-fields)
  → schema-required script-level count drops; update count-asserting tests
packages/prompts/src/script-system-prompt.ts
  - remove the music_profile rules section (~1500 chars)
apps/web/lib/llm/music-profile.ts                            # NEW
  + chooseMusicProfile(scripts: GeneratedScript[], projectIntel: Intelligence): Promise<MusicProfile>
  + uses gpt-4o-mini structured output, single call, ~$0.0005, ~1s
  + reads aggregated tone/mood across the 6 scripts + the audience inference + product category
apps/web/lib/llm/scripts.ts
  → after the 6-framework batch resolves AND register validation completes, call chooseMusicProfile ONCE
  → attach the same musicProfile to all 6 scripts (current behavior is per-framework which often disagree)
apps/web/lib/scenes/voice-impl.ts (or wherever script.musicProfile is read for render)
  → no change needed if reading from script.rawJson.music_profile — but verify the new field path
prisma migrations:
  → no schema change (musicProfile lives inside Script.rawJson JSON blob)
```

**5.3 Streaming concept generation (LAT-03)**

```
apps/web/lib/llm/openai-script-client.ts
  + new export: openaiStructuredCallStreaming<T>({ instructions, input, schema, onPartial }) — wraps client.responses.create({ stream: true })
  + onPartial fires for each delta; final returns the parsed object same as openaiStructuredCall
apps/web/lib/llm/concept-engine.ts
  → generateConceptCards switches to streaming variant (only if SCRIPT_ENGINE_MODE === 'concept_interactive')
  → each completed card pushed via Server-Sent Events to the client as it lands
apps/web/app/api/projects/[id]/scripts/concept-stream/route.ts          # NEW
  + GET handler returning text/event-stream
  + auth-gated via getOrCreateAppUser (per V26.SEC pattern)
  + emits events: { type: 'card', slot: number, card: ConceptCard } | { type: 'done', cards: ConceptCard[] } | { type: 'error', message: string }
```

**5.4 Skeleton placeholders (LAT-04)**

```
apps/web/app/(dashboard)/projects/[id]/scripts/concept-flow.tsx
  → on "צור קונספטים" click, immediately render 6 ConceptCardSkeleton elements with framework headers
  → open EventSource to /api/projects/[id]/scripts/concept-stream
  → on each 'card' event: replace the skeleton at slot N with the real ConceptCardView
  → on 'done': finalize state, allow selection
  → on 'error': replace remaining skeletons with retry-card UI
apps/web/app/(dashboard)/projects/[id]/scripts/concept-card-skeleton.tsx          # NEW
  + 6 framework-header chips + animated shimmer body (motion-shimmer from V27)
```

**DoD (gate against baseline):**

```
wall_time_total <= baseline.wall_time_total * 0.7
```

ALSO regression guards (must hold from earlier sub-tasks):
- `big_idea_diversity` >= baseline + 0.15 (Sub-task 3)
- `casual_markers_per_scene` >= 1.0 (Sub-task 4)
- `register_authenticity_score` >= baseline + 1.5 (Sub-task 4)

The eval's `wall_time_total` includes all four wins composing: prefetch saves the PI wait, music consolidation removes ~1s of redundant per-framework decode, streaming exposes the cards 10s sooner, skeletons remove the perceived dead time. Even if some interact with concurrency, the 0.7× target is the binding gate.

**Verification commands:**

```bash
npm run typecheck
cd apps/web && npm test -- test-concept-interactive-pr6
npm run eval:script-engine -- --compare=.planning/eval/baselines/v27.11.PR6.json
# Expect green on:  wall_time_total <= baseline.wall_time_total * 0.7
# Expect green on:  big_idea_diversity, casual_markers_per_scene, register_authenticity_score regression guards
```

Manual smoke (staging or local):
```bash
npm run dev:web  # plus dev:worker if needed
# create a project, hit "צור קונספטים", confirm:
# - 6 skeleton cards appear instantly
# - first real card appears within ~5s
# - all 6 land within ~10s
# - PI is already done by the time concepts start (pi_duration_ms in eval JSON should be near 0)
```

**Commit:** `perf(script-engine): PI prefetch + music consolidation + streaming + skeletons (sub-task 5, gate 0.7x)`

  → tag SHA in STATE.md: `Sub-task 5 SHA: <sha>`.

**If gate fails:**
- Diagnose which lever underdelivered (the eval JSON has per-stage timings — compare each stage to baseline). Common cases:
  - PI prefetch race: user hits "צור קונספטים" before PI finishes → getPiOrWait blocks anyway. Check the typical avatar-selection wall-clock from production logs; if shorter than 30s, prefetch alone won't close the gap.
  - Streaming: if Responses API streaming delivers all cards together at end (vs incrementally), it's not real streaming for our schema shape. Verify with curl.
- First retry: deepen the slowest lever (e.g. add Redis pub/sub to the SSE endpoint so the prefetch-ready signal hits the client without polling).
- Second retry: drop one lever entirely if it's not delivering. The 0.7× gate should hold on the other three if PI prefetch alone is ~24% of baseline (30s / 125s).
- If still failing: **roll back to `Sub-task 4 SHA`**. Latency work reverts; diversity + register stay shipped. Re-architect from the eval data.

---

## Sub-task 6 — Framework Validators (CONDITIONAL placeholder)

**Status:** **Expanded only if Sub-task 2 baseline shows `framework_signal_match < 0.80`.**

If skipped, this section stays as a placeholder. If green-lit, expand it before Sub-task 5 ships (in parallel) using the structure from Sub-tasks 3-4 (Scope / DoD / Verification / Commit / Rollback).

Anchor sketch (do not implement until baseline data confirms need):

- **FW-01:** define structural signature for each of 6 frameworks. Examples:
  - `skeptical_testimonial`: scene 0 must contain a "doubt" beat (regex on Hebrew negation patterns + specific lexicon); last scene must contain a "vindication" beat.
  - `problem_agitation_solution`: scene 0 = pain, scene 1-2 = agitation, last = solution.
  - (etc. for the other 4 frameworks)
- **FW-02:** validator runs after expand; failing scripts dropped from the 3-pick.
- **FW-03:** if FW-02 alone doesn't reach the 0.80 gate, split the system prompt per-framework (reduces prompt entropy per call; each framework only sees its own rules).
- **FW-04 (gate):** `framework_signal_match >= 0.80`.

**Commit (when shipped):** `feat(script-engine): per-framework validators (sub-task 6, gate 0.80)` → tag SHA in STATE.md.

---

# Cross-cutting

## Per-sub-task housekeeping (do this every commit)

1. Update `.planning/STATE.md`:
   - Mark previous sub-task `status: complete` with the gate-pass numbers.
   - Mark current sub-task `status: in_progress` (or just-shipped) with its commit SHA.
2. Update `.claude/CLAUDE.md` Latest Version block (per house rule: STATUS / CLAUDE / README in same commit). One paragraph, the gate numbers, the lesson.
3. Push (`git push origin main`) — trunk-based dev per house rule.
4. The eval JSON for this sub-task lives in `.planning/eval/runs/<ts>.json` — the timestamp is part of git history via the commit message. Do NOT commit the entire `.planning/eval/runs/` directory; it's an output dir. Add to `.gitignore` if not already.

## Resume protocol (if /clear is used mid-phase)

A new context can pick this back up by reading, in order:

1. **`.planning/STATE.md`** — current sub-task, last completed SHA, baseline numbers.
2. **`.planning/phases/01-script-engine-quality-v2/01-PLAN.md`** (this file) — full plan.
3. **`.planning/REQUIREMENTS.md`** — REQ-IDs and gates.
4. **`git log --oneline -20`** — see what's been committed so far.
5. **`.planning/eval/baselines/v27.11.PR6.json`** + **most recent file in `.planning/eval/runs/`** — current metric standing vs gate.

The state needed to resume is fully captured in STATE.md + git log + this file. No conversation context required.

## Eval comparison contract (the meta-rule every sub-task obeys)

After every sub-task's eval-against-baseline:
- **All required gates pass** → commit + advance to next sub-task.
- **Required gate fails** → follow the sub-task's "If gate fails" recovery; do not advance.
- **Regression guard fires (later sub-task breaks earlier sub-task's gate)** → roll back to the named SHA. Earlier wins are preserved; current sub-task is re-investigated.

## Out of scope (do NOT touch in this phase)

- V27.11.PR6 branch merge / production rollout — separate concern (release management).
- Audit Bottleneck #5 (Anthropic schema cache split + cache_read attribution) — cost optimization, deferred.
- Audit Bottleneck #2 Step B (script prompt 3-file split) — deferred unless eval shows entropy is the binding constraint AFTER diversity + register fixes.
- Render pipeline (ffmpeg, captions, music selection at render time) — orthogonal subsystem.
- Provider/model swaps (Anthropic vs Gemini vs OpenAI) — quality measurement here applies to the configured default; provider tuning is a different milestone.
- Avatar / voice / image-brief work — orthogonal.

---

<verification>

## Phase-level verification (after Sub-task 5 commits)

Phase 1 is complete when:

- [ ] All EVAL-* requirements implemented (eval harness runs end-to-end)
- [ ] Baseline captured for both engine modes
- [ ] DIV-* gate passing: `big_idea_diversity >= baseline + 0.15`
- [ ] REG-* gate passing: `casual_markers_per_scene >= 1.0` AND `register_authenticity_score >= baseline + 1.5`
- [ ] LAT-* gate passing: `wall_time_total <= baseline * 0.7`
- [ ] FW-* either passed (if FW gate fired) or marked validated-by-baseline (if baseline ≥ 0.80)
- [ ] No regression: every later sub-task's gate also satisfies earlier sub-tasks' gates
- [ ] STATE.md reflects all 5 (or 6) sub-task SHAs + final gate numbers
- [ ] CLAUDE.md updated with V28.0 entry

After all gates green, run `/gsd-verify-work 1` for goal-backward verification, then `/gsd-complete-milestone` to close v28.0.

</verification>
