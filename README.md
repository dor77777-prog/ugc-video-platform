# tachles

Hebrew-first AI platform for generating Israeli UGC product video ads from a product URL.

**Brand:** מודעות וידאו שמוכרות. תכל'ס.
**Status:** V22.2 (May 1 2026) — dead-code cleanup: removed 9 unused symbols/files (voice-preset helpers, GenerateAllVoicesButton, voice batch state, generateSceneVoiceAction + state type, 4 worker mock providers, V14.1c one-shot script). **V22.1** — completed-videos showcase now plays the actual MP4 (autoplay muted loop) instead of a static thumbnail. **V22** — dashboard now matches landing's design language: animated SVG aurora background, AnimatedCounter on stats tiles, completed-videos showcase grid (9:16 thumbnails with Play overlays), LiveActivityTicker for returning users, hero typography upgraded to text-7xl font-black. **V21.1** — all 4 wizard inner pages on `<ProjectHero>` + bg-mesh-soft (scripts, avatar, scenes, videos), returning-user dashboard hero (replaces "first video" pitch), sidebar with pinned recent projects + active highlight. **V21** — workspace inner-page polish: new `<ProjectHero>` shared component + 4 custom SVG illustrations + scenes page wrapped in bg-mesh + avatar grid bug fix (yossi/eyal/guy → yosef/eran/gil). **V20** — cinematic landing rebuild + custom SVG logo (play+frame mark) + refined mono-tone gradient text. New floating-glass hero showcase with R2 avatar cards + mouse parallax. Animated SVG aurora background with drifting blobs. Animated counter on scroll. Live activity ticker. **V19.1** — combined design-system overhaul (typeui.sh dashboard + glassmorphism + contemporary + perspective): IBM Plex Sans + JetBrains Mono fonts added, `glass-liquid` + soft/elevated/floating shadow tiers + `bento` grid utilities + `tilt-hover` perspective. Dashboard rebuilt as bento layout (hero 2×2 + stat tiles + tilted project cards). **V19.0** — full visual overhaul: dark-mode-first cinematic theme (kling.ai / krea.ai inspiration). globals.css rewritten — violet-black canvas, neon glow shadows, glass + glass-strong, gradient-border, animated aurora background. Landing page rebuilt with 7.5rem font-black hero, sticky glass nav, 7-card pipeline strip, 6-card features grid, 4-tier pricing with featured tier on gradient-border. **V18** — Sprint 4 polished public landing page at `/` (hero + features + pricing teaser + FAQ + footer). Logged-in users still redirect to `/dashboard`. **V17** — Sprint 3 AI-native UX: phase-anchored AIThinking indicator (replaces static spinners with the live pipeline narrative) + prompt suggestion chips on SceneCard for one-click prompt refinement. **V16** — Sprint 2 interactive polish: `sonner` toasts (RTL Heebo richColors), global `cmdk` Cmd+K command palette with 8 shortcuts, sidebar refreshed to Lucide + glass + shadow-glow on active route. **V15** — Sprint 1 visual polish: new design tokens, `bg-mesh` + `bg-noise` + `glass` + `text-gradient` + `shadow-glow` + `card-hover` utilities, Lucide icons replacing branding-relevant emojis, polished dashboard with staggered fade-in. **V14.8** — bug fix: voice section on each SceneCard is now ALWAYS visible (was hidden when no voice picked yet — making the listen + regen buttons impossible to find). Disabled-with-hint when no voice is picked, fully interactive otherwise. **V14.7** — UX cleanup: all voice UI consolidated on scenes page (step 4). Videos page no longer has the VoicePicker card, GenerateAllVoicesButton, or per-scene voice regen — only an audio preview + a link back to step 4. **V14.4** — SSE for render status. `/api/render/[jobId]/events` streams updates via Server-Sent Events; client uses `EventSource` (auto-reconnect) instead of 3s polling. Sub-2s perceived latency for the entire 3-15 min render without setInterval. **V14.6** — per-scene voice controls on scenes page (step 4). Each scene card now shows voice status + audio preview + standalone "regenerate voice" button, fully independent of image regen (never re-charges the other). **V14.5** — bundle analyzer wired (`npm run analyze:web`). Foundation for finding the next round of code-splits (CaptionPresetPicker / RenderFinalButton candidates). **V14.2-B** — pipeline parallelism + UX move: VoicePicker now on step 4 (scenes) instead of step 5; "Generate all" runs image + voice jobs in parallel so voice typically finishes mid-image-gen and the user reaches step 5 with everything voiced. Saves the "Generate all voices" click + the entire voice wall-clock (~30-90s). **V14.2-A** — perf: in-memory User cache (10s TTL) shaves 50-150ms off every Server-Component render + every API call. Hot polling endpoints now hit Prisma for auth ~once per 10s instead of every 2.5s. Invalidation hooks on every credit mutation + every admin user mutation keep balance / ban / plan state immediately consistent. **V14.3** — UI quick wins: `next/image` for avatar + scene tiles (~70-80% bandwidth saved on thumbnails), `next/dynamic({ssr:false})` for VoicePicker + MusicPicker (~50KB JS deferred), Suspense streaming on dashboard (header instant, stats + recent projects stream in). **V14.1c** — `Scene.status` index added (was missing since V13 PR6); admin drill-down + future state-filter queries no longer full-scan Scene. Migration `20260501010000_v14_1c_scene_status_index`. Applied to production via `apps/web/scripts/apply-v14-1c-index.ts` (bypasses schema-engine which hangs on pgbouncer URLs). **V14.1b** — perf: Prisma `select` trim on `dashboard` / `projects/[id]/videos` / `projects/[id]/scripts` pages — was fetching the full 60-col Scene rows (heavy JSON columns) when only 8-14 were rendered; videos page payload drops from ~150KB to ~5KB per 6-scene project. **V14.1a** — perf: Visibility API pause on every client polling tick (`scenes` / `videos` / `scripts` pages). Background tabs no longer hit `/api/scenes/[id]` or `/api/render/[jobId]/status`; ~50% reduction in idle DB / function load expected. New helper `apps/web/lib/utils/visibility.ts`. **V14 (April 30 2026)** — Image-quality + script-Hebrew-register overhaul on top of V13. Seven-PR series. **V14 PR1**: Israeli realism cue library — 51 atomic cues across 10 categories with paired positive+negative anchors, 8 named scene presets (`kitchen_with_morning_light` / `bathroom_morning_routine` / etc.), all 25 catalog avatars backfilled with required `archetype` + `religiousRegister` metadata; `chooseIsraeliCues(ctx)` deterministic selector replaces the V13 PR2 single-block negative-only emitter. **V14 PR2**: five frame-technique snippets — mirror selfie ("phone covers most of the face"), hand-held selfie (perspective lock + wide-angle distortion), product hand hold (anatomical grip + scale reference), safe reflection, consistency anchor — wired via `chooseFrameTechniqueSnippets()` in the brief builder; new `camera_focus` enum value `selfie_in_mirror`. **V14 PR3**: outfit lock — deterministic `computeLockedOutfit()` persists to `Project.productData.lockedOutfit` on first scene generation, then quoted verbatim by the consistency-anchor snippet so every scene of the same ad sees the same outfit text. **V14 PR4**: `SceneVariationLedger` + scroll-stopper levers — one scene per ad (hook by default, punchline when `finalSceneGoal='decision_push'`) gets a tight-framing + saturated-color treatment; `ledger.summary()` surfaces per-field distinct/total counts for diversity diagnostics. **V14 PR5**: script V6 — Hebrew register-lock section that overrides translated-American-Hebrew patterns, 4 new structured-output fields (`genre` / `voice_profile` / `hook_alternatives` / per-scene `israeli_setting_cue`); the 8 cue IDs share the same namespace as PR1's `SCENE_PRESETS`, no parallel cue systems. **V14 PR6**: `/admin/scenes/[id]/debug` now surfaces every V14 field per scene; new `/admin/projects/[id]/diagnostic` builds a per-script SceneVariationLedger with diversity counts + low-diversity warning banner. **V14 PR7**: docs + master test runner — `npm test` chains V13 + V14 runners, 380+ V14 assertions across 6 PRs (770+ cumulative). All V13 carryovers stand: V13.2 admin /admin/costs hardening (per-call cost attribution into `lib/usage/cost-attribution.ts`, `ProviderBalanceSnapshot` model, polling dashboard, 13 composite indexes); V13.1 ffmpeg cold-start CDN download to `/tmp` + mux-failure refund.
**Production:** https://tachles-lac.vercel.app (Vercel web + Railway worker + Supabase Postgres + Redis Cloud + Cloudflare R2).
**Output:** 9:16 MP4 ads, 15s or 30s, with Hebrew voice-over + RTL captions + background music.

