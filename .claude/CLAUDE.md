# tachles — Claude Project Context

Hebrew-first AI platform for Israeli UGC product video ads.
**Current version:** V13.2 (2026-04-30)
**Production:** https://tachles-lac.vercel.app
**Output:** 9:16 MP4 ads, 15s or 30s, Hebrew voice-over + RTL captions + background music.

---

## Stack (quick reference)

| Layer | Tech |
|-------|------|
| Web | Next.js 15 App Router · React 19 · Tailwind 3.4 · shadcn/ui · RTL Hebrew |
| Worker | Node 20+ · BullMQ 5 · ioredis · `tsx watch` (dev) / Docker (prod) |
| DB | PostgreSQL via Prisma 6 — Supabase pooler `aws-1-ap-south-1` (Mumbai) |
| Queue | Redis Cloud free tier (prod) · local Redis (dev) |
| Storage | Cloudflare R2 (prod, S3-compatible) · local `public/uploads/` (dev) |
| Auth | Supabase Auth — `ADMIN_EMAILS` env auto-promotes first user |
| AI | OpenAI (gpt-5.4-mini scripts, gpt-image-2 scenes, gpt-4o-mini vision for face-gate / motion-analysis / product-visual-analysis — V13 PR1 removed the post-gen QA loop) |
| Voice | ElevenLabs `eleven_v3` with-timestamps |
| Video | Kling Omni v3 i2v + PixVerse LipSync |
| Composition | ffmpeg on worker host → upload MP4 to R2 |

---

## Production deployment

| Service | Where | Notes |
|---------|-------|-------|
| Web (Next.js) | Vercel Hobby | **region: `bom1` (Mumbai)** — pinned in `vercel.json`. MUST stay co-located with Supabase or every Prisma query pays ~250ms cross-region latency. |
| Worker (BullMQ) | Railway (Dockerfile) | `apps/worker/Dockerfile` + `railway.toml` + `.railwayignore`. ffmpeg pre-installed. CMD must `cd /app/apps/worker` before invoking `tsx` so monorepo-hoisted node_modules + relative imports (`./env`) resolve. railway.toml MUST NOT set `startCommand` — it overrides Dockerfile CMD. |
| DB | Supabase `ap-south-1` | Pooler URL (port 6543) for app, direct URL (port 5432) for `prisma db push`. |
| Queue | Redis Cloud (free) | `REDIS_URL` shared between web + worker. |
| Object storage | Cloudflare R2 | `CLOUDFLARE_R2_BUCKET_NAME` env auto-switches `lib/storage/index.ts` from local to R2. |
| Production URL | https://tachles-lac.vercel.app | Set `PUBLIC_BASE_URL` to this so Kling/PixVerse can fetch silent clips + voice MP3s. |

**Verify region after deploys:** `curl -sI https://tachles-lac.vercel.app/api/health \| grep x-vercel-id` — middle segment must be `bom1`.

