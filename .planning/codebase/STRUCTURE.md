# Codebase Structure

**Analysis Date:** 2026-05-03

## Directory Layout

```
ugc-video-platform/
├── apps/
│   ├── web/                              # Next.js 15 web app (deployed to Vercel · region bom1)
│   │   ├── app/                          # App Router (Server Components + Server Actions + API)
│   │   │   ├── (admin)/                  # Admin route group — `data-density="dense"` Vercel-mode
│   │   │   │   ├── layout.tsx            # `requireAdmin()` gate; AdminSidebar
│   │   │   │   └── admin/
│   │   │   │       ├── page.tsx          # Admin overview
│   │   │   │       ├── apicalls/         # API-call drill-down + per-id detail
│   │   │   │       │   ├── page.tsx
│   │   │   │       │   └── [id]/page.tsx
│   │   │   │       ├── costs/            # Live cost dashboard (3 polling islands)
│   │   │   │       │   ├── page.tsx
│   │   │   │       │   ├── actions.ts
│   │   │   │       │   ├── summary-kpis.tsx     # 20s poll
│   │   │   │       │   ├── in-flight.tsx        # 4s poll
│   │   │   │       │   └── recent-calls.tsx     # 8s poll
│   │   │   │       ├── projects/
│   │   │   │       │   ├── page.tsx
│   │   │   │       │   └── [id]/{debug,diagnostic}/   # variation ledger + raw JSON
│   │   │   │       ├── queue/            # BullMQ inspector + actions
│   │   │   │       ├── renders/          # Render-job admin
│   │   │   │       ├── scenes/[id]/{compare,debug}/   # Scene forensics
│   │   │   │       └── users/            # User mgmt + plan/credits/spend-cap
│   │   │   │
│   │   │   ├── (auth)/                   # Login + register
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── login/{actions.ts,page.tsx}
│   │   │   │   └── register/{actions.ts,page.tsx}
│   │   │   │
│   │   │   ├── (dashboard)/              # Authenticated app surface
│   │   │   │   ├── layout.tsx            # Sidebar + Topbar + flow toggles wrapper
│   │   │   │   ├── dashboard/{page.tsx,actions.ts,delete-button.tsx}
│   │   │   │   ├── library/page.tsx      # Showcase / Krea-mode
│   │   │   │   ├── pricing/{page.tsx,actions.ts,client-bits.tsx}
│   │   │   │   ├── settings/page.tsx
│   │   │   │   ├── dev/                  # Dev-only utilities
│   │   │   │   └── projects/
│   │   │   │       ├── new/{page.tsx,actions.ts}                # Wizard step 1
│   │   │   │       └── [id]/
│   │   │   │           ├── layout.tsx                            # Persistent <ProjectFlowToggles>
│   │   │   │           ├── page.tsx                              # Project overview
│   │   │   │           ├── flow-toggle-actions.ts                # Captions + music toggles
│   │   │   │           ├── flow-toggles.tsx                      # Toggle bar UI
│   │   │   │           ├── edit/page.tsx
│   │   │   │           ├── features/{page.tsx,actions.ts,client-bits.tsx}    # Step 2 prep
│   │   │   │           ├── avatar/{page.tsx,actions.ts,client-bits.tsx}      # Wizard step 2
│   │   │   │           ├── scripts/                              # Wizard step 3
│   │   │   │           │   ├── page.tsx                          # Branches on engine mode
│   │   │   │           │   ├── actions.ts                        # Legacy 6-batch generation
│   │   │   │           │   ├── client-bits.tsx
│   │   │   │           │   ├── streaming-scripts-grid.tsx        # Legacy mode UI
│   │   │   │           │   ├── concept-actions.ts                # 4 concept-first actions
│   │   │   │           │   ├── concept-card.tsx                  # ConceptCardView
│   │   │   │           │   ├── concept-flow.tsx                  # State machine UI
│   │   │   │           │   └── continue-button.tsx               # View Transition wrapper
│   │   │   │           ├── scenes/{page.tsx,actions.ts,client-bits.tsx}      # Wizard step 4
│   │   │   │           ├── voices/{page.tsx,actions.ts,client-bits.tsx}      # Wizard step 5
│   │   │   │           ├── videos/                                            # Wizard step 6 (final render)
│   │   │   │           │   ├── page.tsx
│   │   │   │           │   ├── actions.ts
│   │   │   │           │   ├── client-bits.tsx
│   │   │   │           │   ├── voice-picker.tsx
│   │   │   │           │   ├── music-picker.tsx
│   │   │   │           │   └── music-picker-actions.ts
│   │   │   │           └── finish/page.tsx                       # Wizard step 7 (download)
│   │   │   │
│   │   │   ├── api/                      # REST endpoints (Route Handlers)
│   │   │   │   ├── admin/
│   │   │   │   │   ├── apicalls/{export/route.ts,[id]/{export/,route.ts}}
│   │   │   │   │   ├── costs/{summary,in-flight,recent-calls,operation-stats,provider-balances}/route.ts
│   │   │   │   │   ├── diag/anthropic/route.ts
│   │   │   │   │   ├── projects/[id]/{export,route}.ts
│   │   │   │   │   └── scenes/[id]/{animate-compare,export,route}.ts
│   │   │   │   ├── demo/start/route.ts
│   │   │   │   ├── health/route.ts
│   │   │   │   ├── products/{extract,upload-image}/route.ts
│   │   │   │   ├── projects/[id]/{features/{suggest,route}.ts,scripts/{list/,route}.ts,render/route.ts,voice/route.ts}
│   │   │   │   ├── scenes/[id]/{generate,voice,clip,lipsync-only,regen-prompt}/route.ts
│   │   │   │   ├── scenes/[id]/route.ts                          # GET/PATCH
│   │   │   │   ├── render/[jobId]/{status,events}/route.ts       # Status + SSE
│   │   │   │   └── voice/sample/[voiceId]/route.ts               # Same-origin voice preview
│   │   │   │
│   │   │   ├── auth/                     # Supabase auth callbacks
│   │   │   │   ├── callback/route.ts
│   │   │   │   └── signout/route.ts
│   │   │   │
│   │   │   ├── globals.css               # V27 Tri-Modal Liquid tokens
│   │   │   ├── landing-hero.tsx          # Public landing
│   │   │   ├── layout.tsx                # Root: Heebo + Geist + theme provider, dir="he"
│   │   │   └── page.tsx                  # Public landing page
│   │   │
│   │   ├── components/                   # Shared UI (no business logic)
│   │   │   ├── admin/debug-helpers.tsx
│   │   │   ├── brand/                    # Logo + brand-mark
│   │   │   ├── command-palette.tsx       # cmdk-based palette
│   │   │   ├── density/density-scope.tsx # `<DensityScope>` wrapper
│   │   │   ├── layout/                   # admin-sidebar / sidebar / topbar / mobile-nav / dashboard-aurora
│   │   │   ├── theme/                    # next-themes provider
│   │   │   ├── ui/                       # shadcn primitives + tachles additions
│   │   │   │   ├── ai-thinking.tsx · audio-preview.tsx · video-preview.tsx
│   │   │   │   ├── badge.tsx · button.tsx · card.tsx · table.tsx · switch.tsx
│   │   │   │   ├── input.tsx · label.tsx · textarea.tsx
│   │   │   │   ├── elapsed-timer.tsx · loading-card.tsx · progress-bar.tsx
│   │   │   │   └── section-kicker.tsx
│   │   │   └── wizard/
│   │   │       ├── project-hero.tsx · stepper.tsx · wizard-progress-strip.tsx
│   │   │       ├── scene-card-status-badge.tsx · scene-error-details.tsx
│   │   │       ├── scene-log-viewer.tsx · wizard-warnings-panel.tsx
│   │   │
│   │   ├── lib/                          # Business logic, no React
│   │   │   ├── admin/{export-report,queue-stats}.ts
│   │   │   ├── animation/                # Clip pipeline
│   │   │   │   ├── animation-plan-builder.ts   # Typed AnimationPlan
│   │   │   │   ├── face-gate.ts                # Pre-PixVerse vision gate
│   │   │   │   ├── grok-imagine.ts             # xAI i2v provider
│   │   │   │   ├── kling.ts                    # Kling Omni v3 provider
│   │   │   │   ├── lipsync/
│   │   │   │   │   ├── pixverse.ts             # PixVerse adapter
│   │   │   │   │   ├── types.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── motion-analysis.ts          # gpt-4o-mini vision (cached)
│   │   │   │   ├── public-url.ts               # Resolves PUBLIC_BASE_URL
│   │   │   │   ├── scene-routing.ts            # deriveSceneRouting heuristic
│   │   │   │   └── types.ts                    # VideoGenerationProvider interface
│   │   │   ├── auth/{admin-api,sync-user,user-cache}.ts
│   │   │   ├── avatars/{catalog,environment-register,outfit}.ts   # 25-portrait R2 catalog
│   │   │   ├── captions/                       # (empty — moved into packages/shared/captions)
│   │   │   ├── categories/index.ts             # Product category taxonomy
│   │   │   ├── errors/scene-error-messages.ts  # Curated Hebrew error map
│   │   │   ├── image-briefs/
│   │   │   │   ├── image-brief-builder.ts          # Deterministic brief
│   │   │   │   ├── frame-technique-snippets.ts     # V14 PR2 snippets
│   │   │   │   └── scene-variation-ledger.ts       # V14 PR4 ledger
│   │   │   ├── llm/
│   │   │   │   ├── scripts.ts                      # Legacy 6-batch
│   │   │   │   ├── scene-images.ts                 # gpt-image-2 wrapper
│   │   │   │   ├── concept-engine.ts               # V27.11.PR5 2-phase
│   │   │   │   ├── concept-storage.ts              # pendingConcepts JSON helpers
│   │   │   │   ├── openai-script-client.ts         # Responses API
│   │   │   │   ├── anthropic-script-client.ts
│   │   │   │   ├── gemini-client.ts
│   │   │   │   └── openai-models.ts
│   │   │   ├── logging/log.ts                  # logStage + .span
│   │   │   ├── music/{music-library,select-music}.ts   # (mirrors packages/shared)
│   │   │   ├── pricing/provider-costs.ts       # USD + credit constants
│   │   │   ├── product-intelligence/
│   │   │   │   ├── index.ts                        # Orchestrator
│   │   │   │   ├── product-dossier.ts              # LLM dossier
│   │   │   │   ├── product-visual-analysis.ts      # Vision
│   │   │   │   ├── audience-inference.ts           # LLM
│   │   │   │   ├── source-hash.ts                  # Cache key
│   │   │   │   └── types.ts
│   │   │   ├── providers/{balance,balance-snapshot}.ts   # Live + cached
│   │   │   ├── scene-planning/
│   │   │   │   ├── israeli-realism-rules.ts        # 51 cues + 8 scene presets
│   │   │   │   └── scene-rules.ts                  # hands-physics + mirror-safety
│   │   │   ├── scenes/
│   │   │   │   ├── generate-impl.ts                # Image gen owner
│   │   │   │   ├── voice-impl.ts                   # Voice gen owner
│   │   │   │   ├── clip-impl.ts                    # Clip gen owner (Kling/Grok + lipsync)
│   │   │   │   ├── regen-prompt.ts                 # Prompt-only regen
│   │   │   │   ├── mux-audio.ts                    # ffmpeg-static download + silent-clip mux
│   │   │   │   └── scene-status.ts                 # State-machine vocabulary
│   │   │   ├── scraper/
│   │   │   │   ├── index.ts                        # Orchestrator
│   │   │   │   ├── fetch.ts                        # safeFetch (SSRF-hardened)
│   │   │   │   ├── cheerio-fallback.ts
│   │   │   │   ├── json-ld.ts · open-graph.ts · microdata.ts · shopify.ts
│   │   │   │   ├── normalize.ts · cta.ts · quick-suggest.ts
│   │   │   │   └── types.ts
│   │   │   ├── storage/
│   │   │   │   ├── index.ts                        # getStorage() auto-selector
│   │   │   │   ├── r2.ts                           # Cloudflare R2 (S3 SDK)
│   │   │   │   ├── local.ts                        # Dev: writes to public/uploads/
│   │   │   │   └── read-public-asset.ts            # Disk → HTTP fallback
│   │   │   ├── supabase/{client,server,middleware}.ts
│   │   │   ├── usage/
│   │   │   │   ├── log.ts                          # Two-phase ApiCall
│   │   │   │   ├── cost-attribution.ts             # Per-provider attribute helpers
│   │   │   │   ├── credits.ts                      # Charge + refund
│   │   │   │   ├── pricing.ts                      # MTok / character pricers
│   │   │   │   ├── rate-limit.ts
│   │   │   │   └── spend-cap.ts                    # Per-user daily cap
│   │   │   ├── utils/{retry,visibility}.ts         # withRetry helper
│   │   │   ├── view-transition/{router,transition-link.tsx}    # document.startViewTransition wrappers
│   │   │   ├── voice/{elevenlabs,voice-presets}.ts # 30 voices
│   │   │   ├── wizard/current-step.ts
│   │   │   ├── brand.ts                            # BRAND constants
│   │   │   ├── db.ts                               # Prisma client + slow-query log
│   │   │   ├── plans.ts                            # PLAN_CONFIGS + PER_OPERATION_CREDITS
│   │   │   ├── queue.ts                            # BullMQ producer (web side)
│   │   │   ├── timing.ts                           # timed() wrapper
│   │   │   ├── utils.ts                            # cn() + misc
│   │   │   └── video-mode.ts                       # 15s vs 30s constants
│   │   │
│   │   ├── public/                       # Dev-only static assets (also pushed to R2)
│   │   │   ├── avatars/                  # 25 PNG portraits
│   │   │   ├── voice-samples/            # 30 MP3 previews
│   │   │   ├── music/                    # 17 Mixkit tracks
│   │   │   └── uploads/                  # LocalStorage target (dev only)
│   │   │
│   │   ├── scripts/                      # Dev / migration / verification scripts (tsx)
│   │   │   ├── apply-v13-2-migration-prod.ts · apply-v13-migration-prod.ts
│   │   │   ├── debug-{clip,mux,script,voice}-state.ts
│   │   │   ├── demo-script-engine-v2.ts · test-script-engine-v2.ts
│   │   │   ├── generate-avatar-portraits.ts · generate-voice-samples.ts
│   │   │   ├── kling-balance.ts · pixverse-balance.ts · test-balances.ts
│   │   │   ├── recover-pixverse-clip.ts
│   │   │   ├── set-r2-cors.ts · upload-static-assets-to-r2.ts
│   │   │   ├── smoke-prod-pipeline.ts
│   │   │   ├── test-anticollage-pr1.ts · test-anticollage-pr4.ts
│   │   │   ├── test-concept-interactive-pr6.ts
│   │   │   ├── test-schema-trim-pr3.ts · test-script-perf-pr2.ts
│   │   │   ├── test-v13-{all,pr1..pr10}.ts
│   │   │   └── test-v14-{all,pr1..pr8}.ts
│   │   │
│   │   ├── next.config.mjs               # transpilePackages, outputFileTracingExcludes/Includes
│   │   ├── package.json                  # @ugc-video/web — Next 15 + React 19 + Prisma + AI SDKs
│   │   ├── tailwind.config.ts            # V27 Tri-Modal Liquid tokens
│   │   └── tsconfig.json
│   │
│   └── worker/                           # BullMQ render worker (Railway · Docker · Node 20)
│       ├── Dockerfile                    # Node 20 + apt ffmpeg
│       ├── railway.toml-companion        # No startCommand (Dockerfile CMD wins)
│       ├── package.json                  # @ugc-video/worker
│       ├── tsconfig.json                 # Node moduleResolution
│       └── src/
│           ├── index.ts                  # Boots render + maintenance Workers
│           ├── env.ts                    # Worker env loader (dotenv)
│           ├── db.ts                     # Worker Prisma client
│           ├── queue.ts                  # Queue defs + ensureMaintenanceSchedules
│           ├── processors/
│           │   ├── render-processor.ts   # 8-status state machine, 3-stage compose
│           │   └── kling-sweep.ts        # Hourly stuck-task reconciler
│           ├── providers/
│           │   ├── avatar/interface.ts   # Template (no instantiation)
│           │   ├── broll/interface.ts    # Template (no instantiation)
│           │   ├── tts/interface.ts      # Template (no instantiation)
│           │   └── composition/
│           │       ├── ffmpeg.ts         # 3-stage low-mem compose + probeDurationSeconds
│           │       └── interface.ts
│           └── scripts/test-render.ts    # Worker smoke test (`npm run test:render`)
│
├── packages/
│   ├── shared/                           # @ugc-video/shared — types, schemas, music, captions
│   │   ├── package.json                  # "main": "./src/index.ts" (raw .ts export)
│   │   └── src/
│   │       ├── index.ts                  # Barrel
│   │       ├── captions/                 # ASS v4+ pipeline
│   │       │   ├── types.ts · chunker.ts · ass-builder.ts · presets.ts (5 presets) · index.ts
│   │       ├── music/
│   │       │   ├── music-library.ts      # 17-track Mixkit catalog (R2 URLs hard-coded)
│   │       │   ├── select-music.ts       # Mood-aware scoring
│   │       │   └── index.ts
│   │       ├── schemas/                  # Zod schemas
│   │       │   ├── product.ts · render.ts · script.ts · index.ts
│   │       ├── types/
│   │       │   ├── product.ts · render.ts · script.ts · index.ts
│   │       └── utils/{env,index}.ts
│   │
│   └── prompts/                          # @ugc-video/prompts — prompt strings + LLM schemas
│       ├── package.json                  # "main": "./src/index.ts"
│       └── src/
│           ├── index.ts                  # Barrel
│           ├── script-system-prompt.ts   # V6 system prompt (REGISTER LOCK + 6 frameworks)
│           ├── script-json-schema.ts     # Structured-output schema (V27.11.PR3 trim, PR4 enums)
│           ├── concept-system-prompt.ts  # V27.11.PR5 light prompt
│           ├── concept-cards-schema.ts   # V27.11.PR6 12-field card schema
│           ├── scene-image-prompts.ts    # SINGLE_FRAME_RULE + avatar/product locks
│           └── scene-safety.ts           # 23 risky→safe rewrites + modesty tokens
│
├── prisma/
│   ├── schema.prisma                     # 9 models, 6 enums (Postgres)
│   └── migrations/                       # 21 migrations (Apr 27 – May 1, 2026)
│       ├── 20260427203409_init/
│       ├── 20260427211429_add_user_role/
│       ├── 20260427214136_add_selected_script/
│       ├── 20260427220929_add_scene_image_fields/
│       ├── 20260427223618_add_api_call/
│       ├── 20260428064408_v2_script_engine/
│       ├── 20260428094432_v3_voice_clip/
│       ├── 20260428114122_v3_clip_motion_cache/
│       ├── 20260428121521_v3_scene_routing/
│       ├── 20260428123942_v3_credit_transactions_spend_cap/
│       ├── 20260428133048_v3_in_flight_tracking/
│       ├── 20260428135520_v3_apicall_status/
│       ├── 20260428184954_v4_scene_product_metadata/
│       ├── 20260429071141_v6_plans_motion_cache/
│       ├── 20260429071151_v6_plans_motion_cache/
│       ├── 20260429095553_v7_pixverse_face_gate/
│       ├── 20260429164500_v10_scene_captions/
│       ├── 20260429170000_v11_image_qa/
│       ├── 20260430085802_v13_scene_state_log/
│       ├── 20260430120000_v13_2_costs_hardening/
│       ├── 20260501010000_v14_1c_scene_status_index/
│       └── migration_lock.toml
│
├── docs/                                 # Reference design docs (V14 era)
│   └── v14/                              # ISRAELI_VISUAL_REALISM · FRAME_PROMPT_TECHNIQUES · HEBREW_SCRIPT_CREATIVE_RULES
├── .design/design-language-v27/          # V27 design brief + tokens + tasks
├── .claude/                              # Project Claude context + skills
│   ├── CLAUDE.md                         # Tachles project context (~1200 lines)
│   └── skills/                           # design-system, design-systems, xai-video-api
├── .agents/skills/                       # Mirror of .claude/skills
├── .planning/                            # GSD workflow output (this file lives here)
│   ├── codebase/                         # ARCHITECTURE.md · STRUCTURE.md · etc
│   └── debug/                            # Audit logs
├── scripts/                              # Repo-root scripts (e.g. check-v27-legacy.sh)
├── package.json                          # Workspaces declaration
├── package-lock.json
├── tsconfig.base.json                    # Shared TS settings
├── vercel.json                           # framework + buildCommand + regions: ["bom1"]
├── railway.toml                          # Worker deploy (NO startCommand — Dockerfile CMD wins)
├── .vercelignore · .railwayignore · .gitignore · .mcp.json
├── .env / .env.example                   # Single shared env (web + worker)
├── README.md · STATUS.md · DEPLOYMENT.md · BUSINESS_MODEL.md
└── CLAUDE.md (../CLAUDE.md outside repo) # User-level project context
```

