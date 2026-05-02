# Coding Conventions

**Analysis Date:** 2026-05-03

This document is the prescriptive style guide for `tachles` (Hebrew-first Israeli UGC product-video platform). The repo is an npm-workspaces monorepo with two TS-strict workspaces under `apps/*` and two TS-strict workspaces under `packages/*`. There is **no ESLint config** and **no Prettier config** anywhere in the tree — style is enforced by convention, by `tsc --strict --noUncheckedIndexedAccess`, by the V27 legacy gate (`scripts/check-v27-legacy.sh`), and by the standalone tsx verification suite (see `TESTING.md`). New code MUST match the patterns documented here.

---

## Naming Patterns

**Files and directories — kebab-case, no exceptions:**
- Modules / library code: `apps/web/lib/scenes/clip-impl.ts`, `apps/web/lib/usage/cost-attribution.ts`, `apps/web/lib/animation/animation-plan-builder.ts`
- Server actions: `apps/web/app/(dashboard)/projects/[id]/scripts/actions.ts`, `apps/web/app/(dashboard)/projects/[id]/flow-toggle-actions.ts`, `concept-actions.ts`, `music-picker-actions.ts`
- React client components: `apps/web/app/(dashboard)/projects/[id]/scripts/concept-card.tsx`, `concept-flow.tsx`, `streaming-scripts-grid.tsx`, `continue-button.tsx`, `client-bits.tsx`
- shadcn/Radix UI primitives: `apps/web/components/ui/{button,card,input,label,switch,table,textarea,badge,progress-bar,loading-card,elapsed-timer,audio-preview,video-preview,ai-thinking,section-kicker}.tsx`
- Operational scripts: `apps/web/scripts/test-v13-pr1.ts`, `upload-static-assets-to-r2.ts`, `apply-v13-2-migration-prod.ts`, `recover-pixverse-clip.ts`, `set-r2-cors.ts`, `smoke-prod-pipeline.ts`

**Recurring file-name patterns:**
- `*-impl.ts` — pure implementation cores called from BOTH a Server Action and a Route Handler. The Server Action wraps for the single-click button; the Route Handler wraps for the parallel "generate all" loop. Examples: `apps/web/lib/scenes/{generate,voice,clip}-impl.ts`. Rationale (from the source comment in `generate-impl.ts`): "Next.js serializes server actions per-route but does NOT serialize Route Handlers, so the 'Generate all' loop now actually runs scenes concurrently."
- `actions.ts` / `*-actions.ts` — Server Actions file, MUST start with `'use server';` directive on line 1. Examples: `apps/web/app/(dashboard)/projects/[id]/scripts/actions.ts`, `concept-actions.ts`, `flow-toggle-actions.ts`, `music-picker-actions.ts`.
- `route.ts` — Next.js App Router Route Handler, lives under `apps/web/app/api/<path>/route.ts`. Example: `apps/web/app/api/scenes/[id]/generate/route.ts`.
- `page.tsx` / `layout.tsx` — Next.js App Router pages and layouts. `page.tsx` is where `export const maxDuration = …` MUST live (never in `actions.ts` — Next.js rejects it there).
- `test-*.ts` under `apps/web/scripts/` — standalone tsx-runnable verification scripts (see `TESTING.md`). The `test-v13-pr*.ts` and `test-v14-pr*.ts` glob shape is load-bearing: the master runners discover scripts by regex.
- `mock.ts` — provider-level template files, never instantiated in the active path (e.g. `apps/web/lib/animation/lipsync/mock.ts`). See "No mocks in active path" below.

**Functions and variables — camelCase:**
- Pure helpers: `cn()` in `apps/web/lib/utils.ts`, `timed()` in `apps/web/lib/timing.ts`, `withRetry()` in `apps/web/lib/utils/retry.ts`, `logStage()` in `apps/web/lib/logging/log.ts`.
- Implementation cores: `generateSceneImageImpl`, `voiceImpl`, `clipImpl`, `lipSyncOnlyImpl`.
- Verification helpers in test scripts: `ok(name)` / `fail(name, detail)` / `assert(cond, name, detail?)` (this trio is repeated in every `test-*.ts` script — copy verbatim).

**Types and interfaces — PascalCase:**
- `interface SceneErrorMessage`, `interface StageLogger`, `interface RetryOptions`, `interface PublicAsset`.
- Custom error classes: `class OpenAiConfigError extends Error`, `class MuxError extends Error`, `class SceneImageSafetyError`, `class LipSyncProviderError`, `class VideoProviderApiError`, `class PublicUrlError`, `class RateLimitedError`, `class SpendCapExceededError`. **Always set `this.name = '<ClassName>'` in the constructor** so `(err as Error).name` is grep-able in logs.