**Storage migration history (V12.1–V12.3, 2026-04-30):**
- V12.1 — `lib/storage/read-public-asset.ts` helper. Try-disk → fallback-HTTP. Replaced 5 disk-only readers (scene-images, motion-analysis, face-gate, image-qa, product-visual-analysis).
- V12.2 — Static catalogs (avatars + music + voice samples) migrated to R2. URLs hard-coded in catalog files. Bulk uploader: `apps/web/scripts/upload-static-assets-to-r2.ts`.
- V12.3 — Remaining 4 disk readers patched (kling.imageToPayload, kling.downloadAsBuffer, pixverse.resolveToBytes, mux-audio.readUrlAsBuffer). All `process.cwd()/public/` outside `LocalStorage` adapter and `read-public-asset.ts` itself eliminated.
- V12.4 — Voice-sample preview CORS fix. R2 returns 403 on OPTIONS preflight (admin-scope token needed to set CORS). `voice-presets.ts sampleUrl` reverted to `/api/voice/sample/<id>` (same-origin). API route lookup chain: R2 → local disk → ElevenLabs synth → cache back to BOTH. New helper `scripts/set-r2-cors.ts` for when an admin R2 token is available.
- V12.5 — Live provider balance dashboard. `lib/providers/balance.ts` queries Kling `/account/costs`, PixVerse `/openapi/v2/account/balance`, ElevenLabs `/v1/user/subscription`, and OpenAI `/v1/organization/costs` in parallel; surfaced at the top of `/admin/costs` with 60s revalidation. Soft-fails per-provider — an outage on one doesn't break the page.
- V12.6 — Graceful per-provider fallback. When a balance fetcher fails (HTTP 401/403/network), the card falls back to local `ApiCall` aggregates (30d spend + call count) instead of just showing the error. `ProviderFallbackCard` keeps the error visible in a `<details>` block with a fix hint.
- V12.7 — OpenAI parser fix + admin key. `fetchOpenAIBalance` was crashing because `/v1/organization/costs` sometimes returns `amount.value` as a string and `+` was concatenating. Coerced with `Number(...)`. New env var `OPENAI_ADMIN_API_KEY` (sk-admin-…) is preferred over `OPENAI_API_KEY` for Administration API reads — regular keys (sk-svcacct, sk-…) are scoped to model invocation only.
- V13 PR1 — Image QA auto-regen loop removed from active path. Deleted `apps/web/lib/image-qa/`, the QA branch in `lib/scenes/generate-impl.ts`, `buildCorrectiveBrief` in `image-brief-builder.ts`, and the `IMAGE_QA_ENABLED` / `IMAGE_QA_MAX_RETRIES` / `OPENAI_IMAGE_QA_MODEL` env vars. Single-pass image gen now: brief builder → gpt-image-2 → persist. Quality strategy moved to upstream creative planning. DB columns `Scene.imageQaJson` / `imageRegenAttempts` / `needsManualReview` remain nullable for historical data; PR1 stops writing them. Vision calls KEPT: Product Visual Analysis, Motion Analysis, Face Gate (all upstream/routing, not post-generation).
- V13 PR2 — Image Brief strengthening, four small commits. PR2.1 extracts Israeli realism into `apps/web/lib/scene-planning/israeli-realism-rules.ts`. PR2.2 adds `scene-rules.ts` with hands-physics + mirror-safety detectors and rule builders, surfaced as `ImageBrief.handsPhysicsRequired` / `mirrorRisk` / `ruleBlocks` flags. PR2.3 adds the PRODUCT REFERENCE LOCK paragraph in `packages/prompts/src/scene-image-prompts.ts` and gates product mention on `isProblemScene`. PR2.4 adds `buildContactProofRule` answering all five demo questions (where/who/active part/contact/proof) for product_demo / hands_only / closeup_product. Deterministic, no LLM, no DB migration. Verification: `apps/web/scripts/test-v13-pr2.ts` runs 53 assertions.
- V13 PR4 — Stage-tagged logger (`apps/web/lib/logging/log.ts`) with `logStage(stage, scope)`, `.span(label, fn)`, LOG_LEVEL filter, sensitive-data masking. Wired into image-brief / image-gen / voice (PR4.2) and motion-analysis / kling / face-gate / pixverse pipelines (PR4.3) — zero `console.*` left in clip-impl active path.
- V13 PR5 — Curated Hebrew error messages map (`apps/web/lib/errors/scene-error-messages.ts`) covering every pipeline stage. `getSceneErrorMessage(code, raw)` returns `{ hebrew, retryHint?, needsUserEdit?, isFallback }`.
- V13 PR6 — Scene state machine + log buffer schema. Migration `v13_scene_state_log` adds `Scene.status` (String, default 'pending'), `lastErrorCode`, `lastErrorMessage`, `generationLogJson` (all nullable / additive). Canonical states + helpers in `apps/web/lib/scenes/scene-status.ts` (no Prisma enum per house style).
- V13 PR7 — Pipeline impls write the new fields + UX components consume them. PR7.1 wires status transitions in generate / voice / clip impls (each curated `<stage>.<reason>` lastErrorCode matches a PR5 entry). PR7.2 adds `flushSceneLogBuffer` — best-effort persistence of buffered scene logs to `Scene.generationLogJson` (cap 200, oldest dropped on overflow). PR7.3 adds `SceneCardStatusBadge` + `SceneErrorDetails`. PR7.4 adds `SceneLogViewer` + `WizardWarningsPanel`. All RTL-first, Hebrew labels native, Server / Client component split honored.
- V13 PR8 — `/admin/scenes/[id]/debug` admin panel renders every persisted artifact for a scene: status badge, last error, generation log, routing flags, image brief, final prompt, motion analysis, legacy QA (with banner), generation history, project intelligence. Reuses PR5/PR6/PR7 components.
- V13 PR9 — `npm test` runs the V13 verification suite via `apps/web/scripts/test-v13-all.ts` master runner. 360+ assertions across 8 PR scripts run in ~5.4s; trade-off vs full vitest port documented in commit message.
- V13.1 — ffmpeg cold-start download. Vercel's bundler refused to ship the ffmpeg-static binary in the function (verified locally — .vercel/output had no ffmpeg file even with serverExternalPackages + outputFileTracingRoot + glob includes), so non-lipsync clips silently shipped without audio. `lib/scenes/mux-audio.ts` now downloads the binary from `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-${arch}.gz` to `/tmp/tachles-ffmpeg-static` on first call, gunzips, chmods +x, caches for the warm container's lifetime (~1-3s cold-start cost). `clip-impl.ts` now refuses to persist a silent clip on mux failure: marks the scene `status='failed'` with `lastErrorCode='render.ffmpeg_failed'` and returns an error before the credit-charge transaction runs — the user is not charged for failed muxes. PR3.1 adds `apps/web/lib/animation/animation-plan-builder.ts` emitting a typed `AnimationPlan` (motionSubject + cameraMotion enum + objectMotion / humanMotion / forbiddenMotion[] / preserveProductVisibility / avoidFaceZoom / speakingExpected); defaults follow the V13 §10.3 table; V4 metadata + vision motion-analysis override. PR3.2 adds `buildKlingPromptFromPlan` in `kling.ts` that renders the plan into Omni's `{ positive, negative }`; `forbiddenMotion` items + baseline class negatives merge into the negative prompt via dedupe Set. PR3.3 plumbs the plan from `lib/scenes/clip-impl.ts` (legacy `buildKlingMotionPrompt` no longer in the active path); the same PR2 brief flags (handsPhysicsRequired / mirrorRisk / contactProofRequired) feed the plan so still and clip share constraints. Verification: `apps/web/scripts/test-v13-pr3.ts` runs 56 assertions.
- V13.2 — admin /admin/costs accuracy, auto-refresh, and DB performance hardening. Per-call cost attribution moves into `apps/web/lib/usage/cost-attribution.ts` — one helper per provider that prefers actual usage (tokens / characters / observed units) and falls back to configured constants. The `costUsd` field on `ApiCall` now mirrors `actualCostUsd ?? estimatedCostUsd`; both are persisted alongside a JSON `metadata` blob (safe usage payload — never auth headers). New columns: `ApiCall.estimatedCostUsd / actualCostUsd / metadata / renderJobId / sceneId`; new `CreditTransaction.refType`. New table `ProviderBalanceSnapshot` (provider/balanceType/balanceValue/balanceUnit/estimatedUsdValue/rawJson/status/errorMessage/fetchedAt) — observability only, never used to attribute per-call cost. `lib/providers/balance-snapshot.ts` wraps the existing fetchers with a 60s in-process cache + per-provider soft-fail + persist-to-DB. New API endpoints (server-side admin protected via new `lib/auth/admin-api.ts → requireAdminApi()` returning 401/403): `GET /api/admin/costs/{summary,recent-calls,in-flight,provider-balances,operation-stats}`. Recent-calls supports `?provider=&operation=&status=&since=&until=&expand=metadata` filters; metadata is opt-in to keep the table fast. The `/admin/costs` page now uses three client components (`SummaryKpis` 20s · `InFlightCallsSection` 4s · `RecentCallsTable` 8s) that poll their endpoints, show last-updated, and pause when the tab is hidden. Migration `20260430120000_v13_2_costs_hardening` adds the columns + 13 composite indexes (ApiCall provider+operation+createdAt, provider+status+createdAt, completedAt, userId+createdAt, projectId+createdAt, renderJobId+createdAt, sceneId+createdAt; CreditTransaction refType+ref; RenderJob status+createdAt, projectId+createdAt, completedAt; Project userId+createdAt; ProviderBalanceSnapshot provider+fetchedAt). Verification: `apps/web/scripts/test-v13-pr10.ts` runs 31 assertions covering attribution paths, the explicit ban on balance-delta cost attribution, and the closed allowlists guarding admin URL params.