## Directory Purposes

**`apps/web/app/`:**
- Purpose: Next.js 15 App Router — pages, layouts, route handlers, Server Actions
- Contains: `page.tsx` (Server Component), `layout.tsx`, `actions.ts` (`'use server'`), `client-bits.tsx` (Client Component islands), `route.ts` (REST handlers)
- Key files: `apps/web/app/layout.tsx` (root: fonts + theme), `apps/web/app/(dashboard)/projects/[id]/layout.tsx` (project flow toggles)

**`apps/web/app/(dashboard)/projects/[id]/`:**
- Purpose: 7-step wizard for one project; one folder per step
- Contains:
  - `page.tsx` — Server-rendered step UI
  - `actions.ts` — `'use server'` mutations
  - `client-bits.tsx` — interactive islands
  - Step folders: `features/`, `avatar/`, `scripts/`, `scenes/`, `voices/`, `videos/`, `finish/`
- Key files: `flow-toggle-actions.ts` + `flow-toggles.tsx` (persistent captions/music bar)

**`apps/web/app/(admin)/admin/`:**
- Purpose: Admin dashboard (cost tracking, users, queue, renders, scenes drill-down)
- Contains: `costs/`, `users/`, `queue/`, `renders/`, `projects/[id]/{debug,diagnostic}/`, `scenes/[id]/{compare,debug}/`, `apicalls/`
- Key files: `apps/web/app/(admin)/layout.tsx` (`requireAdmin()` + dense Vercel-mode), `costs/page.tsx` + 3 polling islands

