# tachles

## What This Is

Hebrew-first AI platform for Israeli UGC product video ads. Paste a product URL, walk away, come back to a finished 9:16 MP4 with Hebrew voice-over, RTL captions, lip-sync, and background music — production-grade, ready for TikTok / Reels / Shorts / WhatsApp Status. Target users: Israeli founders, in-house brand teams, and agencies serving Israeli market.

## Core Value

**A short-form Hebrew ad that sounds like an Israeli — not translated American copy — and ships from URL to MP4 without operator hand-holding.** If everything else fails, the Hebrew register and the URL→MP4 unattended flow must work.

## Requirements

### Validated

<!-- Shipped and confirmed valuable through V27.11.PR6. -->

**Pipeline (URL → MP4)**
- ✓ Product URL scrape (cheerio + JSON-LD + OG + Shopify + microdata + quick-suggest) — V12
- ✓ Product Intelligence (dossier + visual analysis + audience inference, gpt-5.4-mini + gpt-4o-mini) — V12
- ✓ 25-avatar Israeli persona catalog with archetype + religiousRegister — V14 PR1
- ✓ 30 ElevenLabs `eleven_v3` voice presets, word-level timing — V12
- ✓ Scene image gen (gpt-image-2 medium 1024×1792, single-pass, deterministic Image Brief) — V13 PR1
- ✓ Animation plan builder + Kling Omni v3 i2v + face-gate → PixVerse LipSync — V13 PR3
- ✓ Per-scene clip provider toggle (Kling / xAI Grok), lipsync scenes pinned to Kling — V26
- ✓ Final composition: 3-stage low-mem ffmpeg (per-clip normalize → concat-demuxer + -c copy → optional overlay) → R2 — V13.1
- ✓ Caption sync via probe-after-normalize cumulative offsets — V26.13

**Hebrew + Israeli realism**
- ✓ V6 system prompt with REGISTER LOCK (תכל'ס / סבבה / וואלה DO; translated-American patterns DON'T) — V14 PR5
- ✓ 51-cue Israeli realism library across 10 categories (sockets, architecture, streets, vehicles, brands, food, etc.) — V14 PR1
- ✓ 8 named scene presets (`kitchen_with_morning_light`, `tel_aviv_street_evening`, `supermarket_aisle`, …) shared between script + image-brief layers — V14 PR1
- ✓ Outfit lock (deterministic, religious-gated, persisted to `Project.productData.lockedOutfit`) — V14 PR3
- ✓ Universal `SINGLE_FRAME_RULE` in scene-image-prompts.ts (anti-collage hardening) — V27.11.PR1
- ✓ Anti-collage schema cleanup: `before_after` removed from `SCENE_GENERATION_TYPES`; `comparison_split → comparison_focus` — V27.11.PR4

**Concept-first interactive script UX (behind feature flag)**
- ✓ `CONCEPT_SYSTEM_PROMPT` (~6K chars, 16% of full SCRIPT_SYSTEM_PROMPT) generates 6 lightweight concept cards — V27.11.PR6
- ✓ Server actions: generate / regenerate-selected (slot-stable, byte-identical preservation) / regenerate-all / expand-picked (1–3 selected; per-failure refund) — V27.11.PR6
- ✓ ConceptFlow state machine (idle / generating / picking / regenerating / expanding / error), auto-preselect top-3-by-quality — V27.11.PR6
- ✓ Persistence via `Project.productData.pendingConcepts` — no DB migration — V27.11.PR6
- ✓ Behind `SCRIPT_ENGINE_MODE=legacy_full_batch|concept_interactive`; default = legacy, zero behavior change — V27.11.PR6

