# External Integrations

**Analysis Date:** 2026-05-03

The platform integrates with three LLM providers for script generation (operator-selectable), one image model, two video providers, one TTS provider, one lipsync provider, plus Supabase (auth + Postgres), Redis Cloud (queue), and Cloudflare R2 (storage). Per-call cost attribution is centralized in `apps/web/lib/usage/cost-attribution.ts` — balance-delta attribution is explicitly forbidden (`FORBIDDEN_balanceDeltaAttribution`).

## APIs & External Services

### LLM — Script Generation (operator picks one via `LLM_SCRIPT_PROVIDER`)

**OpenAI (default — `LLM_SCRIPT_PROVIDER=openai`):**
- Wrapper: `apps/web/lib/llm/openai-script-client.ts` — `openaiStructuredCall<T>()` against the Responses API (`client().responses.create`) with `text.format.json_schema` strict mode.
- SDK: `openai` ^4.104.0.
- Default model: `gpt-5.4-mini` (`OPENAI_DEFAULT_SCRIPT_MODEL`). Premium: `gpt-5.4`. Both selectable via `OPENAI_SCRIPT_MODEL` (explicit pin) or `SCRIPT_QUALITY_MODE=premium` (ergonomic toggle).
- Knobs: `OPENAI_REASONING_EFFORT` (default `low`), `OPENAI_VERBOSITY` (default `low`).
- Auth env: `OPENAI_API_KEY` (model invocation).
- Cost attribution: `attributeOpenAiTextCost` in `apps/web/lib/usage/cost-attribution.ts` → `priceOpenAiText` in `apps/web/lib/usage/pricing.ts`. Falls back to `PROVIDER_COST_ESTIMATES_USD.openai_script_batch` (default $0.03) when usage missing.
- Wraps `client().responses.create` in `withRetry` (single retry on transient 5xx within first 15 s) — `apps/web/lib/utils/retry.ts`.