**`apps/web/app/api/`:**
- Purpose: REST endpoints (Route Handlers)
- Contains: scene actions (`scenes/[id]/{generate,voice,clip,...}/route.ts`), render polling/SSE, voice preview, admin JSON
- Key files: every admin endpoint starts with `requireAdminApi()`; render endpoints enforce `job.userId === dbUser.id`

**`apps/web/lib/animation/`:**
- Purpose: Image-to-video + lipsync provider integrations
- Contains: `kling.ts`, `grok-imagine.ts`, `face-gate.ts`, `motion-analysis.ts`, `lipsync/pixverse.ts`, `scene-routing.ts`, `animation-plan-builder.ts`
- Key files: `types.ts` (`VideoGenerationProvider` interface)

**`apps/web/lib/auth/`:**
- Purpose: User identity and authorization
- Contains: `sync-user.ts` (`getOrCreateAppUser` + `requireAdmin`), `admin-api.ts` (`requireAdminApi` JSON 403), `user-cache.ts`

**`apps/web/lib/image-briefs/`:**
- Purpose: Deterministic gpt-image-2 prompt assembly (no LLM)
- Contains: `image-brief-builder.ts` (orchestrator), `frame-technique-snippets.ts` (V14 PR2), `scene-variation-ledger.ts` (V14 PR4)

