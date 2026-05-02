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
Plan: `.planning/phases/01-script-engine-quality-v2/01-PLAN.md` (single consolidated plan, 6 sub-tasks)
Status: Plan ready, awaiting execution
Last activity: 2026-05-03 — Phase 1 plan written

## Sub-task progress (update after each commit)

| # | Sub-task | Status | SHA | Gate result |
|---|----------|--------|-----|-------------|
| 1 | Eval Harness | pending | — | — |
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
