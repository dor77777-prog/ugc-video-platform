# tachles — Claude Project Context

Hebrew-first AI platform for Israeli UGC product video ads.
**Current version:** V12 (2026-04-29)
**Output:** 9:16 MP4 ads, 15s or 30s, Hebrew voice-over + RTL captions + background music.

---

## Stack (quick reference)

| Layer | Tech |
|-------|------|
| Web | Next.js 15 App Router · React 19 · Tailwind 3.4 · shadcn/ui · RTL Hebrew |
| Worker | Node 20+ · BullMQ 5 · ioredis · `tsx watch` |
| DB | PostgreSQL via Prisma 6 (Supabase-compatible) |
| Queue | Redis 6+ |
| Auth | Supabase Auth — `ADMIN_EMAILS` env auto-promotes first user |
| AI | OpenAI (gpt-5.4-mini scripts, gpt-image-2 scenes, gpt-4o-mini vision QA/face-gate) |
| Voice | ElevenLabs `eleven_v3` with-timestamps |
| Video | Kling Omni v3 i2v + PixVerse LipSync |
| Composition | local ffmpeg binary on worker host |

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
│   │   │   ├── image-qa/       gpt-4o-mini vision QA + auto-regen feedback
│   │   │   ├── llm/            scripts.ts (6-batch) · scene-images.ts (gpt-image-2)
│   │   │   ├── plans.ts        PLAN_CONFIGS + PER_OPERATION_CREDITS
│   │   │   ├── pricing/        provider-costs.ts (central USD + credit constants)
│   │   │   ├── product-intelligence/  dossier · visual-analysis · audience-inference
│   │   │   ├── scenes/         generate-impl · voice-impl · clip-impl · regen-prompt · mux-audio
│   │   │   ├── scraper/        cheerio + JSON-LD + OG + Shopify + microdata + quick-suggest
│   │   │   ├── usage/          rate-limit · spend-cap · log (two-phase ApiCall) · credits · pricing
│   │   │   └── voice/          elevenlabs.ts + voice-presets (30 voices)
│   │   └── public/             avatars/ (25 PNGs) · voice-samples/ (30 MP3s) · music/ (17 tracks)
│   │
│   └── worker/src/
│       ├── processors/
│       │   ├── render-processor.ts   V6+ render flow (composition-only)
│       │   └── kling-sweep.ts        hourly stuck-task sweep
│       └── providers/composition/ffmpeg.ts   local concat-filter composition
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
└── prisma/
    ├── schema.prisma           9 models, 6 enums
    └── migrations/             18 migrations (Apr 27–29 2026)
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
        • Optional QA loop (gpt-4o-mini vision, IMAGE_QA_ENABLED, max 2 retries)
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

**Required:** `DATABASE_URL` · `REDIS_URL` · `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `OPENAI_API_KEY` · `ELEVENLABS_API_KEY` · `KLING_ACCESS_KEY` · `KLING_SECRET_KEY` · `PIXVERSE_API_KEY`

**Optional:** `ADMIN_EMAILS` (comma-separated) · `IMAGE_QA_ENABLED=true` · `WORKER_CONCURRENCY` · `CLOUDFLARE_TUNNEL_URL` (for dev — Kling/PixVerse need public HTTPS)

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
- **Prisma** — always `await prisma.$disconnect()` in worker scripts. Use `onDelete: Cascade` for child rows.
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
