# Technology Stack

**Analysis Date:** 2026-05-03

Hebrew-first AI platform for Israeli UGC product video ads (9:16 MP4, 15s/30s, Hebrew voice + RTL captions + music). Monorepo with a Next.js 15 web app (Vercel) and a BullMQ render worker (Railway/Docker).

## Languages

**Primary:**
- TypeScript ^5.6.0 — Web app, worker, shared packages, prompts. Strict mode + `noUncheckedIndexedAccess` (`tsconfig.base.json`).
- JSX/TSX (React 19) — Web UI in `apps/web/`.

**Secondary:**
- SQL (PostgreSQL) — via Prisma 6 schema in `prisma/schema.prisma` (9 models, 6 enums) + 18+ migrations under `prisma/migrations/`.
- Bash — operational scripts: `scripts/check-v27-legacy.sh`, root `scripts/` directory.
- Dockerfile — single worker image at `apps/worker/Dockerfile` (FROM `node:20-slim`).

## Runtime

**Node:**
- Node `>=20` (root `package.json` `engines.node`).
- `apps/worker/Dockerfile` pins `node:20-slim` (Debian-based; ships with `apt-get install -y ffmpeg openssl`).

**Module system:**
- Web (`apps/web/tsconfig.json`): `module: ESNext`, `moduleResolution: Bundler`, `jsx: preserve`, `incremental: true`. Path alias `@/*` → `apps/web/*`.
- Worker (`apps/worker/tsconfig.json`): `module: CommonJS`, `moduleResolution: Node`, `outDir: dist` (but never compiled in prod — runs via `tsx`, see Dockerfile note below).
- Base (`tsconfig.base.json`): `target: ES2022`, `lib: [ES2022, DOM, DOM.Iterable]`, strict, `esModuleInterop`, `resolveJsonModule`, `isolatedModules`.

**Worker runtime quirk:** the worker is shipped as `.ts` source and run with `tsx` at startup (`CMD ["npx", "tsx", "src/index.ts"]` in `apps/worker/Dockerfile`). Pre-compiling does NOT remove the tsx requirement because workspace packages (`@ugc-video/shared`, `@ugc-video/prompts`) declare `"main": "./src/index.ts"`. Dev: `tsx watch src/index.ts`.

**Package manager:**
- npm with workspaces (`package.json` `workspaces: ["apps/*", "packages/*"]`). No pnpm/yarn.
- Lockfile: `package-lock.json` present at repo root (~284 KB).
- Vercel install command: `npm ci --include=dev` (`vercel.json`). `--include=dev` is mandatory because `tsx`, `prisma`, type packages, etc. are devDeps and Vercel defaults `NODE_ENV=production`.

## Frameworks

**Web app (`apps/web/`):**
- Next.js ^15.0.0 — App Router, React Server Components, Server Actions, route handlers.
- React 19 + ReactDOM 19.
- Tailwind CSS ^3.4.0 — `apps/web/tailwind.config.ts`. Three-mode V27 design language (Vercel-mode / Krea-mode / Granola-mode) declared via `data-density` attribute. `darkMode: ['selector', '[data-theme="dark"]']`.
- shadcn/ui (Radix primitives) — `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-slot`. Plus `class-variance-authority`, `clsx`, `tailwind-merge`, `tailwindcss-animate`.
- Animation: `framer-motion` ^12.38.0 (gated to View Transitions / wizard flourishes).
- Icons: `lucide-react` ^0.460.0.
- Toasts: `sonner` ^2.0.7.
- Command menu: `cmdk` ^1.1.1.
- Validation: `zod` ^3.23.0.

**Worker (`apps/worker/`):**
- BullMQ ^5.0.0 + ioredis ^5.4.0 — render queue (`render`) + maintenance queue (`maintenance`).
- `@aws-sdk/client-s3` ^3.1038.0 — used to PUT the final MP4 into Cloudflare R2.
- Prisma client (`@prisma/client` ^6.0.0) — same schema as web.
- Runtime tooling: `tsx` ^4.19.0 (devDep, mandatory at runtime), `dotenv` ^16.4.0 (loads repo-root `.env` then `.env.local`).
- ffmpeg + ffprobe — `apt-get install -y ffmpeg` in the worker Docker image (see `apps/worker/Dockerfile`).

**Database / ORM:**
- Prisma ^6.0.0 — `prisma/schema.prisma`. Provider `postgresql`. Datasource URL from `DATABASE_URL` env. Generator `prisma-client-js`.
- 9 models: `User`, `CreditTransaction`, `ApiCall`, `ProviderBalanceSnapshot`, `Project`, `Script`, `Scene`, `RenderJob`, `Asset`.
- 6 enums: `UserRole`, `ProjectStatus`, `ScriptAngle`, `SceneType`, `RenderJobStatus`, `AssetType`.
- Per-query duration logging and `[SLOW QUERY]` >500ms tag (`apps/web/lib/db.ts`).

