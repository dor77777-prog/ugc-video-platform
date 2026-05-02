# Roadmap — Milestone v28.0 Script Engine Quality v2

**1 phase** | **27 requirements mapped (4 conditional)** | All covered ✓

Per user direction: this milestone runs as **one phase with six sub-tasks**, executed sequentially in a single session. Multi-phase decomposition was explicitly rejected — this is AI engine tuning + observability, not parallelizable infra work.

---

## Phase Overview

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Script Engine Quality v2 | Diverse concepts + spoken Hebrew + ≥30% faster, all proven by eval against captured baseline | EVAL-01..09 · DIV-01..05 · REG-01..04 · LAT-01..05 · FW-01..04 (conditional) | 4 |

---

## Phase 1: Script Engine Quality v2

**Goal:** Make the script engine produce diverse concepts (no shared `big_idea` across slots), spoken Hebrew (casual markers present per scene), faster (≥30% wall-clock cut), and prove every fix on a measurable eval against a captured V27.11.PR6 baseline.

**Requirements:** EVAL-01..09, DIV-01..05, REG-01..04, LAT-01..05, FW-01..04 (conditional on baseline)

**Sub-tasks (sequential, single session — these become PLAN.md tasks):**

1. **Eval Harness** — `apps/web/scripts/eval/script-engine-eval.ts` with 4 metrics (`big_idea_diversity`, `casual_markers_per_scene`, `framework_signal_match`, `register_authenticity_score`) + per-stage timings. Gold set of 8–10 products across 3 categories with pinned PI for determinism. (EVAL-01..07, EVAL-09)

2. **Baseline Run** — Execute eval on the current V27.11.PR6 engine. Persist all 4 metrics + `pi_duration_ms` / `concept_batch_duration_ms` / `concept_expand_duration_ms` to `.planning/eval/baselines/v27.11.PR6.json`. Every later sub-task is gated against these numbers. (EVAL-08)

3. **Diversity Enforcement** — Add `big_idea_axis` enum (6 values) to concept schema. Per-slot ban-list forces orthogonality. Replace `pickTopConceptsByQuality` → `pickTopConceptsByDiversity` (top-3 = 3 distinct axes). Drop `quality_score` (self-rated 8–9 always; meaningless). Re-run eval. Gate: `big_idea_diversity ≥ baseline + 0.15`. (DIV-01..05)

4. **Register Hard Enforcement** — Schema field `casual_markers_used: string[]` per scene with strict validation. Post-generation regex check; scripts averaging < 1 marker per scene get one rewrite retry. System prompt extended with 3 paired ❌/✅ anti-examples per category (verbatim from production failure logs). Re-run eval. Gates: `casual_markers_per_scene ≥ 1.0` AND `register_authenticity_score ≥ baseline + 1.5`. (REG-01..04)

5. **Latency Reduction** — PI prefetch (background job at extraction confirmation, runs parallel with avatar selection, ~30s wall savings). `music_profile` consolidated to single post-batch `gpt-4o-mini` call. Streaming concept generation via Responses API (cards appear 3–5s vs 16s dead time). Skeleton placeholders render on click. Re-run eval. Gate: `wall_time_total ≤ baseline × 0.7`. (LAT-01..05)

6. **Framework Validators (conditional)** — ONLY if Sub-task 2 baseline shows `framework_signal_match < 80%`. Per-framework structural signature (e.g. `skeptical_testimonial` → confession in scene 0 + vindication in last scene). Validator drops failing scripts from top-3. Per-framework prompt split if validators alone don't close the gap. Re-run eval. Gate: `framework_signal_match ≥ 80%`. (FW-01..04)

**Success criteria (observable behaviors):**

1. `npm run eval:script-engine` produces a comparison report against `v27.11.PR6` baseline with all 4 metrics + per-stage timings.
2. After Sub-task 3, generating 6 concepts for any gold-set product yields 6 distinct `big_idea_axis` values (no duplicates), and `big_idea_diversity ≥ baseline + 0.15` on the eval set.
3. After Sub-task 4, every scene's `spoken_text_hebrew` contains ≥ 1 casual marker (verified by regex on production output), and `register_authenticity_score ≥ baseline + 1.5`.
4. After Sub-task 5, total wall-clock from "צור קונספטים" click to expanded script display is ≤ baseline × 0.7 (a measured ≥30% reduction), with concept cards visibly appearing one-by-one within 3–5s.

---

## Coverage Validation

| Requirement | Phase | Sub-task |
|-------------|-------|----------|
| EVAL-01 | 1 | 1 |
| EVAL-02 | 1 | 1 |
| EVAL-03 | 1 | 1 |
| EVAL-04 | 1 | 1 |
| EVAL-05 | 1 | 1 |
| EVAL-06 | 1 | 1 |
| EVAL-07 | 1 | 1 |
| EVAL-08 | 1 | 2 |
| EVAL-09 | 1 | 1 |
| DIV-01 | 1 | 3 |
| DIV-02 | 1 | 3 |
| DIV-03 | 1 | 3 |
| DIV-04 | 1 | 3 |
| DIV-05 | 1 | 3 |
| REG-01 | 1 | 4 |
| REG-02 | 1 | 4 |
| REG-03 | 1 | 4 |
| REG-04 | 1 | 4 |
| LAT-01 | 1 | 5 |
| LAT-02 | 1 | 5 |
| LAT-03 | 1 | 5 |
| LAT-04 | 1 | 5 |
| LAT-05 | 1 | 5 |
| FW-01 | 1 | 6 (conditional) |
| FW-02 | 1 | 6 (conditional) |
| FW-03 | 1 | 6 (conditional) |
| FW-04 | 1 | 6 (conditional) |

100% coverage ✓ — every REQUIREMENTS.md ID maps to Phase 1.

---

## Notes

- **Phase numbering:** Phase 1 because this is the first GSD-tracked milestone (V12–V27.11 history is in MILESTONES.md but not phase-numbered under `.planning/phases/`).
- **Conditional sub-task 6:** If baseline `framework_signal_match ≥ 80%`, FW-01..04 are validated-by-baseline at milestone close — no work needed. Decision happens after Sub-task 2.
- **Atomic sub-task commits:** Each sub-task commits its eval delta + schema/code changes together so future-me can bisect "which sub-task caused metric X to move".

---
*Created: 2026-05-03 — milestone v28.0.*
