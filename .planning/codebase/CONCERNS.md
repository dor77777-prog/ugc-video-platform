# Codebase Concerns

**Analysis Date:** 2026-05-03

This document inventories load-bearing technical debt, fragile-by-design areas, and known incidents that have reshaped the codebase. It is reference material for `/gsd-plan-phase` and `/gsd-execute-phase` — every section names actual files, the failure mode, and the fix approach so future work doesn't regress prior fixes.

The repository encodes most of these constraints in `/Users/dorperetz/Downloads/CLAUDE.md` (root project instructions) and `.claude/CLAUDE.md` (version log). Many concerns ARE the constraint — re-introducing the failure has already been done at least once and produced a postmortem.

---

## Region / region-pinning

**Vercel `bom1` ↔ Supabase `ap-south-1` coupling.**

- `vercel.json` (line 6) hard-pins `regions: ["bom1"]` (Mumbai). Supabase pooler runs in `aws-1-ap-south-1` (Mumbai). Co-location is load-bearing — every Prisma query out of region adds ~250ms round-trip and pages become 2-5s of pure network wait.
- `apps/web/lib/db.ts` (lines 6, 22-28) bakes the assumption in via the `[SLOW QUERY]` threshold of 500ms — tuned for in-region round-trips. Any deploy that drifts the function out of `bom1` while leaving the threshold unchanged will silently hide the regression: every query will look slow but no single one trips the alarm enough to investigate.
- **Fix approach:** Never change `vercel.json regions` without first migrating Supabase. If region must change, pair the migration with a `DATABASE_URL` flip and verify with `curl -sI https://tachles-lac.vercel.app/api/health | grep x-vercel-id` (middle segment must match the new region).
- **Risk if regressed:** Wizard pages 2-5s slower per render, BullMQ worker (Railway) becomes the only fast-path consumer of Supabase, intermittent timeouts on long Server Actions that chain queries.

**Reference:** `vercel.json:6`, `apps/web/lib/db.ts:6`, project instructions "Region pinning" + "Do not move Vercel functions out of `bom1`…".

---

## Storage

**R2 migration scars — V12.1 → V12.4.** The `public/` folder is a dev convenience only; production reads everything from R2 CDN. Disk-readers are a recurring source of regression because they "just work" in dev and silently 404 in prod.

- `apps/web/lib/storage/read-public-asset.ts` is the ONLY sanctioned helper for reading app-relative `/avatars/...`, `/voice-samples/...`, `/music/...`, `/uploads/...` URLs. It tries disk → falls back to HTTP fetch via `PUBLIC_BASE_URL`. Lines 53-82 implement the disk-then-HTTP fallback.
- **9 files were patched** (V12.1 + V12.3) that previously did `fs.readFile(process.cwd() + '/public/...')` directly. Future PRs must NEVER write code in this shape outside `lib/storage/local.ts` and `lib/storage/read-public-asset.ts` itself. On Vercel that path resolves to `/var/task/apps/web/public/...` which doesn't exist — `apps/web/next.config.mjs` lines 72-74 explicitly exclude `public/**` from `outputFileTracingExcludes`.
- **Voice-sample CORS workaround (V12.4).** R2 returns 403 on OPTIONS preflight without an admin-scope token. `apps/web/lib/voice/voice-presets.ts` uses `sampleUrl: /api/voice/sample/<id>` (same-origin) instead of direct R2 URLs. The API route does R2 → local disk → ElevenLabs synth lookup chain. Helper for an admin token: `apps/web/scripts/set-r2-cors.ts`.
- **Static catalog hard-coded URLs.** `https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev` is intentionally hard-coded in `apps/web/lib/avatars/catalog.ts`, `packages/shared/src/music/music-library.ts`, `apps/web/lib/voice/voice-presets.ts`. CDN endpoint, not a secret, but means CDN swap requires touching all three.

**ffmpeg cold-start download (V13.1).** Vercel's bundler refuses to ship the `ffmpeg-static` binary in the function despite `serverExternalPackages` + `outputFileTracingIncludes` directives in `apps/web/next.config.mjs:42, 54-65`.

- `apps/web/lib/scenes/mux-audio.ts:50-72` tries 4 local paths first (`/var/task/...`, `process.cwd()/node_modules/...`, monorepo root, `/tmp/tachles-ffmpeg-static`).
- Lines 92-117 fall back to downloading `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-${arch}.gz`, gunzipping, chmod +x — caches in `/tmp` for warm container lifetime. ~1-3s cost on cold start, ~46MB compressed.
- The release tag `b6.1.1` is hard-coded (line 78) and must match the version in `node_modules/ffmpeg-static/package.json` `binary-release-tag` for checksum compatibility. Bumping `ffmpeg-static` requires updating both.
- **`probeDurationSeconds`** uses pure-JS `music-metadata` (lines 244-258), not `ffprobe-static` — the bin/ tree is 335MB across all platforms and would blow Vercel's 250MB function size limit.