---

## Pipeline (one-line summary)

```
URL → scrape → product intelligence → script (gpt-5.4-mini)
    → scene images (gpt-image-2, single-pass — V13 PR1 removed the QA loop)
    → voice (ElevenLabs eleven_v3 with-timestamps)
    → clips (Kling Omni v3 + PixVerse LipSync via face-gate)
    → final composition (ffmpeg: concat + music + ASS captions)
    → MP4
```

All seven stages are real, billed providers. The only "mock" left in the
repo are dead `apps/worker/src/providers/*/mock.ts` files retained as a
template for future provider swaps; they are never instantiated.

---

## Stack

| Layer | Tech |
|-------|------|
| Web app | Next.js 15.0 App Router · React 19 · Tailwind 3.4 · Radix UI · shadcn/ui · RTL Hebrew |
| Worker | Node 20+ · BullMQ 5 · ioredis · `tsx watch` for dev |
| Shared libs | TypeScript 5.6 · Zod · `@ugc-video/shared` (music, captions, types) · `@ugc-video/prompts` |
| Database | PostgreSQL 14+ via Prisma 6 (Supabase-compatible) |
| Queue | Redis 6+ |
| Auth | Supabase Auth (email + password) — `ADMIN_EMAILS` env auto-promotes; first-user fallback |
| Provider SDKs | `openai` 4.x · custom HTTP wrappers for ElevenLabs / Kling / PixVerse |
| Composition | local **ffmpeg** binary on the worker host (no cloud composition) |