**`apps/web/lib/llm/`:**
- Purpose: LLM provider clients + script-engine orchestration
- Contains: `scripts.ts` (legacy 6-batch), `concept-engine.ts` (V27.11.PR5), `scene-images.ts`, `openai-script-client.ts`, `anthropic-script-client.ts`, `gemini-client.ts`, `concept-storage.ts`, `openai-models.ts`

**`apps/web/lib/product-intelligence/`:**
- Purpose: Product dossier + visual analysis + audience inference
- Contains: `index.ts`, `product-dossier.ts`, `product-visual-analysis.ts`, `audience-inference.ts`, `source-hash.ts`, `types.ts`

**`apps/web/lib/scenes/`:**
- Purpose: Scene-stage owners — single source of truth for image/voice/clip transitions
- Contains: `generate-impl.ts`, `voice-impl.ts`, `clip-impl.ts`, `regen-prompt.ts`, `mux-audio.ts`, `scene-status.ts`
- Naming: `*-impl.ts` suffix marks the canonical owner; both `/api/scenes/[id]/...` routes and Server Actions delegate here

**`apps/web/lib/scraper/`:**
- Purpose: URL → product JSON (cheerio + JSON-LD + OG + Shopify + microdata)
- Contains: `index.ts`, `fetch.ts` (SSRF-hardened `safeFetch`), `cheerio-fallback.ts`, `json-ld.ts`, `open-graph.ts`, `microdata.ts`, `shopify.ts`, `normalize.ts`, `cta.ts`, `quick-suggest.ts`, `types.ts`