**Infrastructure + observability**
- ✓ Vercel `bom1` (Mumbai) co-located with Supabase `ap-south-1` — V12 (load-bearing)
- ✓ Cloudflare R2 for all production assets (avatars, music, voice-samples, scene images, voice MP3s, final MP4s) — V12.1-V12.3
- ✓ ffmpeg-static cold-start download for Vercel serverless web app — V13.1
- ✓ Two-phase `ApiCall` logging (`in_progress` → `success`/`failed`) — V12
- ✓ Per-call cost attribution via `attribute<Provider>Cost()` helpers; balance-delta attribution forbidden by verified guard — V13.2
- ✓ `/admin/costs` live provider balances (Kling / PixVerse / ElevenLabs / OpenAI / xAI / Gemini) with per-provider fallback to local `ApiCall` aggregates — V12.5–V12.6, V25, V26
- ✓ `/admin/scenes/[id]/debug` per-scene introspection (status, error, generation log, image brief, motion analysis, V14 fields) — V13 PR8 + V14 PR6
- ✓ Admin polling cadence: 4s in-flight / 8s recent calls / 20s summary / 60s balances + `document.visibilityState` pause — V13.2
- ✓ 13 composite indexes on `ApiCall` / `CreditTransaction` / `RenderJob` / `Project` / `ProviderBalanceSnapshot` — V13.2
- ✓ `/admin/scenes/[id]/debug` and `/admin/projects/[id]/diagnostic` — V14 PR6

**Security (V26.SEC audit, all 5 findings fixed)**
- ✓ Auth on every `/api/*` route; admin gate via `requireAdminApi()` for `/api/admin/*` — V13.2
- ✓ Per-resource ownership checks on render status / events / scenes / projects — V26.SEC
- ✓ SSRF: `redirect: 'manual'` + per-hop hostname re-validation against `isPrivateOrLocalHost()`, 5-hop cap — V26.SEC
- ✓ Zero raw SQL (`$queryRaw`/`$executeRaw`); zero `spawn`/`exec` with user input; no hardcoded secrets — V26.SEC
- ✓ Demo route gated by `getOrCreateAppUser()` — V26.SEC

**Design language (V27 Tri-Modal Liquid)**
- ✓ Three coordinated modes — Vercel (chrome), Krea (wizard step 4-7 + scene cards), Granola (modals) — V27.0 Wave 1
- ✓ Color + motion = state, not decoration: `--ai` (78° lime) only inside `[data-ai-active]`, `--success` (150° green) only on completion — V27.0
- ✓ View Transitions API (browser-native) for all 4 wizard hops — V27.4 (deliberately NOT React 19 `unstable_ViewTransition`)
- ✓ Heebo + Geist Sans + Geist Mono (Vercel-mode DNA, tabular numbers) — V27.0
- ✓ 4-tier elevation (`tier-surface` / `tier-elevated` / `tier-overlay` / `tier-atmosphere`); `tier-liquid` reserved for landing hero only — V27.0

**Plans + credits**
- ✓ 4 tiers (free_trial 30 / creator 500 / brand 1800 / agency 6000) with first-regen-free, per-user rate limit, daily spend cap — V12

### Active

<!-- Filled by /gsd-new-milestone for current milestone scope. -->

## Current Milestone: v28.0 Script Engine Quality v2

**Goal:** Make the script engine produce *diverse* concepts with *spoken Hebrew*, faster — and prove every fix with a measurable eval, not vibes.

**Three concrete problems being solved (from production usage):**

1. **Generic / non-distinct concepts** — 4 of 6 cards share the same `big_idea`. Frameworks are labels, not enforcement.
2. **Hebrew is written, not spoken** — REGISTER LOCK in the prompt is not enforced in output: תכל'ס / וואלה / סבבה appear ~0 times. Sentences read as direct translation from English ("אף אחד לא אומר כמה זה מבלבל" = "nobody tells you how confusing it is").
3. **~2 minutes per product** — measured from logs: machine ~63s, wall ~125s including user waits. Breakdown: 30s PI + 16s concept batch + 13.5s expand + dead transitions with no feedback. Adds up to hours per week of personal use.

**Target features (one phase, six sub-tasks, executed in one session):**

- Eval harness with 4 metrics + gold set (8–10 projects across 3 categories)
- Baseline run on V27.11.PR6 captured to `.planning/eval/baselines/`
- Diversity enforcement (`big_idea_axis` enum + ban-list + diversity-based picker; drop self-rated `quality_score`)
- Register hard enforcement (`casual_markers_used` schema field + post-gen regex check + retry pass + anti-examples in prompt)
- Latency reduction (PI prefetch in background, music_profile consolidated to one post-call, streaming concept generation, skeleton placeholders)
- Framework validators (conditional — only if baseline `framework_signal_match < 80%`)

**Key context / constraints (load-bearing):**

