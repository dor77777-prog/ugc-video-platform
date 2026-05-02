# tachles — Milestone History

Heavy-summary log of every shipped version (V12 → V27.11.PR6). Each entry: **Goal** · **Shipped** · **Failed/Regressed** (when applicable). Failed/regressed decisions are deliberately emphasized — future milestones should consult this file before re-attempting a path that already lost a head-to-head.

The full per-commit changelog lives in `.claude/CLAUDE.md` and `STATUS.md`. This file is the executive summary.

---

## Conventions

- Versions in chronological order (oldest first), grouped by major line.
- Each version line is 2–3 lines max.
- **Failed/Regressed** marks the most load-bearing entries — these are the ones future-you needs to know about.
- "→" between versions = direct revert / supersedure relationship.

---

## V12 — Storage migration to R2 + provider observability (Apr 27–30, 2026)

**V12** — Initial production deployment baseline. Vercel `bom1` + Supabase `ap-south-1` + Railway worker + Redis Cloud + R2 storage + Supabase Auth + 4-tier credit/plan system + 9 Prisma models + URL→MP4 pipeline end-to-end.

**V12.1** — Goal: stop reading `public/` directly in API routes (Vercel excludes it from the function bundle). Shipped: `lib/storage/read-public-asset.ts` helper (try-disk → fallback-HTTP). Patched 5 disk-only readers (scene-images, motion-analysis, face-gate, image-qa, product-visual-analysis).

**V12.2** — Goal: move static catalogs (avatars + music + voice samples) off disk. Shipped: bulk uploader `apps/web/scripts/upload-static-assets-to-r2.ts`, R2 URLs hard-coded into catalog files.

**V12.3** — Goal: eliminate the last 4 disk-only readers. Shipped: kling.imageToPayload, kling.downloadAsBuffer, pixverse.resolveToBytes, mux-audio.readUrlAsBuffer all now go through R2/HTTP. Zero `process.cwd()/public/` references outside the storage adapter.

**V12.4** — Goal: voice-sample preview was 403'ing on R2 OPTIONS preflight (admin-scope token needed to set CORS). Shipped: `voice-presets.ts sampleUrl` reverted to `/api/voice/sample/<id>` (same-origin). Lookup chain: R2 → local disk → ElevenLabs synth → cache back to BOTH.

**V12.5** — Goal: live provider balance visibility. Shipped: `lib/providers/balance.ts` queries Kling / PixVerse / ElevenLabs / OpenAI in parallel; surfaced at top of `/admin/costs` with 60s revalidation. Soft-fails per-provider.

**V12.6** — Goal: don't blank-out a provider card on a transient outage. Shipped: `ProviderFallbackCard` falls back to local `ApiCall` aggregates (30d spend + call count) when the live fetch fails; keeps the error in a `<details>` block.

**V12.7** — Goal: OpenAI `/v1/organization/costs` parser kept crashing. Shipped: coerced `amount.value` with `Number(...)`; new `OPENAI_ADMIN_API_KEY` env (sk-admin-…) preferred over `OPENAI_API_KEY` for Administration API reads (regular keys are model-only). **Lesson:** OpenAI's API key scope split between admin reads and model invocation is permanent — keep both vars in env.

---

## V13 — Pipeline robustness sweep (Apr 30, 2026)

**V13 PR1** — Goal: post-gen QA + auto-regen loop was the wrong layer. Shipped: deleted `apps/web/lib/image-qa/`, the QA branch in `lib/scenes/generate-impl.ts`, `buildCorrectiveBrief`, and the `IMAGE_QA_ENABLED` / `IMAGE_QA_MAX_RETRIES` / `OPENAI_IMAGE_QA_MODEL` env vars. Quality strategy moved upstream to creative planning. **Lesson (load-bearing):** post-generation QA was a wrong-layer bandaid. Quality belongs at the brief-builder + system-prompt layer, not at a vision-LLM second pass.