---

## Repo layout

```
ugc-video-platform/
├── apps/
│   ├── web/                    Next.js app
│   │   ├── app/                App Router (pages + API routes)
│   │   │   ├── (admin)/admin/  costs · projects · queue · renders · users
│   │   │   ├── (auth)/         login · register
│   │   │   ├── (dashboard)/    dashboard · library · pricing · projects/[id]/* · settings
│   │   │   └── api/            REST endpoints (see API Routes below)
│   │   ├── lib/
│   │   │   ├── animation/      face-gate · kling · lipsync (PixVerse) · motion-analysis · scene-routing
│   │   │   ├── auth/           Supabase + sync-user + admin promotion
│   │   │   ├── image-briefs/   deterministic brief builder + corrective-brief
│   │   │   ├── llm/            scripts.ts (6-batch) · scene-images.ts (gpt-image-2)
│   │   │   ├── plans.ts        PLAN_CONFIGS + PER_OPERATION_CREDITS
│   │   │   ├── pricing/        provider-costs.ts (central USD + credit constants)
│   │   │   ├── product-intelligence/  dossier · visual-analysis · audience-inference
│   │   │   ├── scenes/         generate-impl · voice-impl · clip-impl · regen-prompt · mux-audio
│   │   │   ├── scraper/        cheerio + JSON-LD + OG + Shopify + microdata + quick-suggest
│   │   │   ├── storage/        index.ts (auto-select) · r2.ts (Cloudflare R2) · local.ts (dev)
│   │   │   ├── usage/          rate-limit · spend-cap · log (two-phase ApiCall) · credits · pricing
│   │   │   ├── voice/          elevenlabs.ts + voice-presets (30 voices)
│   │   │   ├── db.ts           Prisma client + per-query duration logging ([SLOW QUERY] >500ms)
│   │   │   └── timing.ts       timed() wrapper — logs [TIMING] / [SLOW] for any async op
│   │   └── public/             avatars/ (25 PNGs) · voice-samples/ (30 MP3s) · music/ (17 tracks)
│   │
│   └── worker/
│       ├── Dockerfile          Node 20 + ffmpeg, used by Railway
│       └── src/
│           ├── processors/
│           │   ├── render-processor.ts   V6+ render flow (composition-only)
│           │   └── kling-sweep.ts        hourly stuck-task sweep
│           └── providers/composition/ffmpeg.ts   concat-filter composition + R2 upload of final MP4
│
├── packages/
│   ├── shared/src/
│   │   ├── music/              music-library.ts (17 tracks) + select-music.ts
│   │   └── captions/           types · chunker · ass-builder · presets (5 V12 presets)
│   └── prompts/src/
│       ├── script-system-prompt.ts   V5 (Hebrew + Israeli realism + Product Intelligence)
│       ├── script-json-schema.ts     structured-output schema
│       ├── scene-image-prompts.ts    avatar + product ref wrapper
│       └── scene-safety.ts           23 risky→safe rewrites + modesty tokens
│
├── prisma/
│   ├── schema.prisma           9 models, 6 enums
│   └── migrations/             18 migrations (Apr 27–29 2026)
│
├── vercel.json                 framework + buildCommand + regions: ["bom1"]
├── railway.toml                Worker deployment config (Dockerfile-based)
└── apps/web/next.config.mjs    transpilePackages + experimental.staleTimes.dynamic = 0
```