- Eval is **integral** to the phase, not a separate gate that waits — the same session that builds the eval runs it as the baseline.
- V27.11.PR6 (concept-interactive UX) is the production starting point. The PR6 branch merge / UAT is **out of scope** for this milestone (it's release management, not engine quality).
- Bottleneck #5 from the audit (Anthropic schema cache split + cache_read attribution) is **deferred** — it's cost optimization at ~10–15%, and the user's pain is quality + latency, not cost.
- Per-framework prompt split (audit recommendation E) is **conditional on eval evidence** — only if baseline `framework_signal_match < 80%`.
- Single phase, six sub-tasks, sequential within session. No multi-phase split — this is AI tuning + observability, not parallelizable infra work.

### Out of Scope

<!-- Explicit boundaries with reasoning to prevent re-adding. -->

- **Multi-language output (English / Arabic / Russian / etc.)** — Hebrew-first is the moat. Multi-language is a different product.
- **Light mode UI** — deliberate dark-only brand choice. Not a backlog item.
- **Drag-to-reorder scenes** — no product evidence; scenes are LLM-ordered with deterministic constraints.
- **Premium Hebrew typography (Ploni / Almoni / Fraktion)** — budget decision; defer until needed.
- **i18n beyond Hebrew/English UI surfaces** — not on roadmap.
- **Image QA auto-regen loop** — V13 PR1 removed it; quality strategy moved upstream to creative planning + deterministic Image Brief. Wrong layer.
- **`before_after` as a single-frame scene_generation_type** — V27.11.PR4 removed it; the creative beat is now rendered as TWO consecutive scenes (state 1 + state 2), never as a single panel-split frame.
- **`comparison_split` frame_strategy** — V27.11.PR4 renamed to `comparison_focus` with single-state composition rule (sharp product + alternative desaturated/out-of-focus).
- **Mocks in active render/voice/clip path** — `mock.ts` files exist as templates only, never instantiated.
- **`fs.readFile(process.cwd() + '/public/...')` outside `lib/storage/local.ts` + `lib/storage/read-public-asset.ts`** — Vercel excludes `public/` from the function bundle; V12.1-V12.3 fixed 9 violators.
- **`maxDuration` in Server Actions `actions.ts`** — Next.js rejects it; must live in the page.tsx that renders the form.
- **`concat-filter` for ffmpeg compose** — caused Railway OOM-kill at frame ~75. The 3-stage normalize→concat-demuxer→overlay pipeline is the only sanctioned path.
- **Pre-compiled worker TS without tsx runtime** — workspace packages (`@ugc-video/shared`, `@ugc-video/prompts`) declare `"main": "./src/index.ts"`, so the worker imports `.ts` files at runtime; tsx is mandatory.
- **`startCommand` in `railway.toml`** — silently overrides Dockerfile `CMD`; cost a deploy with duplicated `apps/worker/apps/worker/...` paths.
- **Cross-region Vercel ↔ Supabase** — `bom1` ↔ `ap-south-1` co-location pinned in `vercel.json`. Every cross-region query costs ~250ms.
- **Balance-delta cost attribution** — `FORBIDDEN_balanceDeltaAttribution()` throws; verification gate in `test-v13-pr10.ts` keeps it honest. Unsafe under concurrency, creates rate-limit pressure on provider /balance APIs, makes tests non-deterministic.
- **Selecting `ApiCall.metadata` in list views** — only when `?expand=metadata` is on. Including JSON in 50-row table makes responses 50–200KB.
- **Hardcoded `/public/uploads/...` paths in production code** — Vercel serverless filesystem is read-only between requests. Always go through `lib/storage/index.ts`.
- **New Prisma enums for evolving values** — use `String` columns (see `framework`, `sceneGoal`, `sceneGenerationType`).
- **Importing from package `exports` subpaths in the worker** — Node `moduleResolution` limitation.
- **Committing `ugc-video-platform-secrets/` directory** — contains live API keys; git-ignored intentionally.

## Context

**Domain.** Israeli D2C / DTC brands and creators need Hebrew video ads that *sound* Israeli (תכל'ס register, local cues, Israeli architecture/streets/brands/food, religious-register awareness) — not translated American copy with a Hebrew layer slapped on. Generic AI video tools fail this register test consistently; the entire pipeline is engineered to enforce it from script through scene image through voice through caption.

**Output spec.** 9:16 MP4 ads, 15s or 30s, Hebrew voice-over + RTL captions burned via libass + optional background music from a 17-track Mixkit library scored against `musicProfile`. Final ship time: 4–7 minutes from URL.

**Production state.** Web on Vercel `bom1` (Mumbai), worker on Railway (Dockerfile, ffmpeg pre-installed), DB on Supabase `ap-south-1`, queue on Redis Cloud free tier, storage on Cloudflare R2, auth via Supabase. Live URL: `https://tachles-lac.vercel.app`. Latest shipped: V27.11.PR6 (concept-first interactive script UX behind `SCRIPT_ENGINE_MODE` feature flag, branch `v27-11-concept-interactive-ux` not yet merged to main).

**The script-quality audit.** `.planning/debug/v27-script-quality-audit.md` is the diagnose-only audit (`status: diagnosed`) that triggered the V27.11 series. Five evidence-backed bottlenecks were identified: (1) PI block injected uncached × 6 in user prompt, (2) 18-layer system-prompt entropy, (3) ~140 mandatory output fields per script forcing decode-bound latency, (4) defaulted to full `gpt-5.4` instead of mini, (5) Anthropic schema bundled in cached system block + cache_read tokens not honored in cost attribution. V27.11.PR1–PR4 + PR6 closed bottlenecks #1, #2, #3, #4 and the collage failure mode at every layer (image prompt + schema + system prompt + brief-builder bridge). The "Script Engine Quality v2" milestone (the one being initialized after this bootstrap) continues from this audit's open recommendations.

**Reference docs (already in `.planning/`).**
- `.planning/codebase/ARCHITECTURE.md` — system overview + dataflow
- `.planning/codebase/STACK.md` — versioned dependency list
- `.planning/codebase/STRUCTURE.md` — repo layout
- `.planning/codebase/INTEGRATIONS.md` — provider integration map
- `.planning/codebase/CONVENTIONS.md` — coding patterns
- `.planning/codebase/CONCERNS.md` — known issues
- `.planning/codebase/TESTING.md` — test inventory
- `.planning/debug/v27-script-quality-audit.md` — diagnose-only root-cause report (the source of the V27.11 work)
- `.planning/MILESTONES.md` — version-by-version history with shipped + failed/regressed decisions

## Constraints

- **Region pinning** — Vercel `bom1` and Supabase `ap-south-1` MUST stay co-located. Verified after every deploy via `curl -sI https://tachles-lac.vercel.app/api/health | grep x-vercel-id` (middle segment must be `bom1`).
- **Storage** — never hardcode paths; always go through `getStorage()` from `lib/storage/index.ts`. Production reads everything from R2 CDN.
- **Per-call cost attribution** — every provider call MUST go through `attribute<Provider>Cost(...)` from `lib/usage/cost-attribution.ts`. Balance-delta attribution is forbidden and gated by a verification test.
- **Two-phase ApiCall logging** — insert `in_progress` row at start, update to `success`/`failed` on finish. Never log only on success.
- **In-flight timestamps** — `imageInFlightAt` / `voiceInFlightAt` / `clipInFlightAt` must be set before any provider call and cleared on finish, or double-clicks generate duplicate paid calls.
- **Hebrew TTS text** — use `scene.textHebrewTts` (cleaned), not `scene.textHebrew` (raw display).
- **Caption timing** — always use real word timings from ElevenLabs; never proportional estimation.
- **No mocks in active path.**
- **Trunk-based dev** — commit on main, small commits + pushes, no long-lived feature branches (per user preference).
- **Update STATUS.md / CLAUDE.md / README.md in the same commit** as code changes (per user preference).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Vercel `bom1` ↔ Supabase `ap-south-1` co-location | Cross-region adds ~250ms per Prisma query | ✓ Locked |
| Cloudflare R2 over Vercel Blob / S3 | Egress-free CDN; cheaper at video scale | ✓ Locked (V12.1-V12.3) |
| `ffmpeg-static` cold-start download in web app | Vercel bundler refuses to ship the binary even with `serverExternalPackages` | ✓ Locked (V13.1) |
| 3-stage low-mem ffmpeg in worker | Single-pass `concat-filter` OOM-killed Railway at frame ~75 | ✓ Locked (V13.1) |
| OpenAI `gpt-5.4-mini` default for scripts | After PR2 prompt cuts + cached-prefix PI, smaller model holds register at 1/3 cost | ✓ Active default (V27.11.PR2) |
| Anthropic `claude-sonnet-4-6` (effort:low + thinking:disabled) as alternative | Higher creative ceiling; gated by `LLM_SCRIPT_PROVIDER=anthropic` | ✓ Locked (V27.10.6) |
| Gemini 3 Pro preserved as experiment path | Lost head-to-head on visual-prose quality but cache behavior is interesting | ⚠️ Behind flag (V25→V26.8 reverted as default; do not re-default without evidence) |
| ElevenLabs `eleven_v3` with-timestamps | Word-level timing is load-bearing for caption sync | ✓ Locked |
| Kling Omni v3 i2v + PixVerse LipSync via face-gate routing | Best Hebrew-language lip-sync available | ✓ Locked |
| xAI Grok Imagine as per-scene alternative clip provider | Diversification; lipsync scenes still pinned to Kling | ✓ Locked (V26) |
| `gpt-image-2` medium 1024×1792 + deterministic Image Brief | Single-pass, no QA loop; quality moved upstream | ✓ Locked (V13 PR1) |
| Universal `SINGLE_FRAME_RULE` in scene-image-prompts + comparison-guard bridge in image-brief-builder | Anti-collage at every layer | ✓ Locked (V27.11.PR1) |
| Removed `before_after` from `SCENE_GENERATION_TYPES`; renamed `comparison_split → comparison_focus` | Schema-level closure of collage failure mode | ✓ Locked (V27.11.PR4) |
| Concept-first script UX behind `SCRIPT_ENGINE_MODE=concept_interactive` | User picks 1–3 of 6 lightweight cards before paying for full expansion | ✓ Behind flag (V27.11.PR6); default still legacy until manual UAT |
| OpenAI Responses API (not Chat Completions) | 40–80% better prefix-cache utilization on the 6-parallel batch | ✓ Locked (V26.9) |
| Per-call cost attribution via `attribute<Provider>Cost`; never balance-delta | Concurrency-safe, no rate-limit pressure on /balance APIs | ✓ Locked + verified by test (V13.2) |
| Two-phase `ApiCall` logging (`in_progress` → `success`/`failed`) | Surfaces stuck calls; required for `/admin/in-flight` view | ✓ Locked |
| Admin polling cadence 4s/8s/20s/60s + tab-visibility pause | Balances freshness against cache-burst | ✓ Locked (V13.2) |
| `OPENAI_ADMIN_API_KEY` separate from `OPENAI_API_KEY` | Administration API requires sk-admin-… scope; model calls work with sk-svcacct/sk-… | ✓ Locked (V12.7) |
| BullMQ + Redis Cloud + Railway Docker worker | ffmpeg + 5+ minute jobs incompatible with Vercel function limits | ✓ Locked |
| `tsx watch` (dev) / `tsx` (prod) for worker — NO pre-compile | Workspace packages declare `"main": "./src/index.ts"` | ✓ Locked |
| `String` columns over Prisma enums for evolving values | `framework`, `sceneGoal`, `sceneGenerationType` evolve too often for migrations | ✓ Locked |
| V27 Tri-Modal Liquid design language | Vercel/Krea/Granola modes with state-driven color and motion | ✓ Locked (V27.0) |
| View Transitions API (browser-native) over React 19 `unstable_ViewTransition` | Browser-native is stable; React API is unstable. V27.2 wave 3 deferral was a wrong call corrected in V27.4 | ✓ Locked (V27.4) |
| Heebo + Geist Sans + Geist Mono | Replaces V14's IBM Plex / JetBrains; tabular numbers fix `/admin/costs` alignment | ✓ Locked (V27.0) |
| Trunk-based dev (commit on main, small commits + pushes) | User preference for visibility + speed | ✓ House rule |
| Update STATUS.md / CLAUDE.md / README.md in same commit | User preference for free-context-on-next-session | ✓ House rule |

---
*Last updated: 2026-05-03 — milestone v28.0 "Script Engine Quality v2" initialized via `/gsd-new-milestone`. Anchored to `.planning/debug/v27-script-quality-audit.md` for what's IN scope (diversity / register / latency) and what's OUT (PR6 rollout, Bottleneck #5, per-framework split unless eval demands it).*