**Const tuples for evolving enums (NOT Prisma enums):**
Per house rule (`What NOT to do` in CLAUDE.md): "Do not add new Prisma enums for things that might evolve — use `String` columns." The canonical pattern lives in `apps/web/lib/scenes/scene-status.ts`:

```ts
export const SCENE_STATUSES = [
  'pending', 'planning', 'brief_built',
  'generating_image', 'image_ready',
  'generating_voice', 'voice_ready',
  'generating_clip', 'clip_ready',
  'needs_review', 'failed',
] as const;
export type SceneStatus = (typeof SCENE_STATUSES)[number];
export function isSceneStatus(value: unknown): value is SceneStatus { … }
```

The DB column is `String?`, the canonical set lives in source, and new states are added by editing this file alone. Same pattern is used for `framework`, `sceneGoal`, `sceneGenerationType` on `Script` / `Scene`.

**Hebrew literals are first-class string content** — never wrapped in i18n keys (no i18n at all). Hebrew goes directly into source: `error.hebrew`, `SCENE_ERROR_MESSAGES['scrape.timeout'].hebrew`, button labels in `concept-flow.tsx` like `"צור 6 כיוונים קריאייטיביים"`. Comments freely mix Hebrew/English ("הילד שוב מסרב לצחצח שיניים?"). Source files are UTF-8.

**Error codes — `<stage>.<reason>`** dot-namespace, lowercase, snake_case after the dot (`scrape.timeout`, `image-gen.safety_rejected`, `kling.poll_timeout`, `pixverse.face_gate_skipped`). The `<stage>` part matches the `[stage:scope]` tag emitted by `logStage()` so logs and curated-error rows cross-reference cleanly.

---

## Code Style

**Formatting:**
- No `.prettierrc` / no `.eslintrc` / no `eslint.config.*` / no `biome.json` anywhere in the repo (verified 2026-05-03). Style is enforced by convention.
- Indent: 2 spaces. Quotes: single (`'use server'`, `import 'next/cache'`). Trailing commas: yes in multi-line. Semicolons: yes.
- Imports always end with explicit semicolons. Object literals use spread + trailing commas.
- Strings: single quotes for code, backticks for templates, `${…}` for interpolation. No double-quote strings in TS source.

**TypeScript strictness — locked at the root:**
`tsconfig.base.json` (extended by every workspace):
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