**V13 PR2** — Goal: strengthen the deterministic Image Brief. Shipped (4 commits): `israeli-realism-rules.ts` extraction, `scene-rules.ts` (hands-physics + mirror-safety detectors), PRODUCT REFERENCE LOCK paragraph in `scene-image-prompts.ts`, contact-proof rule answering all 5 demo questions for product_demo / hands_only / closeup_product.

**V13 PR3** — Goal: typed motion plan instead of free-form Kling positive/negative. Shipped: `animation-plan-builder.ts` emits `AnimationPlan` (motionSubject + cameraMotion enum + objectMotion / humanMotion / forbiddenMotion[] + speakingExpected); `buildKlingPromptFromPlan` renders the plan into Omni's `{positive, negative}` shape.

**V13 PR4** — Goal: structured logs across image-gen and clip-gen. Shipped: stage-tagged logger (`logStage(stage, scope)`, `.span()`, LOG_LEVEL filter, sensitive-data masking). Wired into image-brief / image-gen / voice / motion-analysis / kling / face-gate / pixverse — zero `console.*` left in clip-impl active path.

**V13 PR5** — Goal: turn raw provider errors into Hebrew user messages. Shipped: `scene-error-messages.ts` covering every pipeline stage with `getSceneErrorMessage(code, raw)` returning `{hebrew, retryHint?, needsUserEdit?, isFallback}`.

**V13 PR6** — Goal: persist scene state machine + log buffer. Shipped: migration `v13_scene_state_log` adds `Scene.status` (default 'pending'), `lastErrorCode`, `lastErrorMessage`, `generationLogJson` (all nullable additive). Canonical states + helpers in `scene-status.ts` (no Prisma enum per house style).

**V13 PR7** — Goal: pipeline writes the new fields + UX consumes them. Shipped: status transitions in generate / voice / clip impls (curated `<stage>.<reason>` lastErrorCode), `flushSceneLogBuffer` (cap 200, oldest dropped), `SceneCardStatusBadge` + `SceneErrorDetails` + `SceneLogViewer` + `WizardWarningsPanel`.

**V13 PR8** — Goal: per-scene admin debug view. Shipped: `/admin/scenes/[id]/debug` renders status badge, last error, generation log, routing flags, image brief, final prompt, motion analysis, legacy QA (banner), generation history, project intelligence.

**V13 PR9** — Goal: master test runner. Shipped: `npm test` runs the V13 verification suite via `apps/web/scripts/test-v13-all.ts` (360+ assertions across 8 PR scripts in ~5.4s).

---

## V13.1 — ffmpeg infrastructure (Apr 30, 2026)

**V13.1** — Goal: non-lipsync clips were silently shipping without audio (Vercel bundler refused to ship the ffmpeg-static binary). Shipped: cold-start download of binary from `https://github.com/eugeneware/ffmpeg-static/releases/...` to `/tmp/tachles-ffmpeg-static`, gunzipped, chmod'd, cached for warm container's lifetime (~1-3s cold-start cost). `clip-impl.ts` now refuses to persist a silent clip on mux failure (status='failed', no charge). **Failed/regressed (PRIOR ATTEMPT):** Tried single-pass `concat-filter` for the worker's final compose — Railway OOM-killed at frame ~75 (N parallel decoders + libass + amix all in RAM simultaneously). Replaced with the 3-stage pipeline (3a per-clip normalize in series → 3b concat-demuxer + `-c copy` → 3c optional overlay). **Do not re-attempt** single-pass concat-filter; the OOM is reproducible.

---

## V13.2 — `/admin/costs` accuracy + DB perf hardening (Apr 30, 2026)