**`apps/web/lib/storage/`:**
- Purpose: Pluggable binary storage (R2 prod / local dev)
- Contains: `index.ts` (`getStorage()` auto-selector), `r2.ts`, `local.ts`, `read-public-asset.ts`

**`apps/web/lib/usage/`:**
- Purpose: Per-call cost + credit + rate-limit + spend-cap accounting
- Contains: `log.ts` (two-phase ApiCall), `cost-attribution.ts`, `credits.ts`, `pricing.ts`, `rate-limit.ts`, `spend-cap.ts`

**`apps/web/lib/voice/`:**
- Purpose: ElevenLabs TTS + voice catalog
- Contains: `elevenlabs.ts`, `voice-presets.ts` (30 voices, R2 URLs hard-coded)

**`apps/web/lib/providers/`:**
- Purpose: Provider live balance + cached snapshot
- Contains: `balance.ts` (Kling, PixVerse, ElevenLabs, OpenAI, Gemini, xAI fetchers), `balance-snapshot.ts` (60s cache + soft-fail + persist)

**`apps/web/lib/pricing/`:**
- Purpose: Central USD + credit constants per operation
- Contains: `provider-costs.ts`

**`apps/web/scripts/`:**
- Purpose: One-off dev / migration / verification scripts (tsx-runnable)
- Naming convention: `test-{feature}-{prN}.ts` for verification; `debug-{thing}-state.ts` for state-dumpers; `apply-{name}-migration-prod.ts` for prod migrations; `upload-static-assets-to-r2.ts`, `set-r2-cors.ts` for asset operations
- Test runners: `test-v13-all.ts` + `test-v14-all.ts` (executed via `npm test`)