---

## Pipeline (V12 — all stages real, no mocks in active path)

```
URL → scrape (cheerio + Shopify + OG + microdata)
    → Product Intelligence (dossier · visual analysis · audience inference) [gpt-5.4-mini + gpt-4o-mini]
    → Avatar selection (25-portrait local catalog)
    → Scripts ×6 in parallel [gpt-5.4-mini structured output]
        • V5 creative_strategy (17 fields) + 12-axis quality_score
        • Selective regen if overall < 8
    → Scene images [gpt-image-2 medium 1024×1792]
        • Image Brief Builder (deterministic, no LLM)
        • Single-pass — V13 PR1 removed the post-gen QA + auto-regen loop
    → Voice [ElevenLabs eleven_v3 with-timestamps]
        • charactersToWords (Hebrew/niqqud aware)
        • chunkCaptions (2–5 words, ≤2 lines, 650–2200ms)
        • ffprobe-measured duration
    → Clip [Kling Omni v3 i2v]
        • Motion analysis (gpt-4o-mini vision, cached per imageUrl)
        • Face gate (gpt-4o-mini vision) → PixVerse LipSync if mouth visible
        • Otherwise: ffmpeg mux (silent clip + voice MP3)
    → Final render [BullMQ → ffmpeg]
        • concat-filter (not concat-demuxer)
        • Music (17-track Mixkit library, mood-aware scoring)
        • Captions (ASS v4+ burn-in via libass, 5 presets)
        → /uploads/finals/<ts>.mp4
```