**V13.2** — Goal: per-call cost attribution that's correct under concurrency. Shipped: `lib/usage/cost-attribution.ts` per-provider helpers preferring actual usage over constants; `ApiCall.estimatedCostUsd / actualCostUsd / metadata / renderJobId / sceneId` columns; `ProviderBalanceSnapshot` table for observability only; `lib/providers/balance-snapshot.ts` (60s in-process cache + per-provider soft-fail); admin endpoints under `/api/admin/costs/*` gated by `requireAdminApi()`; `/admin/costs` page split into `SummaryKpis` 20s · `InFlightCallsSection` 4s · `RecentCallsTable` 8s polled with `document.visibilityState` pause; migration `20260430120000_v13_2_costs_hardening` adds 13 composite indexes. **Failed/regressed (REJECTED PATH):** Balance-delta cost attribution (fetching live balance before/after every call) was rejected. Concurrency-unsafe (multiple in-flight calls bleed into each other), creates rate-limit pressure on /balance APIs, makes tests non-deterministic. `FORBIDDEN_balanceDeltaAttribution()` throws explicitly; verification gate in `test-v13-pr10.ts` keeps it honest. **Do not re-attempt.**

---

## V14 — Israeli realism + frame techniques + outfit lock + V6 script (Apr 30, 2026)

**V14 PR1** — Goal: Israeli realism cue library. Shipped: `israeli-realism-rules.ts` rewritten 70-line single-block negative-only emitter → 794-line library (51 atomic cues across 10 categories with paired positive/negative, 21 universal negatives, 12 environment_type baselines, 8 named scene presets matching V6 script `israeli_setting_cue` enum). AvatarProfile extended with required `archetype` + `religiousRegister`; all 25 catalog avatars backfilled.

**V14 PR2** — Goal: frame-technique snippet library targeting documented gpt-image-2 failure modes. Shipped: 5 typed deterministic snippet builders (`mirror_selfie`, `selfie_handheld`, `product_hand_hold`, `safe_reflection`, `consistency_anchor`) + new `selfie_in_mirror` value in `cameraFocus` enum + dispatch via `chooseFrameTechniqueSnippets(ctx)`.

**V14 PR3** — Goal: outfit lock + avatar byte-identity audit. Shipped: `computeLockedOutfit({...})` deterministic composer (top + bottom + footwear + accessories + hair/head, religious-gated); persisted to `Project.productData.lockedOutfit` (race-safe — deterministic). Audit confirmed `describeAvatar()` was already byte-identical across calls.

**V14 PR4** — Goal: scene variation ledger + scroll-stopper levers. Shipped: `SceneVariationLedger` class (record / countOf / unusedFromKnown / diversityScore / summary), `chooseScrollStopperIndex` returning hook (idx 0) or punchline (last) for ads ≥4 scenes, `buildScrollStopperLevers` emitting hook-flavored or punchline-flavored prompt fragments. ImageBrief gains `scrollStopperApplied / scrollStopperReason / variationDiversity`.

**V14 PR5** — Goal: V6 script system prompt with REGISTER LOCK + 4 new structured-output fields. Shipped: REGISTER LOCK section at top with concrete DO/DON'T linguistic anchors (תכל'ס / סבבה / אחותי / וואלה in DO; "אובססיבית" / "תהליך" / translated-American patterns in DON'T); 3 new const tuples (GENRES×6 / VOICE_PROFILES×8 / ISRAELI_SETTING_CUES×8 matching SCENE_PRESETS keys exactly); 4 new schema fields nullable for back-compat (`genre`, `voice_profile`, `hook_alternatives`, `israeli_setting_cue`).

**V14 PR6** — Goal: surface every V14 field in admin. Shipped: `/admin/scenes/[id]/debug` "V14 — frame techniques + scroll-stopper + outfit + genre" section + `/admin/projects/[id]/diagnostic` page with `SceneVariationLedger.fromRecords(scenes)` per script, per-field diversity grid, per-scene record table, "Low diversity" warning banner.

**V14 PR7** — Goal: master test runner + docs. Shipped: `npm test` chains `test:v13` + `test:v14` (770+ assertions); reference docs at `docs/v14/{ISRAELI_VISUAL_REALISM,FRAME_PROMPT_TECHNIQUES,HEBREW_SCRIPT_CREATIVE_RULES}.md`.

---

## V25 — Script-gen migrated OpenAI → Gemini 3 Pro