**`apps/worker/src/`:**
- Purpose: Long-running BullMQ render + maintenance worker
- Contains: `index.ts` (boot), `env.ts`, `db.ts`, `queue.ts`, `processors/`, `providers/`, `scripts/test-render.ts`

**`apps/worker/src/processors/`:**
- Purpose: BullMQ job handlers
- Contains: `render-processor.ts` (final video compose; 674 lines), `kling-sweep.ts` (hourly reconciler)

**`apps/worker/src/providers/composition/`:**
- Purpose: ffmpeg composition driver
- Contains: `ffmpeg.ts` (3-stage compose + `probeDurationSeconds`; 753 lines), `interface.ts`
- Sibling folders `avatar/`, `broll/`, `tts/` hold interface-only templates with no current consumer

**`packages/shared/src/`:**
- Purpose: Cross-app TypeScript code shared between web + worker
- Subtrees: `captions/` (chunker + ASS builder + presets), `music/` (catalog + selector), `schemas/` (zod), `types/`, `utils/`
- Key constraint: package exports raw `.ts` via `"main": "./src/index.ts"` — no build step

**`packages/prompts/src/`:**
- Purpose: LLM prompt strings + structured-output JSON schemas
- Contains: `script-system-prompt.ts`, `script-json-schema.ts`, `concept-system-prompt.ts`, `concept-cards-schema.ts`, `scene-image-prompts.ts`, `scene-safety.ts`

**`prisma/`:**
- Purpose: Database schema + migrations
- Contains: `schema.prisma` (9 models, 6 enums), `migrations/` (21 dated folders)

**`apps/web/public/`:**
- Purpose: Dev-only static assets — also pushed to R2 via `upload-static-assets-to-r2.ts` for production use
- Contains: `avatars/` (25 PNGs), `voice-samples/` (30 MP3s), `music/` (17 tracks), `uploads/` (LocalStorage target in dev)
- Generated: `uploads/` yes, others no
- Committed: avatar PNGs + music + voice-samples committed; `uploads/` ignored

## Key File Locations

**Entry Points:**
- `apps/web/app/layout.tsx` — Next.js root layout (Heebo + Geist + theme + dir="he")
- `apps/web/app/page.tsx` — Public landing page
- `apps/worker/src/index.ts` — Worker boot (`Worker` × 2 + `ensureMaintenanceSchedules`)

**Configuration:**
- `vercel.json` — `regions: ["bom1"]` pinning + framework
- `railway.toml` — Worker deploy (NO `startCommand`)
- `apps/web/next.config.mjs` — `transpilePackages`, `outputFileTracingExcludes/Includes`, `experimental.staleTimes.dynamic = 0`
- `apps/web/tailwind.config.ts` — V27 Tri-Modal Liquid tokens
- `apps/web/app/globals.css` — CSS custom properties + tier system + motion patterns
- `tsconfig.base.json` — Shared TS settings; per-app `tsconfig.json` extends
- `.env` / `.env.example` — Single shared env at repo root
- `prisma/schema.prisma` — DB schema
- `package.json` (root) — npm workspaces declaration

