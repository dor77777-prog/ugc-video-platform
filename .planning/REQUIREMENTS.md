# Requirements — Milestone v28.0 Script Engine Quality v2

Source of truth for what this milestone delivers. Every requirement maps to exactly one phase.

The three production problems being solved (verbatim from user):

1. **Generic / non-distinct concepts** — 4 of 6 cards share the same `big_idea`. Frameworks are labels, not enforcement.
2. **Hebrew is written, not spoken** — REGISTER LOCK in the prompt is not enforced in output: תכל'ס / וואלה / סבבה appear ~0 times. Sentences read as direct translation from English.
3. **~2 minutes per product** — measured: 30s PI + 16s concept batch + 13.5s expand + dead transitions. Personal use = hours per week.

---

## v1 Requirements

### Eval (the foundation — every other requirement is gated by this)

- [ ] **EVAL-01** — `apps/web/scripts/eval/script-engine-eval.ts` exists and runs end-to-end on a fixed gold set
- [ ] **EVAL-02** — Gold set of 8–10 test products lives at `.planning/eval/gold-set/` covering ≥ 3 categories (cosmetics / electronics / food); PI is pre-computed and pinned for determinism
- [ ] **EVAL-03** — `big_idea_diversity` metric (semantic similarity via embeddings across the 6 generated concepts) — target ≥ 0.8 (lower similarity = more diverse)
- [ ] **EVAL-04** — `casual_markers_per_scene` metric (count of [תכל'ס, וואלה, סבבה, פשוט, בכלל, אחותי, תקשיבי, לא נורמלי] per scene) — target ≥ 1.0 average
- [ ] **EVAL-05** — `framework_signal_match` metric (Claude Sonnet judge guesses the framework from spoken text alone, no labels) — target ≥ 80%
- [ ] **EVAL-06** — `register_authenticity_score` metric (judge with 5 ❌ + 5 ✅ mocked anchors per category) — target ≥ 7/10
- [ ] **EVAL-07** — Wall-clock breakdown captured per stage (`pi_duration_ms`, `concept_batch_duration_ms`, `concept_expand_duration_ms`) for every eval run
- [ ] **EVAL-08** — Baseline run on V27.11.PR6 saved to `.planning/eval/baselines/v27.11.PR6.json` with all 4 metrics + per-stage timings
- [ ] **EVAL-09** — `npm run eval:script-engine` runs the harness and produces a comparison report against the most recent baseline

### Diversity (kills "4/6 cards share big_idea")

- [ ] **DIV-01** — `big_idea_axis` enum added to concept card schema with values `convenience | proof | price | emotion | mechanism | social_validation`
- [ ] **DIV-02** — Per-slot ban-list: slot N's prompt includes the axes already chosen by slots 0..N-1 and is instructed those axes are forbidden
- [ ] **DIV-03** — `pickTopConceptsByQuality` replaced with `pickTopConceptsByDiversity` — top-3 must use 3 distinct axes
- [ ] **DIV-04** — `quality_score` removed from concept card schema (the LLM self-rates 8–9 on everything; gating on it is meaningless)
- [ ] **DIV-05** — Eval gate: `big_idea_diversity ≥ baseline + 0.15` after this sub-task lands

### Register (kills "Hebrew reads as translation")

- [ ] **REG-01** — `casual_markers_used: string[]` field added to scene schema with strict validation (≥ 1 marker from the canonical list per non-CTA scene)
- [ ] **REG-02** — Post-generation regex check on every scene's `spoken_text_hebrew`: scripts averaging < 1 marker per scene are flagged `register_failed` and re-issued with explicit rewrite instruction (one retry max)
- [ ] **REG-03** — System prompt extended with 3 paired anti-examples per category — ❌ verbatim from production logs (e.g. PDRN script) + ✅ rewritten in spoken Hebrew
- [ ] **REG-04** — Eval gates: `casual_markers_per_scene ≥ 1.0` AND `register_authenticity_score ≥ baseline + 1.5` after this sub-task lands

### Latency (kills "~2 minutes per product")

- [ ] **LAT-01** — Product Intelligence prefetch: `buildProductIntelligence` kicks off as a background job the moment the user confirms extraction, runs in parallel with avatar selection (~30s wall savings)
- [ ] **LAT-02** — `music_profile` removed from per-framework script schema; computed once via a single `gpt-4o-mini` call after the 6 frameworks resolve (~$0.0005, ~1s, removes 6× output-token redundancy)
- [ ] **LAT-03** — Concept generation streams via OpenAI Responses API streaming structured output — 6 cards appear one-by-one within 3–5s of click instead of 16s of dead time
- [ ] **LAT-04** — Skeleton placeholders: 6 concept-card frames (with framework headers) render the moment "צור קונספטים" is clicked; the skeleton fills in as streaming arrives
- [ ] **LAT-05** — Eval gate: `wall_time_total ≤ baseline × 0.7` after this sub-task lands (≥ 30% wall-clock reduction)

### Framework validators (CONDITIONAL on baseline evidence)

- [ ] **FW-01** — Per-framework structural signature defined for each of the 6 frameworks (e.g. `skeptical_testimonial` requires confession in scene 0, vindication in last scene)
- [ ] **FW-02** — Validator per framework runs after expand; scripts that fail their framework's signature are dropped from the top-3
- [ ] **FW-03** — Per-framework prompt split (audit recommendation E) shipped if validators alone don't reach the gate
- [ ] **FW-04** — Eval gate: `framework_signal_match ≥ 80%` after this sub-task lands

> **Conditional execution:** FW-01..04 only run if Sub-task 2 baseline shows `framework_signal_match < 80%`. If baseline is already ≥ 80%, mark FW-01..04 validated-by-baseline at milestone close.

---

## Future Requirements

Deferred — explicitly NOT in this milestone:

- V27.11.PR6 (concept-interactive UX) production rollout — release management, separate from engine quality. Will be merged when UAT clears, on its own.
- Audit Bottleneck #5 — Anthropic schema cache split + cache_read attribution. Cost optimization at ~10–15%, not the user's pain point.
- Audit Bottleneck #2 Step B — System prompt 3-file split (core / mode / category). Defer until eval shows prompt entropy is the binding constraint AFTER diversity + register fixes ship.

---

## Out of Scope

Explicit exclusions with reasoning to prevent re-adding:

- **Multi-phase execution** — this is AI tuning + observability, not parallelizable infra work. One phase, six sub-tasks, sequential within session.
- **Chasing cost reduction without an eval delta** — every change must show up on a metric. Cost wins that hurt diversity / register / framework signal lose.
- **Reverting V27.11.PR1–PR4** — those bottlenecks are closed. This milestone builds on PR1–PR6, not against them.
- **Re-introducing post-generation vision QA** — V13 PR1 removed it as wrong-layer. This milestone's quality gates live at the prompt + schema + eval layer, not at a second-pass evaluator.
- **Dropping the concept-first engine** — concept_interactive is the architecture going forward. Diversity / register fixes apply at concept time AND at expand time.
- **Modifying the existing 6 framework definitions** — frameworks themselves are correct; the failure is enforcement. Validators (FW-01..04) constrain what passes, not what the LLM proposes.

---

## Traceability

Filled by ROADMAP.md after roadmap creation.

| REQ-ID | Phase |
|--------|-------|
| EVAL-01..09 | Phase 1 |
| DIV-01..05 | Phase 1 |
| REG-01..04 | Phase 1 |
| LAT-01..05 | Phase 1 |
| FW-01..04 | Phase 1 (conditional sub-task 6) |

---
*Created: 2026-05-03 — milestone v28.0 Script Engine Quality v2.*