```
ugc-video-platform/
├── apps/
│   ├── web/                        Next.js app (UI + API + auth + queue enqueue)
│   └── worker/                     BullMQ worker (render + maintenance queues)
├── packages/
│   ├── shared/                     @ugc-video/shared — captions, music, types, schemas
│   └── prompts/                    @ugc-video/prompts — script system prompt + JSON schema
├── prisma/
│   ├── schema.prisma               User, Project, Script, Scene, RenderJob, Asset, ApiCall, CreditTransaction
│   └── migrations/                 18 migrations, latest: v11_image_qa
└── package.json                    npm workspaces
```

---

## Prerequisites

- Node 20+ (tested on 25.x)
- npm 10+ (workspaces — no pnpm/yarn)
- PostgreSQL 14+ — local or Supabase / Neon / Railway / RDS
- Redis 6+ — local or Upstash / Railway
- **ffmpeg** in `$PATH` on the worker host (`brew install ffmpeg`)
- Supabase project for auth (free tier is fine)
- A public tunnel for dev (`cloudflared` / `ngrok`) — Kling and PixVerse fetch
  the silent clip + voice MP3 over HTTPS; localhost URLs won't work

```bash
# Quick local services with Docker
docker run -d --name ugc-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ugc_video \
  -p 5432:5432 postgres:16

docker run -d --name ugc-redis -p 6379:6379 redis:7-alpine
```

---

## Setup

### 1. Install
```bash
npm install
```

### 2. Supabase project (auth)
Create one at https://supabase.com → **Project Settings → API**, copy:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

In **Authentication → Providers → Email**, turn off email confirmation for
local dev. (Service-role key is only needed if you wire up Supabase Storage
later.)

### 3. Environment variables