**AI providers (SDKs / clients):**
- `openai` ^4.104.0 — Responses API + image generation; wrapper at `apps/web/lib/llm/openai-script-client.ts`.
- `@anthropic-ai/sdk` ^0.92.0 — Claude Sonnet 4.6 / Haiku 4.5 / Opus 4.7; wrapper at `apps/web/lib/llm/anthropic-script-client.ts`.
- `@google/genai` ^1.51.0 — Gemini 3 Pro/Flash; wrapper at `apps/web/lib/llm/gemini-client.ts`. (Legacy `@google/generative-ai` removed in V26.2.)
- xAI / Grok video, Kling Omni v3 i2v, PixVerse LipSync, ElevenLabs TTS — all hand-rolled REST against `fetch`, no SDKs.

**Testing:**
- No vitest / jest / mocha setup. Custom standalone runner: `apps/web/scripts/test-v13-all.ts` and `apps/web/scripts/test-v14-all.ts`, plus per-PR runners (`test-anticollage-pr1.ts`, `test-script-perf-pr2.ts`, `test-schema-trim-pr3.ts`, `test-anticollage-pr4.ts`, `test-concept-engine-pr5.ts`, `test-concept-interactive-pr6.ts`). Run with `tsx`. Worker has a separate `test:render` script (`apps/worker/src/scripts/test-render.ts`).
- Tests are assertion suites (~770+ assertions across V13+V14, ~5.4s wall).

**Build / dev tooling:**
- TypeScript ^5.6.0 (root devDep + each workspace).
- `@next/bundle-analyzer` ^16.2.4 — opt-in via `ANALYZE=true npm run build:web` (`apps/web/next.config.mjs`).
- `autoprefixer` ^10.4.0, `postcss` ^8.4.0, `tailwindcss` ^3.4.0.
- Prisma CLI ^6.0.0 (root devDep) — `prisma generate` runs at every Vercel build via `vercel.json buildCommand`.

## Key Dependencies

**Critical (production runtime):**
- `next` ^15.0.0 — App Router, Server Actions, route handlers.
- `react` / `react-dom` ^19.0.0.
- `@prisma/client` ^6.0.0 — DB access on web + worker.
- `bullmq` ^5.0.0 + `ioredis` ^5.4.0 — async render pipeline.
- `@aws-sdk/client-s3` ^3.1038.0 — Cloudflare R2 (S3-compatible).
- `openai` ^4.104.0 / `@anthropic-ai/sdk` ^0.92.0 / `@google/genai` ^1.51.0 — script generation providers (operator picks via `LLM_SCRIPT_PROVIDER` env).
- `@supabase/ssr` ^0.5.2 + `@supabase/supabase-js` ^2.105.0 — auth (cookie-based SSR + browser client).
- `ffmpeg-static` ^5.3.0 — bundled ffmpeg binary used inside Vercel functions for clip mux (`apps/web/lib/scenes/mux-audio.ts`). Worker uses the apt-installed system ffmpeg instead.
- `cheerio` ^1.2.0 — server-side product page scraping (`apps/web/lib/scraper/`).
- `music-metadata` ^11.12.3 — pure-JS audio duration probing in the web app (replaces `ffprobe-static` to fit Vercel 250 MB function size).
- `next-themes` ^0.4.6 — theme persistence for the `data-theme` attribute.
- `zod` ^3.23.0 — validation shared between web app and `@ugc-video/shared` package.

**Internal workspace packages (private, hoisted):**
- `@ugc-video/web` (`apps/web/`) — Next.js application.
- `@ugc-video/worker` (`apps/worker/`) — BullMQ worker.
- `@ugc-video/shared` (`packages/shared/`) — Zod schemas, captions chunker / ASS builder, music library + selector, aspect-ratio helpers, product features. Exports: `.`, `./types`, `./schemas`, `./utils`, `./music`. `main` and `types` both point to `./src/index.ts` (Node consumes TS source directly via `transpilePackages` on the web side, `tsx` on the worker side).
- `@ugc-video/prompts` (`packages/prompts/`) — Hebrew system prompts and JSON schemas: `script-system-prompt.ts`, `script-json-schema.ts`, `concept-system-prompt.ts`, `concept-cards-schema.ts`, `scene-image-prompts.ts`, `scene-safety.ts`. `main` and `types` both point to `./src/index.ts`.