**V25** — Goal: cheaper script-gen (Gemini's better prefix-cache for shared system block + lower per-token rates). Shipped: `gemini-client.ts` wraps `@google/generative-ai`'s `geminiStructuredCall<T>()` (responseMimeType: 'application/json' + responseSchema; recursively strips `additionalProperties` which Gemini rejects); `priceGeminiText` + `attributeGeminiTextCost`; balance card on `/admin/costs` (always falls back to local `ApiCall` aggregates because Generative Language API doesn't expose per-key billing); `LLM_SCRIPT_PROVIDER` env flag. **Failed/regressed (eventually, see V26.8):** Live use of Gemini for script-gen produced lower visual-prose quality vs the OpenAI baseline. The migration to Gemini-as-default was reverted in V26.8. **Lesson:** Cheaper provider with comparable benchmarks ≠ comparable Hebrew creative output. Always validate on live Hebrew samples before flipping the default.

---

## V26 — Script-gen + caption sync hardening (May 2026)

**V26.1** — Goal: fix Gemini SDK calls. Shipped: corrected model id `gemini-3-pro` → `gemini-3-pro-preview`; dropped temperature override.

**V26.2** — Goal: SDK migration. Shipped: `@google/generative-ai` (legacy) → `@google/genai` (new); `outputTokens` now sums candidates + thoughts.

**V26.3, V26.4, V26.5, V26.6** — Goal: Gemini cost-cutting iterations (Flash:minimal → Flash:low → Pro:low). **Failed/regressed:** All four reverted in V26.8 after live use showed lower visual-prose quality vs the OpenAI baseline. **Do not re-attempt** Gemini Flash/Pro low-effort modes for script-gen without a controlled head-to-head vs OpenAI on live Hebrew samples.

**V26.4 (separate)** — Goal: stop the artificial Grok-vs-lipsync rule. Shipped: removed the block — PixVerse runs on Grok output identically to Kling.

**V26.5 (separate)** — Goal: fix xAI 422 errors. Shipped: wrapped `image` as `{ url: ... }` struct.

**V26.7** — Goal: kill the UI "scripts not appearing" delay. Shipped: replaced blind `setInterval(router.refresh, 2500)` with count-driven polling against `/api/projects/[id]/scripts/list`; refresh only when count grows.

**V26.8 → reverts V25/V26.3-V26.6** — Goal: undo the Gemini-as-default decision. Shipped: script-gen reverted Gemini → OpenAI `gpt-5.4-mini` behind `LLM_SCRIPT_PROVIDER` env flag (default `openai`); new `openai-script-client.ts` mirrors `gemini-client.ts`; Gemini path preserved for experiments. **Lesson (anchor for future-you):** This is the V25→V26.8 revert — if a future milestone proposes "let's move scripts back to Gemini for cost", the burden of proof is a side-by-side Hebrew quality comparison on live ads, not benchmark scores.

**V26.9** — Goal: better OpenAI prefix-cache utilization. Shipped: migrated from Chat Completions to Responses API (`client.responses.create` + top-level `instructions` + `text.format.json_schema` + `output_text` helper + `usage.input_tokens` / `usage.output_tokens`). 40-80% better prefix-cache hit rate on the 6-parallel batch sharing `SCRIPT_SYSTEM_PROMPT`. Live: 4.9s wall, $0.0022/call.

**V26.10** — Goal: per-scene clip regen actually parallel. Shipped: pre-V26.10 `<form action={ServerAction}>` caused Next.js to serialize Server Actions per route → multiple scene clicks queued. Switched to direct `fetch('/api/scenes/[id]/clip')` (same path the batch button already used). New `/api/scenes/[id]/lipsync-only` route handler.

**V26.11** — Goal: transparent per-call retry without polluting business logic. Shipped: `apps/web/lib/utils/retry.ts → withRetry()` with `maxAttempts=2` + `earlyFailWindowMs=15000`. Default predicate retries on network errors + HTTP 408/429/500/502/503/504. Wrapped 9 provider clients (OpenAI Responses, Gemini, gpt-image-2, Kling i2v submit, Grok i2v submit, motion-analysis, face-gate, ElevenLabs TTS, PixVerse lipsync submit). Polling loops NOT wrapped — each tick is the implicit retry.

**V26.12 → V26.13** — Goal: caption sync drift. V26.12 used `max(clipDuration, voiceDuration)` for cumulative offset + 100ms `CAPTION_LEAD_MS`. V26.13 made it bulletproof: `probeDurationSeconds(filePath)` ffprobe helper after stage 3a normalize → cumulative `sum(probedDurationsMs)` becomes the global caption offset. Eliminates gradual drift from PixVerse audio stretching, mux frame-rounding, fps=30 cfr re-timing.

**V26 (Per-scene clip-engine choice)** — Goal: diversification of the i2v provider. Shipped: per-scene `Scene.clipProvider` toggle (Kling vs xAI Grok Imagine); lipsync scenes pinned to Kling (PixVerse face-gate is wired only against Kling output); `<ClipProviderToggle>` UI on `<SceneClipCard>` with disabled-with-tooltip when scene requires lipsync. Tachles credits unchanged; provider-cost differences fall on us.

**V26.SEC — Security audit (5 findings, all fixed)** — Goal: comprehensive security review. Shipped: **CRITICAL** dead `/api/render/start` route accepted `userId` from body with no auth → deleted. **HIGH** `/api/render/[jobId]/{status,events}` had no ownership check → both now resolve `getOrCreateAppUser()` and enforce `job.userId === dbUser.id`. **MEDIUM** `/api/demo/start` was unauthenticated public DB write + Redis enqueue → added `getOrCreateAppUser()` gate. **MEDIUM** `safeFetch` `redirect: 'follow'` allowed SSRF redirect-chain bypass (public URL → 302 → 127.0.0.1 / 169.254.169.254 AWS metadata) → `redirect: 'manual'` with explicit per-hop hostname revalidation, capped at 5 hops. Audit confirmed: zero `$queryRaw`/`$executeRaw`, zero `spawn`/`exec` with user input, zero hardcoded secrets, all admin pages behind `(admin)/layout.tsx → requireAdmin()`, all `/api/admin/*` have `requireAdminApi()`, all paid Server Actions verify ownership via `userId: dbUser.id` filters.

---

## V27.0 — Tri-Modal Liquid design language

**V27.0 Wave 1** — Goal: visual-language redesign foundation. Shipped: 3 coordinated modes (Vercel-mode = chrome/admin/settings/sidebar/library; Krea-mode = wizard step 4-7 + scene cards + video reveal; Granola-mode = modals/sheets/popovers/AI-active states); declared via `data-density="dense|default|comfortable|showcase"`; **color and motion are state, not decoration** (`--ai` 78° lime only inside `[data-ai-active]` containers; `--success` 150° green only on completion); 6-step elevation ladder at constant 228° 6%; tier-surface system replaces ad-hoc glass; 12 named motion patterns; `<Button intent="default|action|hero">` semantic CTA hierarchy; **fonts**: IBM Plex Sans → Geist Sans (tabular numbers fix /admin/costs alignment), JetBrains Mono → Geist Mono. Sweep complete: zero legacy class references in source.

**V27.0 Wave 2** — Goal: extend Wave 1 to non-wizard surfaces. Shipped: Topbar, Sidebar, AdminSidebar (removed inverted bg-foreground "loud" admin chrome), DashboardAurora, Library (comfortable Krea-mode showcase), Pricing (popular = tier-elevated + edge-gradient-primary; current = border-success), Settings (dense Vercel-mode + font-mono fields), Admin overview (kicker-muted heading + KpiCard rewired). `(admin)/layout.tsx` declares `data-density="dense"` so all admin sub-routes inherit Vercel-mode by default.

**V27.2 Wave 3 partial** — Goal: View Transitions API CSS infrastructure. Shipped: `view-transition-name: --vt-wizard-progress-strip` on WizardProgressStrip wrapper. **Failed/regressed (corrected later):** Deferred the full `unstable_ViewTransition` React 19 wrapper "until React 19's API stabilizes". This deferral was wrong-footed — V27.4 corrected it.

**V27.3 Wave 3** — Goal: TransitionLink wizard hops. Shipped: scenes → voices, voices → videos wrapped in `document.startViewTransition`. Plus persistent WizardProgressStrip + Topbar credits-meter.

**V27.4 Wave 3 final** — Goal: canonical /scripts → /scenes hop with View Transition. Shipped: form-action returns `{ok, redirectTo}` instead of calling `redirect()`; client component wraps `router.push` in `document.startViewTransition`. All 4 wizard hops now View-Transition-wrapped. **Lesson (load-bearing for future me):** browser-native APIs (View Transitions, Container Queries, Anchor Positioning, View-Timeline) are stable Web Platform features. They do NOT depend on React-stable wrappers. V27.2 conflated `document.startViewTransition` with React 19's `unstable_ViewTransition` — different APIs entirely. Don't defer browser-native API adoption for hypothetical React churn.

---

## V27.10 — Script-gen iteration (defaults churn)

**V27.10.2** — Goal: switch script-gen default to Anthropic Haiku 4.5 (faster + cheaper than Sonnet). **Failed/regressed:** Haiku 4.5 returned `400 invalid_request_error: This model does not support the effort parameter`. The wrapper sends `output_config.effort` + `thinking: { type: 'disabled' }`; Sonnet 4.6 (and Opus 4.7) accepts it. Reverted in V27.10.6. **Do not re-attempt** Haiku 4.5 as script-gen default without first patching the wrapper to drop `output_config.effort` for Haiku.

**V27.10.6** — Goal: revert V27.10.2. Shipped: script-gen default flipped Haiku 4.5 → Sonnet 4.6. Reproduced the Haiku failure via `/api/admin/diag/anthropic`. Live measurement after revert: simple ping <1s; full-shape script-gen call (system+schema+effort:low+thinking:disabled+max_tokens 8192) succeeds.

**V27.10.18** — Goal: higher script-gen quality (per user request). Shipped: OpenAI default flipped `gpt-5.4-mini` → `gpt-5.4` (full). Cost: ~$0.30/batch instead of ~$0.10. **Failed/regressed (eventually, see V27.11.PR2):** The full model didn't deliver the expected quality lift on the bloated V27 prompt. V27.11.PR2 reverted to `gpt-5.4-mini` after the audit identified prompt entropy + uncached PI as the real bottleneck — model size was fixing the wrong problem. **Lesson:** Larger model on a bloated prompt rarely beats a smaller model on a tight prompt. Audit the prompt before ratcheting up the model.

**V27.10.20** — Goal: lipsync silently skipping on every call. Shipped: root cause was `OPENAI_FACE_GATE_MODEL=gpt-4o-mini` env override + face-gate.ts sending `reasoning.effort: 'low'` (gpt-5/o-only param) → HTTP 400 → catch fired → lipsync silently skipped. Fix: `isOpenAiReasoningModel(model)` helper gates the param across face-gate / motion-analysis / product-visual-analysis. Also: face-gate verdict + `lipSyncStatus` + `lipSyncErrorMessage` now persist to Scene (dead columns since V7); admin debug surfaces "מצב Lipsync" section with yellow alert when status='skipped_face_gate_error'. clip-impl motion-analysis fallback synced `'gpt-4o-mini'` → `'gpt-5.4-mini'` to match motion-analysis.ts (5x cost-attribution drift fixed).

---

## V27.11 — Script engine quality push (PR1–PR6) — current/latest

> **Source of truth for this series:** `.planning/debug/v27-script-quality-audit.md` (diagnose-only audit identifying 5 bottlenecks + the collage failure mode). PR1–PR4 + PR6 close bottlenecks #1, #2, #3, #4 + the collage problem at every layer (image prompt + schema + system prompt + brief-builder bridge).

**V27.11.PR1** — Goal: stop the bleeding on multi-panel / collage / split-screen image outputs. Shipped: universal `SINGLE_FRAME_RULE` constant in `scene-image-prompts.ts` (rendered in BOTH avatarPresent branches, anchored after ASPECT_OPENER and before IDENTITY/PRODUCT locks); `detectComparisonGuard()` bridge in `image-brief-builder.ts` (15 word-boundary-anchored phrase patterns + scene-type detection); when fired, appends `COMPARISON_GUARD_RULE_BLOCK` + 13 collage-specific negatives to mustAvoid + negativeConstraints. Verification: 89 assertions across 10 sections.

**V27.11.PR2** — Goal: script cost/latency quick wins (audit bottlenecks #1 + #2 + #4). Shipped: (1) Product Intelligence built ONCE per project via `buildSystemInstructionWithIntelligence(intel)` and passed identically to all 6 framework calls as `systemInstruction` (byte-identical, 10-call deterministic check) — providers' prefix cache writes once, reads ×5; (2) 30-item ✅ self-checklist compressed to a single read-aloud sentence (prompt: 661 → 616 lines, ~40K → 37.3K chars, ~750 tokens off cached prefix); (3) OpenAI default flipped `gpt-5.4` → `gpt-5.4-mini` (~3x cheaper). Two new env knobs: `OPENAI_SCRIPT_MODEL` + `SCRIPT_QUALITY_MODE=balanced|premium`. **Reverts V27.10.18.** Verification: 29 assertions.

**V27.11.PR3** — Goal: schema trim per audit bottleneck #3. Shipped: 4 admin/debug-only fields dropped from `SCENE_ITEM_SCHEMA` (`israeli_environment_required`, `local_realism_notes`, `why_this_scene_exists`, `narrative_link_from_previous`); required field count 24 → 20 per scene. CONTINUITY section added to `script-system-prompt.ts` — cohesion moves INTO the spoken text via lexical bridges, rhetorical questions, time/place markers (the viewer hears the cohesion; a meta-string they never hear was the wrong layer). Verification: 73 assertions across 10 sections.

**V27.11.PR4** — Goal: durable anti-collage at the schema + system-prompt layer (closing the door PR1 patched at the image-prompt layer). Shipped: `before_after` removed from `SCENE_GENERATION_TYPES` (12 → 11 values); `comparison_split` renamed to `comparison_focus` in `FRAME_STRATEGIES` (single-state composition: alternative is desaturated/out-of-focus/in-the-background, never a second panel). System prompt updated end-to-end. The before/after creative beat is now rendered as TWO consecutive scenes (state 1 + state 2). Backwards-compat: zero DB column changes; legacy `Script.rawJson` blobs parse fine. Verification: 48 assertions across 10 sections. **Lesson:** When you patch a failure mode at the bottom layer (image prompt), close the door at the top layer (schema + system prompt) too. PR1 was stop-the-bleeding; PR4 is the durable fix.

**V27.11.PR5** — Goal: concept-first script engine (cost cut via lighter phase 1). Shipped: 2-phase generation behind `SCRIPT_ENGINE_MODE=legacy_full_batch|concept_first` (default = legacy). Phase 1 = ONE LLM call returning 6 lightweight concept cards (~1.5K output tokens total). Phase 2 = top N (default 3, `SCRIPT_CONCEPT_TOP_N` env-tunable [1,6]) expanded in parallel via existing `SINGLE_SCRIPT_JSON_SCHEMA`. ~45% fewer output tokens per batch (~$0.07 saved on `gpt-5.4-mini`). **Failed/regressed (UX, not engine):** The backend-only auto-pick of top-3-by-quality left the OTHER 3 concept cards forever-spinning in the UI — a broken end-user experience. The concept engine itself is sound; the auto-pick UX was wrong. PR6 superseded with an interactive picker. **Lesson:** A backend optimization that changes how many artifacts the user sees needs a paired UX update — never assume the existing UI handles "fewer results than expected" gracefully.

**V27.11.PR6 → supersedes PR5's UX** — Goal: interactive concept-picker UX. Shipped: `SCRIPT_ENGINE_MODE=legacy_full_batch|concept_interactive` (default = legacy, zero behavior change; PR5's `concept_first` value silently re-mapped to legacy — broken UX retired). Flow: user clicks "צור 6 כיוונים קריאייטיביים" → 6 lightweight concept cards (~10s) → reviews / refreshes weak ones / picks 1-3 → only selected expand to full scripts (~25s) → user picks 1 → continues to scenes. **12-field card schema** with `concept_id` (UUID) / `slot_index` (stable 0..5) / `regenerationCount` / `regeneratedFromConceptId`. **4 server actions** in `concept-actions.ts`: generate / regenerate-selected (kept slots byte-identical) / regenerate-all (explicit) / expand-picked (1-3 only, per-failure refund). **Persistence** via `Project.productData.pendingConcepts` (no DB migration). **UI** — `ConceptCardView` + `ConceptFlow` state machine, RTL Hebrew, sticky action bar with credit cost, auto-preselect top 3. **Selection rules**: 0 blocked, 1-3 allowed, 4+ blocked. **Cost**: concept gen + regen are free of user credits (provider cost still logged via ApiCall); expansion charges `script_batch × N selected` with per-failure refund. Verification: 102 assertions across 16 user-named test cases. PR1 (89) + PR2 (29) + PR3 (73) + PR4 (48) regression-clean. **Branch**: `v27-11-concept-interactive-ux` — NOT merged to main yet, awaiting manual browser UAT. Operator opt-in (after UAT): `SCRIPT_ENGINE_MODE=concept_interactive`. Rollback: unset or `=legacy_full_batch`.

---

## Cross-cutting reverts to remember

- **V25 → V26.8**: Gemini 3 Pro as script-gen default → reverted to OpenAI `gpt-5.4-mini`. Cause: lower visual-prose quality on live Hebrew samples (Gemini is preserved as experiment path behind `LLM_SCRIPT_PROVIDER=gemini`).
- **V26.3-V26.6 → V26.8**: Gemini cost-cutting iterations (Flash:minimal → Flash:low → Pro:low) → reverted as part of the V26.8 OpenAI-default restore.
- **V27.10.2 → V27.10.6**: Anthropic Haiku 4.5 as script-gen default → reverted to Sonnet 4.6. Cause: Haiku 4.5 doesn't accept the `output_config.effort` param the wrapper sends.
- **V27.10.18 → V27.11.PR2**: OpenAI `gpt-5.4` (full) as default → reverted to `gpt-5.4-mini`. Cause: prompt entropy + uncached PI was the real bottleneck, not model size.
- **V27.11.PR5 → V27.11.PR6**: Backend-only auto-pick of top-3 concepts (3 cards forever-spinning in the UI) → replaced with interactive concept-picker.
- **V13 PR1 (no revert — corrective deletion)**: Image QA auto-regen loop removed from active path. Quality strategy moved upstream to creative planning. Was the wrong layer — do not re-add a post-generation vision-LLM second pass without a fundamentally new architecture.
- **V13.1 (prior single-pass concat-filter — reverted)**: Single-pass `concat-filter` for worker compose → reverted to 3-stage low-mem pipeline. Cause: Railway OOM-kill at frame ~75. Do not re-attempt.
- **V13.2 (prior balance-delta cost attribution — explicitly forbidden)**: Balance-delta cost attribution → forbidden by `FORBIDDEN_balanceDeltaAttribution()` + verification gate. Cause: concurrency-unsafe, rate-limit pressure on /balance APIs, non-deterministic tests.

---

*Last updated: 2026-05-03 — bootstrapped from CLAUDE.md (root + .claude/), README.md, STATUS.md, .planning/codebase/, .planning/debug/v27-script-quality-audit.md via `/gsd-ingest-docs`.*
