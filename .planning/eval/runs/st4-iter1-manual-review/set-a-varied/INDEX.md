# V28.0.ST4 Option E — Manual Review Index

**5 expanded scripts captured from the post-Sub-task-4 engine** (concept_interactive mode, gpt-5.4-mini). Use this to test whether the framework_signal_match drop (0.833 → 0.444) is a real engine regression or a Sonnet judge artifact.

## How to use

1. Open each numbered file in order (`01-` → `05-`).
2. Read the spoken text. Write down which framework you think it's built around.
3. Expand the spoiler at the bottom of each file to see the actual framework + the Sonnet judge's guess + reasoning.
4. Tally your hit rate at the end.

## Decision rule

- **You hit 4-5 / 5 correct** → the Sonnet judge is weak on heavily-marker-saturated Hebrew (it's out-of-distribution for the model). Path forward: **Option F** — replace the judge with Opus 4.7 or GPT-5.4 and re-run the eval. If fwm jumps to ≥0.7, Sub-task 4 ships GREEN.
- **You hit 2-3 / 5 correct** → frameworks really did partially merge. Path forward: **Option A modified** — recalibrate Sub-task 4 gates + make Sub-task 6 mandatory + reorder Sub-task 6 BEFORE Sub-task 5.
- **You hit 0-1 / 5 correct** → frameworks fully merged. Path forward: **Option D** — rollback Sub-task 4 + architecture rethink before retrying.

## Files in this directory

1. `01-cosmetics-1.md` — cosmetics | סרום ויטמין C מוקצף
2. `02-cosmetics-3.md` — cosmetics | קרם ידיים אנטי-אייג'ינג
3. `03-electronics-2.md` — electronics | מטען נייד 20,000mAh
4. `04-electronics-3.md` — electronics | מצלמת רחוב חכמה לרכב
5. `05-food-2.md` — food | קוביות תה לימון-זנגביל בכוסיות

Plus `JUDGE-RESULTS.md` — all 5 actual frameworks + judge guesses in one table (don't open until after you've made your 5 guesses).

## Capture metadata

- Engine: `SCRIPT_ENGINE_MODE=concept_interactive`
- Provider: `openai:gpt-5.4-mini`
- Code SHA: post-Sub-task-4 iter 1 (uncommitted, ~ a47c80d + ST4 changes)
- Capture cost: ~$0.30 (5 concept batches + 5 expansions + 5 judge calls)
- These are FRESH scripts, not the exact ones from iter 1 (LLM is nondeterministic).
  But they're drawn from the same post-Sub-task-4 distribution.