**Core Logic — pipeline owners:**
- `apps/web/lib/scenes/generate-impl.ts` — image gen owner
- `apps/web/lib/scenes/voice-impl.ts` — voice gen owner
- `apps/web/lib/scenes/clip-impl.ts` — clip gen owner (+ Kling/Grok routing + lipsync)
- `apps/web/lib/llm/scripts.ts` — legacy script batch
- `apps/web/lib/llm/concept-engine.ts` — concept-first script engine
- `apps/web/lib/image-briefs/image-brief-builder.ts` — deterministic gpt-image-2 brief
- `apps/web/lib/animation/animation-plan-builder.ts` — typed AnimationPlan
- `apps/worker/src/processors/render-processor.ts` — final compose state machine
- `apps/worker/src/providers/composition/ffmpeg.ts` — 3-stage ffmpeg pipeline

**Persistence + queue:**
- `apps/web/lib/db.ts` — Prisma client + slow-query log
- `apps/worker/src/db.ts` — Worker Prisma client
- `apps/web/lib/queue.ts` — BullMQ producer (web)
- `apps/worker/src/queue.ts` — BullMQ queue defs + maintenance schedules

**Storage:**
- `apps/web/lib/storage/index.ts` — `getStorage()` auto-selector
- `apps/web/lib/storage/read-public-asset.ts` — disk → HTTP fallback
- `apps/web/lib/avatars/catalog.ts` — 25-portrait R2 URLs
- `apps/web/lib/voice/voice-presets.ts` — 30-voice R2 URLs
- `packages/shared/src/music/music-library.ts` — 17-track R2 URLs

**Auth:**
- `apps/web/lib/auth/sync-user.ts` — `getOrCreateAppUser` + `requireAdmin`
- `apps/web/lib/auth/admin-api.ts` — `requireAdminApi` (JSON 403)
- `apps/web/lib/supabase/{client,server,middleware}.ts`

**Testing:**
- `apps/web/scripts/test-v13-all.ts` + `test-v14-all.ts` — master verification runners (`npm test`)
- `apps/web/scripts/test-{anticollage,scriptperf,schematrim,conceptinteractive}-pr*.ts` — PR-scoped verification
- `apps/worker/src/scripts/test-render.ts` — worker smoke (`npm run test:render`)

## Naming Conventions

**Files:**
- **kebab-case** for all source files (`scene-status.ts`, `concept-actions.ts`, `wizard-progress-strip.tsx`)
- **`-impl.ts`** suffix on scene-stage owners (`generate-impl.ts`, `voice-impl.ts`, `clip-impl.ts`) — single source of truth for that stage transition
- **`*-actions.ts`** for `'use server'` Server Actions next to the page that uses them (`actions.ts` per route, also `concept-actions.ts`, `flow-toggle-actions.ts`, `music-picker-actions.ts`)
- **`client-bits.tsx`** for the Client Component island in a Server-Component page; `*-picker.tsx` / `*-card.tsx` / `*-flow.tsx` for named islands
- **`route.ts`** for App Router REST handlers (Next.js convention)
- **`page.tsx` / `layout.tsx` / `loading.tsx` / `error.tsx`** — Next.js App Router conventions
- **`test-{feature}-{prN}.ts`** for verification scripts in `apps/web/scripts/`
- **`debug-{thing}-state.ts`** for state-dumping dev scripts
- **`{name}-impl.ts` vs `{name}.ts`** — `-impl` suffix marks the heavy single-owner; the bare name is reserved for thin re-exports

**Directories:**
- **`(parens)`** — Next.js route groups (do not become URL segments) — `(admin)`, `(auth)`, `(dashboard)`
- **`[bracket]`** — Next.js dynamic segments — `[id]`, `[jobId]`, `[voiceId]`
- **kebab-case** elsewhere (`product-intelligence`, `image-briefs`, `scene-planning`, `view-transition`)
- **`scripts/`** at app root for dev/migration scripts; **`packages/`** at repo root for shared code; **`prisma/`** at repo root for schema

**Imports:**
- `@/...` alias maps to `apps/web/` (configured in `tsconfig.json`)
- Workspace packages imported by name: `@ugc-video/shared`, `@ugc-video/prompts`
- Worker uses `Node` moduleResolution — import from package root, not subpaths

**TypeScript:**
- camelCase for functions + variables; PascalCase for types + components + classes
- `const` tuples + derived types for evolving vocabularies (e.g. `SCENE_STATUSES` in `scene-status.ts`) — preferred over Prisma enums for forward compat

**Database (Prisma):**
- camelCase column names matching TS (Prisma maps automatically)
- String columns over enums for evolving vocabulary (`framework`, `sceneGoal`, `sceneGenerationType`, `Scene.status`)
- Migration folders: `YYYYMMDDhhmmss_{description}/`

## Where to Add New Code

**New API endpoint:**
- REST: `apps/web/app/api/{group}/[…]/route.ts` (Route Handler). Admin endpoints under `apps/web/app/api/admin/` and MUST start with `requireAdminApi()`.
- Server Action: `actions.ts` next to the page that calls it; mark `'use server'`.
- If long-running (>60s), set `export const maxDuration = 120` in the **page.tsx**, not the actions.ts.

**New wizard step:**
- New folder under `apps/web/app/(dashboard)/projects/[id]/{step}/`
- Add `page.tsx` (Server Component), `actions.ts`, optional `client-bits.tsx`
- Update `apps/web/lib/wizard/current-step.ts` if step ordering changes
- Wrap navigation in `document.startViewTransition` if you want the persistent-strip animation