**Storage allowlist for new code:**
- New static assets MUST also be uploaded to R2 via `apps/web/scripts/upload-static-assets-to-r2.ts`. Disk-only is a dev shortcut that 404s in prod.
- New finals/MP4s/voice MP3s MUST go through `getStorage()` from `apps/web/lib/storage/index.ts`. Direct writes to `apps/web/public/uploads/` fail in prod (Vercel filesystem is read-only between requests).
- New API routes that read public assets MUST use `readPublicAsset()` / `readPublicAssetAsDataUrl()` — not raw `fs.readFile`.

**Files:** `apps/web/lib/storage/index.ts`, `apps/web/lib/storage/local.ts`, `apps/web/lib/storage/r2.ts`, `apps/web/lib/storage/read-public-asset.ts`, `apps/web/lib/scenes/mux-audio.ts`, `apps/web/next.config.mjs:42-74`.

---

## Provider integration risks

**Lipsync silent-skip (V27.10.20) — re-introducible bug.**

- `apps/web/lib/animation/face-gate.ts:140-153` sends `reasoning.effort` ONLY when `isOpenAiReasoningModel(model)` returns true. Pre-V27.10.20, this param was always sent. With `OPENAI_FACE_GATE_MODEL=gpt-4o-mini` set in production, the API returned HTTP 400 ("model does not support effort"), the outer `try/catch` ate the error, and PixVerse was silently skipped on every clip.
- The same gate exists in `apps/web/lib/animation/motion-analysis.ts:296` and `apps/web/lib/product-intelligence/visual-analysis.ts` — all three vision callers consume `isOpenAiReasoningModel()` from `apps/web/lib/llm/openai-models.ts`.
- **Risk if regressed:** Same silent skip — videos render with no lipsync, no UI hint, costs accrue normally. Visibility now lives in `Scene.lipSyncStatus` / `Scene.lipSyncErrorMessage` (persisted on every face-gate run). Admin debug surfaces a "מצב Lipsync" yellow alert when status=`skipped_face_gate_error`.
- **Fix approach when adding new vision models:** extend `isOpenAiReasoningModel()` first, then add the model to the env override.

**Kling ↔ Grok divergence on lipsync.**

- `apps/web/lib/scenes/clip-impl.ts:27` imports `grokImagineProvider`. The pre-flight read at clip start reads `Scene.clipProvider`: `'grok'` opt-in routes through xAI; anything else stays on Kling.
- **Lipsync scenes are pinned to Kling.** PixVerse face-gate is wired only against Kling output. A `'grok'` request on a `requiresLipSync=true` scene logs a fallback and continues with Kling. UI: `<ClipProviderToggle>` Hebrew tooltip disables the Grok button on lipsync scenes.
- Grok's video API does not document reference frames or native negative_prompt — `apps/web/lib/animation/grok-imagine.ts` folds negatives into the main prompt as "AVOID: …".
- **Risk:** Anyone wiring a new clip provider must ensure it also threads through the face-gate decision OR is correctly disabled for lipsync. Provider-specific cost-attribution is mandatory (see Costs section).

**Retry behavior (`apps/web/lib/utils/retry.ts`).**

- `withRetry()` defaults: `maxAttempts=2`, `earlyFailWindowMs=15_000`, `backoffMs=800`. Retries only when the failed attempt completed within 15s AND `shouldRetry(err)` returns true.
- Default predicate (`isTransientByDefault`) retries on: `ECONNRESET / ETIMEDOUT / ECONNREFUSED / ENOTFOUND / EAI_AGAIN / socket hang up / network error / fetch failed / AbortError / undici / connect timeout / reset by peer / temporarily unavailable` plus HTTP 408/429/500/502/503/504 (matched both via `err.httpStatus`/`err.status` and string-matched 3-digit number).
- **Wrapped (V26.11):** OpenAI Responses (`openai-script-client.ts:186`), Gemini (`gemini-client.ts:189`), Anthropic (`anthropic-script-client.ts:222`), gpt-image-2 (`scene-images.ts:175,184`), Kling i2v submit, Grok i2v submit (`grok-imagine.ts:205`), motion-analysis (`motion-analysis.ts:296`), face-gate (`face-gate.ts:169`), ElevenLabs TTS, PixVerse lipsync submit (`pixverse.ts:269`).
- **NOT wrapped: polling loops.** Each poll tick is the implicit retry. Wrapping a polling loop in `withRetry` would amplify latency without adding value and could mask provider-side timeouts.
- **Risk:** New provider wrappers that call submit + poll must wrap ONLY the submit. Adding `withRetry` around a polling loop is a known anti-pattern.

**Files:** `apps/web/lib/utils/retry.ts`, `apps/web/lib/animation/face-gate.ts:140`, `apps/web/lib/animation/motion-analysis.ts`, `apps/web/lib/animation/grok-imagine.ts`, `apps/web/lib/llm/openai-models.ts`, `apps/web/lib/scenes/clip-impl.ts:1123-1180`.

---

## Costs / billing

