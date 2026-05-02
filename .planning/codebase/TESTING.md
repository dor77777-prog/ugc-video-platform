# Testing Patterns

**Analysis Date:** 2026-05-03

This repo does **NOT** use vitest, jest, or any other JS test runner in the production verification path. There is **no `vitest.config.*`, no `jest.config.*`, and no `__tests__/` directory** anywhere outside `node_modules`. Quality is gated by a different stack:

1. **Standalone tsx verification scripts** under `apps/web/scripts/test-*.ts` and `apps/worker/src/scripts/test-render.ts` — each is a normal TS file run via `npx tsx <file>`, asserting invariants with three trivial helpers (`ok` / `fail` / `assert`) and exiting non-zero on any failure.
2. **Master runners** that glob-discover and chain the per-PR scripts in numeric order (`test-v13-all.ts`, `test-v14-all.ts`).
3. **`tsc --noEmit` across all 4 workspaces** as a release gate (CLAUDE.md ships every PR with "tsc clean across all 4 workspaces").
4. **The V27 legacy CSS gate** at `scripts/check-v27-legacy.sh` — informational by default, strict in CI / pre-commit when invoked with `--strict`.
5. **The "no mocks in active path" rule** — `mock.ts` files exist as provider-shape templates only and are never instantiated at runtime.

The pattern was deliberate. The comment at the top of `apps/web/scripts/test-v13-all.ts` makes the trade-off explicit: *"this is a tsx-runnable smoke test that asserts the … pipeline … if/when the repo migrates to vitest in a future milestone, this file becomes the seed for the test suite."*

---

## Test Framework

**Runner:** None. Each test file is invoked via `npx tsx <file>`. Master runners use Node's built-in `child_process.spawnSync('npx', ['tsx', script])`.

**Assertion library:** None. Every script defines the same three helpers verbatim:

```ts
let failures = 0;
function ok(name: string) { console.log(`✓ ${name}`); }
function fail(name: string, detail: string) {
  failures++;
  console.error(`✗ ${name}\n   ${detail}`);
}
function assert(cond: boolean, name: string, detail = '') {
  if (cond) ok(name);
  else fail(name, detail);
}
// … assertions …
if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log(`\n✓ All assertions passed.`);
```

Copy this trio verbatim into any new `test-*.ts` script.

**Run commands:**

```bash
# Web app — full V13 + V14 verification (~5-6s wall time)
cd apps/web && npm test

# Worker — manual smoke test (creates DB rows, enqueues a render-job)
npm run test:render          # from repo root (workspace alias)

# Per-PR / per-feature
npm run test:v13              # apps/web — V13 master runner (8 scripts)
npm run test:v14              # apps/web — V14 master runner (8 scripts)
npm run test:anticollage      # apps/web — V27.11.PR1 (single-frame rule)
npm run test:anticollagepr4   # apps/web — V27.11.PR4 (schema enum sweep)
npm run test:scriptperf       # apps/web — V27.11.PR2 (script-gen cost cuts)
npm run test:schematrim       # apps/web — V27.11.PR3 (4-field schema trim)
npm run test:conceptinteractive # apps/web — V27.11.PR6 (concept-first UX)

# tsc gate (release-blocker)
npm run typecheck             # repo root — runs every workspace's `tsc --noEmit`

# V27 legacy CSS gate
npm run check:v27-legacy      # informational
npm run check:v27-strict      # CI / pre-commit
```

**Note on `test:conceptengine`:** CLAUDE.md V27.11.PR5 references `npm run test:conceptengine` and the file `apps/web/scripts/test-concept-engine-pr5.ts`. Neither is currently present in the repo (verified 2026-05-03). PR5's UX was retired by PR6 ("PR5's `concept_first` value is silently re-mapped to legacy") and the test runner was removed alongside it. The successor `test:conceptinteractive` covers the live PR6 surface.

---

## Test File Organization

**Location:** `apps/web/scripts/test-*.ts` for web-side verification, `apps/worker/src/scripts/test-render.ts` for the worker render smoke test. **Tests are NOT co-located with source** — they live in a single flat directory keyed by feature/PR.