**New scene-stage transition (e.g. "translate"):**
- Owner: `apps/web/lib/scenes/{stage}-impl.ts`
- Set in-flight timestamp on `Scene` before provider call; clear on completion
- Two-phase ApiCall: `recordApiCallStart` → `recordApiCallFinish`
- Add a state to `apps/web/lib/scenes/scene-status.ts` if needed (string column, no migration)
- Add error codes to `apps/web/lib/errors/scene-error-messages.ts`
- Expose via `POST /api/scenes/[id]/{stage}/route.ts` AND a Server Action — both delegate to the impl

**New external provider:**
- Adapter: `apps/web/lib/animation/{provider}.ts` (or appropriate sub-tree) implementing `VideoGenerationProvider` (or LLM equivalent)
- Cost attribution helper: add `attribute{Provider}Cost(...)` to `apps/web/lib/usage/cost-attribution.ts`
- Pricing constants: `apps/web/lib/pricing/provider-costs.ts` and/or `apps/web/lib/usage/pricing.ts`
- Live balance fetcher: `apps/web/lib/providers/balance.ts` — return a sentinel when the provider doesn't expose billing
- Surface in `/admin/costs` provider-balances card automatically via `fetchAllProviderBalances`
- Add env vars to `.env.example`

**New static catalog asset (avatar / music / voice):**
- Drop file in `apps/web/public/{avatars,music,voice-samples}/`
- Run `npx tsx apps/web/scripts/upload-static-assets-to-r2.ts`
- Update the corresponding catalog file (`apps/web/lib/avatars/catalog.ts`, `packages/shared/src/music/music-library.ts`, `apps/web/lib/voice/voice-presets.ts`) with the hard-coded R2 URL

**New Prisma model / column:**
- Edit `prisma/schema.prisma`
- Run `npm run prisma:migrate` (uses direct URL port 5432)
- Run `npm run prisma:generate`
- Prefer `String?` over `enum` for evolving vocabularies — keep canonical values in a TS const tuple

**New shared utility used by web + worker:**
- Add to `packages/shared/src/{utils,types,schemas}/`
- Re-export from `packages/shared/src/index.ts` (or appropriate barrel)
- Worker imports from package root only — do NOT use `exports` subpaths

**New prompt or LLM schema:**
- Edit `packages/prompts/src/{script,scene,concept}-{system-prompt,json-schema}.ts`
- Re-export from `packages/prompts/src/index.ts`
- Add a verification script under `apps/web/scripts/test-{feature}-pr{N}.ts` and wire it into `test-v13-all.ts` / `test-v14-all.ts` if it's part of a sequenced PR series

**New admin debug surface:**
- Page under `apps/web/app/(admin)/admin/{thing}/[id]/debug/page.tsx` — `requireAdmin()` cascades from layout
- Reuse `<SceneCardStatusBadge>`, `<SceneErrorDetails>`, `<SceneLogViewer>` from `apps/web/components/wizard/`
- Add corresponding `/api/admin/{thing}/[id]/...` endpoint when the page polls — gate with `requireAdminApi()`

**New verification test:**
- Add `apps/web/scripts/test-{feature}-pr{N}.ts`
- Wire into the relevant master runner (`test-v13-all.ts` / `test-v14-all.ts`) which is glob-discovered
- Optional: expose as standalone npm script in `apps/web/package.json` (`"test:{feature}": "tsx scripts/test-{feature}.ts"`)

## Special Directories

**`apps/web/public/uploads/`:**
- Purpose: `LocalStorage` write target in dev
- Generated: Yes (every image/voice/clip in dev mode lands here)
- Committed: No (gitignored)
- Production: Never written to — all writes go through R2 via `getStorage()`

**`apps/web/.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: GSD workflow output (codebase maps, debug audits)
- Subdirs: `codebase/` (this file), `debug/` (e.g. `v27-script-quality-audit.md`)
- Generated: Yes (by `/gsd-*` commands)
- Committed: Yes (intentional — these are reference material)

**`.design/design-language-v27/`:**
- Purpose: V27 Tri-Modal Liquid design source of truth
- Contains: `DESIGN_BRIEF.md`, `DESIGN_TOKENS.md`, `TASKS.md`
- Committed: Yes

**`.claude/skills/` and `.agents/skills/`:**
- Purpose: Project Claude skill files (`design-system/SKILL.md`, supporting `rules/*.md`)
- Committed: Yes
- Used by: project-level Claude Code sessions (read first; `AGENTS.md` files explicitly NOT loaded for context cost)

**`docs/v14/`:**
- Purpose: Reference docs from V14 era (ISRAELI_VISUAL_REALISM, FRAME_PROMPT_TECHNIQUES, HEBREW_SCRIPT_CREATIVE_RULES)
- Committed: Yes

**`scripts/`** (repo root):
- Purpose: Repo-level shell scripts (e.g. `check-v27-legacy.sh`)
- Committed: Yes

**`ugc-video-platform-secrets/`** (NOT in tree):
- Purpose: External secrets directory containing live API keys
- Committed: NEVER — gitignored. Cannot be re-created from any committed source.

---

*Structure analysis: 2026-05-03*