**Two-phase `ApiCall` logging.** Insert row with `status: "in_progress"` at start, update to `"success"/"failed"` on finish. `apps/web/lib/usage/log.ts` exposes `recordApiCallStart` + `recordApiCallComplete`. Never log only on success — orphan in-progress rows are how `/admin/costs` surfaces stuck calls.

- Schema enforces this in `prisma/schema.prisma:171-174` (`status` String column with default `"success"` for legacy back-compat, `completedAt` nullable while in-progress).
- 13 composite indexes on `ApiCall` (lines 194-206) — the recent-calls API has filters across `provider`, `operation`, `status`, time windows, `userId`, `projectId`, `renderJobId`, `sceneId`.
- **Risk if a pipeline forgets phase 2:** Row stays `in_progress` forever, billing aggregates miss it, admin in-flight panel shows ghost rows.

**`attribute<Provider>Cost` pattern (V13.2).** Single source of truth for per-call USD attribution.

- `apps/web/lib/usage/cost-attribution.ts` (~376 lines) — one helper per provider: `attributeOpenAiTextCost`, `attributeOpenAiImageCost`, `attributeAnthropicTextCost`, `attributeGeminiTextCost`, `attributeElevenLabsTtsCost`, `attributeKlingI2vCost`, `attributeGrokVideoCost`, `attributePixVerseLipSyncCost`, `attributePixVerseUploadCost`, `attributeLocalComposeCost`.
- Three rules in order: (1) provider-reported usage → priced via `lib/usage/pricing.ts`. (2) configured estimate constant from `lib/pricing/provider-costs.ts`. (3) NEVER balance-deltas.
- `costUsd` mirrors `actualCostUsd ?? estimatedCostUsd`. Both nullable for back-compat with rows pre-V13.2.

**Ban on balance-delta cost attribution.** `apps/web/lib/usage/cost-attribution.ts:370-375`:

```typescript
export function FORBIDDEN_balanceDeltaAttribution(): never {
  throw new Error(
    'V13.2 invariant: per-call cost must NEVER be derived from provider balance deltas. ...'
  );
}
```

- Verified by `apps/web/scripts/test-v13-pr10.ts:212` — the function MUST throw on call. Removing this throw breaks test verification.
- **Why forbidden:** unsafe under concurrency (multiple in-flight calls bleed deltas into each other), creates rate-limit pressure on provider /balance APIs, makes tests non-deterministic.
- **Risk:** Anyone tempted by "fetch balance before; fetch balance after; subtract" must instead use the existing `attribute*Cost` helpers. Provider live balances are observability + reconciliation only.

**Provider balance card fallback chain (`/admin/costs`).**

