# V28.0.ST4 Option E — Manual Review (TWO test sets)

Captured 2026-05-03 to test whether the framework_signal_match drop in Sub-task 4 iter 1 (0.833 → 0.444) is a real engine regression OR a Sonnet judge artifact.

## Important context (read first)

During capture I discovered that **the post-Sub-task-4 LLM consistently puts `problem_agitation_solution` in slot 0** (the first concept card returned) across every product — likely a bias triggered by the new `casual_markers_used` schema requirement. Iter 1's full eval used `pick=2` (expanded slot 0 + slot 1 per product), so half the iter 1 expansions were PAS-clustered and half were varied. This may explain the fwm dip without any real framework merge.

To test this I captured two parallel sets:

| set | which slots | expected framework distribution | judge result |
|---|---|---|---|
| **Set A — varied** (`set-a-varied/`) | slots 0, 1, 2, 3, 4 across 5 products | one each of 5 different frameworks | **5/5 judge correct** |
| **Set B — clustered** (`set-b-clustered/`) | slot 0 across all 5 products | all 5 = problem_agitation_solution (PAS bias) | **4/5 judge correct** |

Combined: judge nailed **9/10** (90%) on this 10-script sample. The iter-1 number of 0.444 (8/18 = 44%) doesn't reproduce in fresh captures — suggests either LLM nondeterminism or a measurement artifact in iter 1's specific run.

## Your blind test

1. Open `set-a-varied/INDEX.md` and follow its instructions (read 5 files, guess each framework, check spoiler).
2. Then open `set-b-clustered/INDEX.md` and do the same.
3. Tally your hit rate on each set.

## Decision rule (revised given the new data)

The judge already scored **9/10 = 90% across both sets combined**. So the question for you is:

- **You hit 8-10 / 10 correct** → engine + judge both reliable; iter 1's 0.444 was likely measurement noise / LLM nondeterminism / slot-0-PAS-clustering. **Path forward: re-run iter 1 to check if 0.444 reproduces. If it doesn't, ship Sub-task 4 with recalibrated gates (Option A modified). If it does reproduce, dig into pick-strategy bug in the eval orchestrator.**

- **You hit 5-7 / 10 correct** → frameworks DID partially merge under Sub-task 4 (you can ID some but not all). **Path forward: Option A modified per your earlier spec — recalibrate gates + Sub-task 6 mandatory + Sub-task 6 before Sub-task 5.**

- **You hit 0-4 / 10 correct** → frameworks fully merged. **Path forward: Option D (rollback) or fundamental re-architecture.**

- **Special case: you hit high on set A but low on set B** → confirms the slot-0-PAS-bias is real and the engine produces less framework-distinctive PAS scripts than other frameworks. **Path forward: investigate the LLM's slot-0 bias before any other decision.**

## Capture metadata

- Engine: `SCRIPT_ENGINE_MODE=concept_interactive`
- Provider: `openai:gpt-5.4-mini`
- Code SHA: post-Sub-task-4 iter 1 (uncommitted; ST4 changes on top of `a47c80d`)
- Capture cost: ~$0.60 total (2 captures × ~$0.30 each)
- These are FRESH scripts, not the exact ones from iter 1 — drawn from the same post-ST4 distribution.

## What NOT to read until you've made your guesses

- Each subdir's `JUDGE-RESULTS.md` — has the actual frameworks + judge guesses + reasoning in one table. Spoilers.
- The `<details>` block at the bottom of each numbered file — same.