---

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/products/extract` | Scrape + Product Intelligence |
| GET/PATCH | `/api/scenes/[id]` | Scene CRUD |
| POST | `/api/scenes/[id]/generate` | Generate scene image |
| POST | `/api/scenes/[id]/voice` | Generate scene voice |
| POST | `/api/scenes/[id]/clip` | Generate scene clip (Kling + optional PixVerse) |
| POST | `/api/scenes/[id]/regen-prompt` | Prompt-only regen |
| GET | `/api/projects/[id]/scripts/list` | List scripts |
| POST | `/api/projects/[id]/render` | Enqueue final render |
| GET | `/api/render/[jobId]/status` | Poll render progress |
| POST | `/api/render/start` | Start render (alt entry) |
| GET | `/api/voice/sample/[voiceId]` | Stream voice preview |
| GET | `/api/health` | Health check |
| POST | `/api/demo/start` | Demo mode entry |

---

## Database models (Prisma)

| Model | Key columns / notes |
|-------|---------------------|
| `User` | plan (free_trial/creator/brand/agency) · creditsBalance · spendCapUsd · banned |
| `CreditTransaction` | append-only audit log, signed amount, reason, ref, adminId |
| `ApiCall` | two-phase: status in_progress→success/failed · provider · costUsd · tokens |
| `Project` | productData JSON (wizard state + intelligence + avatar + music/caption toggles) |
| `Script` | framework (string not enum) · rawJson (V5 strategy + scenes + quality_score) |
| `Scene` | 50+ columns: image/voice/clip URLs + in-flight timestamps + face-gate + PixVerse IDs + caption chunks + image-QA artifacts |
| `RenderJob` | pending → extracting_assets → composing_video → uploading_final → completed/failed |
| `Asset` | type enum: product_image/voice_audio/avatar_video/broll_video/composition/final_video/thumbnail/background_music |

---

## Credits & pricing (lib/plans.ts + lib/pricing/provider-costs.ts)

| Plan | Credits/mo | Price |
|------|-----------|-------|
| free_trial | 30 one-time | — |
| creator | 500 | $49/mo |
| brand | 1800 | $149/mo |
| agency | 6000 | $499/mo |

Key operations (credits): script gen · scene image · voice · clip (Kling) · lipsync (PixVerse). First regen free. Spend cap enforced per-user (default in spend-cap.ts, overridable by admin).

---

## Dev commands

```bash
npm run dev:web          # Next.js dev server
npm run dev:worker       # BullMQ worker (tsx watch)
npm run typecheck        # all workspaces
npm run prisma:generate  # after schema changes
npm run prisma:migrate   # apply migrations
npm run prisma:studio    # Prisma Studio GUI
npm run test:render      # worker render tests
```

---

## Environment variables (root .env / .env.local)

Web + worker share the same .env at repo root.

**Required (always):** `DATABASE_URL` · `REDIS_URL` · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `OPENAI_API_KEY` · `ELEVENLABS_API_KEY` · `KLING_ACCESS_KEY` · `KLING_SECRET_KEY` · `PIXVERSE_API_KEY` · `PUBLIC_BASE_URL`

**Required in production (R2 storage):** `CLOUDFLARE_R2_ACCOUNT_ID` · `CLOUDFLARE_R2_ACCESS_KEY_ID` · `CLOUDFLARE_R2_SECRET_ACCESS_KEY` · `CLOUDFLARE_R2_BUCKET_NAME` · `CLOUDFLARE_R2_PUBLIC_URL` — when `CLOUDFLARE_R2_BUCKET_NAME` is set, `lib/storage/index.ts` switches from local disk to R2 automatically.

**Optional:** `ADMIN_EMAILS` (comma-separated) · `WORKER_CONCURRENCY` · `OPENAI_SCRIPT_MODEL` (default `gpt-5.4-mini`) · `OPENAI_FACE_GATE_MODEL` (default `gpt-4o-mini`)

---

## Key patterns & conventions

- **No mocks in active path.** `mock.ts` files exist in provider dirs as templates only, never instantiated.
- **In-flight timestamps** (`imageInFlightAt`, `voiceInFlightAt`, `clipInFlightAt`) prevent double-clicks from triggering duplicate provider calls. Always set before calling a provider, clear on finish.
- **Two-phase ApiCall logging** — insert row with `status: "in_progress"` at start, update to `"success"/"failed"` on finish. Never log only on success.
- **Motion cache** — `clipMotionTaskId/ImageUrl/GeneratedAt` skip Kling i2v re-run on lipsync-only retries. Invalidate when `scene.imageUrl` changes.
- **Face gate** — gpt-4o-mini vision before PixVerse; skip lipsync if no mouth. Cache result per `faceGateImageUrl`.
- **Hebrew TTS text** — use `scene.textHebrewTts` (cleaned) not `textHebrew` (raw display) when calling ElevenLabs.
- **ASS captions** — built from `captionChunksJson` (scene-relative ms) offset to global timeline in render-processor. Never fall back to proportional estimation.
- **Music** — honor `productData.backgroundMusic` toggle; use `musicProfile` from `script.rawJson` for scoring.
- **Prisma** — always `await prisma.$disconnect()` in worker scripts. Use `onDelete: Cascade` for child rows. **Every query is logged** with its duration via `lib/db.ts`; queries >500ms get a `[SLOW QUERY]` tag for grep'ability.
- **Storage** — never hardcode `/public/uploads/...` paths. Always go through `getStorage()` from `lib/storage/index.ts` so dev (local FS) and prod (R2) both work.
- **Reading public assets in API routes** — `public/` is excluded from the Vercel function bundle (`next.config.mjs` `outputFileTracingExcludes`). NEVER do `fs.readFile(path.join(process.cwd(), 'public', ...))` directly. Always go through `readPublicAsset()` / `readPublicAssetAsDataUrl()` from `lib/storage/read-public-asset.ts` — it tries disk first (dev), falls back to HTTP fetch via `PUBLIC_BASE_URL` (Vercel CDN), and passes absolute http(s) URLs through. V12.1–V12.3 fixed 9 helpers that violated this; do not regress.
- **Static catalogs (avatars / music / voice samples)** — hard-coded R2 URLs in `apps/web/lib/avatars/catalog.ts`, `packages/shared/src/music/music-library.ts`, `apps/web/lib/voice/voice-presets.ts`. Run `npx tsx apps/web/scripts/upload-static-assets-to-r2.ts` after adding new assets to `apps/web/public/{avatars,music,voice-samples}/`. The R2 public URL `https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev` is intentionally hard-coded — it's a CDN endpoint, not a secret, and avoids `NEXT_PUBLIC_*` env juggling for client-component imports.
- **ffmpeg in the web app** — Vercel serverless has no `ffmpeg`/`ffprobe` on PATH. Always invoke them via `FFMPEG_BIN`/`FFPROBE_BIN` constants from `lib/scenes/mux-audio.ts` (which resolves to `ffmpeg-static` / `ffprobe-static` bundled binaries). The binaries are explicitly included in `next.config.mjs` `outputFileTracingIncludes` so Vercel bundles them. The worker has its own apt-installed ffmpeg and is unaffected.
- **Long-running Server Actions** — any page whose Server Action might exceed 60s (e.g. `scripts/generate`, multi-scene batch ops) MUST `export const maxDuration = 120` from the page.tsx, NOT the actions.ts (Next.js rejects it there). Without it, Vercel kills the function and the client hangs in pending forever.
- **Region pinning** — `vercel.json` `regions: ["bom1"]` is load-bearing. Don't change it without ALSO migrating the Supabase project to a matching region — every cross-region query costs ~250ms.
- **Performance instrumentation** — wrap any new async DB/network op with `timed('label', () => fn())` from `lib/timing.ts` so its duration shows in Vercel logs. Search logs for `[TIMING]` / `[SLOW]` to find bottlenecks.
- **Per-call cost attribution (V13.2)** — call `attribute<Provider>Cost(...)` from `lib/usage/cost-attribution.ts` to compute `costUsd` for any provider call. Prefer provider-reported usage (tokens, chars, credits); fall back to configured formulas/constants. NEVER derive per-call cost from balance deltas (fetching live balance before/after the call) — that approach is broken under concurrency, creates rate-limit pressure, and is explicitly forbidden by `FORBIDDEN_balanceDeltaAttribution()`. Provider live balances (`lib/providers/balance-snapshot.ts`, 60s cached) are observability + reconciliation only.
- **Admin API guard (V13.2)** — every `/api/admin/*` route MUST call `requireAdminApi()` from `lib/auth/admin-api.ts` first and return its 401/403 NextResponse on `!ok`. Page-level `requireAdmin()` from `sync-user.ts` redirects (only for pages); API routes need JSON 403 for non-admins.
- **Admin /admin/costs polling cadence** — `SummaryKpis` 20s · `InFlightCallsSection` 4s · `RecentCallsTable` 8s · provider balances 60s. Each section has its own client component that pauses on `document.visibilityState !== 'visible'`. API responses are server-side cached (15s for summary, 30s for operation-stats) so a tab burst doesn't fan out into duplicate aggregates.
- **TypeScript** — `npm workspaces` (no pnpm/yarn). Worker uses `Node` moduleResolution — import from package root, not subpaths.
- **Secrets** — never hardcode. All credentials via env vars only.

---

## What NOT to do

- Do not add mock providers or fake data to the active render/voice/clip path.
- Do not use `concat-demuxer` in ffmpeg — use `concat-filter` (already in ffmpeg.ts).
- Do not use proportional caption timing — always use real word timings from ElevenLabs.
- Do not skip the in-flight timestamp pattern when adding new generation actions.
- Do not add new Prisma enums for things that might evolve — use `String` columns (see `framework`, `sceneGoal`, `sceneGenerationType`).
- Do not import from package `exports` subpaths in the worker (Node moduleResolution limitation).
- Do not move Vercel functions out of `bom1` while Supabase stays in `ap-south-1` — the cross-region latency makes every page render 2-5s of pure network wait.
- Do not put `export const maxDuration` in a `'use server'` actions.ts file — Next.js rejects it. Put it in the page.tsx that renders the form calling that action.
- Do not write final MP4s / images / voice MP3s to `apps/web/public/uploads/` in production code — Vercel's serverless filesystem is read-only between requests. Always go through `lib/storage/index.ts`.
- Do not commit the `ugc-video-platform-secrets/` directory or its `.zip` — it contains live API keys (OpenAI, Kling, PixVerse, ElevenLabs, Supabase). It's git-ignored intentionally.
- Do not put a `startCommand` in `railway.toml` — it silently overrides the Dockerfile `CMD`. Cost us a deploy where the .toml had a stale path that conflicted with the Dockerfile's WORKDIR, producing duplicated `apps/worker/apps/worker/...` paths and ERR_MODULE_NOT_FOUND crashes.
- Do not pre-compile the worker's TypeScript expecting that to remove the tsx runtime requirement — the workspace packages (`@ugc-video/shared`, `@ugc-video/prompts`) declare `"main": "./src/index.ts"`, so the worker still imports `.ts` files at runtime and tsx is mandatory.
- Do not call `fs.readFile(process.cwd() + '/public/...')` from anywhere outside `lib/storage/local.ts` and `lib/storage/read-public-asset.ts`. On Vercel that path resolves to `/var/task/apps/web/public/...` which doesn't exist (public/ is excluded from the function bundle). Use `readPublicAsset()` instead.
- Do not store new static assets only on disk — always also push them to R2 via the upload script. The `public/` folder is now a dev convenience; production reads everything from R2 CDN.
- Do not compute per-call provider cost from balance deltas. `attribute<Provider>Cost` in `lib/usage/cost-attribution.ts` is the only sanctioned path. Balance-delta attribution is unsafe under concurrency (multiple in-flight calls bleed into each other), creates rate-limit pressure on provider /balance APIs, and makes tests non-deterministic. There's a deliberately-throwing `FORBIDDEN_balanceDeltaAttribution()` and a verification assertion in `test-v13-pr10.ts` to keep this honest.
- Do not call `prisma.providerBalanceSnapshot.create*` outside `lib/providers/balance-snapshot.ts`. The cache + 60s TTL + soft-fail handling lives there; ad-hoc fetches will hammer provider APIs and trigger 429s.
- Do not select `ApiCall.metadata` in list views. The recent-calls API returns it ONLY when `?expand=metadata` is on, and per-row drilldowns lazy-fetch. Bringing the JSON into a 50-row table makes the response 50-200KB and slows the dashboard.