**Infrastructure:**
- `dotenv` ^16.4.0 (worker only) — loads `.env` then `.env.local` from repo root.
- `@types/node` ^20.0.0, `@types/react` ^19.0.0, `@types/react-dom` ^19.0.0 (devDeps).

## Configuration

**Workspace layout:**
- Root `package.json` declares `"workspaces": ["apps/*", "packages/*"]`. Web + worker hoist node_modules to repo root.
- Root `tsconfig.base.json` is extended by each workspace tsconfig.
- Workspace cross-imports go through package roots only (no subpath imports in worker — Node moduleResolution can't resolve them).

**Environment files:**
- `.env` and `.env.local` at repo root (shared by web + worker).
- `.env.example` at repo root (79 lines) documents required + optional vars.
- `.env*` are git-ignored; `.gitignore` also excludes the `ugc-video-platform-secrets/` directory and any `.zip` archive.

**Web app (`apps/web/next.config.mjs`):**
- `transpilePackages: ['@ugc-video/shared', '@ugc-video/prompts']` — workspace TS source compiled inline.
- `outputFileTracingRoot: path.resolve(__dirname, '../..')` — points the Vercel file tracer at the monorepo root so hoisted `node_modules` (esp. `ffmpeg-static`) are bundled.
- `serverExternalPackages: ['ffmpeg-static']` — keeps the `ffmpeg-static` path constant intact at runtime.
- `outputFileTracingIncludes`: `'/api/scenes/[id]/clip'` and `'/api/scenes/[id]/**'` force-include `node_modules/ffmpeg-static/**`.
- `outputFileTracingExcludes['*']: ['apps/web/public/**', './public/**']` — strips 159 MB of static assets out of every function bundle (production reads everything from R2 CDN).
- `experimental.staleTimes.dynamic: 0` — disables the 30s Next.js client router cache for dynamic routes (Server Action / API mutations are visible without F5).
- `images.remotePatterns` allows `next/image` optimization for `pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev`.
- `reactStrictMode: true`.

**Tailwind (`apps/web/tailwind.config.ts`):**
- `darkMode: ['selector', '[data-theme="dark"]']`.
- `content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}']`.
- HSL CSS variables (`--canvas`, `--surface`, `--elevated`, `--overlay`, `--primary`, `--ai`, `--success`, etc.) wired through `theme.extend.colors`.
- Custom radii / spacing / motion tokens.
- Plugin: `tailwindcss-animate`.

**Vercel (`vercel.json`):**
- `framework: nextjs`.
- `buildCommand: npm run prisma:generate && npm run build:web`.
- `outputDirectory: apps/web/.next`.
- `installCommand: npm ci --include=dev`.
- `regions: ["bom1"]` — Mumbai. **Load-bearing** because the Supabase pooler is in `aws-1-ap-south-1` (Mumbai); cross-region would add ~250 ms per Prisma query. Verify via `curl -sI https://tachles-lac.vercel.app/api/health \| grep x-vercel-id` (middle segment = `bom1`).

**Railway (`railway.toml`):**
- `[build] dockerfilePath = "apps/worker/Dockerfile"`.
- `[deploy] restartPolicyType = "ON_FAILURE"`, `restartPolicyMaxRetries = 3`.
- **No `startCommand`** — the Dockerfile `CMD` is authoritative. Setting one silently overrides the Dockerfile and has caused stale-path crashes (`apps/worker/apps/worker/...` ERR_MODULE_NOT_FOUND).
- `.railwayignore` at repo root excludes web app assets to keep the worker image small.

**Worker Dockerfile (`apps/worker/Dockerfile`):**
- Base image: `node:20-slim`.
- System deps: `apt-get install -y ffmpeg openssl` (`openssl` is required by Prisma 6 on slim images).
- Copies `package*.json`, `apps/worker/package.json`, `packages/{shared,prompts}/package.json`, and `prisma/`.
- `npm ci --include=dev --workspace=@ugc-video/worker --workspace=@ugc-video/shared --workspace=@ugc-video/prompts --include-workspace-root`.
- `npx prisma generate`.
- `WORKDIR /app/apps/worker` (mandatory — `tsx` resolves `./env` against this cwd).
- `CMD ["npx", "tsx", "src/index.ts"]`.

**Web tsconfig (`apps/web/tsconfig.json`):**
- Extends `tsconfig.base.json`. `jsx: preserve`, `incremental: true`, `noEmit: true`, `allowJs: true`. Plugin `next`. Path alias `@/*` → `./*`.
- Includes: `next-env.d.ts`, `**/*.ts`, `**/*.tsx`, `.next/types/**/*.ts`.

**Worker tsconfig (`apps/worker/tsconfig.json`):**
- Extends `tsconfig.base.json`. `module: CommonJS`, `moduleResolution: Node`, `lib: [ES2022]`, `outDir: dist`, `rootDir: src`, `types: [node]`. Includes: `src/**/*`.

**Prisma (`prisma/schema.prisma`):**
- Provider: `postgresql`. URL: `env("DATABASE_URL")`.
- Indexed for admin observability — composite indexes on `ApiCall(provider, operation, createdAt)`, `ApiCall(status, createdAt)`, `ApiCall(userId, createdAt)`, `ApiCall(renderJobId, createdAt)`, `ApiCall(sceneId, createdAt)`, etc.
- `Scene` is the densest model (50+ columns: image / voice / clip URLs + in-flight timestamps + face-gate cache + PixVerse IDs + caption chunks + V13 status machine + V11 image-QA artifacts).

**`tsconfig.base.json` (shared):**
```json
{
  "target": "ES2022",
  "module": "ESNext",
  "moduleResolution": "Bundler",
  "lib": ["ES2022", "DOM", "DOM.Iterable"],
  "strict": true,
  "esModuleInterop": true,
  "resolveJsonModule": true,
  "skipLibCheck": true,
  "forceConsistentCasingInFileNames": true,
  "isolatedModules": true,
  "noUncheckedIndexedAccess": true
}
```

## Platform Requirements

**Development:**
- Node `>=20`.
- npm 10+ (workspaces).
- Local PostgreSQL 14+ (or Supabase project).
- Local Redis 6+ (BullMQ).
- ffmpeg / ffprobe on PATH for the worker — `brew install ffmpeg` on macOS. Web app uses bundled `ffmpeg-static`; the worker uses the system binary.
- Optional public tunnel (`cloudflared`, `ngrok`) so PixVerse / Kling can fetch local clips via `PUBLIC_BASE_URL`.

**Production:**
- Web app: **Vercel Hobby/Pro**, region `bom1`. Function size limit ~250 MB (drives `outputFileTracingExcludes` + `music-metadata` instead of `ffprobe-static`).
- Worker: **Railway** with the `apps/worker/Dockerfile` (Node 20 + ffmpeg + openssl pre-installed).
- DB: **Supabase Postgres**, project pinned to `aws-1-ap-south-1` (Mumbai). Pooler URL (port 6543) for the app, direct URL (port 5432) for `prisma db push`.
- Queue: **Redis Cloud free tier**. Same `REDIS_URL` shared between web and worker.
- Storage: **Cloudflare R2** (S3-compatible). When `CLOUDFLARE_R2_BUCKET_NAME` is set, `apps/web/lib/storage/index.ts` auto-switches from local FS to R2.
- Public CDN URL: `https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev` (intentionally hard-coded in `apps/web/lib/avatars/catalog.ts`, `packages/shared/src/music/music-library.ts`, `apps/web/lib/voice/voice-presets.ts` — it's a CDN endpoint, not a secret).

## Dev / build / test scripts

**Root `package.json`:**
```bash
npm run dev:web           # next dev (port 3000)
npm run dev:worker        # tsx watch apps/worker/src/index.ts
npm run build:web         # next build
npm run analyze:web       # ANALYZE=true next build (bundle visualizer)
npm run typecheck         # tsc --noEmit across all workspaces
npm run prisma:generate   # prisma generate (Prisma client)
npm run prisma:migrate    # prisma migrate dev
npm run prisma:studio     # prisma studio (GUI)
npm run test:render       # worker render smoke test
npm run check:v27-legacy  # bash scripts/check-v27-legacy.sh
npm run check:v27-strict  # legacy scan in strict mode (CI gate)
```

**`apps/web/package.json` adds:**
```bash
npm test                       # tsx scripts/test-v13-all.ts && tsx scripts/test-v14-all.ts
npm run test:v13               # V13 master runner (~360 assertions)
npm run test:v14               # V14 master runner (~380 assertions)
npm run test:anticollage       # PR1 anti-collage suite
npm run test:scriptperf        # PR2 perf suite
npm run test:schematrim        # PR3 schema trim suite
npm run test:anticollagepr4    # PR4 anti-collage suite
npm run test:conceptinteractive # PR6 concept-interactive UX suite
```

**`apps/worker/package.json`:**
```bash
npm run dev          # tsx watch src/index.ts
npm run start        # tsx src/index.ts (used by Dockerfile CMD)
npm run test:render  # tsx src/scripts/test-render.ts
```

---

*Stack analysis: 2026-05-03*
