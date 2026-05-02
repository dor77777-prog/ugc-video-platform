<!-- refreshed: 2026-05-03 -->
# Architecture

**Analysis Date:** 2026-05-03

## System Overview

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Hebrew RTL, dark UI)                        │
│   Next.js 15 App Router · React 19 · Tailwind 3.4 · shadcn/ui                │
│   `apps/web/app/(dashboard)/projects/[id]/{scripts,scenes,voices,videos}/`   │
└──────────────────────┬─────────────────────────────────────────────────────┘
                       │  Server Actions  +  /api/* fetch
                       ▼
┌────────────────────────────────────────────────────────────────────────────┐
│           NEXT.JS WEB (Vercel · region bom1 · maxDuration=120)              │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  API ROUTES                       │  ROUTE GROUPS (App Router)        │ │
│  │  `apps/web/app/api/`              │  `(auth)` `(dashboard)` `(admin)` │ │
│  │   products/extract                │   wizard pages + Server Actions   │ │
│  │   scenes/[id]/{generate,voice,    │   render `actions.ts` per step    │ │
│  │     clip,lipsync-only,regen-prompt}│  + `client-bits.tsx` islands     │ │
│  │   projects/[id]/{render,scripts}  │                                   │ │
│  │   render/[jobId]/{status,events}  │                                   │ │
│  │   admin/{costs,scenes,projects,…} │                                   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                       │                                    │
│  ┌────────────────────────────────────▼───────────────────────────────┐   │
│  │  PIPELINE LIBRARIES (`apps/web/lib/`)                              │   │
│  │  • scraper        URL → product JSON  (`scraper/index.ts`)         │   │
│  │  • product-       LLM dossier + visual + audience inference        │   │
│  │    intelligence   (`product-intelligence/index.ts`)                │   │
│  │  • llm/scripts    6× parallel framework batch (Responses API)      │   │
│  │  • llm/concept-   2-phase concept-first script engine (V27.11)     │   │
│  │    engine                                                          │   │
│  │  • image-briefs   Deterministic gpt-image-2 brief builder          │   │
│  │  • scenes/        generate-impl · voice-impl · clip-impl ·         │   │
│  │                   regen-prompt · mux-audio                         │   │
│  │  • animation/     kling · grok-imagine · face-gate ·               │   │
│  │                   motion-analysis · lipsync (PixVerse) ·           │   │
│  │                   scene-routing · animation-plan-builder           │   │
│  │  • voice/         elevenlabs.ts + voice-presets                    │   │
│  │  • usage/         log (two-phase ApiCall) · cost-attribution ·     │   │
│  │                   credits · spend-cap · rate-limit · pricing       │   │
│  │  • providers/     balance.ts (live) · balance-snapshot.ts (cached) │   │
│  │  • storage/       index (auto) · r2 (prod) · local (dev) ·         │   │
│  │                   read-public-asset (disk-then-HTTP)               │   │
│  │  • auth/          sync-user · admin-api · user-cache               │   │
│  └────────────────────────┬───────────────────────────────────────────┘   │
└───────────────────────────┼────────────────────────────────────────────────┘
                            │ enqueue render
                            ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  REDIS QUEUE (Redis Cloud · `REDIS_URL`)                                    │
│  `apps/web/lib/queue.ts`  ⇆  `apps/worker/src/queue.ts`                     │
│  Queues:  render  ·  maintenance (kling-sweep)                              │
└────────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  WORKER (Railway · Docker · Node 20 + apt ffmpeg)                           │
│  `apps/worker/src/index.ts`                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  BullMQ Worker  (concurrency: env.workerConcurrency)                 │ │
│  │  → `processors/render-processor.ts`  (8-status state machine)         │ │
│  │     stage 1 — extract assets (per-scene clip + voice + caption JSON)  │ │
│  │     stage 2 — choose music + build ASS captions (`packages/shared`)  │ │
│  │     stage 3a — per-clip ffmpeg normalize (libx264 main/3.1, aac 44.1k)│ │
│  │     stage 3b — concat-demuxer with `-c copy`                          │ │
│  │     stage 3c — overlay (captions + music)  → MP4                      │ │
│  │     stage 4 — upload final MP4 to R2                                  │ │
│  │  → `processors/kling-sweep.ts`  (hourly stuck-task sweep)              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │
                ┌──────────────────┼──────────────────────┐
                ▼                  ▼                      ▼
┌──────────────────┐  ┌──────────────────────┐  ┌────────────────────────────┐
│ Postgres /        │  │ Cloudflare R2         │  │  External providers        │
│ Supabase Pooler   │  │ (`CLOUDFLARE_R2_*`)   │  │  OpenAI · ElevenLabs ·     │
│ ap-south-1 (Mumbai)│  │ via `lib/storage`     │  │  Anthropic · Gemini · xAI · │
│ `prisma/schema`   │  │ `r2.ts` (S3-compat)   │  │  Kling · PixVerse           │
└──────────────────┘  └──────────────────────┘  └────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Next.js root layout | Font loading (Heebo + Geist), `dir="he"`, theme provider | `apps/web/app/layout.tsx` |
| Dashboard layout | Sidebar, Topbar, density scope, auth gate | `apps/web/app/(dashboard)/layout.tsx` |
| Project layout | Persistent `<ProjectFlowToggles>` (captions + music) on every wizard step | `apps/web/app/(dashboard)/projects/[id]/layout.tsx` |
| Admin layout | `data-density="dense"` Vercel-mode + `requireAdmin()` gate | `apps/web/app/(admin)/layout.tsx` |
| Scraper | URL → normalized product (cheerio + JSON-LD + OG + Shopify + microdata) | `apps/web/lib/scraper/index.ts` |
| Product intelligence | Dossier + visual analysis + audience inference (LLM/vision) | `apps/web/lib/product-intelligence/index.ts` |
| Script engine (legacy) | 6 frameworks in parallel, structured-output JSON | `apps/web/lib/llm/scripts.ts` |
| Script engine (concept-first) | 2-phase: 6 lightweight cards → expand selected (V27.11) | `apps/web/lib/llm/concept-engine.ts` |
| OpenAI Responses client | Cached system instruction + structured output | `apps/web/lib/llm/openai-script-client.ts` |
| Anthropic / Gemini clients | Alt LLM providers behind `LLM_SCRIPT_PROVIDER` flag | `apps/web/lib/llm/anthropic-script-client.ts`, `apps/web/lib/llm/gemini-client.ts` |
| Image brief builder | Deterministic prompt assembly (no LLM) | `apps/web/lib/image-briefs/image-brief-builder.ts` |
| Image generator | gpt-image-2 medium 1024×1792 | `apps/web/lib/llm/scene-images.ts` |
| Voice generator | ElevenLabs `eleven_v3` with-timestamps | `apps/web/lib/voice/elevenlabs.ts` |
| Animation plan builder | Typed `AnimationPlan` for clip prompt | `apps/web/lib/animation/animation-plan-builder.ts` |
| Kling i2v provider | Image-to-video via Kling Omni v3 | `apps/web/lib/animation/kling.ts` |
| Grok i2v provider | Per-scene xAI alternative to Kling | `apps/web/lib/animation/grok-imagine.ts` |
| Face gate | gpt-4o-mini vision pre-PixVerse | `apps/web/lib/animation/face-gate.ts` |
| PixVerse lipsync | Mouth-sync of silent clip + voice MP3 | `apps/web/lib/animation/lipsync/pixverse.ts` |
| Mux helper | ffmpeg-static download/cache + silent-clip mux | `apps/web/lib/scenes/mux-audio.ts` |
| Scene actions impl | `clip-impl.ts` · `voice-impl.ts` · `generate-impl.ts` | `apps/web/lib/scenes/` |
| Two-phase ApiCall logger | `recordApiCallStart` / `finish` | `apps/web/lib/usage/log.ts` |
| Cost attribution | Per-provider attribute helpers (no balance-delta) | `apps/web/lib/usage/cost-attribution.ts` |
| Storage abstraction | Auto-selects R2 vs local on `CLOUDFLARE_R2_BUCKET_NAME` | `apps/web/lib/storage/index.ts` |
| Public-asset reader | Disk-first → HTTP fallback for Vercel | `apps/web/lib/storage/read-public-asset.ts` |
| Queue producer | Web-side BullMQ `Queue` + ioredis | `apps/web/lib/queue.ts` |
| Render worker entry | Spins up render + maintenance Workers | `apps/worker/src/index.ts` |
| Render processor | 8-status state machine, ffmpeg compose, R2 upload | `apps/worker/src/processors/render-processor.ts` |
| ffmpeg composer | 3-stage low-mem pipeline (normalize → concat → overlay) + `probeDurationSeconds` | `apps/worker/src/providers/composition/ffmpeg.ts` |
| Kling sweep | Hourly stuck-task reconciliation | `apps/worker/src/processors/kling-sweep.ts` |
| Captions package | Chunker (2–5 words) + ASS v4+ builder + 5 presets | `packages/shared/src/captions/` |
| Music package | 17-track Mixkit catalog + mood scorer | `packages/shared/src/music/` |
| Prompts package | `script-system-prompt.ts` (V6) · `script-json-schema.ts` · `scene-image-prompts.ts` · `scene-safety.ts` · `concept-system-prompt.ts` · `concept-cards-schema.ts` | `packages/prompts/src/` |

## Pattern Overview

**Overall:** monorepo with serverless web + dockerized worker + shared TypeScript packages, glued by a Redis queue and Postgres. Pipeline-style domain (URL → 7-stage AI/ffmpeg chain) with deterministic brief-builders flanking LLM calls.

**Key Characteristics:**
- **npm workspaces** monorepo (`apps/*`, `packages/*`) with `"main": "./src/index.ts"` on shared packages — workspace consumers import raw `.ts` files (no build step), which is why `tsx` is mandatory at runtime in the worker.
- **Region pinning**: `vercel.json` pins to `bom1` (Mumbai) so functions co-locate with Supabase `ap-south-1`. Cross-region would add ~250ms per Prisma query.
- **Two execution surfaces**: Vercel serverless (web + paid AI calls) and Railway long-running container (BullMQ worker + ffmpeg). Both share the same `.env` at repo root.
- **Storage abstraction is environment-driven**: `getStorage()` in `lib/storage/index.ts` lazily imports `R2Storage` if `CLOUDFLARE_R2_BUCKET_NAME` is set, else `LocalStorage`. No code branches on `NODE_ENV`.
- **Two-phase ApiCall logging**: every paid provider call writes a row at submit (`status="in_progress"`) and updates it on completion (`success` / `failed`). Powers live `/admin/costs` dashboard.
- **In-flight timestamps on `Scene`**: `imageInFlightAt` / `voiceInFlightAt` / `clipInFlightAt` block double-submit and survive page refreshes.
- **Deterministic side-rails around LLM calls**: image briefs, scene routing, animation plans, Israeli realism cues, locked outfits, scene-variation ledgers — all pure functions with no LLM dependency. The LLM is sandboxed to a strict JSON schema.

## Layers

**Presentation (App Router pages):**
- Purpose: Server-rendered Hebrew RTL UI; one page per wizard step
- Location: `apps/web/app/{(auth),(dashboard),(admin)}/`
- Contains: `page.tsx` (Server Component) + `actions.ts` (`'use server'`) + `client-bits.tsx` islands
- Depends on: `lib/auth`, `lib/db`, every domain lib for data
- Used by: end-user browser, admin browser

**API routes (`apps/web/app/api/`):**
- Purpose: REST endpoints for client-side fetches (parallel scene actions, render polling, voice preview, admin dashboard polls)
- Pattern: each handler resolves `getOrCreateAppUser()`, enforces ownership, then defers to `lib/scenes/*-impl.ts`
- Admin sub-tree gated through `requireAdminApi()` from `lib/auth/admin-api.ts`

**Server Actions:**
- Purpose: Mutation entry points for forms in the wizard (script generation, scene regen, render kickoff, project flow toggles)
- Pattern: `'use server'` per file; `actions.ts` next to the page that uses it; pages export `maxDuration = 120` when an action may exceed 60s

**Pipeline libraries (`apps/web/lib/`):**
- Purpose: Provider-agnostic domain logic — orchestrates external services + DB + storage
- Convention: `lib/scenes/*-impl.ts` are the single owner of a scene-stage transition; both API routes and Server Actions delegate to them
- Sub-libs: `animation`, `image-briefs`, `llm`, `product-intelligence`, `scenes`, `scraper`, `storage`, `usage`, `voice`, `providers`, `pricing`, `auth`, `scene-planning`, `avatars`

**Shared packages (`packages/`):**
- `@ugc-video/shared`: types, schemas (zod), captions toolkit, music catalog
- `@ugc-video/prompts`: prompt strings, JSON schemas, scene safety rewriter
- Both consumed by web AND worker; export raw `.ts`

**Worker (`apps/worker/src/`):**
- Purpose: Heavy compute (ffmpeg) + reconciliation sweeps. Cannot run on Vercel (no ffmpeg, 60s ceiling, no shared FS)
- Two BullMQ Workers in one process: render queue + maintenance queue (concurrency 1)

**Persistence:**
- Postgres via Prisma 6 (Supabase pooler `aws-1-ap-south-1`, port 6543 for app, port 5432 for migrations)
- Redis Cloud free tier for BullMQ queues (`REDIS_URL`)
- Cloudflare R2 (S3-compatible) for static + generated assets

## Data Flow

### Primary Request Path — full wizard run

1. **Wizard step 1: New project** (`apps/web/app/(dashboard)/projects/new/page.tsx`) → user submits product URL
2. **Server Action `createProjectAction`** (`apps/web/app/(dashboard)/projects/new/actions.ts`) calls `POST /api/products/extract` (`apps/web/app/api/products/extract/route.ts`)
3. **Scrape** → `scrapeProduct()` (`apps/web/lib/scraper/index.ts`) returns normalized product JSON
4. **Product Intelligence** → `runProductIntelligence()` (`apps/web/lib/product-intelligence/index.ts`) → dossier + visual + audience inference (logs ApiCalls)
5. **Wizard step 2: Avatar pick** (`apps/web/app/(dashboard)/projects/[id]/avatar/page.tsx`) → reads `apps/web/lib/avatars/catalog.ts` (25-portrait R2 catalog)
6. **Wizard step 3: Scripts** (`apps/web/app/(dashboard)/projects/[id]/scripts/page.tsx`) → branches on `resolveScriptEngineMode()`:
   - `legacy_full_batch` → `generateScriptsBatch()` in `apps/web/lib/llm/scripts.ts` (6× parallel via OpenAI Responses API)
   - `concept_interactive` → `<ConceptFlow>` UI calls `concept-actions.ts` → `apps/web/lib/llm/concept-engine.ts`
7. **User picks one script** → `selectedScriptId` written to `Project`; ContinueButton wraps `router.push('/scenes')` in `document.startViewTransition`
8. **Wizard step 4: Scenes** (`apps/web/app/(dashboard)/projects/[id]/scenes/page.tsx`) — per scene:
   - `POST /api/scenes/[id]/generate` → `apps/web/lib/scenes/generate-impl.ts` → `buildImageBrief()` → `gpt-image-2` → `getStorage().putBytes()` → DB
   - `POST /api/scenes/[id]/voice` → `apps/web/lib/scenes/voice-impl.ts` → ElevenLabs with-timestamps → `chunkCaptions()` → DB
   - `POST /api/scenes/[id]/clip` → `apps/web/lib/scenes/clip-impl.ts`:
     - Motion analysis (cached on `clipMotionImageUrl`) — `apps/web/lib/animation/motion-analysis.ts`
     - Animation plan — `apps/web/lib/animation/animation-plan-builder.ts`
     - Provider switch on `Scene.clipProvider`: Kling (`kling.ts`) or Grok (`grok-imagine.ts`)
     - Face gate (`face-gate.ts`) → if mouth visible AND `requiresLipSync` → PixVerse (`lipsync/pixverse.ts`); else `muxAudio()` mux silent clip + voice MP3 (`scenes/mux-audio.ts`)
9. **Wizard step 7: Videos / final render** (`apps/web/app/(dashboard)/projects/[id]/videos/page.tsx`) → `POST /api/projects/[id]/render`:
   - Inserts `RenderJob` (status `pending`)
   - `renderQueue.add('render-job', { renderJobId })` (`apps/web/lib/queue.ts`)
10. **Worker picks up job** (`apps/worker/src/index.ts` → `processors/render-processor.ts`):
    - Stage 1 — extract scene assets (download clips + voice + per-scene caption JSON)
    - Stage 2 — choose music (`packages/shared/src/music/select-music.ts`) + build ASS captions (`packages/shared/src/captions/ass-builder.ts`)
    - Stage 3a — per-clip ffmpeg normalize in series (libx264 main/3.1, aac 44.1k 192k stereo, fps=30 cfr)
    - Stage 3b — `probeDurationSeconds` each normalized clip; concat-demuxer with `-c copy`
    - Stage 3c — optional overlay pass (captions burn-in + music mix)
    - Stage 4 — upload final MP4 via `getStorage().putBytes()` → R2
    - Update `RenderJob.status = completed`, `finalVideoUrl`
11. **Client polling** — `/api/render/[jobId]/status` + `/api/render/[jobId]/events` (SSE) drive the progress UI; both gate on `job.userId === dbUser.id`

### Secondary Flow — Admin live cost dashboard

1. `apps/web/app/(admin)/admin/costs/page.tsx` renders three client islands: `summary-kpis.tsx` (20s poll), `in-flight.tsx` (4s poll), `recent-calls.tsx` (8s poll)
2. Each calls `/api/admin/costs/{summary,in-flight,recent-calls,operation-stats,provider-balances}` — all gated by `requireAdminApi()`
3. Provider balances served from `apps/web/lib/providers/balance-snapshot.ts` (60s in-process cache + persist to `ProviderBalanceSnapshot`)
4. Live balance fetchers in `apps/web/lib/providers/balance.ts` (one per provider, soft-fail per-provider so an outage doesn't break the page)
5. Polling pauses on `document.visibilityState !== 'visible'`

### Tertiary Flow — Maintenance sweep

1. `ensureMaintenanceSchedules()` in `apps/worker/src/queue.ts` registers a recurring `kling_sweep` job at boot
2. Maintenance Worker (concurrency 1) calls `runKlingSweep()` (`apps/worker/src/processors/kling-sweep.ts`)
3. Reconciles stuck Kling tasks against the live API and updates `Scene` rows

**State Management:**
- Server-side: Postgres (Prisma) is canonical. `Project.productData` JSON holds wizard state (selected avatar, captions toggle, music toggle, intelligence dossier, locked outfit, pending concepts).
- Client-side: React 19 form state for action submissions; `router.refresh()` after revalidation.
- Cross-step persistence: `revalidatePath` from Server Actions; client `router.refresh()` triggers re-fetch of the new shape.

## Key Abstractions

**`StorageProvider`** (`apps/web/lib/storage/index.ts`):
- Purpose: pluggable backend for binary uploads
- Implementations: `R2Storage` (`r2.ts`, S3 SDK to Cloudflare R2), `LocalStorage` (`local.ts`, writes to `apps/web/public/uploads/`)
- Selection: `getStorage()` lazy-imports based on `process.env.CLOUDFLARE_R2_BUCKET_NAME`, caches the instance for the lifetime of the process
- Sister helper: `readPublicAsset()` / `readPublicAssetAsDataUrl()` in `read-public-asset.ts` — disk-first then HTTP fallback to `PUBLIC_BASE_URL` (Vercel CDN), used because `public/` is excluded from the Vercel function bundle

**`VideoGenerationProvider`** (`apps/web/lib/animation/types.ts`):
- Purpose: vendor-agnostic interface for image-to-video and lipsync
- Implementations: `kling.ts` (Kling Omni v3), `grok-imagine.ts` (xAI Grok Imagine), `lipsync/pixverse.ts`
- Pattern: submit → poll → download bytes; provider-specific field names (`task_id`, `task_status`, `image_list`) stay inside adapters
- Caller: `apps/web/lib/scenes/clip-impl.ts` reads `Scene.clipProvider` to pick the engine; lipsync scenes are pinned to Kling because PixVerse is only validated against Kling output

**`SceneStatus`** (`apps/web/lib/scenes/scene-status.ts`):
- Purpose: state-machine vocabulary for `Scene.status`
- 11 canonical states (string column, not Prisma enum, per house style): `pending → planning → brief_built → generating_image → image_ready → generating_voice → voice_ready → generating_clip → clip_ready`; plus terminal `failed` and `needs_review`
- Helpers: `isSceneStatus`, `isTerminalSceneStatus`, `isInFlightSceneStatus`, `SCENE_STATUS_DEFAULT`

**`RenderJobStatus`** (Prisma enum, `prisma/schema.prisma`):
- 9 states: `pending → extracting_assets → generating_voice → generating_avatar_video → generating_broll → composing_video → uploading_final → completed`; plus terminal `failed`, `cancelled`
- Owned by the worker `processors/render-processor.ts`; web only reads + sets `pending` at enqueue

**`AnimationPlan`** (`apps/web/lib/animation/animation-plan-builder.ts`):
- Purpose: typed deterministic plan that turns scene metadata into Kling/Grok prompts
- Fields: `motionSubject`, `cameraMotion` (enum), `objectMotion`, `humanMotion`, `forbiddenMotion[]`, `preserveProductVisibility`, `avoidFaceZoom`, `speakingExpected`
- Rendered by `buildKlingPromptFromPlan()` into `{ positive, negative }`

**`ImageBrief`** (`apps/web/lib/image-briefs/image-brief-builder.ts`):
- Purpose: deterministic prompt assembly with no LLM dependency
- Composes: avatar describe → product reference lock → Israeli realism cues → frame technique snippets (V14 PR2) → comparison guard (V27.11.PR1) → contact-proof rule → scroll-stopper levers (V14 PR4)
- Returns: `finalImagePrompt` + telemetry fields (`comparisonGuardApplied`, `frameTechniqueSnippetIds`, `scrollStopperApplied`, `variationDiversity`)

**`recordApiCallStart` / `recordApiCallFinish`** (`apps/web/lib/usage/log.ts`):
- Two-phase logging pattern: insert row before provider submit (`status="in_progress"`), update on completion. Powers live `/admin/costs` view of in-flight calls.
- Companion: `attributeXxxCost` family in `apps/web/lib/usage/cost-attribution.ts` — provider-reported usage preferred, configured constants as fallback. **Balance-delta attribution is forbidden**; `FORBIDDEN_balanceDeltaAttribution()` throws.

**`SceneVariationLedger`** (`apps/web/lib/image-briefs/scene-variation-ledger.ts`):
- In-memory deterministic ledger across sibling scenes; tracks distinct values for `cameraFocus` / `sceneGenerationType` / `primarySubject` etc.
- Surface: admin diagnostic page (`/admin/projects/[id]/diagnostic`) renders diversity grid + low-diversity warning

**`ProviderBalanceSnapshot`** (Prisma model + `apps/web/lib/providers/balance-snapshot.ts`):
- Wraps the live fetchers in `balance.ts` with 60s in-process cache + per-provider soft-fail + persist-to-DB
- Observability + reconciliation only — explicitly NOT used for per-call cost attribution

## Entry Points

**HTTP — public:**
- `POST /api/products/extract` — scrape + Product Intelligence
- `GET/PATCH /api/scenes/[id]` — scene CRUD
- `POST /api/scenes/[id]/{generate,voice,clip,lipsync-only,regen-prompt}` — per-stage scene mutations
- `POST /api/projects/[id]/render` — enqueue final render
- `GET /api/render/[jobId]/{status,events}` — render polling + SSE stream (ownership-gated)
- `GET /api/voice/sample/[voiceId]` — same-origin voice preview (R2 → disk → ElevenLabs synth)
- `GET /api/health` — health check
- `POST /api/demo/start` — demo mode entry (auth-gated as of V26.SEC)
- Auth callbacks: `apps/web/app/auth/{callback,signout}/route.ts`

**HTTP — admin:**
- `GET /api/admin/costs/{summary,in-flight,recent-calls,operation-stats,provider-balances}` — dashboard polling
- `GET/POST /api/admin/{scenes,projects,apicalls}/[id]/...` — drill-down + export
- All gated by `requireAdminApi()` returning JSON 401/403

**Server Actions** (each `actions.ts` is `'use server'`):
- `apps/web/app/(dashboard)/projects/new/actions.ts` — `createProjectAction`
- `apps/web/app/(dashboard)/projects/[id]/scripts/{actions,concept-actions}.ts` — script generation + concept-first 4-action set
- `apps/web/app/(dashboard)/projects/[id]/{avatar,features,scenes,voices,videos,finish}/actions.ts` — per-step mutations
- `apps/web/app/(dashboard)/projects/[id]/flow-toggle-actions.ts` — captions + music toggles, `revalidatePath`s the project layout
- `apps/web/app/(admin)/admin/{users,queue,renders,costs}/actions.ts` — admin mutations

**Worker:**
- `apps/worker/src/index.ts` boots two `Worker` instances (render + maintenance) on shared `ioredis` connection
- Render jobs come from `apps/web/lib/queue.ts → renderQueue.add('render-job', { renderJobId })` with three known producer call sites: `/api/projects/[id]/render`, `/api/demo/start`, and `/admin/renders/actions.ts`

## Architectural Constraints

- **Region pinning:** `vercel.json` `regions: ["bom1"]` is load-bearing. Supabase project is `ap-south-1` (Mumbai). Cross-region adds ~250ms per Prisma query.
- **Vercel filesystem is read-only between requests:** all generated MP4s / images / voice MP3s MUST go through `lib/storage/index.ts`. `apps/web/public/uploads/` is dev-only.
- **`public/` is excluded from the Vercel function bundle** (`next.config.mjs` `outputFileTracingExcludes`). Reads must use `readPublicAsset()` (disk-first → HTTP fallback). Direct `fs.readFile(process.cwd()/'public'/…)` is banned outside `lib/storage/local.ts` and `lib/storage/read-public-asset.ts`.
- **ffmpeg in the web app:** Vercel has no ffmpeg on PATH. Web invokes `FFMPEG_BIN`/`FFPROBE_BIN` from `lib/scenes/mux-audio.ts`, which lazily downloads ffmpeg-static to `/tmp/tachles-ffmpeg-static` on cold start (V13.1). Worker uses apt-installed ffmpeg.
- **`maxDuration` placement:** any page with a Server Action that may exceed 60s MUST `export const maxDuration = 120` from the page.tsx — Next.js rejects it in `'use server'` files.
- **Worker requires `tsx` at runtime:** workspace packages export `"main": "./src/index.ts"`. Pre-compiling does not remove the runtime requirement; the Dockerfile must invoke `tsx`.
- **Single shared `.env`** at repo root for both web and worker.
- **No mocks in active path:** mock provider files exist as templates but are never instantiated. The render/voice/clip path is all-real.
- **Concurrency on render queue:** capped via `WORKER_CONCURRENCY` env. Maintenance queue concurrency hard-pinned to 1.
- **Cross-cutting determinism:** prompt/brief builders are pure functions; parallel writers (e.g. lockedOutfit) produce byte-identical output, race-safe.

## Anti-Patterns

### Hardcoded `/uploads/...` or `process.cwd()/'public'/...` paths

**What happens:** Code writes to or reads from a filesystem path inside `apps/web/public/`.
**Why it's wrong:** Vercel serverless filesystem is read-only between requests; `public/` is excluded from the function bundle. The path resolves to `/var/task/apps/web/public/...` which doesn't exist on Vercel.
**Do this instead:** Always go through `getStorage()` from `apps/web/lib/storage/index.ts` for writes; through `readPublicAsset()` from `apps/web/lib/storage/read-public-asset.ts` for reads.

### `concat-filter` ffmpeg compose

**What happens:** A single ffmpeg invocation accepts N inputs and concats them via `-filter_complex concat=n=N`.
**Why it's wrong:** Mixed input codec params (different SAR, AAC profile, etc.) cause concat-demuxer corruption. The N parallel decoders + libass + amix in RAM caused Railway OOM-kills at frame ~75.
**Do this instead:** Use the existing 3-stage pipeline in `apps/worker/src/providers/composition/ffmpeg.ts` — stage 3a normalizes each input to byte-identical params, stage 3b `concat-demuxer + -c copy`, stage 3c overlay.

### Per-call cost from balance deltas

**What happens:** Code fetches provider balance before and after a paid call and uses the delta as `costUsd`.
**Why it's wrong:** Unsafe under concurrency (multiple in-flight calls bleed into each other), creates rate-limit pressure on provider balance APIs, makes tests non-deterministic. There's a deliberately-throwing `FORBIDDEN_balanceDeltaAttribution()` in `apps/web/lib/usage/cost-attribution.ts`.
**Do this instead:** Use `attribute<Provider>Cost(...)` from `apps/web/lib/usage/cost-attribution.ts` — prefers provider-reported usage (tokens/chars/credits) with configured constants as fallback.

### `export const maxDuration` in `'use server'` actions.ts

**What happens:** A long-running Server Action declares `maxDuration` in its own file.
**Why it's wrong:** Next.js rejects it; Vercel kills the function at 60s and the client hangs in pending forever.
**Do this instead:** Put `export const maxDuration = 120` in the **page.tsx** that renders the form calling that action.

### Skipping in-flight timestamps on a new generation action

**What happens:** A new scene-stage action calls a paid provider directly without setting `imageInFlightAt`/`voiceInFlightAt`/`clipInFlightAt` first.
**Why it's wrong:** Double-clicks fan out into duplicate provider calls. Page refresh shows no spinner because `useActionState`'s pending flag is in-memory only.
**Do this instead:** Always set the in-flight timestamp before the provider call and clear it on success or terminal failure (see `apps/web/lib/scenes/clip-impl.ts` for the canonical pattern).

### Adding a new Prisma enum for an evolving domain

**What happens:** New script framework / scene goal / scene generation type added as a Prisma `enum`.
**Why it's wrong:** Forces a DB migration on every vocabulary tweak; older `Script.rawJson` values fail to load.
**Do this instead:** Use `String?` columns and keep the canonical vocabulary in a TypeScript const tuple (see `framework`, `sceneGoal`, `sceneGenerationType`, `Scene.status` via `apps/web/lib/scenes/scene-status.ts`).

### Logging an ApiCall only on success

**What happens:** `recordApiCall(...)` runs only inside the success branch.
**Why it's wrong:** `/admin/costs` shows phantom-clean usage; failed calls become invisible; in-flight calls don't appear at all.
**Do this instead:** Use the two-phase pattern — `recordApiCallStart` before submit, `recordApiCallFinish` (success or failure) after. See `apps/web/lib/usage/log.ts`.

### Reaching into `prisma.providerBalanceSnapshot.create*` directly

**What happens:** A new dashboard widget or sweep job creates `ProviderBalanceSnapshot` rows itself.
**Why it's wrong:** Bypasses the 60s cache + soft-fail in `apps/web/lib/providers/balance-snapshot.ts`. Hammers provider balance APIs and hits 429s.
**Do this instead:** Always go through `lib/providers/balance-snapshot.ts`.

## Error Handling

**Strategy:** layered — provider call errors are caught at the `lib/scenes/*-impl.ts` level, mapped to a curated `<stage>.<reason>` code (`apps/web/lib/errors/scene-error-messages.ts`), persisted to `Scene.lastErrorCode` + `lastErrorMessage`, and rendered to the user as Hebrew via `getSceneErrorMessage()`.

**Patterns:**
- Two-phase ApiCall logging means failed provider calls are persisted with `status="failed"` + `errorMessage` for forensics
- `withRetry()` wrapper (`apps/web/lib/utils/retry.ts`) on submit/one-shot calls in 9 provider clients (default predicate: network errors + HTTP 408/429/500/502/503/504; `maxAttempts=2`, `earlyFailWindowMs=15000`). Polling loops not wrapped — each tick is the implicit retry.
- `safeFetch` in scraper enforces `redirect: 'manual'` with explicit re-validation against `isPrivateOrLocalHost()` to block SSRF (V26.SEC).
- Per-scene log buffer: `Scene.generationLogJson` capped at 200 entries via `flushSceneLogBuffer()`.

## Cross-Cutting Concerns

**Logging:** stage-tagged logger `apps/web/lib/logging/log.ts` with `logStage(stage, scope)` + `.span(label, fn)`. `LOG_LEVEL` env filter; sensitive-data masking. Every Prisma query is logged with duration via `lib/db.ts`; `[SLOW QUERY]` tag for >500ms.

**Performance instrumentation:** wrap async ops with `timed('label', fn)` from `apps/web/lib/timing.ts` — emits `[TIMING]` / `[SLOW]` tags greppable in Vercel logs.

**Validation:** zod schemas in `packages/shared/src/schemas/`. LLM structured-output schemas in `packages/prompts/src/script-json-schema.ts` + `concept-cards-schema.ts`.

**Authentication:** Supabase Auth via `@supabase/ssr`. `apps/web/lib/auth/sync-user.ts → getOrCreateAppUser()` is the single source of truth for the app-side `User` row. `requireAdmin()` for pages (redirects), `requireAdminApi()` for routes (JSON 403). `ADMIN_EMAILS` env auto-promotes.

**Authorization:** every paid Server Action / API route filters by `userId: dbUser.id`. `RenderJob` ownership enforced at `/api/render/[jobId]/{status,events}` (V26.SEC).

**Caching:**
- Per-scene motion analysis cached on `clipMotionImageUrl` (skips Kling i2v re-run on lipsync-only retries)
- Face gate cached on `faceGateImageUrl`
- Provider balance snapshots cached 60s in-process via `balance-snapshot.ts`
- Recent-calls API server-cached 15s; operation-stats 30s
- Voice samples: R2 → local disk → ElevenLabs synth (cache back to both)

**View Transitions:** all 4 wizard hops (`/scripts → /scenes → /voices → /videos`) wrap navigation in `document.startViewTransition` (browser-native API). `WizardProgressStrip` declares `view-transition-name: --vt-wizard-progress-strip` so it persists across navigation.

---

*Architecture analysis: 2026-05-03*
