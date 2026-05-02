---
milestone: v28.0
milestone_name: Script Engine Quality v2
status: planning
progress:
  phases_total: 1
  phases_completed: 0
  current_phase: null
last_updated: 2026-05-03
---

# Project State

## Current Position

Phase: 1 — Script Engine Quality v2
Plan: `.planning/phases/01-script-engine-quality-v2/01-PLAN.md`
Status: Sub-task 2 (Baseline Run) **STOPPED for user approval**
Last activity: 2026-05-03 — Both baselines captured, awaiting user sign-off before Sub-task 3

## Sub-task 2 — Baseline Captured

**Captured at git SHA:** `571fd6c` (= the SHA after Sub-task 1 commit + STATE record).
Both baseline JSONs persisted to `.planning/eval/baselines/`.

### Baseline numbers — concept_interactive (gates measure against this)

```
big_idea_diversity:           0.420   (LOW — concepts cluster, confirming user's "4/6 share big_idea")
casual_markers_per_scene:     0.144   (VERY LOW — 86% of non-CTA scenes contain ZERO casual markers)
framework_signal_match:       0.778   (BELOW 0.80 threshold — Sub-task 6 trigger fired)
register_authenticity_score:  7.673   (just above 7 absolute target — see register-vs-markers tension below)
pi_duration_ms:               9       (sentinel — PI is pinned to disk, 0 wall cost in eval)
concept_batch_duration_ms:    147506  (~16s/product avg)
concept_expand_duration_ms:   228713  (~25s/product avg, 2 expansions per product)
wall_time_total:              626757  (~70s/product wall = 10.5min for full eval)
```

### Baseline numbers — legacy_full_batch (regression guard, not gated)

```
big_idea_diversity:           0.432   (essentially identical to concept; user pain present in BOTH paths)
casual_markers_per_scene:     0.198   (still very low — register pain present in BOTH paths)
framework_signal_match:       0.574   (significantly worse than concept; concept's framework framing helps)
register_authenticity_score:  7.317   (slightly below concept; both above 7)
pi_duration_ms:               9
concept_batch_duration_ms:    0       (no concept stage in legacy)
concept_expand_duration_ms:   134612  (one parallel batch per product; ~15s/product wall for the LLM call)
wall_time_total:              882165  (~98s/product wall = 14.7min total — 6 parallel calls × Sonnet-class wall)
```

### Side-by-side delta (B - A)

| metric | concept (A) | legacy (B) | B-A | gate |
|---|---|---|---|---|
| big_idea_diversity | 0.420 | 0.432 | +0.012 | sub-task 3 ≥ A + 0.15 |
| casual_markers_per_scene | 0.144 | 0.198 | +0.054 | sub-task 4 ≥ 1.0 absolute |
| framework_signal_match | 0.778 | 0.574 | -0.204 | sub-task 6 (CONDITIONAL) ≥ 0.80 |
| register_authenticity_score | 7.673 | 7.317 | -0.356 | sub-task 4 ≥ A + 1.5 |

## Sub-task 6 fate — REQUIRED

**Decision rule per PLAN.md:** if baseline `framework_signal_match < 0.80`, Sub-task 6 (Framework Validators) is green-lit.

**Result:** concept_interactive baseline = `0.778 < 0.80` → **Sub-task 6: required, baseline = 0.778**.

The placeholder in PLAN.md (Sub-task 6 section) needs to be expanded into a full sub-task spec before Sub-task 3 ships. Sketch:

- **FW-01:** Define structural signature for each of 6 frameworks (e.g. `skeptical_testimonial` requires Hebrew "doubt" beat in scene 0 + "vindication" beat in last scene; `problem_agitation_solution` requires pain → escalation → resolution arc).
- **FW-02:** Validator runs after expand; failing scripts dropped from top-3.
- **FW-03:** If FW-02 alone doesn't reach 0.80, split system prompt per-framework so each call only sees its own framework's rules.
- **FW-04 (gate):** `framework_signal_match >= 0.80` after this sub-task lands.

This expansion is deferred until user approves the baseline numbers (per house rule: STOP for approval before continuing).

## Interesting findings (worth remembering, doesn't change plan)