Copy `.env.example` → `.env` and fill in. The full list is in
[`STATUS.md`](./STATUS.md#environment-variables); the minimum to run is:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ugc_video?schema=public"
REDIS_URL="redis://localhost:6379"

NEXT_PUBLIC_SUPABASE_URL="..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
ADMIN_EMAILS="you@example.com"

OPENAI_API_KEY="sk-..."
# Optional — admin-scope key (sk-admin-…) used ONLY for /v1/organization/costs
# reads on the /admin/costs balance card. Regular OPENAI_API_KEY can't read
# Administration API resources. If unset, the dashboard card falls back to
# local ApiCall aggregates (V12.6 fallback).
OPENAI_ADMIN_API_KEY=""
ELEVENLABS_API_KEY="..."

# Kling — Bearer token (wrappers) OR AK/SK pair (official api-singapore)
KLING_API_KEY=""
KLING_ACCESS_KEY="..."
KLING_SECRET_KEY="..."

# PixVerse — required for lip-sync
PIXVERSE_API_KEY="..."

# Public tunnel for Kling/PixVerse to fetch your silent clips + voice MP3s
PUBLIC_BASE_URL="https://your-cloudflared-host.trycloudflare.com"
```

### 4. Prisma
```bash
npm run prisma:generate
npm run prisma:migrate     # name "init" on first run
```

---

## Running

Three terminals (or three background processes):

```bash
# Terminal 1 — Next.js
npm run dev:web                 # → http://localhost:3000

# Terminal 2 — BullMQ worker (renders + maintenance sweeps)
npm run dev:worker

# Terminal 3 — public tunnel for Kling / PixVerse
cloudflared tunnel --url http://localhost:3000
# Copy the *.trycloudflare.com URL → set PUBLIC_BASE_URL in .env → restart Terminal 1
```

Open http://localhost:3000, sign up, you'll land on `/dashboard`. The first
user signed up becomes admin automatically (or any email matching
`ADMIN_EMAILS`).

### Health
```bash
curl http://localhost:3000/api/health
# → { ok: true, checks: { database, redis, ... } }
```

---

## What the wizard does

| Step | Where | Real provider | Cost (USD) | Credits |
|------|-------|---------------|------------|---------|
| 1. Product scrape + intelligence | `lib/scraper/` + `lib/product-intelligence/` | OpenAI gpt-5.4-mini (dossier + audience), gpt-4o-mini (visual analysis on hero image), quick auto-suggest for category + audience | ~$0.10 once per project | 0 |
| 2. Avatar | static catalog `public/avatars/` (25 portraits) | — | $0 | 0 |
| 3. Scripts | `lib/llm/scripts.ts` + `packages/prompts/` | OpenAI gpt-5.4-mini, 6 frameworks in parallel, V5 creative strategy + 12-axis quality score + selective regen | ~$0.05 / batch | 2 |
| 4. Scene images | `lib/scenes/generate-impl.ts` + `lib/image-briefs/` | gpt-image-2 — V11 deterministic image brief replaces the old narration-driven prompt. (V13 PR1: post-generation QA + auto-regen loop removed — quality is driven upstream, not by retry-until-pass.) | $0.06 / image | 2 (first regen free) |
| 5. Voice | `lib/scenes/voice-impl.ts` + `lib/voice/elevenlabs.ts` | ElevenLabs `eleven_v3` (only model with Hebrew). The `with-timestamps` endpoint variant returns per-character alignment → V10 chunker → phrase-level captions | ~$0.02 / scene | 1 (first regen free) |
| 5b. Clip | `lib/scenes/clip-impl.ts` + `lib/animation/` | Kling Omni v3 image-to-video → optional PixVerse LipSync (gated by gpt-4o-mini face-gate) → ffmpeg mux of voice MP3 onto the silent clip when lip-sync is skipped | $0.79 (Kling) + $0.071 (PixVerse, only when face-gate passes) | 15 (Kling) + 2 (PixVerse, only when run) |
| 6. Final render | `apps/worker/src/processors/render-processor.ts` + `providers/composition/ffmpeg.ts` | Local **ffmpeg** — concat all scene clips, mix music, burn ASS captions. Background music auto-selected from 17-track local library; caption preset (one of 5 styles) selected by user before render | $0 (local compute) | 8 (15s) / 12 (30s) |

**Per-video provider cost:** 15s mode ≈ **$3.62** · 30s mode ≈ **$4.57** (env-overridable; see `lib/pricing/provider-costs.ts`).
**Charged:** 15s ≈ 84 credits → $8.40 list · 30s ≈ 108 credits → $10.80 list. Margin ~57% at list price.

For per-operation pricing, plan economics, and effective credit value
math, see the **Pricing** section of [STATUS.md](./STATUS.md#pricing).

---

## Plans

Stored on `User.plan`, configured in [`lib/plans.ts`](apps/web/lib/plans.ts).

| Plan | Price/month | Credits/month | Max LipSync / video | Final render | Effective $/credit |
|------|-------------|---------------|---------------------|--------------|--------------------|
| `free_trial` | $0 | 30 (one-time) | 0 | ❌ | $0.00 (acquisition) |
| `creator` | $49 | 500 | 1 | ✅ | $0.098 |
| `brand` | $149 | 1,800 | 2 | ✅ | $0.0828 |
| `agency` | $499 | 6,000 | 2 | ✅ | $0.0832 |

**No Stripe yet** — admin grants credits + flips plans via `/admin/users`.

---

## Caption presets (V12)

The user picks a style on the videos page before final render. Stored on
`Project.productData.captionsPreset`; the worker reads it and feeds the
preset to the ASS builder.

| ID | Look | Preview |
|----|------|---------|
| `classic` | white Heebo Bold + black outline (default) | clean, safe in any background |
| `bold_yellow` | yellow Heebo 72px + thick black outline | TikTok creator look |
| `block_card` | white inside semi-transparent black box (ASS `BorderStyle=3`) | premium / Apple-ad |
| `gradient_pink` | hot-pink Heebo with pop-in scale | Reels / Stories |
| `word_pop` | one HUGE word at a time with pop-in (per-word ASS events from `wordTimingsJson`) | captions.ai-style |

All built from real ElevenLabs per-character alignment — zero proportional
estimation. Scenes without alignment data are excluded from captions
rather than approximated.

---

## Background music

17 royalty-free Mixkit tracks under [`apps/web/public/music/`](apps/web/public/music/) — that
folder is the **only** source of music. No remote API, no runtime
downloads.

Auto-selection at render time is driven by:
- the script LLM's `music_profile` (mood / energy / style / target_volume)
- product category + audience inference
- a hard penalty against high-energy tracks for beauty / wellness / baby /
  jewelry / premium so the Hebrew voice always stays dominant
- a safe low-energy generic-UGC fallback when nothing scores strongly

ffmpeg loops + `atrim`s the track to exact final-video duration, mixes at
0.08 linear gain (clamped to `[0.04, 0.20]`), 300 ms fade-in, mandatory
2 s fade-out. The Step-1 toggle (`productData.backgroundMusic`) is the
master switch.

---

## Caption + audio pipeline

1. **Voice gen** (ElevenLabs `with-timestamps` endpoint) returns per-character timings.
2. `charactersToWords` (`packages/shared/src/captions/chunker.ts`) groups Hebrew letters + niqqud + punctuation into word timings, preserving logical (read) order.
3. `chunkCaptions` splits into 2–5 word phrase chunks (≤2 lines, ≤18 chars/line, 650–2200 ms per chunk).
4. Both `wordTimingsJson` and `captionChunksJson` are persisted on `Scene` so the worker can build a global ASS file at render time without re-calling ElevenLabs.
5. Worker offsets per-scene chunks/words to the cumulative timeline, hard-caps every event at the scene-clip end, and feeds `buildAssFromChunks` (preset-aware).
6. ffmpeg burns the ASS via the `ass=` filter. libass handles RTL bidi natively — Hebrew word order is never reversed.

---

## Image quality (V11)

**Product Intelligence** (built once per project, stored on `Project.productData.intelligence`):
- **Dossier** (`gpt-5.4-mini`) — 32 fields incl. `productMechanism`, `mustShowVisuals`, `mustAvoidVisuals`, `visualFailureModes`, `israeliRealismCues`, `conservativeAssumptions`.
- **Visual analysis** (`gpt-4o-mini` vision on hero image) — `activePart`, `contactPoint`, `substanceVisualType`, `likelyModelMistakes` (the cheap fakes a generic image model loves to produce).
- **Audience inference** (`gpt-5.4-mini`) — primary/secondary persona, daily moments, problem context, realistic Israeli settings.

**Image Brief Builder** (deterministic, no LLM) — assembles a strict per-scene
contract from dossier + visual analysis + scene metadata: `mustShow`,
`mustAvoid`, `cameraInstruction`, `productAccuracyInstruction`,
`israeliContextInstruction`, `negativeConstraints`, plus a final English
prompt that **replaces** the narration-driven path.

**Image QA — REMOVED IN V13 PR1.** Earlier versions (V11) ran a
`gpt-4o-mini` vision evaluator on each generated frame and auto-regenerated
on failure via a corrective brief. In practice the corrective brief
couldn't fix what QA flagged — most scenes exhausted the 2 retries with
score 0.00 and ended up `needsManualReview=true`, costing 3× the per-scene
image budget for a marginally-better result. PR1 deletes the loop entirely:
quality is now driven by the upstream Image Brief and (in PR2) the Scene
Plan, not by regenerating-until-a-vision-model-approves. The manual
"regenerate scene" button covers the residual cases.

---

## Admin dashboard

| Page | What it shows |
|------|---------------|
| `/admin` | 24 h KPIs: signups, active users, queue depth, recent failed jobs |
| `/admin/costs` | **V12.5: live balance cards for all 4 paid providers** (Kling pack units / PixVerse credits / ElevenLabs chars / OpenAI 24h-7d-30d spend, refreshed every 60s) · Live in-flight ApiCalls with elapsed timer · per-provider cost cards · **operation pricing table** (USD cost / credits charged / list margin %) · **15s vs 30s video estimate** · **plan economics** (effective credit value, underwater warnings) · 30-day per-project leaderboard · latency P50/avg/max · recent failures · last 50 calls |
| `/admin/users` | User list, plan, credits balance, per-user `spendCapUsd` override, ban toggle, manual credit grant + reason |
| `/admin/projects` | Project list, product name, status, owner |
| `/admin/renders` | RenderJob list, status filter, error message inspector |
| `/admin/queue` | BullMQ queue depths, recent jobs |

---

## API routes (web)

```
GET    /api/health                              DB + Redis liveness

POST   /api/products/extract                    Scrape URL → ScrapeResult + auto-suggested category/audience
POST   /api/projects/[id]/scripts/list          Generate 6 scripts (parallel, streamed)
POST   /api/projects/[id]/voice                 Batch voice for all scenes
POST   /api/projects/[id]/render                Enqueue final composition (BullMQ)

GET    /api/scenes/[id]                         Live scene state (used by polling SceneCard)
PUT    /api/scenes/[id]                         Update scene fields (visual prompt, etc.)
POST   /api/scenes/[id]/generate                Generate scene image (image brief + gpt-image-2, single-pass)
POST   /api/scenes/[id]/regen-prompt            Ask LLM for a fresh image prompt variant
POST   /api/scenes/[id]/voice                   Generate per-scene voice
POST   /api/scenes/[id]/clip                    Generate per-scene clip (Kling i2v + PixVerse)

GET    /api/render/[jobId]/status               Poll render job
GET    /api/voice/sample/[voiceId]              Pre-rendered voice sample MP3
```

The single-scene `generate` / `voice` / `clip` endpoints all use **Route
Handlers** (not Server Actions) because Next.js 15 serializes server
actions per route; using fetch from the client lets multiple regenerate
buttons run in parallel.

---

## Worker

Two queues, both backed by Redis:

- **`render`** — final composition. Concurrency `WORKER_CONCURRENCY` (default 2). One job per finished video.
- **`maintenance`** — recurring `kling_sweep` (every 60 min): cleans up stuck Kling tasks (`Scene.clipMotionTaskId` > 30d old with no `clipUrl`).

The `render` processor in
[`apps/worker/src/processors/render-processor.ts`](apps/worker/src/processors/render-processor.ts)
walks: gather assets (10%) → compose video (50%) → upload final (90%) →
completed (100%). All caption + music selection happens at the compose
step.

---

## Project scripts

```bash
npm run dev:web              # Next.js on :3000
npm run dev:worker           # BullMQ worker
npm run build:web            # Production build
npm run typecheck            # tsc --noEmit across all workspaces
npm run prisma:generate
npm run prisma:migrate       # create + apply migration
npm run prisma:studio        # DB GUI
npm run test:render          # enqueue a sample render job (smoke test)

# Helpers under apps/web/scripts
npx tsx apps/web/scripts/generate-avatar-portraits.ts   # (re)generate the 25-avatar catalog
npx tsx apps/web/scripts/generate-voice-samples.ts      # pre-render Hebrew voice previews
npx tsx apps/web/scripts/test-script-engine-v2.ts       # run V2 fixtures against real OpenAI (~$0.10)
npx tsx apps/web/scripts/recover-pixverse-clip.ts <projectId> <pixverseUrl> [sceneId]
                                                         # one-shot recovery of a successful PixVerse output
                                                         # whose status was mis-reported as failed
```

---

## Production

| Service | Where | Notes |
|---------|-------|-------|
| **Web app** | Vercel (`bom1` region, Mumbai) | Auto-deploys on push to `main`. Config: [`vercel.json`](vercel.json) |
| **Worker** | Railway (Dockerfile) | Auto-deploys on push to `main`. Config: [`railway.toml`](railway.toml) + [`apps/worker/Dockerfile`](apps/worker/Dockerfile) |
| **Database** | Supabase Postgres (`aws-1-ap-south-1.pooler.supabase.com`) | Pooler URL via pgBouncer, port 6543 |
| **Queue** | Redis Cloud free tier | 30 MB, no per-day command limit |
| **Storage** | Cloudflare R2 (bucket `ugc-video`) | Public CDN at `https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/`. Static catalogs (avatars, music, voice samples) and runtime-generated assets (scene images, voice MP3s, clips, finals) all land here in production. Local dev still uses `apps/web/public/uploads/`. |

The same `.env` shape is used in all three places (Vercel env vars, Railway
env vars, local `.env`); the only difference is the `DATABASE_URL` /
`REDIS_URL` / `CLOUDFLARE_R2_*` values. See `STATUS.md` § "Environment
variables" for the full env reference.

**Re-uploading static catalogs to R2** (run once whenever the catalogs change):
```bash
npx tsx apps/web/scripts/upload-static-assets-to-r2.ts
# --dry to preview, --skip=avatars,music,voice-samples to skip subsets
```

**Health checks:**
```bash
curl https://tachles-lac.vercel.app/api/health
# → { ok: true, checks: { database: { ok: true }, redis: { ok: true } } }
```

---

## What's still pending

- ~~**Cloud storage** — Migrate to S3 / Supabase Storage before going live.~~ ✅ done in V12 (Cloudflare R2 wired via [`apps/web/lib/storage/r2.ts`](apps/web/lib/storage/r2.ts), static catalogs hosted on R2 in V12.2).
- **Stripe billing** — admin-grants only today. Plan/credit columns are ready; the checkout + webhook layer is not.
- **Custom avatar upload** — catalog is closed (25 portraits). User-supplied portraits would need a moderation pass.
- **Password reset / OAuth (Google/Apple) / MFA** — Supabase supports it, the UI does not yet.
- **Rate limiting at the edge** — current limits are app-layer (`lib/usage/rate-limit.ts`); no IP-level WAF in front yet.
- **Structured logging** — `console.log` everywhere; no Pino + Sentry yet.
- **`/uploads/` cleanup policy** — directory grows unbounded. The Kling-sweep maintenance job handles orphaned task IDs but not disk garbage.

For the deep per-feature implementation status (what's real, what's
mocked, what's a known issue), see [STATUS.md](./STATUS.md).