- `apps/web/lib/providers/balance.ts` queries Kling `/account/costs`, PixVerse `/openapi/v2/account/balance`, ElevenLabs `/v1/user/subscription`, OpenAI `/v1/organization/costs`, Gemini (always falls back — Generative Language API doesn't expose per-key billing), Grok/xAI (always falls back — same reason).
- 60s in-process cache + per-provider soft-fail in `apps/web/lib/providers/balance-snapshot.ts`. Soft-fail flow: provider fetcher errors → `ProviderFallbackCard` shows local 30d `ApiCall` aggregates with the error in a `<details>` block.
- **OpenAI parser bug (V12.7).** `fetchOpenAIBalance` was crashing because `/v1/organization/costs` sometimes returns `amount.value` as a string and `+` was concatenating. Coerced with `Number(...)`. Don't regress this — there's no test guarding it.
- **OpenAI admin key separation.** `OPENAI_ADMIN_API_KEY` (sk-admin-…) preferred over `OPENAI_API_KEY` for Administration API reads. Regular keys are scoped to model invocation only.
- `prisma.providerBalanceSnapshot.create*` MUST stay inside `lib/providers/balance-snapshot.ts`. Ad-hoc fetches will hammer provider APIs and trigger 429s.

**Admin /admin/costs polling cadence.** `SummaryKpis` 20s · `InFlightCallsSection` 4s · `RecentCallsTable` 8s · provider balances 60s. Each section pauses on `document.visibilityState !== 'visible'`. Server-side caches: 15s (summary), 30s (operation-stats). Don't select `ApiCall.metadata` in list views — opt-in only via `?expand=metadata`, otherwise the recent-calls payload balloons to 50-200KB.

**Files:** `apps/web/lib/usage/cost-attribution.ts`, `apps/web/lib/usage/log.ts`, `apps/web/lib/usage/pricing.ts`, `apps/web/lib/pricing/provider-costs.ts`, `apps/web/lib/providers/balance.ts`, `apps/web/lib/providers/balance-snapshot.ts`, `apps/web/scripts/test-v13-pr10.ts`.

---

## Security

**V26.SEC fixes (load-bearing).**

- **CRITICAL — deleted `/api/render/start`.** Pre-V26.SEC this dead route accepted `userId` from the request body with no auth and would create a render job for any caller. No source callers; deleted entirely. Do NOT recreate this route shape — start renders only via authenticated flows that bind `userId` from the session.
- **HIGH — `/api/render/[jobId]/status` ownership check.** `apps/web/app/api/render/[jobId]/status/route.ts:20-40` resolves `getOrCreateAppUser()` and enforces `job.userId === dbUser.id` before returning data. RenderJob IDs are CUIDs (~20 chars, unguessable in practice), but support tickets / browser history / shared URLs leak them. Same ownership check on `/api/render/[jobId]/events` (SSE).
- **MEDIUM — `/api/demo/start` auth gate.** `apps/web/app/api/demo/start/route.ts:21` calls `getOrCreateAppUser()` before any DB write or Redis enqueue. The shared `demo@ugc-video.local` user is preserved (matches prior semantics) but unauthenticated visitors can no longer trigger Redis BullMQ jobs.
- **MEDIUM — `safeFetch` SSRF redirect-chain hardening.** `apps/web/lib/scraper/fetch.ts:78-131` switched from `redirect: 'follow'` to `redirect: 'manual'`, capped at 5 hops, re-validates every hop's hostname against `isPrivateOrLocalHost()` (covers `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (AWS metadata!), IPv6 loopback + link-local, `*.local` / `*.localhost` / `*.internal`).
- **Risk if regressed:** Going back to `redirect: 'follow'` re-opens SSRF — an attacker hosts a public URL that 302s to AWS metadata `http://169.254.169.254/latest/meta-data/iam/...` and exfiltrates instance role credentials.

**Admin guard rules — TWO different helpers, do not confuse.**

- **Pages:** `requireAdmin()` from `apps/web/lib/auth/sync-user.ts` — redirects non-admins to `/dashboard`. Used by `apps/web/app/(admin)/layout.tsx`.
- **API routes:** `requireAdminApi()` from `apps/web/lib/auth/admin-api.ts:23-57` — returns `{ ok: false, response: NextResponse.json(..., { status: 401|403 }) }`. Page-level redirect is invalid for API endpoints; this helper returns JSON.
- Every `/api/admin/*` route MUST call `requireAdminApi()` first. Audit confirmed in V26.SEC: all admin pages behind `(admin)/layout.tsx → requireAdmin()`, all `/api/admin/*` have `requireAdminApi()`.

**Audit confirmed clean (V26.SEC):** zero `$queryRaw`/`$executeRaw`, zero `spawn/exec` with user input, zero hardcoded secrets, all paid Server Actions verify ownership via `userId: dbUser.id` filters.

**Files:** `apps/web/lib/auth/sync-user.ts`, `apps/web/lib/auth/admin-api.ts`, `apps/web/lib/scraper/fetch.ts:24-52`, `apps/web/app/api/render/[jobId]/status/route.ts`, `apps/web/app/api/demo/start/route.ts`, `apps/web/app/(admin)/layout.tsx`.

---

## Data / schema

**Prisma `String` columns over enums for evolving vocabularies.** House style (project instructions, "Do not add new Prisma enums for things that might evolve").

- `Script.framework` — V2 framework slug (`problem_agitation_solution / skeptical_testimonial / demonstration_proof / price_alternative_anchor / relatable_israeli_moment / fast_direct_response`). String. Was added without a migration.
- `Scene.sceneGoal` — narrative function (`stop_scroll / establish_pain / introduce_product / prove_it_works / decision_push / other`).
- `Scene.sceneGenerationType` — `talking_head / selfie_talking / mirror_selfie_talking / product_demo / broll / lifestyle / hands_only / closeup_product / before_after`. Note `before_after` is officially deprecated by V27.11.PR4 but legacy DB rows still parse — see "Schema cleanup leftovers".
- `Scene.faceVisibility` — `clear_front_facing / partial_face / profile / no_face`.
- `Scene.status` (V13 PR6) — `pending / generating / completed / failed / etc.` Canonical states + helpers in `apps/web/lib/scenes/scene-status.ts`. New states are added by editing that helper, not by migrating Prisma.
- `Scene.lipSyncStatus` — `pending / queued / processing / completed / failed / skipped_no_face / failed_fallback_used`.
- `User.plan` — `free_trial / creator / brand / agency`. String, vocabulary in `apps/web/lib/plans.ts`.

**Risk:** Anyone adding "let me convert this to a real enum" must consult the project instructions FIRST. Migration would force every consumer to re-deploy in lock-step; the existing String pattern lets the application evolve independently.

**JSONB blobs.**

- `Project.productData` — wizard state + intelligence + avatar + music/caption toggles + `lockedOutfit` + `pendingConcepts` (V27.11.PR6).
- `Script.rawJson` — V5 `creative_strategy` (17 fields) + scenes + `quality_score` + V6 `genre / voice_profile / hook_alternatives`. Validated against `SCRIPT_JSON_SCHEMA` only at LLM-output time; legacy rows with deprecated fields (V27.11.PR3-removed) still parse fine.
- `Scene.imageBriefJson` — strict `ImageBrief` used to produce `imageUrl`. Includes V14 PR2 `frameTechniqueSnippetIds`, V14 PR4 `scrollStopperApplied / variationDiversity`, V27.11.PR1 `comparisonGuardApplied / comparisonGuardReasons`.
- `Scene.imageQaJson` — V11 legacy QA artifact. **No longer written** (V13 PR1 removed the auto-regen loop). See "Schema cleanup leftovers".
- `Scene.motionAnalysisJson` — gpt-4o-mini vision motion analysis. Cached per `motionAnalysisImageUrl`.
- `Scene.wordTimingsJson` / `Scene.captionChunksJson` — V10 ElevenLabs word + caption timings. NULL → captions skipped (refuse to fall back to proportional estimation).
- `Scene.generationLogJson` — V13 PR6 structured log buffer. Capped at 200 entries per scene; oldest dropped on overflow.
- `ApiCall.metadata` — V13.2 safe-to-store provider usage payload (NEVER auth headers / API keys). Lazy-load only — `?expand=metadata` opt-in on recent-calls API.
- `ProviderBalanceSnapshot.rawJson` — safe raw response (no auth headers).
- `CreditTransaction.metadata` — append-only audit log.
- `RenderJob.providerPayloadJson` — composition pipeline state.
- `Asset.metadata` — type-specific (caption preset, music profile, etc.).

**`pendingConcepts` blob from V27.11.PR6.** Lives on `Project.productData.pendingConcepts`. No DB migration. Survives page refresh. Cleared only via explicit "regenerate all". Wrapped via `wrapRawConceptsForStorage` (assigns `concept_id` UUID + `slot_index` 0..5); `replaceSlots` keeps non-replaced slots byte-identical and increments `regenerationCount`. Implemented in `apps/web/lib/llm/concept-storage.ts`. **Risk:** because it's stuffed into a JSON column, schema validation is application-side only. Adding a new field to the concept card schema should ALSO bump tests in `apps/web/scripts/test-concept-interactive-pr6.ts` (102 assertions) so legacy partial-blob shapes don't crash.

**Files:** `prisma/schema.prisma`, `apps/web/lib/scenes/scene-status.ts`, `apps/web/lib/llm/concept-storage.ts`, `apps/web/lib/plans.ts`.

---

## Render pipeline

**3-stage low-mem ffmpeg (`apps/worker/src/providers/composition/ffmpeg.ts`).**

The pipeline EXISTS as it does because of a Railway OOM-kill at frame ~75 with the original single-pass `concat-filter`. Reverting to `concat-filter` reproduces the OOM.

- **3a. Per-clip normalize, in series** (`ffmpeg.ts:211-258`). Each input clip goes through ONE decoder + ONE encoder at a time → byte-identical libx264 main/3.1 + aac 44.1k 192k stereo + fps=30 cfr + yuv420p + scale-pad to 1080×1920. Mixed input codec params (different SAR, different AAC profile, different fps from Kling/PixVerse/Grok) get fully resolved here.
- **3b. concat-demuxer + `-c copy`** (lines following). Near-zero RAM. Safe ONLY because 3a guarantees byte-identical codec params — the historical concat-demuxer corruption (different SAR / GOP / AAC profile across inputs) cannot happen post-normalize.
- **3c. Optional overlay pass.** Captions force a video re-encode (libass overlays raw frames); music forces an audio re-encode (amix). Whichever isn't needed is stream-copied. When neither is enabled, 3c is skipped entirely.
- Peak memory: max(per-clip normalize, overlay pass) ≈ one decoder + one encoder + libass + amix.

**Why `concat-filter` is forbidden:** N parallel decoders + libass + amix all in RAM at once. Railway's cgroup OOM-killer hits at frame ~75 on a 6-scene video. Reproducing this would silently break the worker — error logs show OOM, render fails at upload, user sees "Failed" with no actionable hint.

**Why `concat-demuxer` was previously broken:** Mixed input codec params produce visual corruption (smeared frames, audio glitches) in the stitched output. That's why naive concat-demuxer was abandoned. Stage 3a's normalize fixed THAT problem.

**Files:** `apps/worker/src/providers/composition/ffmpeg.ts`, project instructions "Do not switch the ffmpeg compose back to single-pass `concat-filter`".

---

## Captions

**V26.13 ffprobe-measured cumulative offsets.**

- `apps/worker/src/providers/composition/ffmpeg.ts:269-288` calls `probeDurationSeconds(normalizedPath)` on every output of stage 3a. Cumulative `sum(probedDurationsMs)` is the global caption offset.
- Why: pre-V26.13, the worker used `max(clipDuration, voiceDuration)` from the DB, which compounded drift across scenes (PixVerse audio stretching, mux frame-rounding, fps=30 cfr re-timing all add ~5-50ms per clip).
- When ANY scene carries `captionChunks` (the new V26.13 path), the composer rebuilds the ASS post-normalize using the probed offsets, REPLACING the upstream pre-built `captionsAssContent`.
- `CAPTION_LEAD_MS = 100` — captions appear 100ms before the word is spoken (standard UGC practice).

**Why proportional caption timing is forbidden.** Pre-V10 fallback used proportional split based on word count. Drift accumulated to 1-2s by the end of a 30s ad. The worker now refuses to fall back: when `wordTimingsJson` / `captionChunksJson` are NULL, captions for that scene are SKIPPED entirely. Better silence than misalignment.

**ASS rebuilt post-normalize.** Upstream-built `captionsAssContent` is treated as a fallback only — the composer always rebuilds when scene-level chunks are present. Means ASS construction lives in TWO places: `packages/shared/src/captions/ass-builder.ts` (upstream, called by web app) AND inline in `ffmpeg.ts` (post-probe). Drift between them is a known landmine — see `packages/shared/src/captions/presets.ts` for the 5 V12 presets that both must agree on.

**Files:** `apps/worker/src/providers/composition/ffmpeg.ts`, `packages/shared/src/captions/`, `apps/web/lib/voice/elevenlabs.ts`, `prisma/schema.prisma:423-435`.

---

## Build / deploy traps

**Worker tsx requirement.** `apps/worker/Dockerfile:11-21` installs deps with `--include=dev` because tsx lives in devDependencies and Railway defaults `NODE_ENV=production`.

- Workspace packages declare `"main": "./src/index.ts"` (`packages/shared/package.json`, `packages/prompts/package.json`). This is why pre-compiling the worker's TypeScript does NOT remove the tsx runtime requirement — at runtime the worker imports `.ts` files from those packages directly.
- Dockerfile CMD must `cd /app/apps/worker` before invoking tsx (lines 33-34). Without the cd, tsx (invoked from `/app`) misresolves the relative `./env` import inside the monorepo's hoisted `node_modules`.

**`railway.toml` must NOT set `startCommand`.** The current `railway.toml` correctly omits it. A previous deploy set a stale path that conflicted with the Dockerfile's `WORKDIR`, producing duplicated `apps/worker/apps/worker/...` paths and `ERR_MODULE_NOT_FOUND` crashes. `startCommand` silently overrides the Dockerfile CMD — house rule is the CMD is the source of truth.

**Monorepo path duplication trap.** Same root cause as above. The Dockerfile's `WORKDIR /app/apps/worker` + `npx tsx src/index.ts` works only because the workspace packages are hoisted to `/app/node_modules`. Any change that flattens packages or moves them must update the WORKDIR + CMD in lock-step.

**ffmpeg-static bundling in `apps/web/next.config.mjs`.**

- `outputFileTracingRoot: path.resolve(__dirname, '../..')` (line 23) — without this, Vercel's tracer scopes to `apps/web/` and silently skips the binary.
- `serverExternalPackages: ['ffmpeg-static']` (line 42) — without this, webpack tries to copy the binary into `.next/server/chunks/` as if it were a JS chunk, the bundler-rewritten copy ships, and `spawn()` hits ENOENT.
- `outputFileTracingIncludes` (lines 54-65) — explicitly forces `node_modules/ffmpeg-static/**` into the `/api/scenes/[id]/clip` and `/api/scenes/[id]/**` function bundles. Both keys are required because Vercel's function-collapsing sometimes merges several routes into one `.func`.
- **Even with all three knobs, the binary still sometimes doesn't ship.** That's why `mux-audio.ts` has the `/tmp` cold-start download fallback — belt-and-braces.
- `outputFileTracingExcludes` (lines 72-74) — `apps/web/public/**` excluded from every function bundle (159MB of static assets).

**`maxDuration` only in page.tsx, NEVER in actions.ts.** Next.js rejects `export const maxDuration = 120` in `'use server'` files. Long-running Server Actions (`scripts/generate`, multi-scene batch ops) must declare it from the page.tsx that renders the form. Without it, Vercel kills the function at 60s and the client hangs in pending forever.

**Region-pinned alias.** Production URL `https://tachles-lac.vercel.app` is the alias the rest of the system depends on (`PUBLIC_BASE_URL`, Kling/PixVerse callbacks). After deploys, manually verify with `vercel alias set` if the alias is stale.

**Files:** `apps/worker/Dockerfile`, `railway.toml`, `apps/web/next.config.mjs`, `vercel.json`, project instructions "What NOT to do".

---

## Schema cleanup leftovers

These columns / values are dead weight for new code but kept nullable / stringly-typed for back-compat with existing rows.

**V13 PR1 — image-QA columns retired.**

- `Scene.imageQaJson`, `Scene.imageRegenAttempts` (default 0), `Scene.needsManualReview` (default false) — `prisma/schema.prisma:444-447`. PR1 deleted `apps/web/lib/image-qa/`, the QA branch in `lib/scenes/generate-impl.ts`, `buildCorrectiveBrief` in `image-brief-builder.ts`, and the `IMAGE_QA_ENABLED` / `IMAGE_QA_MAX_RETRIES` / `OPENAI_IMAGE_QA_MODEL` env vars. Single-pass image gen now: brief builder → gpt-image-2 → persist.
- Columns are still **read** by admin debug (`apps/web/app/(admin)/admin/scenes/[id]/debug/page.tsx:195, 532, 538, 754, 757`) and the export-report (`apps/web/lib/admin/export-report.ts:738, 775`), but no production write path touches them. Risk: anyone reviving image-QA must understand WHY it was removed (PR1 commit message — "the model can't reliably fix what it flags") before re-enabling.
- **Vision calls KEPT:** Product Visual Analysis, Motion Analysis, Face Gate (all upstream/routing, not post-generation).

**V14 PR1 — `PersonaArchetype` + `ReligiousRegister` now required across catalog.**

- AvatarProfile extended with required `archetype: PersonaArchetype` + `religiousRegister: ReligiousRegister`. All 25 catalog avatars in `apps/web/lib/avatars/catalog.ts` are backfilled — no nulls, no implicit defaults.
- New avatar PRs MUST set both fields. The 8 named scene presets (`kitchen_with_morning_light`, `bathroom_morning_routine`, etc.) in `apps/web/lib/scene-planning/israeli-realism-rules.ts` reference these archetypes deterministically — adding an avatar without `archetype` defined will produce missing-cue errors at brief-render time.

**V27.11.PR4 — `before_after` enum value deprecated, but legacy rows still parse.**

- `packages/prompts/src/script-json-schema.ts` removed `'before_after'` from `SCENE_GENERATION_TYPES` (now 11 values, was 12). Renamed `'comparison_split'` → `'comparison_focus'` in `FRAME_STRATEGIES`.
- Legacy `Script.rawJson` blobs in DB with `sceneGenerationType: 'before_after'` and `frame_strategy: 'comparison_split'` parse fine — `LlmScene.scene_generation_type` is typed as plain `string` at the runtime mapper layer (`apps/web/lib/llm/scripts.ts:244` and `packages/shared/src/types/script.ts:30`), NOT the enum.
- The PR1 anti-collage bridge in `apps/web/lib/image-briefs/image-brief-builder.ts:209` (`LEGACY_COMPARISON_SCENE_TYPES = new Set(['before_after'])`) still catches legacy rows: any scene with `sceneGenerationType === 'before_after'` triggers `COMPARISON_GUARD_RULE_BLOCK` + 13 collage-specific negatives at brief-render time.
- `apps/web/lib/animation/scene-routing.ts:18, 94, 121` intentionally retains `'before_after'` as a possible output for legacy scenes that lack explicit `requiresLipSync` — orthogonal layer, returns `requiresLipSync: false` either way.
- Admin debug page (`apps/web/app/(admin)/admin/scenes/[id]/debug/page.tsx:160-169`) detects deprecated enum values and surfaces a yellow alert.
- **Risk if regressed:** Removing the bridge OR tightening the runtime mapper to enum-only typing crashes legacy scenes in flight. The bridge is a permanent compatibility shim.

**V27.11.PR3 — 4 schema fields dropped from `SCENE_ITEM_SCHEMA`.** `israeli_environment_required`, `local_realism_notes`, `why_this_scene_exists`, `narrative_link_from_previous`. Schema-required count: 24 → 20. Legacy DB blobs with these keys present still parse fine (`additionalProperties: false` is set on the schema, but it only validates new LLM output, not what's already persisted). Admin debug surfaces an info-only "legacy meta fields detected" badge.

**V27.10.20 — face-gate persistence revived from V7 dead columns.** `Scene.lipSyncStatus`, `Scene.lipSyncErrorMessage`, `Scene.faceGateImageUrl`, `Scene.faceGateReason` were dead since V7 (face-gate ran but didn't persist results). PR re-wired the persist path; columns existed already. Side benefit — admin debug "מצב Lipsync" panel.

**Files:** `prisma/schema.prisma`, `apps/web/lib/scenes/generate-impl.ts:348-352`, `apps/web/app/(admin)/admin/scenes/[id]/debug/page.tsx`, `apps/web/lib/image-briefs/image-brief-builder.ts:171-209`, `apps/web/lib/animation/scene-routing.ts`, `packages/shared/src/types/script.ts`.

---

## Concept-first script flow (V27.11.PR6)

**Feature-flagged behind `SCRIPT_ENGINE_MODE`. Default `legacy_full_batch`. Awaiting manual UAT.**

- Branch `v27-11-concept-interactive-ux` — NOT merged to main.
- Operator opt-in (after manual browser UAT): `SCRIPT_ENGINE_MODE=concept_interactive`. Rollback: unset the env var.
- PR5's `concept_first` value is silently re-mapped to `legacy_full_batch` at `apps/web/lib/llm/concept-engine.ts:resolveScriptEngineMode` — the broken auto-pick UX is permanently retired.

**New surface area:**
- Schema: `packages/prompts/src/concept-cards-schema.ts` — 12 LLM-output fields per card + `CONCEPT_REGEN_JSON_SCHEMA` for partial regen.
- System prompt: `packages/prompts/src/concept-system-prompt.ts` — `CONCEPT_SYSTEM_PROMPT` (~6K chars, ~16% of `SCRIPT_SYSTEM_PROMPT`) + `CONCEPT_REGEN_SYSTEM_PROMPT`.
- Storage: `apps/web/lib/llm/concept-storage.ts` — wraps raw concept cards with `concept_id` (UUID) + `slot_index` (0..5) + `regenerationCount` + `regeneratedFromConceptId`. JSON blob in `Project.productData.pendingConcepts` (no DB migration).
- 4 server actions in `apps/web/app/(dashboard)/projects/[id]/scripts/concept-actions.ts`: `generateConceptsAction` (slug `script_concept_batch`), `regenerateSelectedConceptsAction` (slug `script_concept_regenerate_selected`), `regenerateAllConceptsAction` (slug `script_concept_batch` w/ `metadata.regenerateAll`), `expandPickedConceptsAction` (charges `script_batch` × N selected, slug `script_concept_expand`, partial-failure refund per failed expansion).
- UI: `apps/web/app/(dashboard)/projects/[id]/scripts/concept-card.tsx` (RTL Hebrew card), `apps/web/app/(dashboard)/projects/[id]/scripts/concept-flow.tsx` (state machine: idle / generating / picking / regenerating / expanding / error). Auto-preselects top-3-by-quality, refuses 4+ silently.
- `scripts/page.tsx` branches on `resolveScriptEngineMode()`: concept_interactive + no scripts → `ConceptFlow`; legacy or has scripts → existing `StreamingScriptsGrid`.

**Selection rules:** 0 selected = blocked, 1-3 = allowed, 4+ = blocked, duplicates = blocked.

**Cost / credits:** concept generation + regen are FREE of user credits (provider cost still logged via ApiCall). Expansion charges `PER_OPERATION_CREDITS.script_batch × N selected` up-front with per-failure refund. **Risk:** if the expansion path is added to without preserving the per-failure refund logic, users get charged for failed expansions silently.

**Verification:** `apps/web/scripts/test-concept-interactive-pr6.ts` — 102 assertions, 16 sections. PR1 (89) + PR2 (29) + PR3 (73) + PR4 (48) regression-clean. Standalone runner: `npm run test:conceptinteractive`.

**Files:** `apps/web/lib/llm/concept-engine.ts`, `apps/web/lib/llm/concept-storage.ts`, `apps/web/app/(dashboard)/projects/[id]/scripts/concept-*.{ts,tsx}`, `packages/prompts/src/concept-*.ts`, `apps/web/scripts/test-concept-interactive-pr6.ts`.

---

## Outstanding TODOs / FIXMEs / explicit suppressions

Repository grep for `TODO / FIXME / HACK / XXX` returned **zero matches** in `apps/` and `packages/` (excluding `.next/`). Either truly absent, or all were swept during recent refactors. Either way: surprisingly clean for a codebase of this scale.

**Code-level `eslint-disable` (live source only, no `.next/`):**
- `apps/web/app/(dashboard)/projects/new/page.tsx:532, 590, 650` — `@next/next/no-img-element` (raw `<img>` tags for product / gallery / hero images that genuinely don't benefit from `next/image` optimization).
- `apps/web/app/(dashboard)/projects/[id]/avatar/client-bits.tsx:90` — same.
- `apps/web/app/(dashboard)/dashboard/page.tsx:187, 199` — `jsx-a11y/media-has-caption` + `@next/next/no-img-element`.
- `apps/web/app/(admin)/admin/scenes/[id]/compare/client-bits.tsx:88` — `@next/next/no-img-element`.
- `apps/web/components/ui/video-preview.tsx:79` — `jsx-a11y/media-has-caption` (UGC video preview, no captions track).
- `apps/web/scripts/test-schema-trim-pr3.ts:319, 331` — `@typescript-eslint/no-unused-vars` on type-only placeholders.
- `apps/web/lib/llm/concept-storage.ts:175` — `@typescript-eslint/no-unused-vars`.
- `apps/web/components/ui/progress-bar.tsx:11` — `@deprecated` JSDoc tag on the `accent` variant alias for `ai`. Wave 4 sweep removes it.

**`@ts-ignore` only in `apps/web/.next/types/validator.ts`** — auto-generated, not source.

**Legacy / deprecated mentions (live source, comment-level):**
- `apps/web/components/ui/progress-bar.tsx:11` — `accent → ai` rename, alias kept for Wave 4 sweep.
- `apps/web/components/ui/button.tsx:3, 11, 67` — `intent` prop layered on legacy `size`+`variant`; back-compat preserved.
- `apps/web/app/(dashboard)/projects/[id]/videos/actions.ts:87, 94` — `'kling'` legacy alias for `kling-omni-v3`.
- `apps/web/app/(dashboard)/projects/[id]/scripts/page.tsx:29, 159` — fallback to legacy angle label / streaming-scripts-grid path.
- `apps/web/app/(admin)/admin/apicalls/[id]/page.tsx:139, 150` — `success` is a legacy boolean; `status` is the source of truth since V12.
- Numerous `(admin)/admin/scenes/[id]/debug/page.tsx` references to V27.11.PR3/PR4 deprecated enum detection.

**Commit-level outstanding:** `.planning/` is uncommitted (per `git status`). No other dirty state.

**Files:** various, listed above.

---

*Concerns audit: 2026-05-03*