- **Diversity + register pain present in BOTH engine paths.** `concept_interactive` was supposed to give the LLM lighter framing for diversity but in practice both paths converge on similar `big_idea_diversity` (0.420 vs 0.432) and similarly low casual_markers (0.144 vs 0.198). The user's pain is upstream of the concept-vs-legacy split — it's in the system prompt + schema design that BOTH paths inherit. This validates the milestone's central bet that fixes belong AT THE PROMPT/SCHEMA LAYER, not at the engine-mode layer.
- **concept_interactive's one clear win is `framework_signal_match` (+0.20 vs legacy).** The concept-card framing forces the LLM to commit to a framework's distinctive structure before expansion, so expanded scripts read more like the framework they claim to be. Legacy generates all 6 in one batch and they bleed into each other stylistically.
- **legacy_full_batch is slower wall-clock.** 882s vs 627s for the same 9 products. Counter-intuitive given legacy "parallelizes 6 frameworks per product" — but the wall_time is dominated by the LONGEST framework call per product (~98s on Sonnet-class output). concept_interactive splits work into a fast concept stage (16s) + cheap expand stage (only `pick=2` expansions × 13s each).
- **register_authenticity_score (7.67) and casual_markers_per_scene (0.14) don't correlate cleanly.** The Sonnet judge gives "passing" (>7) register scores even when 86% of scenes have ZERO casual markers. Hypothesis: the judge anchors to "is this Hebrew correctly written / not American calque" rather than "does this contain תכל'ס/וואלה". Neutral non-translated Hebrew passes the judge's bar even without casual markers. **Implication for Sub-task 4:** the casual_markers metric is the load-bearing register gate (≥ 1.0); the register_authenticity_score gate (≥ baseline + 1.5) catches further improvement on top.

## Sanity check results

- Judges varied across products: framework_signal_match ranges 0.0 - 1.0 across 9 products; register_authenticity_score ranges 6.4 - 8.3. ✓ Not constants.
- No NaN values in any aggregate. ✓
- Per-product timings sensible: concept batch 14-21s, each expand 10-17s. ✓
- 1 outlier product: **electronics-2** has div=0 + fwm=0 (concept batch likely returned <2 cards or parse glitch). 8/9 clean. Note for forensics; doesn't invalidate the aggregate. The orchestrator's per-stage error notes are empty — should improve to capture partial-failure context in a follow-up.

## Sub-task progress (update after each commit)

| # | Sub-task | Status | SHA | Gate result |
|---|----------|--------|-----|-------------|
| 1 | Eval Harness | complete | 5191a89 | smoke pass + judges fix landed (judge auto-fallback Anthropic→OpenAI; loud failures; startup health check) |
| 2 | Baseline Run | **STOPPED for approval** | (this commit) | both baselines captured. Sub-task 6: REQUIRED (fwm=0.778 < 0.80) |
| 3 | Diversity Enforcement | pending | — | gate: big_idea_diversity ≥ baseline + 0.15 (= ≥ 0.570) |
| 4 | Register Hard Enforcement | pending | — | gate: casual_markers_per_scene ≥ 1.0 AND register_authenticity_score ≥ 9.17 |
| 5 | Latency Reduction | pending | — | gate: wall_time_total ≤ baseline × 0.7 (= ≤ 438730 ms = 7.3 min) |
| 6 | Framework Validators | **required** | — | gate: framework_signal_match ≥ 0.80 (currently 0.778; need +0.022 absolute) |

## Baseline numbers (machine-readable copy for quick lookup)

```
Baseline SHA: 571fd6c
big_idea_diversity:           0.420
casual_markers_per_scene:     0.144
framework_signal_match:       0.778
register_authenticity_score:  7.673
pi_duration_ms:               9
concept_batch_duration_ms:    147506
concept_expand_duration_ms:   228713
wall_time_total:              626757
```

## Sub-task progress (update after each commit)

| # | Sub-task | Status | SHA | Gate result |
|---|----------|--------|-----|-------------|
| 1 | Eval Harness | complete | 5191a89 | smoke pass on cosmetics-1: big_idea_diversity=0.395, casual_markers=0/4 (foundation only — no gate) |
| 2 | Baseline Run | pending | — | — (this is the BASELINE — no gate) |
| 3 | Diversity Enforcement | pending | — | gate: big_idea_diversity >= baseline + 0.15 |
| 4 | Register Hard Enforcement | pending | — | gate: casual_markers_per_scene >= 1.0 AND register_authenticity_score >= baseline + 1.5 |
| 5 | Latency Reduction | pending | — | gate: wall_time_total <= baseline * 0.7 |
| 6 | Framework Validators (CONDITIONAL) | not-decided-until-st2 | — | gate: framework_signal_match >= 0.80 (only fires if baseline < 0.80) |

## Baseline numbers

(populated after Sub-task 2)

```
Baseline SHA: <pending>
big_idea_diversity:           <pending>
casual_markers_per_scene:     <pending>
framework_signal_match:       <pending>
register_authenticity_score:  <pending>
pi_duration_ms:               <pending>
concept_batch_duration_ms:    <pending>
concept_expand_duration_ms:   <pending>
wall_time_total:              <pending>
```

## Accumulated Context

### Decisions
- Single phase, six sub-tasks executed in one session — not multi-phase
- Eval harness is integral (Sub-task 1) — every later sub-task must beat baseline on its target metric
- V27.11.PR6 is the baseline (production starting point); PR6 merge/UAT is out of scope

### Blockers
- None

### Todos
- None

## Anchor Documents

- Audit (diagnose-only, source of truth for bottlenecks): `.planning/debug/v27-script-quality-audit.md`
- Project: `.planning/PROJECT.md`
- Requirements: `.planning/REQUIREMENTS.md`
- Roadmap: `.planning/ROADMAP.md`
- Milestone history: `.planning/MILESTONES.md`