**Anthropic Claude (alt — `LLM_SCRIPT_PROVIDER=anthropic`):**
- Wrapper: `apps/web/lib/llm/anthropic-script-client.ts` — `anthropicStructuredCall<T>()` via `client().messages.create`. Schema is appended as text inside the cached system block (Anthropic's structured-outputs grammar compiler rejects our schema as "too large").
- SDK: `@anthropic-ai/sdk` ^0.92.0.
- Default model: `claude-sonnet-4-6`. Override via `ANTHROPIC_SCRIPT_MODEL` (Haiku 4.5 / Opus 4.7). Wrapper auto-detects Haiku id prefix and drops the unsupported `output_config.effort` param.
- Knobs: `ANTHROPIC_SCRIPT_EFFORT` (default `low`).
- Auth env: `ANTHROPIC_API_KEY` (validated to start with `sk-ant-`, length ≥ 20).
- Cost attribution: `attributeAnthropicTextCost` → `priceAnthropicText`. Tracks `cache_read_input_tokens` / `cache_creation_input_tokens` for prompt-cache telemetry (~10% billing on cached prefix).
- Falls back to `PROVIDER_COST_ESTIMATES_USD.anthropic_script_batch` (default $0.30) when usage missing.

**Google Gemini (alt — `LLM_SCRIPT_PROVIDER=gemini`):**
- Wrapper: `apps/web/lib/llm/gemini-client.ts` — `geminiStructuredCall<T>()` via `client().models.generateContent`. Recursively strips `additionalProperties` from any schema before send (Gemini rejects it). Uses the modern `responseJsonSchema` field.
- SDK: `@google/genai` ^1.51.0 (legacy `@google/generative-ai` deleted in V26.2).
- Default model: `gemini-3-pro-preview` (`GEMINI_DEFAULT_MODEL`). Override: `GEMINI_SCRIPT_MODEL`.
- Auto-pins `thinkingConfig.thinkingLevel: 'low'` for any `gemini-3*` model (the model's own default `'high'` overruns 60s Server Action ceilings on a 6-parallel batch). Never sets `temperature` for Gemini 3 (Google explicitly warns sub-1.0 causes looping).
- Auth env: `GEMINI_API_KEY`.
- Cost attribution: `attributeGeminiTextCost` → `priceGeminiText` (handles two-band Pro pricing — `tier2InputThreshold: 200_000` flips to higher rate). Sums `candidatesTokenCount + thoughtsTokenCount` to match Google's "Output (incl. thinking)" line item.

**Concept-cards two-phase engine (V27.11 PR5/PR6):**
- Resolver: `resolveScriptEngineMode()` reads `SCRIPT_ENGINE_MODE` env: `legacy_full_batch` (default) or `concept_interactive`. PR5's `concept_first` value is silently re-mapped to legacy.
- Concept-engine module: `apps/web/lib/llm/concept-engine.ts`.
- Concept-cards schema + prompts: `packages/prompts/src/concept-cards-schema.ts`, `packages/prompts/src/concept-system-prompt.ts`.
- Server actions: `apps/web/app/(dashboard)/projects/[id]/scripts/concept-actions.ts` (`generateConceptsAction`, `regenerateSelectedConceptsAction`, `regenerateAllConceptsAction`, `expandPickedConceptsAction`).

### LLM — Other OpenAI invocations

| Purpose | File | Model env (default) |
|---------|------|---------------------|
| Scene image generation (gpt-image-2) | `apps/web/lib/llm/scene-images.ts`, `apps/web/lib/scenes/generate-impl.ts` | `OPENAI_IMAGE_MODEL` (`gpt-image-2`) |
| Product dossier (Hebrew, structured) | `apps/web/lib/product-intelligence/product-dossier.ts` | `OPENAI_DOSSIER_MODEL` → `OPENAI_SCRIPT_MODEL` (`gpt-5.4-mini`) |
| Product visual analysis (vision) | `apps/web/lib/product-intelligence/product-visual-analysis.ts` | `OPENAI_PRODUCT_VISION_MODEL` (`gpt-5.4-mini`) |
| Audience inference | `apps/web/lib/product-intelligence/audience-inference.ts` | `OPENAI_AUDIENCE_MODEL` → `OPENAI_SCRIPT_MODEL` (`gpt-5.4-mini`) |
| Wizard step-1 quick suggestions | `apps/web/lib/scraper/quick-suggest.ts` | `OPENAI_QUICK_SUGGEST_MODEL` → `OPENAI_SCRIPT_MODEL` (`gpt-5.4-mini`) |
| Motion analysis (vision) | `apps/web/lib/animation/motion-analysis.ts`, called from `apps/web/lib/scenes/clip-impl.ts` | `OPENAI_MOTION_VISION_MODEL` (`gpt-5.4-mini`) |
| Face-gate (vision, before lipsync) | `apps/web/lib/animation/face-gate.ts` | `OPENAI_FACE_GATE_MODEL` (`gpt-5.4-mini`) |
| Scene prompt regen | `apps/web/lib/scenes/regen-prompt.ts`, `apps/web/app/api/scenes/[id]/regen-prompt/route.ts` | `OPENAI_SCRIPT_MODEL` (`gpt-5.4-mini`) |
| Wizard feature suggestion | `apps/web/app/api/projects/[id]/features/suggest/route.ts` | `OPENAI_SCRIPT_MODEL` (`gpt-5.4-mini`) |

OpenAI image cost path: `attributeOpenAiImageCost` (`apps/web/lib/usage/cost-attribution.ts`) → `priceOpenAiImage` (no usage exposed by image API, uses observed-constant pricing per quality + size).

### Voice — ElevenLabs (Hebrew TTS)

- Wrapper: `apps/web/lib/voice/elevenlabs.ts` — `generateHebrewVoiceover()`. Hand-rolled REST against `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` (and `/with-timestamps` variant for caption alignment). No SDK.
- Pipeline integration: `apps/web/lib/scenes/voice-impl.ts` calls `generateHebrewVoiceover` with `withTimestamps: true` so the captions chunker (`packages/shared/src/captions/chunker.ts`) gets per-character timings.
- Default model: `eleven_v3` — **only** ElevenLabs model that supports Hebrew (`heb`). `eleven_multilingual_v2` accepts Hebrew text but produces gibberish; `eleven_flash_v2_5` does not support Hebrew. Override: `ELEVENLABS_MODEL_ID`.
- Voice catalog: `apps/web/lib/voice/voice-presets.ts` (16 hand-picked voices). Pre-generated samples streamed via `/api/voice/sample/[voiceId]` route handler at `apps/web/app/api/voice/sample/[voiceId]/route.ts` (R2 → local disk → ElevenLabs synth → cache fallback chain).
- Auth env: `ELEVENLABS_API_KEY` (sent as `xi-api-key` header).
- Retry: `withRetry` wraps the fetch + status check in `apps/web/lib/voice/elevenlabs.ts` (~line 118).
- Cost attribution: `attributeElevenLabsTtsCost` → `priceElevenLabsTts` (chars × $/1K, eleven_v3 = $0.10 / 1K chars). Falls back to `PROVIDER_COST_ESTIMATES_USD.elevenlabs_voice_scene` (default $0.02) when char count missing.

### Video — Image-to-Video (Kling Omni v3, default; xAI/Grok, opt-in per scene)

**Kling Omni v3 (default):**
- Wrapper: `apps/web/lib/animation/kling.ts` — implements `VideoGenerationProvider` (interface in `apps/web/lib/animation/types.ts`). Submit-then-poll, `POLL_INTERVAL_MS=5000`, `POLL_TIMEOUT_MS=15min`.
- Pipeline integration: `apps/web/lib/scenes/clip-impl.ts` calls Kling for the silent motion clip. Two endpoint families: `/v1/videos/image2video` (legacy) vs `/v1/videos/omni-video` (V3 omni / multi-shot).
- Default base URL: `https://api-singapore.klingai.com` (`KLING_API_BASE_URL`).
- Default i2v endpoint: `/v1/videos/image2video` (`KLING_IMAGE_TO_VIDEO_ENDPOINT`).
- Default lipsync endpoint: `/v1/videos/lip-sync` (`KLING_LIPSYNC_ENDPOINT`) — not used in active path; PixVerse handles lipsync.
- Default model: `kling-v2-master` (`KLING_IMAGE_TO_VIDEO_MODEL`).
- Auth env (two paths):
  - `KLING_API_KEY` — Bearer token (preferred for wrapper / proxy providers).
  - `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` — official endpoint requires HS256 JWT signed in code (`buildAuthHeader()` in `apps/web/lib/animation/kling.ts:89`, also in `apps/web/lib/providers/balance.ts:53`).
- Cost attribution: `attributeKlingI2vCost` → `priceKling`. $0.546 / Kling token (empirical), defaults to `PROVIDER_COST_ESTIMATES_USD.kling_i2v_clip` (default $0.79) when token count missing.
- Hourly stuck-task sweep: `apps/worker/src/processors/kling-sweep.ts` (BullMQ recurring job `recurring:kling_sweep` registered in `apps/worker/src/queue.ts`).
- Caches motion analysis per `scene.imageUrl` to avoid re-running ~$0.005 vision pass on lipsync-only retries (`Scene.motionAnalysisJson` / `motionAnalysisImageUrl` / `motionAnalysisAt`).

**xAI / Grok Imagine (opt-in per-scene `Scene.clipProvider='grok'`):**
- Wrapper: `apps/web/lib/animation/grok-imagine.ts` — implements `VideoGenerationProvider`. Submit + poll: `POST /v1/videos/generations` → `GET /v1/videos/{request_id}` (status `pending|done|expired|failed`).
- Pipeline integration: `apps/web/lib/scenes/clip-impl.ts` reads `Scene.clipProvider` pre-flight; `'grok'` routes through this wrapper. Lipsync scenes are pinned back to Kling (PixVerse face-gate is wired only against Kling output).
- Default base URL: `https://api.x.ai/v1` (`XAI_API_BASE_URL`).
- Default model: `grok-imagine-video` (`XAI_VIDEO_MODEL`).
- Default resolution: `720p` (`XAI_VIDEO_RESOLUTION`).
- xAI URLs are EPHEMERAL — wrapper downloads bytes inline before returning so they can be re-uploaded to R2.
- Auth env: `XAI_API_KEY` (Bearer token from console.x.ai).
- Cost attribution: `attributeGrokVideoCost` → `priceGrokVideo`. Per-second pricing: `XAI_VIDEO_PRICE_PER_SEC_480P_USD` (default 0.08), `XAI_VIDEO_PRICE_PER_SEC_720P_USD` (default 0.15). Fallback constant: `PROVIDER_COST_ESTIMATES_USD.xai_video_clip` (default $0.75).
- Reference doc: `.claude/skills/xai-video-api.md`.

### Lipsync — PixVerse v2

- Wrapper: `apps/web/lib/animation/lipsync/pixverse.ts` — implements `LipSyncProvider` (interface in `apps/web/lib/animation/lipsync/types.ts`). Three-step flow: upload video → upload audio → start lipsync.
- Pipeline integration: `apps/web/lib/scenes/clip-impl.ts` after the face-gate vision pass approves the scene. Skipped when `mouthVisible: false` from face-gate.
- Default base URL: `https://app-api.pixverse.ai` (`PIXVERSE_API_BASE_URL`).
- Endpoints (all overridable via env):
  - `/openapi/v2/media/upload` (`PIXVERSE_MEDIA_UPLOAD_ENDPOINT`)
  - `/openapi/v2/video/lip_sync/generate` (`PIXVERSE_LIPSYNC_ENDPOINT`)
  - `/openapi/v2/video/result` (`PIXVERSE_RESULT_ENDPOINT`)
- Constraints enforced upstream of the API call: video / audio ≤ 30 s, file ≤ 50 MB, resolution ≤ 1920 px.
- Polling: `POLL_INTERVAL_MS=5000`, `POLL_TIMEOUT_MS=10min`. Status enum is unreliable — wrapper checks completion-data fields (`url` populated AND `outputWidth>0` AND `outputHeight>0` AND `path` non-empty) instead.
- Auth env: `PIXVERSE_API_KEY` (sent as `API-KEY` header). `Ai-Trace-Id` per-call uuid for support.
- Cost attribution: `attributePixVerseLipSyncCost` (and `attributePixVerseMediaUploadCost` for the upload step). Pack model in `apps/web/lib/pricing/provider-costs.ts → PIXVERSE_COST_MODEL`: $10 / 2,250 credits = $0.00444/credit; observed 16 credits / lipsync scene = $0.071. Per-scene fallback: `PROVIDER_COST_ESTIMATES_USD.pixverse_lipsync_scene` (default $0.071).
- Face-gate gate: `apps/web/lib/animation/face-gate.ts` (gpt-4o-mini vision) caches verdict per `Scene.faceGateImageUrl` so regen on the same image doesn't re-pay vision cost.

### Compose — ffmpeg (local compute, no provider cost)

- Web app (per-clip mux, dev): `apps/web/lib/scenes/mux-audio.ts` uses `FFMPEG_BIN` / `FFPROBE_BIN` from `ffmpeg-static`. Vercel cold-start downloads the binary from `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-${arch}.gz` to `/tmp/tachles-ffmpeg-static`, gunzips, chmods +x, caches for the warm container's lifetime (V13.1).
- Worker (final compose, prod): `apps/worker/src/providers/composition/ffmpeg.ts`. 3-stage low-mem pipeline (per-clip normalize libx264 main/3.1 + aac 44.1k → concat-demuxer with `-c copy` → optional caption / music overlay). Then PUTs final MP4 to R2 (~`apps/worker/src/providers/composition/ffmpeg.ts:728-732`).
- Cost attribution: `attributeLocalComposeCost` returns `costUsd: 0` (local compute).

## Data Storage

**Database — PostgreSQL (Supabase):**
- Connection: `DATABASE_URL` env (pooler URL on port 6543 for the app, direct URL on port 5432 for `prisma db push`).
- Region: `aws-1-ap-south-1` (Mumbai). Co-located with Vercel `bom1`.
- ORM: Prisma 6 (`@prisma/client` ^6.0.0). Schema: `prisma/schema.prisma`. Client: `apps/web/lib/db.ts` (web), `apps/worker/src/db.ts` (worker).
- 9 models, 6 enums (see STACK.md). Per-query duration logging + `[SLOW QUERY]` >500ms tag in `apps/web/lib/db.ts`. `timed()` wrapper for additional async ops in `apps/web/lib/timing.ts`.

**File / object storage — Cloudflare R2:**
- Adapter selection: `apps/web/lib/storage/index.ts` — when `CLOUDFLARE_R2_BUCKET_NAME` env is set, uses `R2Storage`; else `LocalStorage` (dev only).
- R2 implementation: `apps/web/lib/storage/r2.ts` — `S3Client` from `@aws-sdk/client-s3` with `region: 'auto'` and `endpoint: https://${accountId}.r2.cloudflarestorage.com`.
- Local dev fallback: `apps/web/lib/storage/local.ts` — writes to `apps/web/public/uploads/<folder>/<filename>`.
- Public asset reader: `apps/web/lib/storage/read-public-asset.ts` — try-disk → fallback-HTTP via `PUBLIC_BASE_URL`. **Mandatory** for any code reading `public/` assets (Vercel function bundle excludes `public/`).
- Static catalog uploader: `apps/web/scripts/upload-static-assets-to-r2.ts` (run after adding new avatars / music / voice samples).
- Worker R2 upload: `apps/worker/src/providers/composition/ffmpeg.ts:728-732` builds its own `S3Client` from the same env vars.
- Required env: `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL`. Public CDN: `https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev` (hard-coded in static catalogs).
- CORS helper: `apps/web/scripts/set-r2-cors.ts` (R2 returns 403 on OPTIONS preflight without admin-scope token).

**Caching:**
- In-process user cache (10 s TTL): `apps/web/lib/auth/user-cache.ts` — keyed by Supabase auth id, invalidated by `invalidateUserCacheById` from `apps/web/lib/usage/credits.ts` on credit mutations.
- In-process provider balance cache (60 s TTL + soft-fail + persist-to-DB): `apps/web/lib/providers/balance-snapshot.ts` (writes to `ProviderBalanceSnapshot` table).
- API route response caches: 15s (summary), 30s (operation-stats) on `/admin/costs` endpoints.
- No Redis-based caching (Redis is queue-only).

## Authentication & Identity

**Provider — Supabase Auth (cookie-based SSR):**
- Server client: `apps/web/lib/supabase/server.ts → createSupabaseServerClient()`.
- Browser client: `apps/web/lib/supabase/client.ts`.
- Cookie session middleware: `apps/web/lib/supabase/middleware.ts` (called from `apps/web/middleware.ts`).
- SDK: `@supabase/ssr` ^0.5.2 + `@supabase/supabase-js` ^2.105.0.
- Required env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

**App user sync + role:**
- `apps/web/lib/auth/sync-user.ts → getOrCreateAppUser()` returns `{ authUser, dbUser }`. Race-safe insert via Prisma P2002 catch.
- `requireAuth()` redirects unauthenticated users to `/login`.
- `requireAdmin()` redirects non-admins to `/dashboard`.
- Admin promotion: first-ever registered user is auto-promoted; comma-separated emails in `ADMIN_EMAILS` env are also auto-promoted on login.

**Admin API guard (route handlers, returns JSON 401/403):**
- `apps/web/lib/auth/admin-api.ts → requireAdminApi()`. Used by every `/api/admin/*` route handler. Pages use `requireAdmin()` instead (which can redirect).

**Per-user economics fields (`User` model, `prisma/schema.prisma`):**
- `plan` (string, defaults `free_trial`): `free_trial` | `creator` | `brand` | `agency`.
- `creditsBalance` (int, default 0).
- `spendCapUsd` (float, nullable; admin-overridable).
- `banned` (bool). Banned users redirect to `/login?error=banned`.
- `planAnnualBilling`, `planRenewsAt`, `planStartedAt`.

## Monitoring & Observability

**Error tracking:**
- No Sentry / Datadog / external APM. Errors are logged to console.
- Stage-tagged logger (V13 PR4): `apps/web/lib/logging/log.ts → logStage(stage, scope)` with `.span(label, fn)`, `LOG_LEVEL` filter (`debug` in dev, `info` in prod), and sensitive-data masking.

**Logs:**
- Vercel function logs (web app stdout/stderr).
- Railway service logs (worker stdout/stderr). Worker boot-print includes `RAILWAY_GIT_COMMIT_SHA` and `BUILD_MARKER` (`apps/worker/src/index.ts:14-20`).
- DB-side per-query timing: `[SLOW QUERY]` >500 ms tag from `apps/web/lib/db.ts`.
- App-side timing: `[TIMING]` / `[SLOW]` tags from `apps/web/lib/timing.ts`.

**Per-call ApiCall ledger (`ApiCall` model, append-mostly):**
- Two-phase: insert `status='in_progress'` at submit time, update to `success`/`failed` on finish (`apps/web/lib/usage/log.ts → recordApiCallStart` / `recordApiCallSuccess` / `recordApiCallFailure`).
- Columns: `provider`, `operation`, `model`, `costUsd` (= `actualCostUsd ?? estimatedCostUsd`), `estimatedCostUsd`, `actualCostUsd`, `inputTokens`, `outputTokens`, `units`, `durationMs`, `status`, `metadata` (JSON).
- Linked to `userId`, `projectId`, `renderJobId`, `sceneId` for admin drill-down.
- 13 composite indexes for `/admin/costs` query patterns (migration `20260430120000_v13_2_costs_hardening`).

**Provider live balances (60s cached, soft-fail, observability only — never used for cost attribution):**
- Module: `apps/web/lib/providers/balance.ts`. Cache + DB persist: `apps/web/lib/providers/balance-snapshot.ts` (writes to `ProviderBalanceSnapshot`).
- Per-provider fetchers in `apps/web/lib/providers/balance.ts`:
  - `fetchKlingBalance()` → `GET /account/costs` (line 66, JWT signed in code).
  - `fetchPixVerseBalance()` → `GET /openapi/v2/account/balance` (line 168).
  - `fetchElevenLabsBalance()` → `GET /v1/user/subscription` (line 235).
  - `fetchOpenAIBalance()` → `GET /v1/organization/costs?bucket_width=1d` (line 301). Prefers `OPENAI_ADMIN_API_KEY` (sk-admin-…) over `OPENAI_API_KEY`. Coerces `amount.value` with `Number(...)` because OpenAI sometimes returns a string and `+` would concatenate.
  - `fetchGeminiBalance()` (line 392) — sentinel error: Generative Language API has no per-key billing endpoint, dashboard falls back to local `ApiCall` aggregates.
  - `fetchXaiBalance()` (line 420) — sentinel error: same situation.
- `ProviderFallbackCard` renders the fallback view: when a balance call fails, it shows local `ApiCall` 30d aggregates and keeps the error visible inside a `<details>` block.

**Admin observability endpoints (under `/api/admin/costs/`, all guarded by `requireAdminApi()`):**
- `GET /api/admin/costs/summary/route.ts` — KPI rollups (15s server cache; client polls 20s).
- `GET /api/admin/costs/in-flight/route.ts` — currently-running calls with elapsed timer (client polls 4s).
- `GET /api/admin/costs/recent-calls/route.ts` — filterable list (`?provider=&operation=&status=&since=&until=&expand=metadata`); `metadata` is opt-in to keep table fast (client polls 8s).
- `GET /api/admin/costs/operation-stats/route.ts` — per-operation aggregates (30s server cache).
- `GET /api/admin/costs/provider-balances/route.ts` — live balances (60s server cache).
- Diagnostic: `GET /api/admin/diag/anthropic/route.ts` — tests `ANTHROPIC_API_KEY` validity + simple ping + full-shape script-gen call.
- Admin debug pages: `apps/web/app/(admin)/admin/scenes/[id]/debug/page.tsx`, `apps/web/app/(admin)/admin/projects/[id]/diagnostic/page.tsx`, `apps/web/app/(admin)/admin/projects/[id]/debug/page.tsx`.

## CI/CD & Deployment

**Hosting:**
- Web: Vercel Hobby/Pro, region `bom1` (`vercel.json regions: ["bom1"]`).
- Worker: Railway Docker service (`railway.toml` + `apps/worker/Dockerfile`).

**Production URL:** `https://tachles-lac.vercel.app` (set in `PUBLIC_BASE_URL` env so Kling / PixVerse / xAI can fetch silent clips + voice MP3s via HTTPS).

**CI Pipeline:**
- No GitHub Actions / CircleCI / similar. Vercel + Railway each pull from `main` on push (trunk-based dev).
- Pre-merge validation: `npm run typecheck` (all workspaces), `npm test` (~770 V13+V14 assertions), `npm run check:v27-strict` (legacy class-name guard).
- Vercel build command (`vercel.json`): `npm run prisma:generate && npm run build:web`.

**Deploy verification:**
- Vercel region: `curl -sI https://tachles-lac.vercel.app/api/health \| grep x-vercel-id` (middle segment must be `bom1`).
- Worker boot SHA: `BUILD_MARKER=… builtFromSha=…` log line at startup uses `RAILWAY_GIT_COMMIT_SHA`.
- Health endpoint: `apps/web/app/api/health/route.ts` (also exposes a build SHA derived from `VERCEL_GIT_COMMIT_SHA`).

## Environment Configuration

**Required (always):**
- `DATABASE_URL` — Postgres pooler URL (port 6543).
- `REDIS_URL` — BullMQ queue, shared between web + worker.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `OPENAI_API_KEY` — required even if `LLM_SCRIPT_PROVIDER=anthropic|gemini` (vision/image/dossier paths still use OpenAI).
- `ELEVENLABS_API_KEY`.
- `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` (or `KLING_API_KEY` for proxy providers).
- `PIXVERSE_API_KEY`.
- `PUBLIC_BASE_URL` — Vercel domain in prod, public tunnel in dev.

**Required in production (R2 storage — auto-switches when `CLOUDFLARE_R2_BUCKET_NAME` is set):**
- `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL`.

**Optional (provider-conditional):**
- `ANTHROPIC_API_KEY` — required only when `LLM_SCRIPT_PROVIDER=anthropic`. Validated to start with `sk-ant-`.
- `GEMINI_API_KEY` — required only when `LLM_SCRIPT_PROVIDER=gemini`.
- `XAI_API_KEY` — required only for opt-in Grok video clips.
- `OPENAI_ADMIN_API_KEY` — preferred over `OPENAI_API_KEY` for `/v1/organization/costs` reads (sk-admin-…). Regular keys are scoped to model invocation only.

**Optional knobs (defaults shown in `.env.example`):**
- `ADMIN_EMAILS` (comma-separated) — auto-promote to admin on login.
- `LLM_SCRIPT_PROVIDER` (default `openai`).
- `SCRIPT_ENGINE_MODE` (default `legacy_full_batch`; alt `concept_interactive`).
- `SCRIPT_QUALITY_MODE` (`balanced` / `premium`).
- `SCRIPT_CONCEPT_TOP_N` (1..6, default 3).
- `OPENAI_SCRIPT_MODEL` (default `gpt-5.4-mini`), `OPENAI_REASONING_EFFORT` (default `low`), `OPENAI_VERBOSITY` (default `low`).
- `OPENAI_IMAGE_MODEL` (default `gpt-image-2`), `OPENAI_DOSSIER_MODEL`, `OPENAI_AUDIENCE_MODEL`, `OPENAI_QUICK_SUGGEST_MODEL`, `OPENAI_PRODUCT_VISION_MODEL`, `OPENAI_MOTION_VISION_MODEL`, `OPENAI_FACE_GATE_MODEL`.
- `ANTHROPIC_SCRIPT_MODEL` (default `claude-sonnet-4-6`), `ANTHROPIC_SCRIPT_EFFORT` (default `low`).
- `GEMINI_SCRIPT_MODEL` (default `gemini-3-pro-preview`).
- `XAI_VIDEO_MODEL` (default `grok-imagine-video`), `XAI_VIDEO_RESOLUTION` (default `720p`), `XAI_API_BASE_URL`.
- `XAI_VIDEO_PRICE_PER_SEC_480P_USD` (default 0.08), `XAI_VIDEO_PRICE_PER_SEC_720P_USD` (default 0.15).
- `KLING_API_BASE_URL` (default `https://api-singapore.klingai.com`), `KLING_IMAGE_TO_VIDEO_ENDPOINT`, `KLING_LIPSYNC_ENDPOINT`, `KLING_IMAGE_TO_VIDEO_MODEL`, `KLING_LIPSYNC_MODEL`, `KLING_LIPSYNC_MOCK`.
- `PIXVERSE_API_BASE_URL` (default `https://app-api.pixverse.ai`), `PIXVERSE_MEDIA_UPLOAD_ENDPOINT`, `PIXVERSE_LIPSYNC_ENDPOINT`, `PIXVERSE_RESULT_ENDPOINT`.
- `ELEVENLABS_MODEL_ID` (default `eleven_v3`).
- `WORKER_CONCURRENCY` (default 2).
- `CAPTIONS_MODE` (default `phrase`).
- `LOG_LEVEL` (default `debug` in dev, `info` in prod).
- `DEFAULT_CLIP_PROVIDER` (default `grok`; per-scene `Scene.clipProvider` overrides).
- `NEXT_PUBLIC_APP_URL` — used by `read-public-asset.ts` as a public-base-URL fallback.
- `ANALYZE` — set to `true` to open bundle visualizer (`apps/web/next.config.mjs`).
- Many `COST_*` env vars (see `apps/web/lib/pricing/provider-costs.ts`) — override individual cost constants without redeploying app code.

**Vercel-injected (read in `apps/web/lib/admin/export-report.ts` for the diagnostic export):**
- `VERCEL_ENV`, `VERCEL_REGION`, `VERCEL_GIT_COMMIT_SHA`.

**Railway-injected (read in `apps/worker/src/index.ts` boot log):**
- `RAILWAY_GIT_COMMIT_SHA`.

**Secrets location:**
- Local: repo-root `.env` and `.env.local` (git-ignored). `dotenv` loads them in the worker at `apps/worker/src/env.ts`; Next.js loads them automatically.
- Cloud: Vercel project Environment Variables (Production / Preview / Development). Railway service Variables tab.
- Manual export bundle: `ugc-video-platform-secrets/` directory + `.zip` exist on developer machines; both are git-ignored intentionally and **must never be committed**.

## Webhooks & Callbacks

**Incoming webhooks:** None. The pipeline is fully poll-based — Kling, PixVerse, and xAI are all submit-then-poll from the web app or worker.

**Outgoing callbacks / fetched-by-providers:**
- Kling Omni v3: needs `image_url` in request body. The wrapper passes a public HTTPS URL (R2 CDN) or base64 data URI.
- Kling LipSync (unused in active path): would fetch `audio_url` from `PUBLIC_BASE_URL`.
- PixVerse LipSync: 3-step upload flow — wrapper POSTs the bytes via multipart `file=@...`. No external fetch by PixVerse.
- xAI Grok video: accepts public HTTPS URL or base64 data URI in `image` field.

## Region Pinning

- Vercel region `bom1` (Mumbai) and Supabase `aws-1-ap-south-1` (Mumbai) are co-located. Cross-region would add ~250 ms per Prisma query.
- Verify after deploy: `curl -sI https://tachles-lac.vercel.app/api/health \| grep x-vercel-id`.

---

*Integration audit: 2026-05-03*
