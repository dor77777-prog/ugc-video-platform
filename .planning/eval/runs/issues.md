# Eval Harness — Open Issues Log

Tracks anomalies surfaced by `npm run eval:script-engine` runs that need
investigation. Fix or dismiss as data arrives. Each issue records the
SHA + run JSON where it was first observed so a repro is always possible.

---

## #1 — `electronics-2` partial-failure outlier (concept_interactive baseline)

**First observed:** 2026-05-03, run `2026-05-02T22-53-17-574Z`, SHA `571fd6c` (Sub-task 2 baseline).

**Symptom:** `electronics-2` returned `big_idea_diversity = 0` AND `framework_signal_match = 0` AND `casual_markers_per_scene = 0`, while `register_authenticity_score = 8.33` (from a partial set of scenes that were judged). The remaining 8/9 products were clean.

**Likely cause (unconfirmed):** The phase-1 `generateConceptCards` call for this product returned fewer than 2 valid `RawConceptCard` objects — possibly:
- a parse glitch in the structured-output JSON (one card had a missing required field and the whole batch was truncated by OpenAI's strict mode), OR
- the LLM returned an empty `concepts: []` array (very rare on a heavily-constrained schema, but possible if the model hit a content-filter signal on the product name "מצלמת רחוב חכמה לרכב" — dash-cam framing could trigger a privacy/surveillance soft filter).

`big_idea_diversity = 0` is the harness's default for `texts.length < 2` (see `apps/web/scripts/eval/metrics/big-idea-diversity.ts:21`), confirming that <2 cards were available to embed.

**Why we suspect partial parse, not a hard error:** The orchestrator's outer `catch` block on the concept-batch stage didn't fire (no error in `notes`), so the call returned `{ concepts: [...] }` with a usable but truncated array. The orchestrator currently doesn't validate that the array length matches expectations — it just iterates. This is a forensics gap.

**Forensics gap to close:** `runConceptBatch()` in `apps/web/scripts/eval/runners/concept-runner.ts` should log a warning when `out.concepts.length < 6` (concept_interactive contract is exactly 6 cards). The orchestrator's `notes[]` should also capture short-card-count and mid-stage anomalies, not just thrown errors. Defer to follow-up unless the issue repros.

**Decision rule:**
- If this outlier **repros** in the Sub-task 3 eval (post-diversity-enforcement) — **investigate** before continuing. A 1/9 silent failure rate is tolerable for a baseline that's already statistically meaningful (8 clean), but if it grows to 2+/9 it's a systemic concern.
- If it **does not repro** — close this issue. Treat it as a single-call non-determinism event.

**Aggregate impact assessment:** The concept_interactive baseline `big_idea_diversity = 0.420` includes the 0 from this outlier (mean of 9 includes the 0 for div). Excluding electronics-2, the 8-product mean would be `0.420 × 9/8 = 0.4725`. Within ±0.06 of either. Doesn't change the gate calculation materially (Sub-task 3 needs +0.15 above baseline, so the gate is "≥ 0.570" either way → only ~0.04 difference in target).

**Status:** OPEN — re-check after Sub-task 3 baseline run.

---
