# tachles

Hebrew-first AI platform for generating UGC video ads from product URLs.
Brand tagline: **מודעות וידאו שמוכרות. תכל'ס.**

The product extractor, OpenAI script engine, and real provider integrations (ElevenLabs /
HeyGen / Kling / Runway / Creatomate) are intentionally **not** implemented yet — everything
ships behind a mock provider so the queue + DB + UI flow can be exercised end to end
before any external API costs are paid.

## Stack

- **apps/web** — Next.js 15 App Router, Tailwind, shadcn/ui, RTL Hebrew
- **apps/worker** — Node.js BullMQ worker, mock provider pipeline
- **packages/shared** — TypeScript types + Zod schemas
- **packages/prompts** — LLM system prompt + JSON schema (placeholders)
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

## API routes (web)

| Method | Path                              | Description                          |
| ------ | --------------------------------- | ------------------------------------ |
| GET    | `/api/health`                     | DB + Redis liveness check            |
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

## What is NOT in this foundation

By design — these are the next modules to build, not gaps to patch:

- ❌ Product scraper (Shopify / Open Graph / Cheerio)
- ❌ OpenAI script engine
- ❌ Hebrew TTS normalization middleware
- ❌ Real ElevenLabs / HeyGen / Kling / Runway / Creatomate adapters
- ❌ Auth (Supabase Auth)
- ❌ Storage uploads (Supabase Storage / S3)
- ❌ Credits / billing
- ❌ Full project dashboard UI

## Recommended next module

**Product Scraper** (`apps/web/lib/scraper/` + `POST /api/products/extract`).

It's the first piece the user touches in the real flow, it has zero external paid
dependencies, and it unblocks the script engine after it. Order from the spec:

1. Product Scraper
2. LLM Script Engine
3. Hebrew Middleware
4. Real Composition (Creatomate)
5. Real TTS (ElevenLabs)
6. Real Avatar (HeyGen)
7. Real B-Roll (Kling / Runway)

Build them one at a time. Don't start billing until at least one real video has shipped.