**Naming — the glob shape is load-bearing:**
- `test-v13-pr<N>.ts` and `test-v14-pr<N>.ts` (with optional `.M` minor suffix, e.g. `test-v13-pr10.ts` / `test-v13-pr1.ts`) — discovered by the master runners via the regex `/^test-v13-pr\d+(?:\.\d+)?\.ts$/`.
- `test-anticollage-pr<N>.ts`, `test-schema-trim-pr<N>.ts`, `test-script-perf-pr<N>.ts`, `test-concept-interactive-pr<N>.ts` — feature-scoped, invoked by name from the matching `npm run` script in `apps/web/package.json`.
- `test-render.ts` — worker-only, manual smoke test that creates a real `User` / `Project` / `Script` / `Scene` / `RenderJob` and enqueues to `renderQueue`.
- `test-script-engine-v2.ts` — earlier-vintage smoke test against fixture products (skincare / kitchen / …); not in any runner glob.
- `test-balances.ts` — operational checks against provider balance APIs; 17 lines, no assertions.

**Structure inside each script:**

```ts
// V<X> PR<N> verification — <one-line summary>.
//
// <2-5 paragraph rationale: what bottleneck this test pins, what
// fixture data shape it uses, what would regress without it>.

import fs from 'node:fs';
import path from 'node:path';
import { … } from '../lib/<module>';     // relative imports — the
                                          // scripts live in apps/web/
                                          // so they can't use @/

let failures = 0;
function ok(name: string) { … }
function fail(name: string, detail: string) { … }
function assert(cond: boolean, name: string, detail = '') { … }

// ── 1. <Section name> ────────────────────────────────────────────────
{
  // fixture data + assertions
}

// ── 2. <Section name> ────────────────────────────────────────────────
{ … }

// summary
if (failures > 0) {
  console.error(`\n✗ ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log(`\n✓ All assertions passed.`);