`apps/web/tsconfig.json` overrides to `jsx: "preserve"` + `noEmit: true` + path alias `@/*` → workspace root + Next.js plugin. `apps/worker/tsconfig.json` overrides to `module: "CommonJS"`, `moduleResolution: "Node"` — and **this is load-bearing**: do NOT import from package `exports` subpaths in the worker (Node moduleResolution can't resolve them); always import from package root.

**`tsc --noEmit` is a release gate** — `npm run typecheck` runs all four workspaces (`npm run typecheck --workspaces --if-present`). CLAUDE.md ships every PR with "tsc clean across all 4 workspaces" as part of the verification line.

**`noUncheckedIndexedAccess` is on** — every `arr[i]` access yields `T | undefined`. Idiom in source: `productData?.audience?.profile ?? null`, `(arr[0] ?? throw new Error(...))`, optional chaining everywhere index access happens.

**No semicolon-less style, no `var`, no `function` keyword for top-level non-recursive helpers** (use `const fn = () => …` for local closures, `export function fn()` for exported top-level).

**Linting / tooling:**
- TypeScript itself plus the V27 legacy gate are the only static checks: `npm run check:v27-legacy` (informational) and `npm run check:v27-strict` (CI/pre-commit ready) — see `scripts/check-v27-legacy.sh`. The gate refuses pre-V27 utility classes (`glass-strong`, `glass-liquid`, `bg-accent`, `text-accent`, `border-accent`, `ring-accent`, `animate-{fade-in-up,progress-shimmer,shimmer-overlay,soft-pulse,aurora-drift}`, `tachles-{progress-shimmer,shimmer-overlay,soft-pulse,fade-in-up,aurora-drift,text-shimmer}`, `shadow-glow`, `shadow-glow-accent`, bare `.glass` className) anywhere in `apps/**/*.{ts,tsx,css}` or `packages/**/*.{ts,tsx,css}`. New code MUST use V27 vocabulary: `tier-{surface,elevated,overlay,atmosphere,liquid}`, `glow-primary` / `glow-ai`, `motion-{fade,fade-up,pop-in,slide-down,slide-side,cinematic-reveal,press,lift-hover,tilt-hover,shimmer,pulse-ai,aurora}`, `edge-gradient-primary`, `kicker-{loud,muted}`.

**Tailwind utility-class composition uses `cn()` from `apps/web/lib/utils.ts`:**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Always merge through `cn()` — `twMerge` collapses Tailwind conflicts (e.g. `p-4 p-6` → `p-6`).

**RTL Hebrew is the default direction.** `apps/web/app/layout.tsx` sets `<html dir="rtl" lang="he">`. Components don't need to opt into RTL; latin-only tables / kickers / mono spans use `font-mono` and tabular numbers via `Geist Mono`.

**Tailwind theme — V27 Tri-Modal Liquid:**
Three coordinated modes share one vocabulary; mode is declared via `data-density="dense|default|comfortable|showcase"` on a wrapping element (`<DensityScope>` at `apps/web/components/density/density-scope.tsx`). Vercel-mode = dense / chrome / admin. Krea-mode = comfortable / wizard step 4-7 / scene cards / video reveal. Granola-mode = the connective tissue (modals, sheets, popovers). Color and motion are STATE, not decoration: `--ai` (78° lime) appears only inside `[data-ai-active="image|voice|clip|script-batch|render"]` containers, `--success` (150° green) appears only on completion via `[data-state="success"]`. Hard limit: max 2 glass tiers per screen. Source of truth: `.design/design-language-v27/{DESIGN_BRIEF,DESIGN_TOKENS,TASKS}.md`.

**Fonts:** Heebo (Hebrew anchor) + Geist Sans (Latin / numbers, Vercel-mode DNA, tabular numbers built in) + Geist Mono (kickers, IDs, badges, tabular data). Configured in `apps/web/tailwind.config.ts` and loaded as `var(--font-heebo)` / `var(--font-geist-sans)` / `var(--font-geist-mono)` in `apps/web/app/layout.tsx`.

---

## Import Organization

Order observed across `apps/web/lib/scenes/clip-impl.ts`, `apps/web/lib/scenes/generate-impl.ts`, every `actions.ts`:

1. Node built-ins / external libs first: `import { Prisma } from '@prisma/client';`, `import OpenAI from 'openai';`, `import { revalidatePath } from 'next/cache';`, `import Link from 'next/link';`.
2. Workspace packages next: `import { aspectRatioFromProductData } from '@ugc-video/shared';`, `import { buildScenePrompt } from '@ugc-video/prompts';`.
3. App-local imports last via the `@/` alias: `import { prisma } from '@/lib/db';`, `import { logStage, flushSceneLogBuffer } from '@/lib/logging/log';`, `import { withRetry } from '@/lib/utils/retry';`.

Path alias: `@/*` → `apps/web/*` (declared in `apps/web/tsconfig.json`). Always use `@/lib/...` for cross-cutting modules; use relative imports only between files in the SAME directory or sibling subdirectories that already share a parent.

**No barrel files at the workspace root.** `@ugc-video/shared` exposes named subpaths in its `exports` map (`./types`, `./schemas`, `./utils`, `./music`) which **only the web app may consume** — the worker (Node moduleResolution) imports from package root only.

---

## Server Action / Route Handler / Component Layering

**Three-layer pattern for every paid generation operation** (script, image, voice, clip, lipsync):

1. **Implementation core** in `apps/web/lib/scenes/<op>-impl.ts` — pure, no `'use server'` directive, idempotent, callable from BOTH a Server Action and a Route Handler. Owns the in-flight guard, two-phase ApiCall logging, credit deduction, and provider call.

2. **Server Action** in `apps/web/app/(dashboard)/projects/[id]/<step>/actions.ts` — `'use server';` on line 1, thin wrapper that resolves the user, calls the impl core, calls `revalidatePath(...)`, and either `redirect()`s or returns `{ ok, redirectTo }` for the client View Transition pattern.

3. **Route Handler** in `apps/web/app/api/scenes/[id]/<op>/route.ts` — `export async function POST(...)`, also thin, used by the parallel "generate all" loop because Next.js does NOT serialize Route Handlers (it does serialize Server Actions per-route).

Per-scene clip regen uses `fetch('/api/scenes/[id]/clip')` from the client (`'use client'` button → direct POST) — V26.10 explicitly rejected the `<form action={ServerAction}>` pattern because clicking 6 scene buttons in succession was queuing the actions sequentially.

---

## Error Handling

**Error-class taxonomy (each carries `this.name`):**
- `OpenAiConfigError` (`apps/web/lib/llm/openai-script-client.ts`)
- `LlmConfigError` (`apps/web/lib/llm/scripts.ts`) — re-exported by impl cores
- `SceneImageSafetyError` / `SceneImageTimeoutError` (`apps/web/lib/llm/scene-images.ts`)
- `MuxError` (`apps/web/lib/scenes/mux-audio.ts`)
- `LipSyncProviderError` / `LipSyncTimeoutError` / `LipSyncConfigError` (`apps/web/lib/animation/lipsync/`)
- `VideoProviderApiError` / `VideoProviderConfigError` / `VideoProviderTimeoutError` (`apps/web/lib/animation/types.ts`)
- `PublicUrlError` (`apps/web/lib/animation/public-url.ts`)
- `RateLimitedError` / `SpendCapExceededError` (`apps/web/lib/usage/{rate-limit,spend-cap}.ts`)

**Curated Hebrew error map — single source of truth:**
`apps/web/lib/errors/scene-error-messages.ts` exports `SCENE_ERROR_MESSAGES: Record<string, SceneErrorMessage>` keyed by `<stage>.<reason>` (see "Error codes" above). Shape:

```ts
export interface SceneErrorMessage {
  hebrew: string;          // user-facing Hebrew explanation
  retryHint?: string;      // shown next to "נסה שוב"
  needsUserEdit?: boolean; // when true, surface "edit & retry" instead of "try again"
}
```

The `getSceneErrorMessage(code, raw)` helper (V13 PR5) returns `{ hebrew, retryHint?, needsUserEdit?, isFallback }` — `isFallback: true` when the code isn't in the map. New error surfaces MUST register a curated entry rather than throw a raw Error string from a provider.

**Scene state machine** — `apps/web/lib/scenes/scene-status.ts` defines `SCENE_STATUSES`, `SCENE_STATUS_TERMINAL`, `SCENE_STATUS_IN_FLIGHT`. Every impl core writes the new status BEFORE the long-running provider call and writes the terminal status (`clip_ready` / `failed` / `needs_review`) at the end. `Scene.lastErrorCode` (the dot-namespaced code) and `Scene.lastErrorMessage` (the Hebrew copy) persist on failure so the UI can surface them without re-running the impl.

**Stage-tagged structured logging — `logStage(stage, scope)`:**
`apps/web/lib/logging/log.ts` is the canonical logger. Replaces every bare `console.*` in the active pipeline. Usage:

```ts
import { logStage, flushSceneLogBuffer } from '@/lib/logging/log';

const log = logStage('kling', sceneId); // sceneId starts with "scn_"
log.info('submitted task', { taskId });
await log.span('kling.poll', () => provider.poll(taskId));
```

- `stage` is one of `scrape · intelligence · script · scene-plan · image-brief · image-gen · voice · motion · animation-plan · kling · grok · face-gate · pixverse · render`.
- `scope` is the resource id; when it starts with `scn_`, every line is also appended to an in-memory per-scene log buffer (cap 200 entries; oldest dropped).
- `LOG_LEVEL=debug|info|warn|error` env filters output (default: `debug` in dev, `info` in prod).
- `.span(label, fn)` wraps an async block, logs `→ label`, `← label (NNms)` on success, `✗ label (NNms): <err>` on failure (re-throws).
- Sensitive-data masking is automatic: keys matching `/api[_-]?key$/i`, `/^secret/i`, `/token$/i`, `/authorization$/i`, `/^bearer$/i`, `/password$/i` get truncated to `…<last4>`; values starting with `sk-`, `Bearer `, `eyJ` get truncated; long base64 blobs (>1024 chars matching `^[A-Za-z0-9+/=]+$`) get reported as `(base64 N chars)`.
- Persist with `await flushSceneLogBuffer(sceneId, prisma)` at end-of-impl — appends buffered entries to `Scene.generationLogJson` (cap 200 per row), best-effort (Prisma errors silently drop entries; the console log already shipped).

**`timed(label, fn)` wraps any async DB/network op** — logs `[TIMING] label — Nms` (or `[SLOW]` when ≥1000ms; `[TIMING-FAIL]` on throw). Search Vercel logs for `[TIMING]` / `[SLOW]` / `[TIMING-FAIL]`. Sync version: `timedSync()`. Source: `apps/web/lib/timing.ts`.

```ts
const result = await timed('scripts:findFirst', () => prisma.project.findFirst({ … }));
```

**Prisma `[SLOW QUERY]` tagging — automatic per query:**
`apps/web/lib/db.ts` subscribes to the Prisma `query` event and logs every query with its duration. Threshold 500ms (one-round-trip Vercel `bom1` → Supabase `ap-south-1`). Above the threshold, lines are tagged `[SLOW QUERY]`; at or below, `[query]`. Truncated to 200 chars. This means **every database query in production has a duration line in the function logs** — no opt-in required.

```ts
client.$on('query' as never, (e) => {
  const slow = e.duration >= SLOW_QUERY_MS;
  const tag = slow ? '[SLOW QUERY]' : '[query]';
  console.log(`${tag} ${e.duration}ms — ${e.query.slice(0, 200)}…`);
});
```

---

## In-Flight Timestamp Pattern

`Scene.{imageInFlightAt, voiceInFlightAt, clipInFlightAt}` are nullable `DateTime?` columns guarded by per-stage TTLs (typically 3 minutes for image, similar for voice / clip). The contract is identical in `apps/web/lib/scenes/{generate,voice,clip}-impl.ts`:

```ts
// 1. Read scene + check guard
const sceneAny = scene as unknown as { imageInFlightAt?: Date | null };
if (
  sceneAny.imageInFlightAt &&
  Date.now() - sceneAny.imageInFlightAt.getTime() < IMAGE_IN_FLIGHT_TTL_MS
) {
  return { success: false, error: 'כבר רץ — נסה שוב בעוד רגע' };
}

// 2. Set timestamp BEFORE the provider call
await prisma.scene.update({
  where: { id: sceneId },
  data: { imageInFlightAt: new Date() },
});

try {
  // 3. Provider call (Kling / OpenAI / ElevenLabs / PixVerse)
  …
} finally {
  // 4. ALWAYS clear the timestamp on the way out
  await prisma.scene.update({ where: { id: sceneId }, data: { imageInFlightAt: null } }).catch(() => {});
}
```

The TTL guards against orphaned timestamps from crashed Vercel invocations. Lipsync-only retries piggy-back on `clipInFlightAt` — same column, different code path. Add new generation flows (e.g. a `regenerateClipImpl`) to follow the SAME pattern; do not invent a per-flow flag.

---

## Two-Phase ApiCall Logging

Every paid provider call MUST produce an `ApiCall` row that flips from `status: 'in_progress'` to `'success'` or `'failed'`. Helpers in `apps/web/lib/usage/log.ts`:

```ts
const callId = await recordApiCallStart({
  provider: 'openai', operation: 'image_gen',
  model: 'gpt-image-2', userId, projectId, sceneId,
  estimatedCostUsd: priceOpenAiImage({ quality: 'medium', size: '1024x1792' }),
});
try {
  const resp = await provider.call(...);
  await recordApiCallComplete(callId, {
    success: true,
    durationMs,
    metadata: { /* safe usage payload — NEVER auth headers */ },
    ...attributeOpenAiImageCost({ model, quality, size }),
  });
} catch (err) {
  await recordApiCallComplete(callId, {
    success: false, errorMessage: (err as Error).message, durationMs,
  });
  throw err;
}
```

**Cost attribution lives in `apps/web/lib/usage/cost-attribution.ts` — one helper per provider:** `attributeOpenAiTextCost`, `attributeOpenAiImageCost`, `attributeElevenLabsTtsCost`, `attributeKlingI2vCost`, `attributePixVerseLipSyncCost`, `attributePixVerseMediaUploadCost`, `attributeLocalComposeCost`, `attributeAnthropicTextCost`, `attributeGeminiTextCost`, `attributeGrokVideoCost`. Each prefers provider-reported usage (tokens / chars / observed units) and falls back to constants in `apps/web/lib/pricing/provider-costs.ts`. The returned shape feeds `recordApiCallComplete` directly: `{ source: 'actual_usage' | 'estimate', actualCostUsd?, estimatedCostUsd, metadata }`. `costUsd` mirrors `actualCostUsd ?? estimatedCostUsd`.

**Forbidden:** computing per-call cost from balance deltas. `FORBIDDEN_balanceDeltaAttribution()` in `cost-attribution.ts` deliberately throws and is asserted in `apps/web/scripts/test-v13-pr10.ts`. Live balances (`apps/web/lib/providers/balance-snapshot.ts`, 60s cached) are observability + reconciliation only — never used to attribute cost. Don't call `prisma.providerBalanceSnapshot.create*` outside `balance-snapshot.ts` either; the cache + soft-fail handling lives there.

---

## Provider Retry Wrapper — `withRetry`

`apps/web/lib/utils/retry.ts` exports `withRetry(fn, opts?)`. Wrap the SUBMIT / one-shot call in every provider client:

```ts
import { withRetry } from '@/lib/utils/retry';

const response = await withRetry(
  () => client.responses.create({ ... }),
  { label: 'openai-script', maxAttempts: 2, earlyFailWindowMs: 15_000 },
);
```

Wrapped in: `apps/web/lib/llm/{openai,gemini,anthropic}-script-client.ts`, `apps/web/lib/llm/scene-images.ts`, `apps/web/lib/animation/{kling,grok-imagine}.ts`, `apps/web/lib/animation/motion-analysis.ts`, `apps/web/lib/animation/face-gate.ts`, `apps/web/lib/voice/elevenlabs.ts`, `apps/web/lib/animation/lipsync/pixverse.ts` (submit only; the poll loop is the implicit retry — do NOT wrap polling).

Defaults: `maxAttempts: 2` (one retry), `earlyFailWindowMs: 15000`, `backoffMs: 800`. Default `shouldRetry` accepts: HTTP 408/429/500/502/503/504 (via `err.httpStatus` or `err.status`), and message substrings `econnreset`, `etimedout`, `econnrefused`, `enotfound`, `eai_again`, `socket hang up`, `network error`, `fetch failed`, `aborterror`, `the operation was aborted`, `request timeout`, `undici`, `connect timeout`, `reset by peer`, `temporarily unavailable`. 4xx config / schema / validation errors are NOT retried.

---

## Env-Var Driven Model Selection

Every LLM client resolves its model at call time from env, with explicit pin > ergonomic toggle > default:

```ts
// apps/web/lib/llm/openai-script-client.ts
function resolveDefaultModel(): string {
  if (process.env.OPENAI_SCRIPT_MODEL?.trim()) return process.env.OPENAI_SCRIPT_MODEL.trim();
  const mode = process.env.SCRIPT_QUALITY_MODE?.trim().toLowerCase();
  if (mode === 'premium') return PREMIUM_MODEL; // 'gpt-5.4'
  return DEFAULT_MODEL;                          // 'gpt-5.4-mini'
}
```

Same shape across:
- Script provider: `LLM_SCRIPT_PROVIDER=openai|anthropic|gemini` (default `openai`).
- Script engine mode: `SCRIPT_ENGINE_MODE=legacy_full_batch|concept_interactive` (default `legacy_full_batch`); PR5's deprecated `concept_first` value silently re-maps to legacy.
- Per-provider model: `OPENAI_SCRIPT_MODEL` / `ANTHROPIC_SCRIPT_MODEL` / `GEMINI_SCRIPT_MODEL`.
- Reasoning knobs: `OPENAI_REASONING_EFFORT=none|low|medium|high|xhigh`, `OPENAI_VERBOSITY=low|medium|high`.
- Quality mode: `SCRIPT_QUALITY_MODE=balanced|premium`.
- Vision models: `OPENAI_FACE_GATE_MODEL` (default `gpt-4o-mini`).

**Operators flip env in Vercel/Railway and redeploy — no code change required.** Always include the resolution order in a comment at the top of each client (see `openai-script-client.ts` top-of-file block for the canonical example).

When two callers need to log the same provider tag (e.g. `actions.ts` records the ApiCall row, `scripts.ts` chooses the actual provider), duplicate the resolver and ADD A COMMENT calling out the duplication. Source has an example: `actions.ts` says `MUST stay in sync with resolveScriptProvider() in lib/llm/scripts.ts.` after V27.10.13 caught a drift bug.

---

## Storage Abstraction

**Never hardcode `/public/uploads/...` paths.** Always go through `getStorage()` from `apps/web/lib/storage/index.ts`:

```ts
const storage = await getStorage();
const { url } = await storage.putBytes({
  folder: 'uploads/scenes', filename: `${id}.png`,
  data: bytes, contentType: 'image/png',
});
```

`getStorage()` auto-selects: when `CLOUDFLARE_R2_BUCKET_NAME` is set, returns `R2Storage` (`apps/web/lib/storage/r2.ts`); otherwise `LocalStorage` (`apps/web/lib/storage/local.ts`). The cached singleton lives at module scope.

**Reading public assets — `readPublicAsset()`:**
`public/` is excluded from the Vercel function bundle (`next.config.mjs` `outputFileTracingExcludes`). Direct `fs.readFile(process.cwd() + '/public/...')` calls fail at `/var/task/apps/web/public/...`. Always use `apps/web/lib/storage/read-public-asset.ts`:

```ts
import { readPublicAsset, readPublicAssetAsDataUrl } from '@/lib/storage/read-public-asset';
const { bytes, contentType } = await readPublicAsset('/avatars/eran.png');
const dataUrl = await readPublicAssetAsDataUrl('/avatars/eran.png');
```

The helper's strategy: try disk first (works locally), fall back to HTTP fetch via `PUBLIC_BASE_URL` (or `NEXT_PUBLIC_APP_URL` / `VERCEL_URL`). Absolute http(s) URLs and `data:` URLs pass through.

**Locked R2 URLs in static catalogs:**
- `apps/web/lib/avatars/catalog.ts` — 25 avatar PNGs (hard-coded R2 URLs)
- `packages/shared/src/music/music-library.ts` — 17 music tracks (hard-coded)
- `apps/web/lib/voice/voice-presets.ts` — 30 voice samples; `sampleUrl` is `/api/voice/sample/<id>` (same-origin) because R2 returns 403 on OPTIONS preflight (see V12.4)

Run `npx tsx apps/web/scripts/upload-static-assets-to-r2.ts` after adding new assets to `apps/web/public/{avatars,music,voice-samples}/`. The R2 public URL `https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev` is intentionally hard-coded — it's a CDN endpoint, not a secret.

---

## ffmpeg / ffprobe in the Web App

Vercel serverless has no `ffmpeg` / `ffprobe` on PATH. The contract:
- `apps/web/lib/scenes/mux-audio.ts` exports `muxVoiceOntoVideo(input)`, `readUrlAsBuffer(url)`, `probeDurationSeconds(bytes)`, plus the `MuxError` class. Call THESE helpers — do NOT shell out to ffmpeg directly from API code.
- The helpers internally resolve the `ffmpeg-static` binary across multiple candidate paths and, on cold-start in production, download the binary to `/tmp/tachles-ffmpeg-static`, gunzip, and chmod +x (V13.1). One-time ~1-3s cold-start cost; cached for the warm container's lifetime.
- `apps/web/next.config.mjs` declares `serverExternalPackages: ['ffmpeg-static']` plus `outputFileTracingIncludes` for `/api/scenes/[id]/clip` and `/api/scenes/[id]/**`. Duration probing uses the pure-JS `music-metadata` package (NOT `ffprobe-static`) to stay under Vercel's 250 MB function-size limit.
- The worker has its own apt-installed ffmpeg (`apps/worker/Dockerfile`) and uses a 3-stage low-mem composition pipeline at `apps/worker/src/providers/composition/ffmpeg.ts`. Do NOT switch back to single-pass `concat-filter` — the 3-stage pipeline (per-clip normalize → concat-demuxer with `-c copy` → optional overlay) is what avoids both Railway OOM-kill and the original codec-mixing corruption.

---

## `export const maxDuration` Placement

Long-running Server Actions (script gen, multi-scene batch ops) require `maxDuration` on the **page.tsx**, not on `actions.ts` (Next.js rejects it there). Example from `apps/web/app/(dashboard)/projects/[id]/scripts/page.tsx`:

```ts
// Script generation can take up to ~3min on Sonnet 4.6 (V14):
// Product Intelligence + 6 parallel calls, each ~3K tokens of structured JSON.
// 300s is the Hobby plan ceiling — this gives headroom without forcing a plan upgrade.
export const maxDuration = 300;
```

Without this, Vercel kills the function at 60s and the client hangs in pending state forever. New pages whose Server Action could exceed 60s MUST set `maxDuration` (max 60 on Hobby for non-pinned routes; up to 300 on Hobby with explicit declaration; up to 900 on Pro).

---

## Admin Auth Helpers

**Two separate functions; do not confuse them.**

- `requireAdmin()` in `apps/web/lib/auth/sync-user.ts` — for **pages** under `app/(admin)/`. Resolves the Supabase user, syncs into the `User` table, checks email against `ADMIN_EMAILS` env (comma-separated), redirects on failure. The first registered admin email is auto-promoted.
- `requireAdminApi()` in `apps/web/lib/auth/admin-api.ts` — for **API routes** under `app/api/admin/`. Returns `{ ok: false, response: NextResponse.json(..., { status: 401|403 }) }` on failure so the caller returns the response. Pages redirect; API returns JSON. Use the right one for the surface.

Every `/api/admin/*` route handler MUST `await requireAdminApi()` first and return its 401/403 response on `!ok`.

---

## Secret Handling

- All credentials via env vars. **No secrets hardcoded anywhere.**
- The `ugc-video-platform-secrets/` directory and its `.zip` are git-ignored (live API keys for OpenAI, Kling, PixVerse, ElevenLabs, Supabase). Don't commit them.
- `OPENAI_ADMIN_API_KEY` (sk-admin-…) is preferred over `OPENAI_API_KEY` for Administration API reads (the regular `sk-svcacct` / `sk-…` keys are scoped to model invocation only).
- `recordApiCallComplete(...)`'s `metadata` field is JSON for forward compat — provider-specific dimensions live there. **NEVER store auth headers / api keys** in metadata. The `logStage()` masking layer scrubs the obvious shapes; double-check anything you put through it.
- `safeFetch` uses `redirect: 'manual'` with explicit re-validation of every hop's hostname against `isPrivateOrLocalHost()` (V26.SEC). Don't bypass.

---

## Comments

**When to comment:**
- Top-of-file block explaining the module's role + the resolution order for env knobs (canonical: `apps/web/lib/llm/openai-script-client.ts`).
- Multi-paragraph rationale comments for ANY load-bearing subtle decision (region pinning, the 3-stage ffmpeg pipeline, the in-flight TTL choice, why a Server Action was rejected for a Route Handler). The `/* … */` form is rare; `//` runs of 5-30 lines are the house style. See `apps/web/lib/scenes/clip-impl.ts` lines 1-20 and `apps/web/lib/scenes/mux-audio.ts` lines 20-90 for the canonical shape.
- Versioning markers in comments: `V12.4 — voice-sample preview CORS fix`, `V26.10 — per-scene clip regen runs in parallel`, `V27.11.PR2 — DEFAULT flipped back to gpt-5.4-mini`. These markers cross-reference CLAUDE.md history.

**JSDoc / TSDoc:**
Used inconsistently — only on exported helpers whose contract is non-obvious (`logStage`, `flushSceneLogBuffer`, `withRetry`, `attributeOpenAiTextCost`). Not required on every export.

---

## Function Design

**Size:** No hard rule. Implementation cores routinely run 100-300 lines (`generate-impl.ts` ~470 lines, `clip-impl.ts` ~1500 lines) because they orchestrate guard + ApiCall + provider + cost + state machine + log buffer flush all in one transaction-shaped flow. Don't fragment them just for size — the `_impl` boundary is what justifies the length.

**Parameters:** Object-arg pattern for anything taking 3+ params. `withRetry(fn, opts?)`, `recordApiCallStart(input)`, `attributeOpenAiTextCost({ model, inputTokens, outputTokens })`, `buildImageBrief(input)`. Two-arg positional only for the obvious pure-pair shape (`logStage(stage, scope)`, `cn(...inputs)`).

**Return values:** Tagged-union result objects, never throw-and-catch as a control-flow channel. Canonical shape from `generate-impl.ts`:

```ts
export interface GenerateSceneResult {
  success: boolean;
  error?: string;
  needsCredits?: boolean;
  safetyBlocked?: boolean;
  timedOut?: boolean;
  rateLimited?: boolean;
  spendCapExceeded?: boolean;
  freeRegen?: boolean;
  imageUrl?: string;
}
```

The Server Action and the Route Handler each map this to their own response shape. Errors from provider clients DO throw — the impl core catches and translates to flags.

---

## Module Design

**Exports — named only.** No default exports anywhere in `apps/web/lib`, `apps/worker/src`, or `packages/*/src`. (The exception: Next.js `page.tsx` / `layout.tsx` / `route.ts` files require default-export functions — that's framework, not style.)

**Barrel files:** `packages/shared/src/index.ts` is the only barrel and the only entry for the worker (which uses Node moduleResolution and can't navigate `exports` subpaths). The web app may use named subpaths from the package's `exports` map.

**House rule (CLAUDE.md):** Always update CLAUDE.md / STATUS.md / README.md in the SAME commit as a behavior-changing change. The "Current version" + dated entry at the top of `.claude/CLAUDE.md` is part of the contract.

**Trunk-based dev (user memory):** Commit on `main` only. Small commits + pushes. No long-lived feature branches. The one exception in the current repo is `v27-11-concept-interactive-ux` (V27.11.PR6) — explicitly held back awaiting manual browser UAT before merge.

---

## What NOT to do (hard rules from CLAUDE.md)

- Do not add mock providers or fake data to the active render/voice/clip path. `mock.ts` files exist as templates only, never instantiated.
- Do not switch the worker ffmpeg compose back to single-pass `concat-filter` — Railway OOM-kill at frame ~75.
- Do not use proportional caption timing — always use real word timings from ElevenLabs (`captionChunksJson`, scene-relative ms, offset to global timeline in `render-processor.ts`).
- Do not skip the in-flight timestamp pattern when adding new generation actions.
- Do not add new Prisma enums for things that might evolve — use `String` columns (see `framework`, `sceneGoal`, `sceneGenerationType`).
- Do not import from package `exports` subpaths in the worker (Node moduleResolution limitation).
- Do not move Vercel functions out of `bom1` while Supabase stays in `ap-south-1` — every cross-region query costs ~250ms.
- Do not put `export const maxDuration` in a `'use server'` actions.ts file — Next.js rejects it.
- Do not write final MP4s / images / voice MP3s to `apps/web/public/uploads/` in production code — Vercel's serverless filesystem is read-only between requests.
- Do not call `fs.readFile(process.cwd() + '/public/...')` from anywhere outside `apps/web/lib/storage/local.ts` and `apps/web/lib/storage/read-public-asset.ts`.
- Do not put a `startCommand` in `railway.toml` — it silently overrides the Dockerfile `CMD`.
- Do not pre-compile the worker's TypeScript expecting that to remove the tsx runtime requirement.
- Do not store new static assets only on disk — also push them to R2 via `upload-static-assets-to-r2.ts`.
- Do not compute per-call provider cost from balance deltas. `attribute<Provider>Cost` in `apps/web/lib/usage/cost-attribution.ts` is the only sanctioned path. `FORBIDDEN_balanceDeltaAttribution()` exists to keep this honest, asserted in `apps/web/scripts/test-v13-pr10.ts`.
- Do not call `prisma.providerBalanceSnapshot.create*` outside `apps/web/lib/providers/balance-snapshot.ts`.
- Do not select `ApiCall.metadata` in list views. The recent-calls API returns it ONLY when `?expand=metadata` is on.

---

*Convention analysis: 2026-05-03*
