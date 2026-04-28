# tachles

Hebrew-first AI platform for generating UGC video ads from product URLs.
Brand tagline: **מודעות וידאו שמוכרות. תכל'ס.**

## Current state (April 2026 — V6)

End-to-end functional. Every wizard step uses real providers (no mocks in the main path).
See [STATUS.md](./STATUS.md) for the full implemented / mocked / missing breakdown.

### What V6 added (Apr 29)
- **Script streaming** — 6 framework calls fire in parallel, each script persists +
  appears in the UI the moment it's ready (no waiting for the slowest sibling).
  `router.refresh()` polls every 2.5s during generation; pending slots show as
  animated skeleton cards.
- **Avatar gender lock** — Hebrew is heavily gendered. The selected avatar's
  `gender` is now passed into the user prompt with an explicit zachar/nekeva
  rule, so spoken_text + on_screen_caption never mismatch the chosen voice.
- **30 voices** — VoicePicker now has 18 female + 12 male hand-picked from
  ElevenLabs Voice Library (UGC creators / influencers / mature voices /
  social-media-tuned). Pre-rendered Hebrew samples ship with the repo.

### What V5 added (Apr 29)
- **Israeli visual realism** — explicit per-scene `environment_type` +
  `environment_style` + `israeli_environment_required` + `local_realism_notes`.
  gpt-image-2 prompts get a hard-coded boilerplate forcing Israeli outlets,
  switches, apartment proportions, trissim, Hebrew/neutral text.
- **Expanded creative strategy** — 5 new fields (`big_idea`,
  `specific_situation`, `product_role`, `proof_moment`,
  `why_this_is_different_from_other_scripts`) + 5 hook_options + 12-dim
  quality_score.

### What V4 added (Apr 28)
- **Duration mode (15s / 30s)** — single source of truth in `lib/video-mode.ts`.
  Per-mode constraints (scene count, lipsync cap, word budget) thread through
  the script LLM, the system prompt, and the clip pipeline.
- **Product-first metadata** — every scene now commits to `primarySubject`,
  `mustShowProduct`, `productVisibilityPriority`, `cameraFocus`, `showFace`
  via structured-output. Image prompts switch to a product-led opener when
  `primary_subject != avatar`.

The wizard is end-to-end functional through **scene-image generation** with real OpenAI:

- ✅ **Step 1 — Product**: real Shopify/JSON-LD/OG/microdata scraper, with SSRF protection.
- ✅ **Step 2 — Avatar**: 25 AI-generated Israeli portraits (Mizrahi / Yemeni / Ethiopian /
  Russian / Ashkenazi / dati-leumi; ages 18-58; Tel Aviv, Haifa, Jerusalem, Be'er Sheva,
  Eilat, Modi'in, Galilee). Each portrait is the **single source of truth** for that
  character's identity in every downstream scene.
- ✅ **Step 3 — Scripts (V2)**: 6 Hebrew UGC scripts via `gpt-5.4-mini`. **Creative
  strategy engine** — every script declares 12 strategy fields (core insight, audience pain,
  emotional trigger, product mechanism, main objection, persuasion angle, why-stop-scroll,
  ugc situation, hook type, script promise, conversion goal, assumptions) before any
  spoken text is written. **3 hook options per script** with an explicit selection +
  reason. **Self-scoring on 8 axes** (hook strength / specificity / Israeli authenticity
  / emotional pull / visual clarity / conversion potential / TTS naturalness /
  no-generic-clichés); the wrapper **selectively regenerates in parallel** any script
  that scores below 8 (capped at 3 concurrent regen calls). 12-phrase anti-cliché
  blacklist enforced.
- ✅ **Step 4 — Scene images**: `gpt-image-2` at 1024×1536 portrait, avatar as Image 1
  (identity anchor) + product as Image 2. The prompt builder includes:
  - **REALISM CHECK block** — anatomy (5 fingers, natural articulation), light direction
    (single primary source, consistent shadows), surface contact (no floating objects),
    architecture (90° walls), anti-AI tells (no plastic skin, no doll-eyes).
  - **Mirror-selfie physics** — phone shows its BACK in the reflection, eyes look at the
    mirror (so reflection looks at camera), real optics throughout.
  - **3-layer safety pipeline** — (1) term sanitization (23 risky→safe rewrites, e.g.
    `bodysuit`→`fitted base layer top`), (2) per-category modesty tokens for sensitive
    categories (fashion / fitness / wellness), (3) auto-retry without product image +
    aggressive modesty when gpt-image-2 returns `safety_violations`.
  - **True parallel batch generation** — `POST /api/scenes/[id]/generate` Route Handler
    + parallelism=2 in the client loop (Next.js Server Actions are serialized per-route,
    so the loop uses `fetch()` to bypass that). 5 scenes ~2.5 min instead of 5 min.
  - **180s server timeout** + **200s client timeout** + **classified error display**
    (safety / timeout / credits / generic) so failures never leave the UI hanging.
  - **Live UI updates** — `GET /api/scenes/[id]` polled every 2.5s during batch (or
    burst-polled for 15s after a single-scene action). No manual refresh needed.

Steps that are still mocked or pending (next modules to ship):

- ⏳ **Step 5 — Voice-over** (ElevenLabs Hebrew TTS, per scene).
- ⏳ **Step 6 — Image → Video** (provider TBD: Kling / Runway / Luma / Pika).
- ⏳ **Step 7 — Final composition** (Creatomate concat + music + RTL captions).

The render queue (BullMQ + worker) is wired and runs end-to-end with mock providers, so
each real provider can be swapped in independently without touching the orchestration.

For the full API surface, architecture diagrams, and per-feature status, see
[STATUS.md](./STATUS.md).

## Stack

- **apps/web** — Next.js 15 App Router, Tailwind, shadcn/ui, RTL Hebrew
- **apps/worker** — Node.js BullMQ worker (image→video / TTS / composition still mocked)
- **packages/shared** — TypeScript types + Zod schemas
- **packages/prompts** — Hebrew script system prompt, scene-image prompt builder (`awesome-gpt-image-2` patterns), strict JSON schema for the LLM
- **prisma** — PostgreSQL schema (Supabase-compatible)

```
ugc-video-platform/
├── apps/
│   ├── web/                    # Next.js app
│   └── worker/                 # BullMQ worker
├── packages/
│   ├── shared/                 # types, zod schemas, utils
│   └── prompts/                # script system prompt + JSON schema
├── prisma/
│   └── schema.prisma           # User, Project, Script, Scene, RenderJob, Asset
├── package.json                # npm workspaces
├── tsconfig.base.json
└── .env.example
```

## Prerequisites

- Node.js 20+ (tested with 25.x as well)
- npm 10+ (this repo uses npm workspaces — no pnpm/yarn needed)
- PostgreSQL 14+ — local install or hosted (Supabase, Neon, Railway, RDS)
- Redis 6+ — local install or hosted (Upstash, Railway)
- **Supabase project** for auth (free tier is fine — see step 2 below)

### Quick local services with Docker

If you don't already have Postgres + Redis running locally:

```bash
docker run -d --name ugc-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ugc_video \
  -p 5432:5432 postgres:16

docker run -d --name ugc-redis -p 6379:6379 redis:7-alpine
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project (for auth)

1. Go to <https://supabase.com> → "New project". Free tier is enough.
2. Once created, open **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (only for later, when storage is wired up) → `SUPABASE_SERVICE_ROLE_KEY`
3. (Recommended for local dev) **Authentication → Providers → Email** — turn off
   "Confirm email" so you can sign up and log in immediately without a confirmation email.

### 3. Configure env

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

> **Brew Postgres users:** the example uses `postgres:postgres` creds (the Docker recipe
> below). If you have Homebrew Postgres, your superuser is your macOS username with no
> password, so change `DATABASE_URL` to `postgresql://YOUR_USERNAME@localhost:5432/ugc_video?schema=public`.

### 4. Prisma

```bash
npm run prisma:generate
npm run prisma:migrate          # name the migration "init" when prompted
```

## Running

Open two terminals.

**Terminal 1 — Next.js web app:**

```bash
npm run dev:web
# → http://localhost:3000
```

**Terminal 2 — BullMQ worker:**

```bash
npm run dev:worker
# Watches for jobs on the "render" queue.
```

Open `http://localhost:3000` and you'll be redirected to `/login`. Click "הירשם עכשיו"
to create an account, then you'll land on the dashboard.

### Routes you'll see

| Path                  | Auth | What it is                                      |
| --------------------- | ---- | ----------------------------------------------- |
| `/login`              | —    | Email + password sign-in                        |
| `/register`           | —    | Sign-up (creates a Supabase user + Prisma User) |
| `/dashboard`          | ✓    | Home — stats + "create video" CTA               |
| `/projects/new`       | ✓    | Wizard shell (7 steps — only the frame for now) |
| `/library`            | ✓    | Past completed renders                          |
| `/settings`           | ✓    | Account info                                    |
| `/dev/demo`           | ✓    | Mock pipeline trigger (drives the worker)       |

### Health check

```bash
curl http://localhost:3000/api/health
# → { "ok": true, "checks": { "database": { "ok": true }, "redis": { "ok": true }, ... } }
```

If any check fails (`ok: false`), the response is HTTP 503 and the failing component
includes an `error` field.

## Test the mock render flow

This creates a sample user / project / script / scenes / render job and pushes it onto
the queue. Run it with the worker already running in another terminal so you can watch
the pipeline progress live.

```bash
npm run test:render
```

Output:

```
Enqueued render job: cme_xxx
Project:            cmp_xxx
Script:             cms_xxx
```

Watch the worker terminal — it will log:

```
[render] starting job cme_xxx
[render] cme_xxx → extracting_assets (5%)
[render] cme_xxx → generating_voice (15%)
[mock-tts] synthesizing "אם גם אצלכם צחצוח שיניים…"
[render] cme_xxx → generating_avatar_video (35%)
[render] cme_xxx → generating_broll (60%)
[render] cme_xxx → composing_video (85%)
[render] cme_xxx → uploading_final (95%)
[render] job cme_xxx completed
```

You can also poll the status from the web app:

```bash
curl http://localhost:3000/api/render/<jobId>/status
```

Or — easier — log in and go to **`/dev/demo`**. There's a "הפעל ג׳וב מוק" button that
runs the same pipeline and shows live progress in the UI.

Or open `npm run prisma:studio` and browse the `RenderJob` and `Asset` tables.

## Project scripts

Run from the repo root.

| Command                     | What it does                                    |
| --------------------------- | ----------------------------------------------- |
| `npm run dev:web`           | Start Next.js on `http://localhost:3000`        |
| `npm run dev:worker`        | Start the BullMQ worker (watch mode via `tsx`)  |
| `npm run build:web`         | Production build of the web app                 |
| `npm run typecheck`         | Run `tsc --noEmit` across all workspaces        |
| `npm run prisma:generate`   | Regenerate the Prisma client                    |
| `npm run prisma:migrate`    | Create + apply a dev migration                  |
| `npm run prisma:studio`     | Open Prisma Studio (DB GUI)                     |
| `npm run test:render`       | Enqueue a sample render job (smoke test)        |
| `cd apps/web && npx tsx scripts/generate-avatar-portraits.ts` | (Re)generate the 25-avatar catalog via gpt-image-2. Idempotent — skips files that already exist in `public/avatars/`. ~$0.04 per missing avatar. |
| `cd apps/web && npx tsx scripts/test-script-engine-v2.ts` | Run V2 fixtures (skincare / kitchen / tech) against real OpenAI. Asserts 148 properties per fixture: framework coverage, scene completeness, no forbidden cliché phrases, overall ≥ 8. ~$0.10–0.15 total. |

## API routes (web)

### Health & extraction
| Method | Path                              | Description                          |
| ------ | --------------------------------- | ------------------------------------ |
| GET    | `/api/health`                     | DB + Redis liveness check            |
| POST   | `/api/products/extract`           | Body: `{ url }` → returns scraped product data + confidence + signals + warnings. SSRF-protected. |

### Scenes (live polling + parallel batch)
| Method | Path                              | Description                          |
| ------ | --------------------------------- | ------------------------------------ |
| GET    | `/api/scenes/:id`                 | Returns `{ imageUrl, imageGenerationCount, imageGeneratedAt }`. Used by SceneCard for live polling during batch generation. |
| POST   | `/api/scenes/:id/generate`        | Generates a scene image via gpt-image-2 + safety pipeline + auto-retry. Returns `{ success, imageUrl?, error?, needsCredits?, safetyBlocked?, timedOut?, safetyRetryApplied? }`. **The "Generate all" loop in the UI calls this endpoint via `fetch()` instead of the equivalent server action — Next.js serializes server actions per-route, so this Route Handler is the parallel-friendly path.** |

### Render queue (mock today)
| Method | Path                              | Description                          |
| ------ | --------------------------------- | ------------------------------------ |
| POST   | `/api/render/start`               | Create a render job and enqueue it   |
| GET    | `/api/render/:jobId/status`       | Get current status / progress / URL  |

`POST /api/render/start` body (validated by Zod):

```json
{
  "projectId": "...",
  "scriptId": "...",
  "userId": "...",
  "aspectRatio": "9:16"
}
```

## Provider architecture

Every external API call goes through a small adapter interface. For now, only mocks exist.

```
apps/worker/src/providers/
├── tts/             → TTSProvider              (ElevenLabs adapter goes here)
├── avatar/          → AvatarVideoProvider      (HeyGen adapter goes here)
├── broll/           → BrollVideoProvider       (Kling / Runway adapter goes here)
└── composition/     → CompositionProvider      (Creatomate adapter goes here)
```

When a real provider is wired up later, the processor (`render-processor.ts`) doesn't
change — only the import for that one provider does.

## What is mocked

Everything that costs money or talks to a paid API:

- **TTS** (`mock-tts`) — returns a fake `mock://tts/...mp3` URL after 300ms.
- **Avatar video** (`mock-avatar`) — returns `mock://avatar/...mp4` after 800ms.
- **B-Roll** (`mock-broll`) — returns `mock://broll/...mp4` per scene after 500ms.
- **Composition** (`mock-composition`) — returns `mock://final/...mp4` after 1200ms.

The render pipeline writes proper `Asset` rows to Postgres for each step and updates
`RenderJob.status` + `progressPercent` exactly as the real version will. Only the
output URLs are fake.

## What is shipped vs. still pending

✅ **Already real (no mocks):**

- Product scraper (Shopify / JSON-LD / Open Graph / microdata / Cheerio fallback) + SSRF protection
- Supabase Auth (email + password, middleware refresh, first-user / `ADMIN_EMAILS` auto-promotion)
- 25-avatar AI portrait catalog (`scripts/generate-avatar-portraits.ts`, idempotent)
- OpenAI script engine (`gpt-5.4-mini`, structured outputs, 6 angles, category-aware)
- OpenAI scene-image engine (`gpt-image-2` at 1024×1536, awesome-gpt-image-2 prompt patterns)
- Admin dashboard (users / projects / renders / queue / costs)
- Credits balance + per-action charging (5 free on signup, 1/script-gen, 1/scene-image)

⏳ **Still pending (the next modules to ship):**

- Hebrew TTS normalization middleware
- Real ElevenLabs Hebrew voice-over per scene
- Real image-to-video provider (Kling / Runway / Luma / Pika — TBD)
- Real Creatomate composition (concat + music + RTL captions)
- Cloud storage for generated assets (currently `apps/web/public/uploads/` — won't survive prod)
- Stripe / Paddle billing (subscriptions)
- Custom avatar upload (current catalog is closed)
- Password reset, OAuth (Google/Apple), MFA
- RLS in Supabase, rate limiting, structured logging (Pino), Sentry

## Recommended next module

**Hebrew voice-over (ElevenLabs)** — Step 5 of the wizard. The image pipeline is locked
in; pairing audio with each scene unblocks the rest of the video pipeline.

Suggested order:

1. **Voice-over (ElevenLabs)** — per-scene MP3, voice consistency across scenes
2. **Hebrew TTS normalization middleware** (numbers, currency, English abbreviations)
3. **Image → Video** (pick one provider, wire the adapter)
4. **Final composition (Creatomate)** — concat + music + RTL captions + downloadable MP4
5. **Cloud storage** (Supabase Storage) — replace local fs writes
6. **Stripe billing** — only after one real video has shipped end-to-end

For the full implementation status (what's done / partial / pending), see [STATUS.md](./STATUS.md).