```

Use box-drawing dashes (`──`) to fence sections. The leading number `[1.1]`, `[1.2]`, `[2.1]`, … prefixes assertion names so a failure tells you instantly which section + assertion broke.

---

## Test Inventory

### Master runners

| File | Role | Notes |
|------|------|-------|
| `apps/web/scripts/test-v13-all.ts` | Glob-runs `test-v13-pr*.ts` in numeric order, exits non-zero on any failure | 60 lines; spawned via `npx tsx`; per-script wall-time logged in summary |
| `apps/web/scripts/test-v14-all.ts` | Same shape for `test-v14-pr*.ts` | 59 lines; mirrors V13 runner |

### V13 verification suite — `npm run test:v13`

| File | Lines | Asserts | Coverage |
|------|------:|--------:|----------|
| `test-v13-pr1.ts` | 161 | 15 | Image-QA auto-regen loop removal — `lib/image-qa/` deleted, no QA imports / env reads in `generate-impl.ts`, no `buildCorrectiveBrief`, vision calls KEPT for face-gate / motion / product-visual-analysis |
| `test-v13-pr2.ts` | 394 | 49 | Image brief strengthening — Israeli realism extraction, hands-physics + mirror-safety detectors, PRODUCT REFERENCE LOCK paragraph, contact-proof rule |
| `test-v13-pr3.ts` | 345 | 55 | Animation plan builder + Kling prompt rendering — typed `AnimationPlan` with motionSubject / cameraMotion enum / forbiddenMotion / preserveProductVisibility / avoidFaceZoom, `buildKlingPromptFromPlan` rendering, plumbing through `clip-impl.ts` |
| `test-v13-pr4.ts` | 527 | 63 | Stage-tagged logger — `logStage(stage, scope)`, `.span()`, `LOG_LEVEL` filter, sensitive-data masking |
| `test-v13-pr5.ts` | 150 | 22 | Curated Hebrew error map — `SCENE_ERROR_MESSAGES` keyed by `<stage>.<reason>`, `getSceneErrorMessage(code, raw)` returning `{ hebrew, retryHint?, needsUserEdit?, isFallback }` |
| `test-v13-pr6.ts` | 145 | 34 | Scene state machine — `SCENE_STATUSES` const tuple, `isSceneStatus`, `SCENE_STATUS_TERMINAL`, `SCENE_STATUS_IN_FLIGHT`, schema additions for `status` / `lastErrorCode` / `lastErrorMessage` / `generationLogJson` |
| `test-v13-pr7.ts` | 272 | 44 | Pipeline impls write the new fields — status transitions, curated `<stage>.<reason>` codes, `flushSceneLogBuffer`, UX components surface them |
| `test-v13-pr8.ts` | 112 | 15 | `/admin/scenes/[id]/debug` panel — every persisted artifact rendered, status badge, last error, generation log, routing flags, image brief, motion analysis |
| `test-v13-pr10.ts` | 284 | 33 | V13.2 `/admin/costs` hardening — `attribute<Provider>Cost` invariants, the explicit ban on balance-delta attribution (`FORBIDDEN_balanceDeltaAttribution()` asserted to throw), closed allowlists guarding admin URL params |

V13 master runner sums: ~330 assertions across 9 scripts.

### V14 verification suite — `npm run test:v14`

| File | Lines | Asserts | Coverage |
|------|------:|--------:|----------|
| `test-v14-pr1.ts` | 672 | 50 | Israeli realism cue library — 51 atomic cues across 10 categories, 21 universal negatives, 12 environment_type baselines, 8 named scene presets, `chooseIsraeliCues(ctx)` deterministic selector, AvatarProfile extension |
| `test-v14-pr2.ts` | 583 | 49 | Frame-technique snippets — 5 typed deterministic builders (mirror selfie / selfie hand-held / product hand-hold / safe reflection / consistency anchor), `chooseFrameTechniqueSnippets(ctx)` dispatcher, single-scene suppression of consistency anchor, `selfie_in_mirror` enum value |
| `test-v14-pr3.ts` | 408 | 31 | Outfit lock + avatar byte-identity audit — `computeLockedOutfit({ gender, style, archetype, religiousRegister, productCategory? })` deterministic composition, religious gating, `describeAvatar()` byte-identity across 25 catalog avatars |
| `test-v14-pr4.ts` | 522 | 47 | Scene variation ledger + scroll-stopper levers — `SceneVariationLedger.{record, countOf, unusedFromKnown, diversityScore, summary}`, `chooseScrollStopperIndex({ totalScenes, finalSceneGoal? })`, `buildScrollStopperLevers`, ledger DOES NOT override script choices |
| `test-v14-pr5.ts` | 313 | 34 | Script V6 system prompt + 4 new structured-output fields — REGISTER LOCK section, GENRES / VOICE_PROFILES / ISRAELI_SETTING_CUES const tuples, ISRAELI_SETTING_CUES_LIST exactly matches SCENE_PRESETS keys |
| `test-v14-pr6.ts` | 201 | 21 | Admin debug surfaces — `/admin/scenes/[id]/debug` V14 section, `/admin/projects/[id]/diagnostic` per-script ledger + diversity grid + low-diversity warning |
| `test-v14-pr7.ts` | 177 | 14 | Docs + master test runner — `npm test` chains test:v13 + test:v14, runner glob-discovery, README/STATUS retroactive entries |
| `test-v14-pr8.ts` | 177 | 14 | (Trailing V14 cleanup pass) |

V14 master runner sums: ~260 assertions across 8 scripts.

### V27 / V27.11 feature-scoped suites

| File | Lines | Asserts | npm script | Coverage |
|------|------:|--------:|------------|----------|
| `test-anticollage-pr1.ts` | 526 | 30 | `test:anticollage` | Universal Single-Frame Rule — `SINGLE_FRAME_RULE` constant rendered in BOTH `buildScenePrompt()` branches (avatarPresent=true/false), `detectComparisonGuard()` flags scenes with comparison language, `COMPARISON_GUARD_RULE_BLOCK` + 13 collage-specific negatives appended to brief |
| `test-anticollage-pr4.ts` | 417 | 45 | `test:anticollagepr4` | Durable anti-collage architecture — `before_after` removed from `SCENE_GENERATION_TYPES`, `comparison_split` → `comparison_focus` in `FRAME_STRATEGIES`, system prompt sweeps, PR1 bridge regression on legacy `before_after` |
| `test-script-perf-pr2.ts` | 341 | 27 | `test:scriptperf` | V27.11.PR2 cost cuts — checklist removal evidence, char/line measurements (~40K → ~37.3K chars), PI in `systemInstruction` not user prompt, byte-identity across 10 calls, default model = `gpt-5.4-mini`, cache-eligibility floor |
| `test-schema-trim-pr3.ts` | 353 | 26 | `test:schematrim` | 4 admin/debug-only fields dropped — `israeli_environment_required`, `local_realism_notes`, `why_this_scene_exists`, `narrative_link_from_previous`. Schema required count 24 → 20 per scene; legacy DB-shape scenes still parse; CONTINUITY section in system prompt |
| `test-concept-interactive-pr6.ts` | 471 | 54 | `test:conceptinteractive` | Concept-first INTERACTIVE script UX — 12 LLM-output fields per concept card, server-managed wrapper (concept_id / slot_index / regenerationCount), `replaceSlots` byte-identity for unmodified slots, 4 server actions, selection rules (0=blocked, 1-3=allowed, 4+=blocked), expansion charges credits with per-failure refund |

(Asserts column reflects literal occurrences of `assert(` in the file; some scripts test multiple invariants per `assert` block via array iteration, so the **stated assertion counts in CLAUDE.md** — 89 / 76 / 73 / 84 / 102 — are higher because each iteration counts as an assertion. CLAUDE.md is authoritative for the user-facing count; the table above shows the literal call-count for grep-ability.)

### Operational scripts (NOT verification)

| File | Purpose |
|------|---------|
| `apps/worker/src/scripts/test-render.ts` | Manual worker smoke test — creates real DB rows for User/Project/Script/Scene/RenderJob, enqueues to `renderQueue`. Run via `npm run test:render`. Requires the worker (`npm run dev:worker`) to be running to actually process the job. |
| `apps/web/scripts/smoke-prod-pipeline.ts` | End-to-end production smoke test |
| `apps/web/scripts/test-script-engine-v2.ts` | Smoke test against three product fixtures (skincare / kitchen / …) — 276 lines, ~15 assertions; not in any runner glob |
| `apps/web/scripts/test-balances.ts` | Live balance fetch from each provider — 17 lines, no asserts |
| `apps/web/scripts/debug-{clip,mux,script,voice}-state.ts` | Manual debug helpers — print Scene rows, mux state, etc. |
| `apps/web/scripts/recover-pixverse-clip.ts` | Recovery helper for stuck PixVerse jobs |
| `apps/web/scripts/{kling,pixverse}-balance.ts` | Provider balance probes |
| `apps/web/scripts/apply-v13-{,2-}migration-prod.ts` | Out-of-band Prisma migration appliers used during V13 / V13.2 rollout |
| `apps/web/scripts/upload-static-assets-to-r2.ts` | Bulk-upload `apps/web/public/{avatars,music,voice-samples}/` to R2; run after adding new static assets |
| `apps/web/scripts/set-r2-cors.ts` | One-time R2 CORS configuration helper (admin-scope token required) |
| `apps/web/scripts/generate-{avatar-portraits,voice-samples}.ts` | Catalog generators |
| `apps/web/scripts/demo-script-engine-v2.ts` | Hand-driven demo of the script engine (live LLM calls) |

---

## Mocking — "no mocks in active path"

This is a hard rule, codified in CLAUDE.md and asserted by the V13 PR1 test (`apps/web/scripts/test-v13-pr1.ts`):

- `mock.ts` files exist in some provider directories (e.g. `apps/web/lib/animation/lipsync/mock.ts`) as **template shapes** for the provider interface. They are **never instantiated** at runtime.
- The active render / voice / clip / lipsync paths **always** call real providers (OpenAI, Kling, ElevenLabs, PixVerse, Grok). There is no DI container, no `if (process.env.MOCK_PROVIDERS) …` branch, and no in-memory test double.
- `apps/web/scripts/test-v13-pr1.ts` explicitly verifies that `lib/image-qa/` is gone and that `generate-impl.ts` contains zero references to mock-style fixtures (`forbiddenInGenerateImpl: ['image-qa', 'ImageQa', 'evaluateImageQa', 'buildCorrectiveBrief', 'IMAGE_QA_ENABLED', 'IMAGE_QA_MAX_RETRIES']`).

**What this means for adding tests:**
- Tests verify **shape and invariants**, not behavior under mock providers. You assert that `SCENE_STATUSES` contains `'failed'`, that the system prompt includes the REGISTER LOCK section, that `withRetry` retries on `ECONNRESET` but not on a 4xx — never that "the fake Kling provider was called twice."
- For pipeline tests, the assertion targets are the deterministic, no-LLM artifacts: image briefs (built by `buildImageBrief()`, no LLM), animation plans (built by `buildAnimationPlan()`, no LLM), curated Hebrew error messages (looked up from a static map), schema shapes (JSON schema for OpenAI structured output).
- Live-LLM smoke tests (`test-script-engine-v2.ts`, `smoke-prod-pipeline.ts`, `demo-script-engine-v2.ts`) hit real providers and consume real budget. They are NOT in any master runner. Run them by hand only.

---

## Fixtures and Factories

**Inline fixtures.** Each test script declares its fixture data at the top, between the helpers and the first `── 1.` section. Patterns observed:

- `apps/web/scripts/test-v13-pr2.ts` builds inline `Scene` / `ImageBriefInput` shapes for the hands-physics and mirror-safety detector tests.
- `apps/web/scripts/test-anticollage-pr1.ts` declares minimal `ProductIntelligence`, `ProductDossier`, `ProductVisualAnalysis`, `AudienceInference` fixtures at the top.
- `apps/web/scripts/test-v14-pr3.ts` iterates over the actual avatar catalog (`AVATAR_CATALOG` from `apps/web/lib/avatars/catalog.ts`) — the production data IS the fixture.
- `apps/worker/src/scripts/test-render.ts` uses Prisma to create real DB rows in a real `aws-1-ap-south-1` Supabase — Hebrew text fixtures inline (`textHebrew: 'הילד שוב מסרב לצחצח שיניים?'`).

**No factory libraries** (no `@faker-js/faker`, no `fishery`, no `factory.ts`). Fixtures are hand-rolled minimal objects.

**Fixture location:** Adjacent to the test that uses them. There is no `__fixtures__/` or `test/fixtures/` directory.

---

## Coverage

**No coverage tool configured.** No `nyc`, `c8`, or vitest coverage. The verification approach intentionally trades line-coverage instrumentation for assertion-density on load-bearing invariants.

**View per-test results:**

```bash
# Per-script
npx tsx apps/web/scripts/test-v13-pr3.ts

# All V13 with summary
cd apps/web && npm run test:v13
# Output: per-script PASS/FAIL + ms, total assertions passed/failed
```

The master runner prints a summary table:
```
V13 verification summary:
  PASS  test-v13-pr1.ts                (840ms)
  PASS  test-v13-pr2.ts                (1230ms)
  …
All 9 V13 verification scripts passed.
```

---

## Test Types

**Schema / contract tests.** The bulk of `test-v13-*` and `test-v14-*` and the V27 PR scripts. Pure assertions on exported types, const tuples, JSON schema shapes, system prompt strings, deterministic builders. Run in <1s each, no I/O.

**State-machine tests.** `test-v13-pr6.ts` asserts `SCENE_STATUSES` content, `isSceneStatus` guard correctness, `SCENE_STATUS_TERMINAL` / `SCENE_STATUS_IN_FLIGHT` set membership.

**Cost-attribution tests.** `test-v13-pr10.ts` asserts that `attribute<Provider>Cost` returns the right `source` (`actual_usage` / `estimate`), that the metadata payload carries the right keys, and that `FORBIDDEN_balanceDeltaAttribution()` throws.

**Determinism tests.** Several scripts include 100-run loops to assert that a function is byte-identical across invocations:
- `test-v14-pr3.ts` runs `describeAvatar()` over the 25-avatar catalog and asserts no nulls / no whitespace drift.
- The (now-removed) PR5 concept-engine test ran `pickTopConceptsByQuality` 100 times and asserted identical output.
- `test-script-perf-pr2.ts` calls `buildSystemInstructionWithIntelligence` 10 times and asserts byte-identity (cache prefix invariant).

**Manual integration tests** (live providers, real DB):
- `apps/worker/src/scripts/test-render.ts` — full render pipeline.
- `apps/web/scripts/smoke-prod-pipeline.ts` — production smoke.
- `apps/web/scripts/test-script-engine-v2.ts` — script engine against fixture products.

**E2E tests:** None. No Playwright, no Cypress, no Puppeteer. The "manual UAT" pattern referenced in CLAUDE.md (e.g. PR6 "awaiting manual browser UAT before merge") is a human walking through the wizard in a browser.

---

## CI Gating

The repo's CI behavior is implied (no `.github/workflows/` was inspected here, but the gates referenced throughout CLAUDE.md and the `npm run` scripts are):

1. **`tsc --noEmit` across all 4 workspaces** (`npm run typecheck`). Every PR ships with "tsc clean across all 4 workspaces" as the line-1 verification statement.
2. **The matching master runner** for the version's PR family (e.g. `npm run test:v13` for V13.x, `npm run test:v14` for V14.x; V27.11.PR1-6 use `test:anticollage`, `test:scriptperf`, `test:schematrim`, `test:anticollagepr4`, `test:conceptinteractive`).
3. **The V27 legacy CSS gate** (`scripts/check-v27-legacy.sh --strict`). Refuses commits containing pre-V27 utility classes:
   - `glass-strong`, `glass-liquid`, bare `.glass`
   - `bg-accent`, `text-accent`, `border-accent`, `ring-accent`
   - `animate-{fade-in-up, progress-shimmer, shimmer-overlay, soft-pulse, aurora-drift}`
   - `tachles-{progress-shimmer, shimmer-overlay, soft-pulse, fade-in-up, aurora-drift, text-shimmer}`
   - `shadow-glow`, `shadow-glow-accent`
   
   Default mode reports findings and exits 0 (informational). `--strict` exits 1 on any occurrence.

**No PR-level enforcement of the per-PR test scripts beyond the runners above.** A new PR is expected to add its OWN `test-<topic>-pr<N>.ts` script and its OWN `test:<topic>` npm alias — that's the convention CLAUDE.md describes for every PR entry.

---

## Common Patterns

**Async testing — node:fs and node:child_process only:**

```ts
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const generateImpl = fs.readFileSync(
  path.join(WEB, 'lib/scenes/generate-impl.ts'),
  'utf8',
);
for (const forbidden of FORBIDDEN_TOKENS) {
  assert(
    !generateImpl.includes(forbidden),
    `[2.x] generate-impl.ts has no '${forbidden}'`,
  );
}
```

**Error testing — assert that a forbidden function throws:**

```ts
import { FORBIDDEN_balanceDeltaAttribution } from '../lib/usage/cost-attribution';
let threw = false;
try { FORBIDDEN_balanceDeltaAttribution(); } catch { threw = true; }
assert(threw, '[5.1] FORBIDDEN_balanceDeltaAttribution throws');
```

**Determinism testing — invoke N times, compare:**

```ts
const outputs = new Set<string>();
for (let i = 0; i < 100; i++) {
  outputs.add(JSON.stringify(pickTopConceptsByQuality(fixtures)));
}
assert(outputs.size === 1, '[3.1] pickTopConceptsByQuality is deterministic over 100 runs');
```

**Schema-shape testing — directly inspect const arrays / objects:**

```ts
import { SCENE_STATUSES } from '../lib/scenes/scene-status';
assert(
  SCENE_STATUSES.includes('failed'),
  "[1.1] 'failed' is in SCENE_STATUSES",
);
```

**Master-runner spawning — Node `spawnSync` with `'inherit'` stdio:**

```ts
import { spawnSync } from 'node:child_process';
const proc = spawnSync('npx', ['tsx', path.join(SCRIPTS_DIR, script)], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: process.env,
});
const ok = proc.status === 0;
```

---

## What's Explicitly NOT Tested

- **Full render pipeline end-to-end** (no automated wall-time test for the 6-scene → final MP4 flow). The worker `test-render.ts` enqueues a job; manual observation in Vercel/Railway logs verifies the rest.
- **UI behavior** (no React Testing Library, no Playwright). UI changes are gated on manual browser UAT.
- **Live LLM output quality** (no auto-grading of script output). Quality is a human judgment, captured in CLAUDE.md prose.
- **DB migration backwards compatibility under concurrent load.** Migrations are applied via `prisma migrate dev` in dev and via the one-off `apply-v13-*-migration-prod.ts` scripts in prod, with manual verification.

---

*Testing analysis: 2026-05-03*
