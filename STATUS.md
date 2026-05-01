# tachles · STATUS

Living document. Last update: **2026-05-01** (V25 — script generation switched from OpenAI gpt-5.4-mini to Google Gemini 3 Pro. New env var `GEMINI_API_KEY` (gitignored locally + Vercel + Railway), new client wrapper `apps/web/lib/llm/gemini-client.ts` (uses `@google/generative-ai` SDK with `responseMimeType: "application/json"` + `responseSchema`; includes a `stripIncompatibleKeywords()` deep-copy that removes `additionalProperties` since Gemini's validator rejects it). `apps/web/lib/llm/scripts.ts` rewritten — same parallel 6-framework structure (`Promise.all` over `FRAMEWORK_ORDER`), but each call now goes through `geminiStructuredCall()` with `SCRIPT_SYSTEM_PROMPT` as `systemInstruction` and the existing `SINGLE_SCRIPT_JSON_SCHEMA`. Token accounting from `usageMetadata.promptTokenCount` / `candidatesTokenCount`. New env var `GEMINI_SCRIPT_MODEL` (default `gemini-3-pro`). Cost attribution: `priceGeminiText()` in `lib/usage/pricing.ts` with HSL-style per-1M-token rates (gemini-3-pro = $1.25 input / $10 output, plus 2.5-pro / 2.5-flash / 2.0-flash / 1.5-pro / 1.5-flash entries); `attributeGeminiTextCost()` in `lib/usage/cost-attribution.ts` mirrors the OpenAI version. Provider tagging: `scripts/actions.ts → recordApiCallStart({ provider: 'gemini', ... })` so the admin /admin/costs dashboard groups script spend correctly. Admin dashboard: `PROVIDER_LABEL` extended with `gemini` and `xai`; new "Google Gemini" balance card always renders the V12.6 ProviderFallbackCard (the Generative Language API doesn't expose per-key billing). New `fetchGeminiBalance()` returns the explicit "no balance API" sentinel error. `PROVIDER_COST_ESTIMATES_USD.gemini_script_batch` constant added (defaults $0.04, falls back to legacy `COST_OPENAI_SCRIPT_BATCH_USD` env). The other OpenAI-backed code paths (motion-analysis / scene-image / quick-suggest / regen-prompt / audience-inference) stay on OpenAI for now. tsc clean. **V23+V24** — dashboard luxury polish + full mobile responsiveness. **V23 luxury polish**: (1) New `<WizardProgressStrip />` component (`apps/web/components/wizard/wizard-progress-strip.tsx`) — visual rendition of the 6-step user flow as 6 glass tiles with monospace step numbers, Lucide icons, current-step `shadow-glow` + animated pulse, completed-step accent + "בוצע" tag, future-step dashed icon + 50% opacity. Each tile is a Link to the step's route when reachable. (2) New `<SectionKicker />` component (`apps/web/components/ui/section-kicker.tsx`) — the small uppercase mono tag from the landing ("הדמויות · The Cast"). Reused on the dashboard for every major section heading. (3) Dashboard restructured: featured-project block at the top (project name + "פעיל" indicator + WizardProgressStrip showing where the user is), then bento with hero CTA + stats, then completed-videos showcase with kicker, then in-progress and completed sections each prefixed with `<SectionKicker />`. Headlines use `text-2xl md:text-3xl font-black` for section H2s consistent with the landing's section H2 scale. **V24 mobile**: (1) Sidebar hidden on screens < md (`hidden md:flex`). (2) New `<MobileNav />` client component (`apps/web/components/layout/mobile-nav.tsx`) — hamburger button in topbar (44px target) + sliding drawer panel from the right (RTL-natural starting edge), 300px wide / max 85vw, glass-strong + shadow-floating. Closes on backdrop click / ESC / route change. Body-scroll-lock while open. Renders the same nav structure as `<Sidebar />` so users have the full experience on mobile. (3) Topbar tightened: `px-4 md:px-6`, "תוכניות" button `hidden md:inline-flex` (drawer carries it on mobile), avatar bumped from `h-9 w-9` to `h-11 w-11` for touch target compliance. (4) Bento card span fixed: `bento-3x1` was overflowing the 2-col mobile grid; switched hero CTA to `bento-2x1 md:bento-2x2`. (5) All drawer nav links use `min-h-[44px]` + py-3. tsc clean. **V22.2** — dead code cleanup. Removed 9 categories of code that nothing imported / called: (1) `defaultVoicePresetForAvatar` + `mapAvatarAgeToVoiceAge` from `apps/web/lib/voice/voice-presets.ts` — added in V14.2-B, reverted same release, unreferenced ever since. (2) `buildCreditMutationOps` import from `apps/web/app/(dashboard)/projects/[id]/scripts/actions.ts` — never called in that file (real callers are voice-impl/clip-impl/generate-impl). (3) `GenerateAllVoicesButton` (entire 115-line component) from `videos/client-bits.tsx` — was rendered until V14.7 voice-UI consolidation, never re-imported after. (4) Voice-batch event constants + listener effect (`VOICES_BATCH_START`/`VOICES_BATCH_DONE` + voiceBatchPolling state + the useEffect listening to them). (5) `voiceFormAction` / `voiceState` / `wasVoicePendingRef` / `voiceUrlAtPendingRef` + the post-action voice-poll-burst useEffect inside SceneClipCard — voice forms moved to step 4, none of this fired anymore. (6) `generateSceneVoiceAction` + `GenerateVoiceState` type from `videos/actions.ts` — the only consumer was the deleted form. (7) `generateSceneVoiceImpl` import in the same actions file. (8) Four worker mock providers `apps/worker/src/providers/{composition,tts,avatar,broll}/mock.ts` — CLAUDE.md flagged them as "templates only, never instantiated"; verified zero importers. (9) `apps/web/scripts/apply-v14-1c-index.ts` — V14.1c migration applied to production on 2026-05-01, script will never re-run. The voice-state simplification also let `showVoiceWorking` collapse from `voicePending || voiceBatchPolling || voiceInFlightServer` to just `voiceInFlightServer`. tsc clean across all 4 workspaces. **V22.1** — completed-videos showcase actually plays the videos. The V22 thumbnails were broken because the Prisma query selected `project.scripts[0]` (first script in DB, often not the SELECTED one with generated images) and filtered scenes by `sceneOrder: 0` which sometimes didn't match. V22.1 fixes both: (1) **Switched to `<video src={finalVideoUrl} muted autoPlay loop playsInline preload="metadata">`** so each tile plays the ACTUAL generated MP4 ad on loop — way more impressive than a static thumbnail. (2) Query rebuilt to use `project.selectedScript.scenes` filtered by `imageUrl: { not: null }` and ordered by sceneOrder ASC, taking the first hit. The first-scene image is now used as a `poster` prop on the `<video>` so it shows instantly while the MP4 loads, and as a fallback `<img>` for older RenderJobs that lack `finalVideoUrl`. Hover effect refined: bottom-only gradient (was full overlay) so the video stays visible, dim-on-hover layer to surface the Play button. **V22** — dashboard upgrade to landing-grade design language. User feedback: "אהבתי את הדף הראשי, אפשר לקחת משם השראה לדשבורד". Five concrete additions:

1. **Animated SVG aurora background** (`apps/web/components/layout/dashboard-aurora.tsx` — NEW) — same drift technique as landing-hero (3 radial blobs, 22-32s loops, mix-blend-screen) but scaled down (380/340/320 radius vs 500/450/400) so it doesn't fight content. Replaces the static `bg-mesh-soft` wrapper. Layered with `bg-noise` overlay.

2. **Hero typography upgraded** to landing scale: was `text-3xl md:text-5xl`, now `text-4xl md:text-6xl lg:text-7xl font-black leading-[0.95]` matching the landing hero. Plus a chip badge above the H1 (gradient pill + ping dot + "לוח בקרה · Studio") matching the landing's "AI-native לשוק הישראלי · 2026" pattern.

3. **AnimatedCounter on stats tiles** — imported from `landing-hero.tsx`. Stats numbers now count up from 0 to value with `easeOutQuart` over 1.5s when the tile enters the viewport. Number size increased to `text-4xl md:text-5xl font-mono`. Icon tile upgraded from solid to `bg-gradient-to-br from-primary/30 to-accent/15` (matches landing's stat icons).

4. **`<CompletedVideosShowcase />`** (NEW, returning users only) — 6 most-recent completed RenderJobs as 9:16 thumbnail cards. Uses each project's first-scene `imageUrl` as the visual (since we don't generate dedicated MP4 thumbnails). Hover: `scale-110` on the image + Play button overlay (h-12 rounded-full primary/90 + Play Lucide icon). Numbered top-right badge. Same visual language as the landing avatar showcase grid. Header: "הסרטונים שיצרת" + "ספריית מלאה →" link to /library.

5. **`<LiveActivityTicker />`** lifted from landing-hero into the dashboard — appears for returning users between the hero header and the bento grid. Same component, mock messages cycling every 3.5s with ping-dot indicator.

The dashboard now reads as the same product as the landing — animated aurora canvas, gradient-tile icons, mono-font massive numbers with counter animation, hover-scale showcase grids with Play overlays, glass surfaces throughout. tsc clean. **V21.1** — full workspace polish., single commit. **All 4 wizard inner pages on `<ProjectHero>`**: scripts (kicker "תסריטים", icon Wand2, breadcrumb to /avatar), avatar (kicker "אווטאר", icon Users, breadcrumb to /edit), scenes (kicker "סצנות", icon ImageIcon, avatar tile + script hook in meta), videos (kicker "קליפים", icon Film, voice picker badge in meta, breadcrumb to /scenes). Each page wrapped in `bg-mesh-soft bg-noise` for visual continuity with the landing/dashboard. **Returning-user dashboard**: `<ReturningUserHero>` (NEW) replaces the "Create your first video" pitch when `completedRendersCount > 0`. Surfaces "סטודיו פעיל · X סרטונים" badge, gradient headline "סרטון נוסף במחי לחיצה", dual CTA (פרויקט חדש + ספריית הסרטונים), and `<StudioCanvasIllustration />` decorative graphic in the corner. **Sidebar workspace context**: layout.tsx fetches the user's 5 most-recent active projects, sidebar renders them in a "Pinned" section with status icon (CheckCircle2 / CircleDashed) and a primary-tinted highlight + animate-soft-pulse dot when the URL matches the active project. **Bug fix**: 3 broken avatar IDs in landing showcase (`yossi`/`eyal`/`guy` → `yosef`/`eran`/`gil`, all HTTP 200 verified). Earlier in this version: shared `<ProjectHero>` component, 4 SVG illustrations (`EmptyStudioIllustration` / `LoadingSparklesIllustration` / `PipelineArrowIllustration` / `StudioCanvasIllustration`). tsc clean across all 4 workspaces. **V21** — workspace inner-page polish + custom illustrations + avatar grid fix. **Bug fix**: 3 avatar IDs in the landing showcase grid (`yossi`, `eyal`, `guy`) didn't exist in `lib/avatars/catalog.ts` and rendered as broken `<Image>` placeholders. Replaced with `yosef`, `eran`, `gil` (verified HTTP 200 from R2). **New shared component** `apps/web/components/wizard/project-hero.tsx` — `<ProjectHero>` for inner pages: glass-strong panel with kicker / breadcrumb / step badge / title / description / meta slot / actions slot + soft radial gradient wash. **New illustrations** `apps/web/components/brand/illustrations.tsx`: `EmptyStudioIllustration` (two rotated frames + play triangle + dotted grid), `LoadingSparklesIllustration` (3 SVG diamonds with staggered rotate animations), `PipelineArrowIllustration` (animated dashed arrow), `StudioCanvasIllustration` (3 overlapping frame outlines + floating dots — for hero decorative backgrounds). Pure inline SVG, zero deps. **scenes/page.tsx** rebuilt — old header + accent context strip replaced with `<ProjectHero>` carrying avatar tile + script hook badge in the meta slot. Page now wrapped in `bg-mesh-soft bg-noise` for visual continuity with the landing. tsc clean. **V20** — cinematic landing rebuild. Major upgrade in visual ambition: (1) **Custom SVG logo** (`apps/web/components/brand/logo.tsx`) — rebuilt as a "play+frame" mark: rounded-rectangle frame with an asymmetric gap on the right edge + tilted inner play triangle + accent dot at the gap (suggests "content emerging" / live generation). Single-tone primary gradient stroke + subtle Gaussian glow filter. Wordmark in font-black tracking -0.04em. Replaces the previous "Sparkles in a gradient tile" placeholder everywhere (landing nav, topbar, footer). (2) **Gradient text refined** (`apps/web/app/globals.css`) — the previous 3-stop violet→magenta→lime read as "pride flag" / amateur. Replaced with mono-tone tonal gradients used by Linear / Stripe / Anthropic: `.text-gradient` is now `primary 100% → primary 75%` with a `drop-shadow(... primary/0.25)` halo for the metallic-sheen feel. `.text-gradient-cool` is white→light-gray (subtle highlight). New `.text-gradient-shimmer` for hero key words with a 6s background-position animation. (3) **Cinematic landing rebuild** (`apps/web/app/page.tsx` + new `apps/web/app/landing-hero.tsx`): h1 at 8rem font-black with kinetic line-stack ("סרטוני UGC / בעברית. / תכל'ס."), client-side `<HeroShowcase />` with 6 floating glass cards rendering real R2 avatar PNGs at varying scale/rotation/z (mouse-parallax drift via cursor position, scaled by depth). Hero left side: copy + LiveActivityTicker (cycles 5 mock messages with "Ahmad just generated…" / city / elapsed seconds, ping-dot indicator). Hero right side: showcase. New `<AnimatedCounter />` (uses IntersectionObserver + easeOutQuart) counts up to target on scroll. Stats strip rebuilt: 4 large `glass-strong` tiles with gradient icon + counter + tracking-[0.25em] label. Avatar showcase grid: 12 R2 avatars at aspect-[4/5] with hover scale + numbered badge. Bottom CTA: `glass-liquid` with multi-stop radial wash. Animated SVG aurora (3 SVG circles with `<animate>` cx/cy attributes, 20-30s loops, mix-blend-screen). tsc clean. **V19.1** — combined design-system overhaul: pulled 7 typeui.sh skills (perspective / neobrutalism / glassmorphism / pacman / dashboard / neumorphism / contemporary), saved each in `.claude/skills/design-systems/` for future reference, then synthesized the four most-applicable (`dashboard` + `glassmorphism` + `contemporary` + `perspective`) into a unified `tachles-design-system` SKILL.md. Concrete code changes: (1) **Fonts** — added IBM Plex Sans (Latin / cloud-platform feel) and JetBrains Mono (numbers / code) via `next/font/google` alongside Heebo (Hebrew). Tailwind `font-sans` falls through Heebo → IBM Plex → system. `font-mono` uses JetBrains. (2) **`globals.css`** — three new utility tiers: `glass-liquid` (40px blur + 180% saturate + multi-stop overlay + 3-layer shadow for the heaviest CTAs), `shadow-soft` / `shadow-elevated` / `shadow-floating` (cloud-platform shadow scale to replace harsh borders), `bento` grid (4-col desktop / 2-col mobile + `.bento-2x1/2x2/3x1/4x1/1x2` span helpers), `tilt-hover` (subtle 3D perspective lift via `transform: perspective(900px) rotateX(2deg)`). (3) **Dashboard rebuilt as bento layout** — hero CTA spans 2×2 with `glass-strong` + `gradient-border` + dual radial wash, three stat tiles stack on the right with mono numbers + `text-[11px] uppercase tracking-[0.25em]` labels, project cards use `tilt-hover` for the 3D perspective feel. Empty state uses `glass-liquid`. Section headings shifted from `text-sm` to `text-[11px] tracking-[0.25em]` for the modern micro-label look. tsc clean. **V19.0** — full visual overhaul: dark-mode-first cinematic theme inspired by kling.ai + krea.ai. globals.css rewritten end-to-end: deep violet-black canvas (240 18% 5%), card surface 240 14% 8%, primary brightened to 258 100% 68% for dark contrast. New utilities: `bg-mesh` (3-stop radial mesh), `bg-mesh-soft`, `bg-spotlight` (conic), `glass` (backdrop-blur 20px + saturate 140% + inset highlight), `glass-strong` (28px + saturate 160% + primary box-shadow), `text-gradient` (3-stop violet→magenta→lime), `text-gradient-cool` (white→primary), `shadow-glow` (3-layer neon — inner ring + 24px soft + 32px outer), `shadow-glow-accent`, `card-hover` (3px lift + primary border + glow on hover), `gradient-border` (animated border via mask-composite), `focus-ring`. New animations: `animate-aurora-drift` (slow gradient drift, 22s loop). Heading scale rebuilt: h1 letter-spacing -0.04em / font-weight 900, h2-h4 -0.025em / 800. Selection styling tinted primary. Landing page (`apps/web/app/page.tsx`) rebuilt cinematic: fixed aurora layer (3 blurred radial blobs) with `mix-blend-screen` + `animate-aurora-drift`, sticky glass nav with logo gradient tile, hero h1 7.5rem font-black with 3-stop gradient on "UGC" + cool gradient on "תכל'ס", 4-tile stats panel ("6 / 30 / 25 / <5"), 7-card pipeline strip with monospace step numbers, 6-card features grid, 4-tier pricing with featured Brand tile using `gradient-border` + "הכי פופולרי" pill, FAQ with `<details>` + chevron rotate, bottom CTA with conic spotlight wash. Staggered fade-in (60-80ms × index) across grids. tsc clean. **V18** — Sprint 4: public landing page replaces the old auth-gated redirect at `/`. Logged-in users still redirect to `/dashboard`; anonymous visitors now see hero + features + pricing teaser + FAQ + footer in a single scroll. Hero with `text-gradient` headline + 30-credit-free-trial badge + dual CTA (התחל חינם / התחבר). Six-card features grid (Wand2 / Mic2 / Film / Sparkles / Zap / ShieldCheck Lucide icons) describing scripts / voices / lipsync / Israeli realism / final composition / cost transparency. Four-tier pricing teaser (free_trial / creator / brand featured with `shadow-glow` + scale-[1.02] / agency) reading from `PLAN_CONFIGS`. FAQ accordion (5 items) using `<details>` + group-open rotation on the chevron. Glass + bg-mesh + bg-noise treatment throughout. Staggered fade-in on hero rows (80ms / 160ms / 240ms / 320ms delays). Footer with logo + tagline + nav links. tsc clean. **V17** — Sprint 3: AI-native UX patterns. New `apps/web/components/ui/ai-thinking.tsx` — AIThinking component + 3 phase tables (`IMAGE_GEN_PHASES` / `VOICE_GEN_PHASES` / `CLIP_GEN_PHASES`). Each phase has a Lucide icon + Hebrew label + `atMs` time anchor; the component cycles through them as time passes, highlighting the current one with `animate-soft-pulse`. Replaces the static "Loading…" pattern with the actual pipeline narrative the user is paying for ("בונה תיאור ויזואלי → בוחר זווית מצלמה → מערבב אווטאר → מייצר ב־gpt-image-2 → משלים פרטים"). Wired into the GenerateAllButton banner on the scenes page (compact variant under the progress bar). Prompt suggestion chips: 6 clickable RTL chips under the SceneCard prompt textarea (🎨 רקע פשוט / 📷 זווית קרובה / ☀️ אור טבעי / 🌃 ערב חמים / 🇮🇱 פרט ישראלי / 😊 חיוך טבעי). Each chip appends an English fragment that gpt-image-2 understands so the user can iterate without typing English. tsc clean. **V16** — Sprint 2: interactive polish. Three new packages — `sonner` (toast notifications), `cmdk` (command palette), `framer-motion` (reserved for V17). Sonner `<Toaster />` mounted in root layout with RTL + Heebo font + richColors; flow-toggles now confirm with `toast.success` and surface errors with `toast.error`. Global Cmd+K command palette: new `apps/web/components/command-palette.tsx` with cmdk filter UI, glass surface, keyboard nav, three groups (יצירה / ניווט / אדמין) and 8 shortcut targets. Floating bottom-right "search ⌘K" hint button for discovery. Lives in `(dashboard)/layout.tsx` so it's available on every authenticated page. Sidebar refresh: Lucide icons (replacing 5 inline SVGs), `glass` background, `shadow-glow` on the active route, `bg-gradient-to-br` on the upgrade-plan tile with hover scale. tsc clean. **V15** — Sprint 1: visual polish for 2026 AI-startup feel. Tailwind + globals.css overhaul: new design tokens (`border-subtle`, `primary-soft`, `accent-soft`, `gradient-from`/`gradient-to`), utility classes (`bg-mesh` radial gradient background, `bg-noise` SVG noise overlay, `glass` backdrop-blur card, `text-gradient`, `shadow-glow` for primary CTAs, `card-hover` lift), three new keyframes (`tachles-soft-pulse` for live indicators, `tachles-fade-in-up` for staggered entry). Dashboard rebuilt: mesh + noise background, gradient hero CTA with `shadow-glow`, three glass stat cards with Lucide icons (FolderKanban / Film / Coins), Lucide on every section heading (Sparkles / Clock / CheckCircle2 / ArrowLeft), polished empty state with gradient icon tile, staggered fade-in animations across project cards (50ms delay × index). `lucide-react` v0.460 added to apps/web; emoji literals replaced where they read as branding-relevant. Heading typography tightened with `tracking-tight` defaults + `letter-spacing: -0.02em` global on h1-h4. tsc clean. **V14.8** — voice section on scenes-page SceneCard is now ALWAYS visible (was hidden when `voiceSelected=false`, which made the regen button impossible to find for users who hadn't picked a voice yet — and meant existing voices weren't visibly playable either). The whole section is rendered unconditionally; status text + button label switch on three states: (1) no voice picked → amber "⚠ בחר קול בראש העמוד" + button disabled with tooltip; (2) voice picked but not generated → "לא נוצרה" + "🎙 צור קול"; (3) voice exists → "✓ נוצרה" + AudioPreview + "↻ צור מחדש". `flex-wrap` added so the row collapses cleanly on narrow widths. tsc clean. **V14.7** — UX cleanup: all voice handling consolidated on the scenes page (step 4). Removed from `projects/[id]/videos/page.tsx` (step 5): the standalone VoicePicker card (replaced by a thin "Voice picked: X — change in scenes step" reminder), the GenerateAllVoicesButton batch, and from `SceneClipCard` the "↻ צור voice-over מחדש" form action + the new-voice prompt. Voice section in `SceneClipCard` is now read-only — `<AudioPreview>` if voiceUrl exists, with the in-flight overlay still present so the spinner survives a refresh. If a scene is missing voice (e.g. step-4 batch failed), the card surfaces a yellow link back to the scenes page instead of a "create voice" button. New `projectId` prop on SceneClipCard for the link target. The unused `voiceFormAction` / `wasVoicePendingRef` / `voiceUrlAtPendingRef` state in `videos/client-bits.tsx` is left as harmless dead code (TypeScript clean) until a follow-up V14.8 strips it. **V14.4** — SSE for render status replaces 3s polling. New route `apps/web/app/api/render/[jobId]/events/route.ts` opens a Server-Sent Events stream that holds 55s per connection (5s under Vercel Hobby's 60s cap), polls the DB every 1.5s server-side, and pushes a `data: {json}\n\n` event whenever status / progressPercent / finalVideoUrl / errorMessage changes. Terminal statuses (completed / failed / cancelled) trigger a final event + clean close. The client `RenderFinalButton` swapped its `setInterval(fetch, 3s)` for `new EventSource(...)` — auto-reconnects on close so the long render (~3-15 min) stays current with sub-2s latency, no manual interval. `maxDuration = 60` set on the route. `X-Accel-Buffering: no` header tells Vercel not to buffer the stream. The original /status route is kept as a non-streaming fallback for any future caller. Worker → Redis pubsub → SSE was rejected for V14.4 (worker on Railway, route on Vercel — would need cross-host pubsub plumbing); the V14.1c index on RenderJob.status keeps the server-side DB poll cheap. tsc clean. **V14.6** — per-scene voice controls on scenes page (step 4). Each `SceneCard` now renders a voice section under the image action row, gated on `voiceSelected` (project-level voiceId set via the picker at the top of the page): status indicator (✓ נוצרה / לא נוצרה / יוצר…), `<AudioPreview>` for the existing MP3, and a "↻ צור מחדש" button that POSTs `/api/scenes/[id]/voice` independently of image gen. New props on SceneCard: `voiceUrl` / `voiceDurationSeconds` / `voiceGenerationCount` / `voiceInFlightAt` / `voiceSelected`. New `VOICE_IN_FLIGHT_TTL_MS = 90s` constant matches the GenerateAllVoicesButton per-scene budget. The poll burst that watches for the new MP3 mirrors the existing image-flight effect (visibility-paused, 3s tick, baseline-URL anchor). Voice and image regen are fully independent — regenerating the image never touches voice and vice versa, addressing the user's concern that re-creating one frame shouldn't waste a credit on the other. tsc clean. **V14.5** — bundle analyzer wired. `@next/bundle-analyzer` added to apps/web devDependencies; `next.config.mjs` wraps the export in `withBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })`. New root npm script `analyze:web` runs `ANALYZE=true npm run build -w @ugc-video/web` and opens the visualization. The first big splits already happened in V14.3 (VoicePicker + MusicPicker via `next/dynamic` ssr:false); the analyzer is the foundation for finding the next round of splits — `CaptionPresetPicker` (~250 lines, conditionally rendered when captionsEnabled) and `RenderFinalButton` (~300 lines, shown only at the bottom of step 5) are the obvious next candidates. tsc clean. **V14.2-B** — pipeline parallelism: voice + image gen now race in parallel on step 4. **UX move**: VoicePicker now lives on the scenes page (step 4) instead of step 5 — voice + avatar are both visual identities, and the user picks them while choosing scene images. Once a voice is picked, "Generate all" fires N image jobs (POST /api/scenes/[id]/generate) AND N voice jobs (POST /api/scenes/[id]/voice) simultaneously via parallel fetch. Voice gen typically takes 5-15s while images take 30-60s, so voice usually finishes long before images and the user gets to step 5 with all voices ready. Cost copy updated to surface "X תמונות + Y קריינויות = Z קרדיטים". `defaultVoicePresetForAvatar` + `mapAvatarAgeToVoiceAge` helpers in `apps/web/lib/voice/voice-presets.ts` are kept (future fallback path) but not auto-set on avatar select per user feedback. Files: `scenes/page.tsx` (VoicePicker UI + voice queue), `scenes/client-bits.tsx` (lazy VoicePicker re-export, GenerateAllButton parallel batch + headline / cost / button copy). Voice errors are silent in the batch — voice-impl logs to ApiCall and the user can retry per-scene from step 5. tsc clean. **V14.2-A** — perf: in-memory User cache cuts 50-150ms off every server-component render + every API route. `apps/web/lib/auth/user-cache.ts` (NEW) keeps a `Map<supabaseAuthId, User>` with a 10s TTL. `getOrCreateAppUser()` checks the cache first; on a hit it skips Prisma user.findUnique + admin promotion + ban check entirely. Hot polling endpoints (/api/scenes/[id], /api/render/[jobId]/status — called every 2.5s × multiple scenes during a generation) now hit DB only ~once per 10s for auth instead of every request. Cache invalidation: `invalidateUserCacheById()` is called after every credit mutation (`generate-impl.ts`, `voice-impl.ts`, `clip-impl.ts` × 2 transactions, plus `applyCreditMutation`) and every admin user mutation (`addCredits` / `refundCredits` / `setSpendCap` / `toggleBan` / `changePlan`). Stale balance therefore can't survive a `router.refresh()` — the new helper `invalidateUserCacheAfterCreditMutation` re-exports from `lib/usage/credits.ts` so impl files only depend on credits.ts. `invalidateUserCache(authId)` for admin/auth callers that hold the Supabase id directly. tsc clean. **V14.3** — UI quick wins: next/image + lazy pickers + Suspense streaming. **PR-A**: replaced 3 raw `<img>` tags (avatar 56×56 thumbnail in scenes/page.tsx, scene 9:16 tile in scenes/client-bits.tsx, scene 9:16 fallback in videos/client-bits.tsx) with `next/image`. Avatar PNG drops from 1024px → 56px on thumbnails (~80% bandwidth saved); scene PNGs drop from 1024×1792 → 360px wide (~70% saved). Added `images.remotePatterns` for the R2 CDN host in next.config.mjs. **PR-B**: VoicePicker (312L) + MusicPicker (352L) wrapped in `next/dynamic({ ssr:false })` from `videos/client-bits.tsx`. ~50KB JS deferred from the videos-page initial bundle; users who never open the pickers never pay the cost. **PR-C**: dashboard split into 3 Suspense boundaries — header renders instantly, stats stream in, recent projects stream in. New `RecentProjectsSkeleton` + `StatsSkeleton` placeholders. Header + CTA visible ~500ms earlier on slow connections. tsc clean. **V14.1c** — perf: `Scene.status` index. The state-machine column was added in V13 PR6 (`v13_scene_state_log` migration) but never indexed; admin drill-down `/admin/scenes?status=failed` and any future state-filter WHERE clause did a full Scene scan. Migration `20260501010000_v14_1c_scene_status_index` adds `CREATE INDEX IF NOT EXISTS "Scene_status_idx" ON "Scene"("status")`. Schema: new `@@index([status])` on the Scene model. Applied to production via one-shot `apps/web/scripts/apply-v14-1c-index.ts` (uses Prisma runtime client + `$executeRawUnsafe` to bypass schema-engine, which hangs on Supabase pgbouncer pooler URLs); creation took 845ms. tsc clean. **V14.1b** — perf: Prisma `select` trim on three hot pages. The Scene model is 60+ cols (heavy JSON: motionAnalysisJson / generationLogJson / wordTimingsJson / captionChunksJson / briefJson / imageBriefJson + dozens of timestamps), and three pages were silently shipping all of them: `dashboard/page.tsx` (project list, only id+productName+status+updatedAt+selectedScriptId+productData rendered), `projects/[id]/videos/page.tsx` (renders only 14 of the Scene cols — was shipping ~150KB per 6-scene project, now ~5KB), and `projects/[id]/scripts/page.tsx` (renders 8 Scene cols × 6 scripts). Replaced `include` with explicit `select`; kept `rawJson` on Script (the page reads creativeStrategy / qualityScore / hookOptions from it). Expected ~7× payload reduction on videos page, ~3-4× on scripts. tsc clean. **V14.1a** — perf: Visibility API pause on every client-side polling tick. Hot client polls (scenes / videos / scripts pages) now skip their `/api/scenes/[id]` and `/api/render/[jobId]/status` fetches whenever `document.visibilityState !== 'visible'`. The interval keeps firing so the next tick (within 2.5s of returning) catches the user up — perceived real-time-ness is unchanged. New helper `apps/web/lib/utils/visibility.ts` exporting `isPageVisible()`; guard added to 8 polling sites across `(dashboard)/projects/[id]/{scenes,videos,scripts}/client-bits.tsx`. Background tab now contributes 0 DB load; expected ~50% reduction in Vercel function invocations + Supabase queries when users keep the app open in the background. tsc clean. **V14** — image-quality + script-Hebrew-register overhaul on top of V13. Seven-PR series. **V14 PR1**: Israeli realism cue library — 51 atomic cues × 10 categories, paired positive+negative anchors, 8 named scene presets (`kitchen_with_morning_light` / `bathroom_morning_routine` / `bedroom_evening` / `living_room_couch` / `tel_aviv_street_evening` / `supermarket_aisle` / `gym_modern` / `outdoor_park_afternoon`), 25 avatars backfilled with `archetype` + `religiousRegister`; `chooseIsraeliCues(ctx)` deterministic selector replaces V13 PR2's single-block emitter. **V14 PR2**: 5 frame-technique snippets (`mirrorSelfieSnippet` / `selfieHandheldSnippet` / `productHandHoldSnippet` / `safeReflectionSnippet` / `consistencyAnchorSnippet`) via `chooseFrameTechniqueSnippets()` in the brief builder; new `camera_focus="selfie_in_mirror"`. **V14 PR3**: outfit lock — `computeLockedOutfit()` persists to `Project.productData.lockedOutfit` on first scene gen, quoted verbatim by the consistency anchor. **V14 PR4**: `SceneVariationLedger` + scroll-stopper — one scene per ad ≥4 scenes (hook OR `decision_push`-driven punchline) gets tight-framing + saturated-color levers; `ledger.summary()` surfaces distinct/total per field. **V14 PR5**: script V6 — register-lock override section + 4 new structured-output fields (`genre` / `voice_profile` / `hook_alternatives` / per-scene `israeli_setting_cue`); the 8 cue IDs share the namespace with PR1's SCENE_PRESETS. **V14 PR6**: `/admin/scenes/[id]/debug` now surfaces every V14 field per scene; new `/admin/projects/[id]/diagnostic` renders per-script ledger summary + per-scene record table + low-diversity warning. **V14 PR7**: docs + master test runner — `npm test` chains V13 + V14 (`apps/web/scripts/test-v14-all.ts`), 380+ V14 assertions across 6 PRs (770+ cumulative). tsc clean. V13.2 — admin /admin/costs
accuracy + auto-refresh + DB performance hardening. Per-call cost
attribution moved into `lib/usage/cost-attribution.ts` (one helper per
provider; prefers actual usage, falls back to formulas/constants;
never derived from balance deltas). New columns on `ApiCall`:
`estimatedCostUsd`, `actualCostUsd`, `metadata` (JSON), `renderJobId`,
`sceneId` + 9 new composite indexes. New `ProviderBalanceSnapshot`
model + 60s in-process cache (`lib/providers/balance-snapshot.ts`).
Five new admin API routes — `/api/admin/costs/{summary, recent-calls,
in-flight, provider-balances, operation-stats}` — guarded by
`requireAdminApi()` (401/403 JSON for API routes, vs page-level
redirect). Three new client components on `/admin/costs` polling at
20s/4s/8s with date + provider + operation + status filters and
last-updated chip. Migration `20260430120000_v13_2_costs_hardening`
adds 13 indexes total across ApiCall / CreditTransaction / RenderJob /
Project / ProviderBalanceSnapshot. Verification: new
`apps/web/scripts/test-v13-pr10.ts` runs 31 assertions (390+ across
all V13 PRs). tsc clean. V13.1 — ffmpeg cold-start download from CDN to
`/tmp` because Vercel can't bundle the static binary on this monorepo
+ protective refund: a non-lipsync scene whose mux fails now skips
clipUrl persistence + sets `status='failed'` + doesn't charge the user.
Earlier today: V13 PR9 — `npm test` master runner ships. Cumulative
V13 surface: PR1 removed the post-generation Image QA auto-regen loop;
PR2 strengthened the upstream Image Brief with Israeli realism / hands
physics / mirror safety / product reference lock / product-demo
contact-proof rules; PR3 added the deterministic Animation Plan +
`buildKlingPromptFromPlan`; PR4 added a stage-tagged logger with
sensitive-data masking; PR5 shipped the curated Hebrew error map; PR6
added the `v13_scene_state_log` migration; PR7 wired state transitions
in every pipeline impl + persisted the per-scene log buffer + shipped
four wizard UX components; PR8 surfaced everything on
`/admin/scenes/[id]/debug`; PR9 wraps the 8 verification scripts behind
a single `npm test` command.).

This is the deep spec — what each subsystem actually does, where it
lives, what's real vs mocked, and known issues. For a high-level pitch
and setup instructions see [README.md](./README.md).

---

## Status legend

- ✅ Implemented and used in production path
- 🟡 Implemented but partial / behind a feature flag / cost-gated
- ⏳ Planned for the next milestone
- ❌ Removed / deprecated — do not bring back without rationale

---

## Pipeline overview (V12)

```
URL paste
  └─ Step 1: Scrape (cheerio + JSON-LD + OG + Shopify endpoint + microdata)
        + lazy quick-suggest (gpt-5.4-mini → category + targetAudience)
        + (deferred to script gen) Product Intelligence bundle:
            · Dossier (gpt-5.4-mini, 32 fields)
            · Visual Analysis (gpt-4o-mini vision on hero image)
            · Audience Inference (gpt-5.4-mini)
        → Project.productData{intelligence,…}

  └─ Step 2: Avatar
        25-portrait local catalog (apps/web/public/avatars/)
        → Project.productData.selectedAvatarId, voiceId

  └─ Step 3: Scripts
        gpt-5.4-mini, 6 frameworks in parallel, structured output
        V5 creative_strategy block (17 fields) + 12-axis quality_score
        Selective regen for any script with overall < 8 (capped)
        Music profile per script (mood/energy/style/target_volume)
        → Script + 4–6 Scene rows

  └─ Step 4: Scene image
        Image Brief Builder (deterministic, no LLM)
            ← dossier + visual analysis + scene metadata
        → finalImagePrompt (REPLACES narration-driven prompt)
        gpt-image-2 medium 1024×1792 + 3-layer safety pipeline
        → Scene.imageUrl, imageBriefJson
        (V13 PR1: post-generation Image QA loop removed — quality is
         driven by the upstream brief, not by retry-until-pass.)

  └─ Step 5: Voice
        ElevenLabs eleven_v3 with-timestamps endpoint
        charactersToWords (Hebrew/niqqud/punct/Latin aware)
        chunkCaptions (2–5 word phrase chunks, ≤2 lines, 650–2200 ms)
        ffprobe-measured duration (no proportional estimation)
        → Scene.voiceUrl, voiceDurationSeconds, wordTimingsJson, captionChunksJson

  └─ Step 5b: Clip
        Motion analysis (gpt-4o-mini vision, cached per imageUrl)
        Kling Omni v3 image-to-video (3-10s)
        Face gate (gpt-4o-mini vision) → only proceed if mouth visible
        PixVerse LipSync (multipart upload + poll, 10-min budget)
        OR ffmpeg mux (silent clip + voice MP3) when lip-sync skipped
        → Scene.clipUrl, faceGate*, pixverse*, lipSyncStatus

  └─ Step 6: Final render (BullMQ render queue)
        ffmpeg local composition (concat-filter, not concat-demuxer)
        Music selection (17-track Mixkit library, mood-aware)
        Caption preset (5 styles) — ASS v4+ burn-in via libass
        → /uploads/finals/<ts>.mp4, RenderJob.finalVideoUrl, Asset row
```

Every stage is real. There are no mock providers in the active path.

---

## Repo layout

```
ugc-video-platform/
├── apps/
│   ├── web/                Next.js 15 + API + UI
│   │   ├── app/            App Router (pages + API routes)
│   │   ├── lib/
│   │   │   ├── animation/          face-gate, kling, lipsync (PixVerse), motion-analysis, scene-routing
│   │   │   ├── auth/               Supabase + sync-user + admin promotion
│   │   │   ├── avatars/            25-portrait catalog (closed set)
│   │   │   ├── captions/           re-exports from @ugc-video/shared
│   │   │   ├── categories/         15 product categories with guidance text
│   │   │   ├── image-briefs/       deterministic image-brief builder + corrective-brief generator
│   │   │   ├── llm/                scripts.ts (6-batch generator), scene-images.ts (gpt-image-2 wrapper)
│   │   │   ├── music/              re-exports from @ugc-video/shared
│   │   │   ├── plans.ts            PLAN_CONFIGS + PER_OPERATION_CREDITS + effective-value math
│   │   │   ├── pricing/            provider-costs.ts: central USD + credit constants
│   │   │   ├── product-intelligence/  dossier + visual analysis + audience inference
│   │   │   ├── scenes/             generate-impl.ts (image), voice-impl.ts (TTS), clip-impl.ts (Kling+PixVerse), regen-prompt.ts, mux-audio.ts (ffmpeg helper)
│   │   │   ├── scraper/            cheerio + JSON-LD + OG + Shopify + microdata + quick-suggest
│   │   │   ├── usage/              rate-limit, spend-cap, log (two-phase ApiCall), credits, pricing
│   │   │   └── voice/              elevenlabs.ts (custom HTTP wrapper) + voice-presets (30 voices)
│   │   ├── public/avatars/         25 PNGs (Israeli portraits, generated via gpt-image-2)
│   │   ├── public/voice-samples/   30 pre-rendered Hebrew voice previews
│   │   └── public/music/           17 Mixkit tracks + README
│   │
│   └── worker/             BullMQ worker
│       └── src/
│           ├── index.ts                            workers + graceful shutdown
│           ├── queue.ts                            render + maintenance queue handles
│           ├── processors/
│           │   ├── render-processor.ts             the V6+ render flow
│           │   └── kling-sweep.ts                  hourly Kling stuck-task sweep
│           └── providers/
│               └── composition/ffmpeg.ts           local ffmpeg composition (concat-filter)
│
├── packages/
│   ├── shared/             @ugc-video/shared
│   │   └── src/
│   │       ├── types/
│   │       ├── schemas/
│   │       ├── utils/
│   │       ├── music/      music-library.ts (17 tracks) + select-music.ts (scoring)
│   │       └── captions/   types.ts + chunker.ts + ass-builder.ts + presets.ts (5 V12 presets)
│   │
│   └── prompts/            @ugc-video/prompts
│       └── src/
│           ├── script-system-prompt.ts             V5 system prompt (Hebrew + Israeli realism + V11 PRODUCT INTELLIGENCE block)
│           ├── script-json-schema.ts               strict structured-output schema
│           ├── scene-image-prompts.ts              avatar + product reference wrapper for gpt-image-2
│           └── scene-safety.ts                     23 risky→safe term rewrites + per-category modesty tokens
│
└── prisma/
    ├── schema.prisma       9 models, 6 enums
    └── migrations/         18 sequential migrations (Apr 27 → Apr 29 2026)
```

---

## Database schema

| Model | Purpose |
|-------|---------|
| `User` | Auth identity (Supabase backed) + plan + creditsBalance + spendCapUsd |
| `CreditTransaction` | Append-only audit log of every credit movement (admin grants, auto charges, refunds, first-regen-free events) |
| `ApiCall` | Two-phase log of every paid provider call (provider, operation, model, tokens, cost, durationMs, status: in_progress/success/failed) |
| `Project` | One per video. `productData` JSON holds wizard state + scraped data + Product Intelligence bundle + caption preset + music toggle |
| `Script` | One per AI-generated framework option (6 per project). `rawJson` stores the full V5 strategy + scenes + quality score |
| `Scene` | The biggest table — 40+ columns. Image, voice, clip, motion analysis cache, face-gate result, PixVerse task IDs, caption chunks, in-flight timestamps, V11 image-QA artifacts |
| `RenderJob` | One per final-render attempt. Status flows pending → extracting_assets → composing_video → uploading_final → completed/failed/cancelled |
| `Asset` | Generic "thing we produced" row — final video, intermediate clip, voice MP3, etc. |

### Migrations (chronological)

1. `20260427203409_init` — base models
2. `20260427211429_add_user_role` — UserRole + banned
3. `20260427214136_add_selected_script` — Project → Script FK
4. `20260427220929_add_scene_image_fields`
5. `20260427223618_add_api_call`
6. `20260428064408_v2_script_engine` — Scene narrative metadata
7. `20260428094432_v3_voice_clip` — voice + clip URL columns
8. `20260428114122_v3_clip_motion_cache` — motion cache columns
9. `20260428121521_v3_scene_routing` — sceneGenerationType / faceVisibility / requiresLipSync
10. `20260428123942_v3_credit_transactions_spend_cap` — `CreditTransaction` table + `User.spendCapUsd`
11. `20260428133048_v3_in_flight_tracking` — `imageInFlightAt` / `voiceInFlightAt` / `clipInFlightAt`
12. `20260428135520_v3_apicall_status` — ApiCall.status + completedAt (two-phase)
13. `20260428184954_v4_scene_product_metadata` — primarySubject / mustShowProduct / productVisibilityPriority / cameraFocus / showFace
14. `20260429071141_v6_plans_motion_cache` — User plan billing + Scene motion analysis cache
15. `20260429071151_v6_plans_motion_cache` — backfill: User.plan default 'free_trial'
16. `20260429095553_v7_pixverse_face_gate` — full PixVerse + face-gate columns
17. `20260429164500_v10_scene_captions` — wordTimingsJson + captionChunksJson + captionsGeneratedAt
18. `20260429170000_v11_image_qa` — imageBriefJson + imageQaJson + imageRegenAttempts + needsManualReview
19. `20260430085802_v13_scene_state_log` — Scene.status / lastErrorCode / lastErrorMessage / generationLogJson
20. `20260430120000_v13_2_costs_hardening` — V13.2 admin-costs hardening:
    - `ApiCall.estimatedCostUsd` / `actualCostUsd` / `metadata` / `renderJobId` / `sceneId`
    - `CreditTransaction.refType`
    - New `ProviderBalanceSnapshot` table (provider / balanceType / balanceValue / balanceUnit / estimatedUsdValue / rawJson / status / errorMessage / fetchedAt)
    - 13 new indexes covering admin-cost queries: `ApiCall(provider, operation, createdAt)` · `(provider, status, createdAt)` · `completedAt` · `(userId, createdAt)` · `(projectId, createdAt)` · `(renderJobId, createdAt)` · `(sceneId, createdAt)`; `CreditTransaction(refType, ref)`; `RenderJob(status, createdAt)` · `(projectId, createdAt)` · `completedAt`; `Project(userId, createdAt)`; `ProviderBalanceSnapshot(provider, fetchedAt)`. Performance targets: recent-50 < 300ms p95, in-flight < 200ms p95, summary < 500ms p95, no normal admin query emits `[SLOW QUERY] >500ms`.

`Project.productData` and `Script.rawJson` carry many additional fields
without dedicated columns (intelligence bundle, music profile, captions
preset selection, scrape result, etc.). The schema is intentionally
plastic in JSON for evolving creative metadata.

---

## Subsystems

### ✅ Auth & user lifecycle
- Supabase email + password (`apps/web/lib/auth/sync-user.ts`).
- On first login, a Prisma `User` row is created with 5 free credits.
- `ADMIN_EMAILS` (comma-separated) auto-promotes those emails to `role=admin`.
- Bootstrap rule: if no admin exists in DB, the first user signed up is auto-promoted (regardless of email).
- Race-safe via Prisma unique constraint + re-read on conflict.

### ✅ Plans & credits
- 4 tiers: `free_trial` / `creator` / `brand` / `agency`. See [`lib/plans.ts`](apps/web/lib/plans.ts).
- `effectiveCreditValueUsd(plan)` computes amortized per-credit revenue (`monthlyPrice / monthlyCredits`). Used in admin margin reporting; NEVER use the $0.10 list price for subscriber margin math.
- `PER_OPERATION_CREDITS` map (single source of truth):
  - `script_batch` = 2 · `image` = 2 · `voice` = 1 · `motion_analysis` = 0 (bundled)
  - `kling_i2v_clip` = 15 · `pixverse_lipsync_scene` = 2 · `lipsync_only` (regen) = 12
  - `final_render_15s` = 8 · `final_render_30s` = 12
- **Split charging** (V8) — Kling i2v is charged the moment Kling returns a clip; PixVerse is charged separately ONLY if the face-gate passed and PixVerse actually returned a synced clip. Face-gate rejects → 0 PixVerse credits.
- First-regen-free: `image` ✅, `voice` ✅, all clips ❌ (Kling cost too high).

### ✅ Pricing constants ([`lib/pricing/provider-costs.ts`](apps/web/lib/pricing/provider-costs.ts))
- `CREDIT_LIST_VALUE_USD` = $0.10 (env: `CREDIT_LIST_VALUE_USD`).
- `PROVIDER_COST_ESTIMATES_USD`: per-operation USD costs, all env-overridable.
- `PIXVERSE_COST_MODEL`: pack math — $10 / 2,250 px-credits = $0.00444/credit · 16 px-credits / scene = $0.071 / scene.
- `VIDEO_COST_ESTIMATES`: 15s ≈ $3.62, 30s ≈ $4.57.
- `OPERATION_CREDIT_PRICING`: per-operation credit map, mirrored into `lib/plans.ts`.

### ✅ Rate limit + spend cap
- [`lib/usage/rate-limit.ts`](apps/web/lib/usage/rate-limit.ts) — per-user, per-operation daily limits.
- [`lib/usage/spend-cap.ts`](apps/web/lib/usage/spend-cap.ts) — per-user daily USD cap (default 10, override via `User.spendCapUsd`). Admins exempt.
- Both run BEFORE every paid provider call. Tested in dev under load.

### ✅ ApiCall logging (two-phase)
- [`lib/usage/log.ts`](apps/web/lib/usage/log.ts) — `recordApiCallStart` inserts `status='in_progress'` immediately; `recordApiCallComplete` flips to `success`/`failed` with cost + duration + tokens.
- Lets `/admin/costs` show **live** in-flight calls with elapsed timer. The dashboard also warns on stuck calls (>3min with no completion).
- **V13.2** — completions also write `estimatedCostUsd` / `actualCostUsd` / `metadata` (JSON, safe usage payload only — never auth headers) and link the row to `renderJobId` / `sceneId` when known. `costUsd` mirrors `actualCostUsd ?? estimatedCostUsd`. Per-row drilldown at `/admin/scenes/[id]/debug` reads these directly.

### ✅ Cost attribution (V13.2) ([`lib/usage/cost-attribution.ts`](apps/web/lib/usage/cost-attribution.ts))
- One helper per provider — `attributeOpenAiTextCost`, `attributeOpenAiImageCost`, `attributeElevenLabsTtsCost`, `attributeKlingI2vCost`, `attributePixVerseLipSyncCost`, `attributePixVerseMediaUploadCost`, `attributeLocalComposeCost`. Each returns `{ costUsd, estimatedCostUsd, actualCostUsd?, source, metadata }`.
- Three rules in order: (1) provider-reported usage (tokens / chars / credits) when available → `source='actual_usage'`; (2) configured formula or constant → `source='estimate'` or `'observed_constant'`; (3) **never** balance deltas. The deliberately-throwing `FORBIDDEN_balanceDeltaAttribution()` exists so a verification test can keep the invariant honest.
- Why not balance deltas? Multiple in-flight calls bleed into each other (race condition under concurrency), the /balance endpoints rate-limit hard (free-tier ElevenLabs already 429s on 60s polling), and tests become non-deterministic.
- Provider live balances are observability + reconciliation only (`lib/providers/balance-snapshot.ts`, 60s in-process cache, soft-fail per provider, persisted to `ProviderBalanceSnapshot` for trends).

### ✅ Admin /admin/costs (V13.2 polling)
- Five new admin API routes — `GET /api/admin/costs/{summary, recent-calls, in-flight, provider-balances, operation-stats}` — guarded by `requireAdminApi()` from [`lib/auth/admin-api.ts`](apps/web/lib/auth/admin-api.ts) which returns JSON 401/403 (page-level `requireAdmin()` redirects, which API routes can't do).
- Polling cadence: summary 20s · recent-calls 8s · in-flight 4s · provider-balances 60s. Each section is its own client component that pauses on `document.visibilityState !== 'visible'` and shows last-updated chip + manual ↻ refresh.
- Filters on recent-calls: provider · operation · status · since · until. Allowlists are static (no SQL injection vector — closed sets in route.ts). Heavy `metadata` JSON is opt-in via `?expand=metadata`; per-row drilldown lazy-fetches it.
- Server-side caches: summary 15s · operation-stats 30s. A burst of admin tabs polling at the client cadence collapses into ONE DB aggregate per cache window.
- DB indexes covering the hot paths — see "Migrations" below.

### ✅ Scraper ([`lib/scraper/`](apps/web/lib/scraper/))
- Tier 1: Shopify endpoint (`/products/<handle>.json`) + JSON-LD `Product` schema + Open Graph + microdata.
- Tier 2: cheerio body extraction with 19 product-container selectors (`.product__description`, `[itemprop="description"]`, `#productDescription`, etc.) + densest-content-cluster fallback.
- **CSS-leak guard** — strips `<style>` / `<script>` / `<noscript>` content entirely (not just tags). The `looksLikeCssOrJsGarbage` filter rejects descriptions that are mostly `{ ; : } @media`. Surfaces `weak-description` warning to the wizard banner.
- **Description picker** — among all sources, the longest cleaned candidate wins (was: source-priority, which let one-sentence Shopify descriptions beat 5x-richer body content).
- Bullet-list features extracted from `<ul><li>` inside the product container, deduped against JSON-LD features.
- SSRF protection in [`lib/scraper/fetch.ts`](apps/web/lib/scraper/fetch.ts).

### ✅ Quick auto-suggest at scrape time ([`lib/scraper/quick-suggest.ts`](apps/web/lib/scraper/quick-suggest.ts))
- ~$0.001 gpt-5.4-mini call returning `{ targetAudience, categoryId, reason }`.
- Wizard auto-fills the "קהל יעד" textarea + selects the right category radio. Falls back silently to the keyword-based `guessCategory` heuristic when the LLM call fails or isn't called.
- Skipped when product name + description don't pass a minimum-content check (avoids burning tokens on junk).

### ✅ Product Intelligence (V11) ([`lib/product-intelligence/`](apps/web/lib/product-intelligence/))
- **Dossier** — `gpt-5.4-mini`, 32 strict-schema fields including `productMechanism`, `painPoints`, `desiredOutcomes`, `purchaseTriggers`, `mainObjections`, `mustShowVisuals`, `mustAvoidVisuals`, `visualEvidenceRequirements`, `visualFailureModes`, `israeliRealismCues`, `conservativeAssumptions`. The LLM is forbidden from inventing claims; assumptions go to `conservativeAssumptions[]`.
- **Visual analysis** — `gpt-4o-mini` vision pass on the hero image. Returns physical truth: `objectDescription`, `activePart`, `contactPoint`, `substanceVisualType`, `textureAndMaterial`, `bestDemoAngles[]`, `mustShowForDemo[]`, `mustAvoidForDemo[]`, **`likelyModelMistakes[]`** (the cheap fakes a generic image model loves to produce). This is the most load-bearing field for QA downstream.
- **Audience inference** — `gpt-5.4-mini`, derives concrete Israeli personas (`primaryAudience[]`, `dailyUseMoments[]`, `problemContext[]`, `realisticIsraeliSettings[]`, `bestAdFrameworks[]`, `toneRecommendation`, `visualStrategyRecommendation`).
- All three stitched into `Project.productData.intelligence`, built lazily at first script generation. ~$0.10 per project, never recomputed.

### ✅ Script engine (V5+V11)
- [`lib/llm/scripts.ts`](apps/web/lib/llm/scripts.ts) — fires 6 framework-pinned `gpt-5.4-mini` calls in parallel. Each script is persisted via the `onScriptReady` callback as soon as its promise resolves, so the UI streams them in.
- Frameworks: `problem_agitation_solution` · `skeptical_testimonial` · `demonstration_proof` · `price_alternative_anchor` · `relatable_israeli_moment` · `fast_direct_response`.
- Strict structured output (`packages/prompts/src/script-json-schema.ts`).
- The user prompt receives a `🧠 PRODUCT INTELLIGENCE` block with the full dossier + visual analysis + audience. Hard rules: `creative_strategy.product_mechanism` MUST mirror `dossier.productMechanism`; demo scenes MUST cite a `mustShowVisuals` item; `environment_type` MUST come from `audience.realisticIsraeliSettings`.
- Each script self-scores on 12 axes (V5: hook strength, specificity, Israeli authenticity, emotional pull, visual clarity, conversion potential, TTS naturalness, no-generic-cliches, creative originality, product visibility, israeli visual realism, duration fit) + `weakness_note`. The wrapper selectively regenerates any script with `overall < 8`.
- Each script also returns a `music_profile` (mood / energy / style / target_volume / duck_under_voice). Stored in `Script.rawJson` and consumed at final-render time.
- Avatar gender lock — selected avatar's grammatical gender is injected with explicit zachar/nekeva rules so spoken_text + on-screen captions never mismatch.
- Per-mode constraints (15s / 30s) thread through the prompt: scene count, lipsync cap, total Hebrew word budget. Anti-cliché blacklist (12 phrases) enforced.

### ✅ Image Brief Builder (V11) ([`lib/image-briefs/image-brief-builder.ts`](apps/web/lib/image-briefs/image-brief-builder.ts))
- **Deterministic, no LLM.** A brief is a contract — letting the LLM build it would re-introduce the drift V11 was created to eliminate.
- Pulls `mustShow` from `dossier.mustShowVisuals` ∪ `visualAnalysis.mustShowForDemo` ∪ `contactPoint` ∪ `substanceVisualType`.
- Pulls `mustAvoid` from `dossier.mustAvoidVisuals` ∪ `dossier.visualFailureModes` ∪ `visualAnalysis.mustAvoidForDemo` ∪ `visualAnalysis.likelyModelMistakes` ∪ universal Israeli-realism guards (foreign outlets / suburban / random English signage / stock-photo polish).
- Produces a `finalImagePrompt` structured as: SCENE INTENT → CAMERA → COMPOSITION → REALISM → ENVIRONMENT → ISRAELI CONTEXT → PRODUCT ACCURACY → MUST SHOW → MUST NOT SHOW.
- Replaces the legacy narration-driven path. The script's `visual_prompt_english` is folded in as a hint, not the primary source.
- `buildCorrectiveBrief` was removed in **V13 PR1** alongside the QA loop — it only existed to feed the auto-regeneration retry path.

### ❌ Image QA — REMOVED IN V13 PR1
- The post-generation `gpt-4o-mini` vision evaluator + corrective-brief auto-regen loop has been deleted from the active path. `lib/image-qa/` is gone; `generate-impl.ts` is now a single-pass image gen with no QA branch and no `IMAGE_QA_*` env reads.
- Why removed (not just gated): in current testing the corrective brief reliably failed to fix what QA flagged — most scenes exhausted 2 retries with score 0.00 and ended up `needsManualReview=true` while spending 3× the per-scene image budget. A vision model second-guessing an image model is the wrong loop; the fix is upstream creative planning, not regenerate-until-pass.
- Replaced by: better upstream brief (V11 + the PR2 Scene Plan), per-stage logs (PR4), the existing manual "regenerate scene" button, and the wizard error-surface UX (PR5).
- Historical DB columns `Scene.imageQaJson` / `imageRegenAttempts` / `needsManualReview` remain nullable so old projects' QA reports don't get nuked. PR1 stops writing them; later PRs may repurpose `imageRegenAttempts` for manual user regens and `needsManualReview` for hard-failure flagging.

### ✅ Captions (V10 + V12)
- **Source of truth** — ElevenLabs `with-timestamps` endpoint variant. Returns `audio_base64` + `alignment.characters[]` + per-character ms timings. `eleven_v3` is the only Hebrew-supporting model; we hard-pin it because Next.js dev caches `process.env` at boot and a stale `.env` would silently fall back to `multilingual_v2` (gibberish on Hebrew).
- `charactersToWords` ([`packages/shared/src/captions/chunker.ts`](packages/shared/src/captions/chunker.ts)) groups Hebrew letters + niqqud + Latin + digits into word timings, attaching trailing punctuation. Logical (read) order — never reversed.
- `chunkCaptions` splits into 2–5 word phrase chunks (≤2 lines, ~18 chars/line, min 650 ms / max 2200 ms, splits on strong `. ! ?` / soft `, ; : — …` punctuation, stretches under-duration chunks).
- Persisted on `Scene.wordTimingsJson` + `Scene.captionChunksJson` (migration `v10_scene_captions`). Worker offsets to global timeline at render time.
- ASS v4+ via `buildAssFromChunks` — libass handles bidi natively. Hard-cap on every event end at the scene clip's end on the global timeline (audio probe was occasionally a few ms longer than the rendered clip).
- **5 V12 caption presets** ([`packages/shared/src/captions/presets.ts`](packages/shared/src/captions/presets.ts)):
  | id | font / size | color | border | per-word? | popIn? |
  |----|-------------|-------|--------|-----------|--------|
  | `classic` | Heebo Bold 64 | white #FFFFFF | outline 4 black | no | no |
  | `bold_yellow` | Heebo Bold 72 | yellow #FFE600 | outline 6 black | no | no |
  | `block_card` | Heebo Bold 56 | white | `BorderStyle=3` opaque black box (16 padding) | no | no |
  | `gradient_pink` | Heebo Bold 70 | hot pink #FF1493 | outline 5 black | no | yes |
  | `word_pop` | Heebo Bold 90 | white | outline 6 black | **yes** | yes |
- Picker at `/projects/[id]/videos`. Selection persists in `localStorage` per project + saves to `Project.productData.captionsPreset` on render submit.
- `word_pop` reads `Scene.wordTimingsJson` and emits one ASS Dialogue per word with `\fad(50,50)\fscx80\fscy80\t(0,80,\fscx110\fscy110)\t(80,160,\fscx100\fscy100)` — captions.ai-style punch-in.

### ✅ Background music (V9)
- 17 royalty-free Mixkit tracks under [`apps/web/public/music/`](apps/web/public/music/) — that folder is the SOLE source. Metadata in [`packages/shared/src/music/music-library.ts`](packages/shared/src/music/music-library.ts).
- Each track: `{ id, title, fileUrl, source, license, attributionRequired:false, allowedPlatforms:['all'], moods[], categories[], energy, style, bestFor[], avoidFor[] }`.
- `selectMusicTrack()` scores tracks by mood/category/style/energy match. Hard penalty against high-energy tracks for beauty / wellness / baby / jewelry / premium / self-care so the Hebrew voice always stays dominant. Themed tracks (Christmas, Halloween) explicitly excluded from the auto-fallback list.
- ffmpeg pipeline: `-stream_loop -1` on the music input → `atrim=duration=<finalSec>` → `volume=0.08` (clamped to `[0.04, 0.20]`) → `afade=t=in:st=0:d=0.3` → `afade=t=out:st=<end-2>:d=2`. `amix duration=first` ensures music never extends the visual end.
- Step-1 toggle (`productData.backgroundMusic`) is the master switch. Debug payload in `RenderJob.providerPayloadJson.music` records track id + license + reason + volume + fade durations.

### ✅ Avatar catalog
- 25 Israeli portraits in `apps/web/public/avatars/` (Mizrahi / Yemeni / Ethiopian / Russian / Ashkenazi / dati-leumi). Closed set today.
- Each has a `gender` field — drives Hebrew zachar/nekeva grammatical lock in script + voice.
- Generator: `apps/web/scripts/generate-avatar-portraits.ts` (idempotent, ~$0.04 per missing portrait, gpt-image-2).

### ✅ Voice catalog
- 30 ElevenLabs voices (18 female + 12 male) curated for Israeli UGC. Pre-rendered Hebrew samples ship with the repo at `apps/web/public/voice-samples/`.
- Generator: `apps/web/scripts/generate-voice-samples.ts`.

### ✅ Animation pipeline (V7)
- **Kling Omni v3** ([`lib/animation/kling.ts`](apps/web/lib/animation/kling.ts)) — image-to-video only. 3-10 s clips, `9:16`. Reference images supported (product hero passed alongside scene image so packaging/label stays accurate). Negative prompts derived from `mustAvoidVisuals` + `likelyModelMistakes`. Auth: Bearer token (wrappers) OR HS256 JWT (`KLING_ACCESS_KEY` + `KLING_SECRET_KEY` for the official endpoint).
- **Motion analysis** ([`lib/animation/motion-analysis.ts`](apps/web/lib/animation/motion-analysis.ts)) — `gpt-4o-mini` vision describes what should physically move in the still. Cached per-`imageUrl` so a clip regen on the same image doesn't re-pay the analysis call.
- **Face gate** ([`lib/animation/face-gate.ts`](apps/web/lib/animation/face-gate.ts)) — `gpt-4o-mini` vision. Decides: full clear face? mouth visible? confidence? Drops to `false` → lip-sync skipped, only Kling clip + ffmpeg audio mux. Saves PixVerse credits on product/hands-only scenes.
- **PixVerse** ([`lib/animation/lipsync/pixverse.ts`](apps/web/lib/animation/lipsync/pixverse.ts)) — sole lip-sync provider. Multipart video upload + multipart audio upload + `/lip_sync/generate` + poll `/video/result/{video_id}`. Trust completion data (`url + path + outputWidth × outputHeight`) over the `status` enum (which has flipped through transient values in two production incidents).
- **Recovery script** — `apps/web/scripts/recover-pixverse-clip.ts` for one-shot recovery of a successful PixVerse output that the poller mis-flagged. Used twice in production and now obsolete since the trust-completion-data fix.

### ✅ Composition (V9 + V10 + V12)
- ffmpeg local — `apps/worker/src/providers/composition/ffmpeg.ts`.
- **concat-filter** (not concat-demuxer) — every input clip is decoded, normalized (`fps=30, setsar=1, format=yuv420p, aresample=44100, channel_layouts=stereo`), then concatenated. Eliminates the "freeze on the bad frame" boundary corruption we hit with the demuxer when clips had slightly different SAR/profile.
- Caption ASS file written to a tempdir + applied via `ass=<path>` filter. Heebo font + libass for Hebrew bidi.
- Music input added at index N (after scene clips) with `-stream_loop -1`. Mix via `amix=inputs=2:duration=first:dropout_transition=0:normalize=0`.
- Output: H.264 `libx264 preset=fast crf=20`, AAC 192k, `+faststart`. Saved to `apps/web/public/uploads/finals/<ts>.mp4`.

---

## Providers (active in V12)

| Provider | What it does | Model / endpoint | Required env |
|----------|--------------|------------------|--------------|
| OpenAI | Scripts (`gpt-5.4-mini`) · Scene images (`gpt-image-2`) · Vision: motion analysis, face-gate, image-QA, product visual analysis (`gpt-4o-mini`) · Quick suggest at scrape (`gpt-5.4-mini`) | as listed | `OPENAI_API_KEY` (+ optional `OPENAI_*_MODEL` overrides) |
| ElevenLabs | Hebrew TTS | `eleven_v3` `with-timestamps` endpoint | `ELEVENLABS_API_KEY` |
| Kling | Image-to-video, 3–10 s clips | `kling-v3-omni` | `KLING_API_KEY` (Bearer) OR `KLING_ACCESS_KEY` + `KLING_SECRET_KEY` (JWT) |
| PixVerse | Lip-sync (sole provider since V7) | `/openapi/v2/media/upload` + `/lip_sync/generate` + `/video/result/{id}` | `PIXVERSE_API_KEY` |
| ffmpeg | Local composition | binary in `$PATH` | — |

### ❌ Removed providers (do not bring back without rationale)

- **Kling LipSync v1** — replaced by PixVerse on 2026-04-29 (V7). PixVerse is ~7× cheaper and has multipart upload that doesn't require a public URL.
- **Sync.so · ElevenLabs Omnihuman · Mock LipSync** — removed in V7 cleanup.
- **KlingAvatar v2 / Avatar v2 Pro / advanced_lipsync / lipsync_v1 (TalkingScene variants)** — all removed in V7. There is no longer a `TalkingSceneProvider` abstraction.
- **Creatomate** — replaced by local ffmpeg in V9 era. Function `priceCreatomate()` retained as a stub for the cost log only; never called.
- **Runway** — never wired. `'runway'` is still listed in the `ApiCall.provider` enum string union for forward-compat, but no code path produces it.

### 🟡 Mock files retained as templates
- `apps/worker/src/providers/composition/mock.ts`, `tts/mock.ts`, `avatar/mock.ts`, `broll/mock.ts` — exist on disk, never imported by the active worker (`render-processor.ts` instantiates `ffmpegCompositionProvider` directly). Kept as a reference shape for future provider swaps.
- `KLING_LIPSYNC_MOCK="1"` — legacy env switch in [`lib/animation/lipsync/pixverse.ts`](apps/web/lib/animation/lipsync/pixverse.ts) returning the silent input unchanged. Useful when `PUBLIC_BASE_URL` isn't set up (Kling/PixVerse can't fetch from localhost).

---

## API routes

```
GET    /api/health                              DB + Redis liveness

POST   /api/products/extract                    Scrape URL → ScrapeResult + suggestions{ targetAudience, categoryId }
GET    /api/voice/sample/[voiceId]              Pre-rendered voice preview MP3

POST   /api/projects/[id]/scripts/list          (legacy GET via dashboard) — script generation enqueue
POST   /api/projects/[id]/voice                 Batch voice for all scenes
POST   /api/projects/[id]/render                Enqueue final composition; body: { captionsPreset?: string }
GET    /api/projects/[id]/scripts/list          Stream scripts as they persist (the wizard polls this)

GET    /api/scenes/[id]                         Live scene state polled by SceneCard during batch
PUT    /api/scenes/[id]                         Update visual prompt etc.
POST   /api/scenes/[id]/generate                Generate image (deterministic brief → gpt-image-2, single-pass — V13 PR1 removed the QA loop)
POST   /api/scenes/[id]/regen-prompt            Ask LLM for a fresh visualPromptEnglish variant — does NOT generate the image
POST   /api/scenes/[id]/voice                   Generate voice (ElevenLabs with timestamps)
POST   /api/scenes/[id]/clip                    Generate clip (Kling i2v + face-gate + PixVerse / mux)

GET    /api/render/[jobId]/status               Poll render-job status

(legacy / dev)
POST   /api/demo/start                          Local demo flow trigger
POST   /api/render/start                        Bare render enqueue (used by /dev/demo)
```

The single-scene endpoints all use **Route Handlers**, not Server
Actions, because Next.js 15 serializes server actions per-route — using
fetch from the client is the only way to run regenerate buttons in
parallel across multiple scene cards.

---

## Worker

Two queues, both backed by Redis (`REDIS_URL`):

| Queue | Concurrency | Job kinds | Schedule |
|-------|-------------|-----------|----------|
| `render` | `WORKER_CONCURRENCY` (default 2) | `render-job` (one per final composition) | on-demand from `/api/projects/[id]/render` |
| `maintenance` | 1 | `kling_sweep` | recurring every 60 min, jobId `recurring:kling_sweep` |

`render-processor.ts` flow: `pending → extracting_assets (10%) → composing_video (50%) → uploading_final (90%) → completed (100%)`. On failure it sets `RenderJob.status=failed` with a captured `errorMessage` and does NOT refund credits automatically (admin handles refunds via `/admin/users`).

`kling-sweep.ts` finds Scene rows whose `clipMotionTaskId` is set but `clipUrl` is NULL and `clipMotionGeneratedAt` is older than the Kling task TTL — flags them as failed so the UI doesn't show a perpetual spinner.

Graceful shutdown on `SIGINT` / `SIGTERM` closes both workers and quits Redis.

---

## Admin dashboard

| Page | What it shows |
|------|---------------|
| `/admin` | Top-level KPIs (signups, active users, queue depth, recent failures) |
| `/admin/costs` | **In-flight ApiCalls** with elapsed timer · per-provider cost cards · **operation pricing table** (USD cost / credits / list margin %) · **PixVerse cost model breakdown** · **15s/30s video estimates** · **plan economics** (effective credit value + underwater warnings) · 30-day per-project leaderboard · per-operation latency P50/avg/max · 10 most recent failures · last 50 calls |
| `/admin/users` | User list · plan · creditsBalance · per-user spend cap · ban toggle · manual credit grant + reason |
| `/admin/projects` | Project list with product name + status + owner |
| `/admin/renders` | RenderJob list with status filter + error inspector |
| `/admin/queue` | BullMQ queue depths + recent jobs |

---

## Environment variables

### Database / queue
```
DATABASE_URL              postgresql://user:pass@host:5432/db?schema=public
REDIS_URL                 redis://host:6379  (or rediss:// for Upstash)
```

### Auth
```
NEXT_PUBLIC_SUPABASE_URL          required
NEXT_PUBLIC_SUPABASE_ANON_KEY     required
SUPABASE_SERVICE_ROLE_KEY         optional (only needed for Supabase Storage)
ADMIN_EMAILS                      comma-separated emails always promoted to admin
```

### OpenAI
```
OPENAI_API_KEY                    required
OPENAI_SCRIPT_MODEL               default gpt-5.4-mini   (also used for dossier + audience + quick-suggest)
OPENAI_IMAGE_MODEL                default gpt-image-2
OPENAI_FACE_GATE_MODEL            default gpt-4o-mini    (also used for motion analysis + product visual analysis)
OPENAI_DOSSIER_MODEL              optional override; falls back to SCRIPT_MODEL
OPENAI_AUDIENCE_MODEL             optional override
OPENAI_PRODUCT_VISION_MODEL       optional override; default gpt-4o-mini
OPENAI_QUICK_SUGGEST_MODEL        optional override; falls back to SCRIPT_MODEL
OPENAI_MOTION_VISION_MODEL        optional override; default gpt-4o-mini
```

### ElevenLabs
```
ELEVENLABS_API_KEY                required
ELEVENLABS_KEY_ID                 optional (legacy credential pair)
ELEVENLABS_MODEL_ID               default eleven_v3 (the only Hebrew-supporting model — DO NOT change without verifying)
```

### Kling
```
KLING_API_BASE_URL                default https://api-singapore.klingai.com
KLING_IMAGE_TO_VIDEO_ENDPOINT     default /v1/videos/omni-video
KLING_IMAGE_TO_VIDEO_MODEL        default kling-v3-omni
KLING_API_KEY                     preferred — Bearer token (wrappers)
KLING_ACCESS_KEY                  fallback — for official api-singapore (HS256 JWT pair)
KLING_SECRET_KEY                  fallback — for official api-singapore (HS256 JWT pair)
KLING_LIPSYNC_MOCK                "1" → return silent video unchanged (legacy escape hatch)
```

### PixVerse
```
PIXVERSE_API_KEY                  required
PIXVERSE_API_BASE_URL             default https://app-api.pixverse.ai
PIXVERSE_MEDIA_UPLOAD_ENDPOINT    default /openapi/v2/media/upload
PIXVERSE_LIPSYNC_ENDPOINT         default /openapi/v2/video/lip_sync/generate
PIXVERSE_RESULT_ENDPOINT          default /openapi/v2/video/result
```

### App
```
NODE_ENV                          development | production
NEXT_PUBLIC_APP_URL               default http://localhost:3000
PUBLIC_BASE_URL                   public URL Kling/PixVerse use to fetch silent clips + voice MP3s. In dev: a cloudflared/ngrok tunnel.
WORKER_CONCURRENCY                default 2 — BullMQ render concurrency
CAPTIONS_MODE                     phrase | off | word_highlight  (only "phrase" is wired today)
```

### Pricing overrides (all optional — fall back to defaults in [`lib/pricing/provider-costs.ts`](apps/web/lib/pricing/provider-costs.ts))
```
CREDIT_LIST_VALUE_USD                     default 0.10
COST_OPENAI_SCRIPT_BATCH_USD              default 0.05
COST_OPENAI_SCENE_IMAGE_USD               default 0.06
COST_OPENAI_MOTION_ANALYSIS_SCENE_USD     default 0.005
COST_ELEVENLABS_VOICE_SCENE_USD           default 0.02
COST_KLING_I2V_CLIP_USD                   default 0.79
COST_PIXVERSE_LIPSYNC_SCENE_USD           default 0.071
PIXVERSE_PACKAGE_PRICE_USD                default 10
PIXVERSE_PACKAGE_CREDITS                  default 2250
PIXVERSE_OBSERVED_LIPSYNC_CREDITS_PER_SCENE   default 16
```

---

## Pricing

### Per-operation list value @ $0.10/credit
| Operation | Provider $ | Credits | List $ | Margin (list) |
|-----------|-----------|---------|--------|---------------|
| Script batch (6 scripts) | $0.05 | 2 | $0.20 | 75% |
| Scene image (gen / regen) | $0.06 | 2 | $0.20 | 70% |
| Voice (gen / regen) | $0.02 | 1 | $0.10 | 80% |
| Motion analysis | $0.005 | 0 | bundled | n/a |
| Kling i2v clip | $0.79 | 15 | $1.50 | 47% |
| PixVerse lip-sync (only when face-gate passes) | $0.071 | 2 | $0.20 | 65% |
| Lip-sync regen (PixVerse only, no Kling) | $0.071 | 12 | $1.20 | 94% |
| Final render 15s | $0 (local ffmpeg) | 8 | $0.80 | ~100%* |
| Final render 30s | $0 (local ffmpeg) | 12 | $1.20 | ~100%* |

*Final render charge covers worker compute + storage + bandwidth.

### Per-video totals
| Mode | Scenes | LipSync | Provider $ | Charged credits | List $ | Margin |
|------|--------|---------|------------|-----------------|--------|--------|
| 15s | 4 | 1 | **$3.62** | 84 | $8.40 | 57% |
| 30s | 5 | 2 | **$4.57** | 108 | $10.80 | 58% |

### Plan effective credit value
| Plan | Price | Credits | $/credit (effective) |
|------|-------|---------|----------------------|
| free_trial | $0 | 30 | $0.00 (acquisition) |
| creator | $49/mo | 500 | $0.098 |
| brand | $149/mo | 1,800 | $0.0828 |
| agency | $499/mo | 6,000 | $0.0832 |

For subscriber margin analysis, ALWAYS use the effective $/credit, not
the $0.10 list price. Admin `/admin/costs` surfaces both side-by-side
and shows a red badge on any plan whose effective revenue is underwater
versus the typical 30s-mode video cost.

---

## Known issues / design decisions (not bugs)

1. **PixVerse `status` field is unreliable** — observed two production incidents where the field flipped through transient values (1 / 3 / 5) during finalization. The poller now ignores it and trusts completion data: `url && path && outputWidth > 0 && outputHeight > 0`. See [`lib/animation/lipsync/pixverse.ts`](apps/web/lib/animation/lipsync/pixverse.ts).
2. **Kling i2v poll budget is 15 minutes** (bumped from 8 in April 2026). Peak-load v3-omni runs were taking 9-10 min, causing false timeouts that wasted the $0.79 spend.
3. **Image QA auto-regeneration was removed in V13 PR1** (was previously gated OFF via `IMAGE_QA_ENABLED=false`). The vision-model evaluator was burning $0.18 + 60s per scene to regenerate-until-pass while the corrective brief couldn't reliably fix what it flagged. Quality is now driven upstream — Product Intelligence → Scene Plan → Image Brief — and the manual "regenerate scene" button covers the residual cases. See `❌ Image QA — REMOVED IN V13 PR1` above.
4. **Single-scene Server Actions are serialized per-route** in Next.js 15. The wizard's per-scene "regenerate" buttons all use Route Handlers via `fetch()` to bypass this — multiple scenes can regenerate concurrently.
5. **Captions are skipped on scenes that have no `captionChunksJson`** (older voice generations pre-V10). They are NEVER approximated proportionally — that's the bug we removed.
6. **`apps/web/public/uploads/` has no garbage collection**. Disk grows unbounded. A cleanup job for old `clips_*/` and `finals/*.mp4` is on the to-do list.
7. **Hebrew model lock** — `eleven_v3` is the only model with Hebrew. We hard-pin it in [`voice-impl.ts`](apps/web/lib/scenes/voice-impl.ts) instead of reading from env, because Next.js dev caches `process.env` at boot and a stale `.env` would silently fall back to `multilingual_v2` (non-Hebrew → gibberish output).
8. **Captions preset is selected on the videos page**, NOT in Step 1. The picker is hidden when `productData.captions !== true`. Selection lives in `localStorage` until render submit, then persists to `productData.captionsPreset`.
9. **Quick-suggest at scrape time runs an LLM call** (~$0.001). It's gated only by minimum-content (skipped when product name + description are nearly empty). If you want zero LLM calls on scrape, set the relevant model env to an empty string.
10. **`clipDurationSeconds` is reconciled** at script time — `max(scripted, voice+0.5s)` clamped to Kling's 3–10 s enum. The audio-derived bound prevents lip-sync truncation when a calmer voice runs ~30% slower than the 14 chars/sec heuristic.

---

## What's still pending

| | Work | Notes |
|---|------|-------|
| ⏳ | Cloud storage (S3 / Supabase Storage) | Replace `apps/web/public/uploads/` writes. Won't survive a stateless prod deploy. |
| ⏳ | Stripe / Paddle billing | Plan + credit columns are ready; checkout + webhook + subscription state machine missing. |
| ⏳ | Custom avatar upload | Catalog is closed (25 portraits). Needs a moderation pass before user-uploaded portraits. |
| ⏳ | Password reset / Google + Apple OAuth / MFA | Supabase supports it; the UI hasn't been built. |
| ⏳ | Edge rate limiting | App-layer limits exist; no IP-level WAF / Cloudflare rules. |
| ⏳ | Structured logging + Sentry | Currently `console.log` everywhere. |
| ⏳ | `/uploads/` cleanup job | Maintenance queue handles Kling stuck tasks; a separate disk-GC sweeper is missing. |
| ⏳ | Word-highlight caption mode | `CAPTIONS_MODE=word_highlight` is reserved but not wired (would extend `word_pop` with an active-word color override on the full phrase). |
| ⏳ | Tests | The repo has no test runner today. The chunker / brief builder / music selector are pure modules and are vitest-ready. |
| ⏳ | Admin debug panels for V11 artifacts | DB columns exist (`Scene.imageBriefJson`, `imageQaJson`, `Project.productData.intelligence`); a dedicated admin viewer would help diagnose creative drift. |

---

## Version log (V4 → V12, all April 2026)

| Tag | Date | Headline |
|-----|------|----------|
| **V13.1** | 2026-04-30 | **ffmpeg cold-start download + mux-failure refund.** Vercel's tracer + serverExternalPackages + outputFileTracingRoot all failed to bundle the ffmpeg-static binary into the function — verified locally that `vercel build` produces .vercel/output WITHOUT ffmpeg anywhere despite .vc-config.json's filePathMap declaring it. Symptom in prod: every mux ApiCall failed with ENOENT at `/var/task/node_modules/ffmpeg-static/ffmpeg`, and non-lipsync scenes shipped silent clips while the user paid $0.79 of Kling credit per attempt. Switched `lib/scenes/mux-audio.ts` to a cold-start CDN download: on first call after a warm-container miss, fetches `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-${arch}.gz` (b6.1.1 = ffmpeg-static@5.3.0's binary-release-tag), gunzips, writes to `/tmp/tachles-ffmpeg-static`, chmods +x, caches for the warm container's lifetime. Adds ~1-3s on cold start; warm calls = zero overhead. Also added a protective layer in `clip-impl.ts`: when mux fails on a non-lipsync scene, the action skips persisting clipUrl, marks `status='failed' + lastErrorCode='render.ffmpeg_failed'`, and returns an error WITHOUT running the credit-charge transaction — the user no longer pays for silent clips. |
| **V13 PR9** | 2026-04-30 | **`npm test` runs the V13 suite.** Master runner `apps/web/scripts/test-v13-all.ts` discovers and executes every `test-v13-pr*.ts`, prints per-script pass/fail + duration, exits non-zero on any failure. 360+ assertions across 8 scripts complete in ~5.4s. Trade-off vs the V13 §17 vitest port documented in the commit. |
| **V13 PR8** | 2026-04-30 | **Admin scene debug panel** at `/admin/scenes/[id]/debug`. Status badge + last error + generation log + routing flags + image brief + final prompt + motion analysis + legacy QA (with banner) + generation history + project intelligence — every persisted artifact in one collapsible page. Reuses PR5 / PR6 / PR7 components. (Admin) layout already gates auth via `requireAdmin()`. |
| **V13 PR7** | 2026-04-30 | **State-machine writes + UX components.** PR7.1 wires status transitions in `generate-impl` / `voice-impl` / `clip-impl` (each curated `<stage>.<reason>` lastErrorCode matches a PR5 entry). PR7.2 adds `flushSceneLogBuffer` — best-effort persistence of the buffered per-scene log into `Scene.generationLogJson` with cap-200 trim. PR7.3 ships `SceneCardStatusBadge` (Hebrew label per status, color-coded dot) + `SceneErrorDetails` (Hebrew message from PR5 map, retry / skip / debug actions). PR7.4 ships `SceneLogViewer` (reverse-chronological timeline of generationLogJson) + `WizardWarningsPanel` (collapsible אזהרות (N) above the scene grid). All RTL-first. |
| **V13 PR6** | 2026-04-30 | **Scene state machine + log buffer schema.** Additive migration `v13_scene_state_log` adds 4 nullable columns to `Scene`: `status` (String @default("pending")), `lastErrorCode`, `lastErrorMessage`, `generationLogJson`. Canonical state set lives in `apps/web/lib/scenes/scene-status.ts` as a const tuple + derived TS type + `isSceneStatus` guard + terminal/in-flight predicates — no Prisma enum per house style. Migration applied to Supabase production. |
| **V13 PR5** | 2026-04-30 | **Curated Hebrew error messages map** at `apps/web/lib/errors/scene-error-messages.ts`. Codes follow `<stage>.<reason>` so they grep alongside the [stage:scope] log lines. Coverage: scrape · intelligence · script · scene-plan · image-brief · image-gen · voice · motion · animation-plan · kling · face-gate · pixverse · render · cross-stage credits / rate-limit / spend-cap. `getSceneErrorMessage(code, raw)` returns `{ hebrew, retryHint?, needsUserEdit?, isFallback }`. |
| **V13 PR4** | 2026-04-30 | **Stage-tagged logger.** `apps/web/lib/logging/log.ts` adds `logStage(stage, scope)` returning a StageLogger with `.debug/.info/.warn/.error/.span(label, fn)`. `[stage:scope]` prefix on every line; LOG_LEVEL env filter (default debug in dev, info in prod); sensitive-data masking (sk-…, Bearer, JWT, long base64). Wired into image-brief + image-gen + voice (PR4.2) and motion-analysis + kling + face-gate + pixverse (PR4.3) — zero `console.*` left in clip-impl active path. |
| **V13 PR3** | 2026-04-30 | **Animation Plan + Kling prompt rewrite — 3 small commits.** PR3.1: `apps/web/lib/animation/animation-plan-builder.ts` deterministic builder emitting `AnimationPlan` (motionSubject / secondarySubject / cameraMotion enum / forbiddenMotion[] / preserveProductVisibility / avoidFaceZoom / speakingExpected). Defaults follow the V13 §10.3 table per scene type; V4 metadata (cameraFocus / primarySubject / mustShowProduct / showFace) overrides; vision motion-analysis primaryAction takes precedence on hands/product subjects. PR3.2: `buildKlingPromptFromPlan` renders the plan into `{ positive, negative }`; `forbiddenMotion` merges into negative prompt with baseline class negatives via dedupe Set. PR3.3: `clip-impl.ts` now builds the plan once + calls `buildKlingPromptFromPlan` instead of the legacy `buildKlingMotionPrompt`; the same PR2 brief flags (handsPhysicsRequired / mirrorRisk / contactProofRequired) plumb into the plan so still and clip share constraints. Verification: `apps/web/scripts/test-v13-pr3.ts` runs 56 assertions, all pass. No DB migration. |
| **V13 PR2** | 2026-04-30 | **Image Brief strengthening — 4 small commits.** PR2.1: extract Israeli realism rules → `apps/web/lib/scene-planning/israeli-realism-rules.ts` (refactor only, identical output). PR2.2: `scene-rules.ts` adds hands-physics + mirror-safety detectors + rule builders; `ImageBrief` exposes `handsPhysicsRequired` / `mirrorRisk` / `ruleBlocks`; renderFinalPrompt updated to drop the legacy "fails QA" wording. PR2.3: `packages/prompts/src/scene-image-prompts.ts` gains a PRODUCT REFERENCE LOCK paragraph (same shape / color / proportions / applicator design / label placement) and gates the product mention on `isProblemScene` so problem scenes don't force the product. PR2.4: `buildContactProofRule` emits a numbered PRODUCT DEMO CONTACT PROOF section weaving `activePart` / `contactPoint` / `substanceVisualType` into all five demo questions; triggers on product_demo / hands_only / closeup_product. Verification: `apps/web/scripts/test-v13-pr2.ts` runs 53 assertions, all pass. No DB migration. Deterministic and pure throughout. |
| **V13 PR1** | 2026-04-30 | **Image QA auto-regeneration removed from active path.** Deleted `apps/web/lib/image-qa/` (the gpt-4o-mini vision evaluator), the QA branch in `lib/scenes/generate-impl.ts`, `buildCorrectiveBrief` in `lib/image-briefs/image-brief-builder.ts`, and the `IMAGE_QA_ENABLED` / `IMAGE_QA_MAX_RETRIES` / `OPENAI_IMAGE_QA_MODEL` env vars from `.env.example`. Image generation is now a single-pass call: brief builder → gpt-image-2 → persist. Historical DB columns `Scene.imageQaJson` / `imageRegenAttempts` / `needsManualReview` remain nullable; PR1 stops writing them. Vision calls we KEEP: Product Visual Analysis, Motion Analysis, Face Gate (all upstream/routing, not post-generation second-guess). Verification: `apps/web/scripts/test-v13-pr1.ts` runs 22 assertions. Net diff: -489 / +94. PR2 (Scene Plan), PR3 (Animation Plan + Kling rewrite) follow. |
| **V12.7** | 2026-04-30 | **OpenAI balance parser fix + admin-scope key.** `fetchOpenAIBalance` was crashing with `total30.toFixed is not a function` because `/v1/organization/costs` sometimes returns `amount.value` as a string and `+` was concatenating, not adding. Coerce with `Number(r.amount?.value ?? 0)`. New env var `OPENAI_ADMIN_API_KEY` (sk-admin-…) — dedicated admin-scope key for Administration API reads, preferred over `OPENAI_API_KEY` (which is restricted to model invocation). All 4 cards on `/admin/costs` now show live data: Kling, PixVerse, ElevenLabs, OpenAI ($11.07 / 30d, $4.40 / 24h on smoke test). |
| **V12.6** | 2026-04-30 | **Graceful per-provider fallback** on `/admin/costs`. When a balance fetcher fails (HTTP 401 / 403 / network), the card no longer just shows the error — it falls back to local `ApiCall` aggregates (30d spend + call count) so the page stays useful. New helper `ProviderFallbackCard` keeps the error visible in a `<details>` block with a fix hint (e.g. "add user_read scope to ElevenLabs key"). |
| **V12.5** | 2026-04-30 | **Live provider balance dashboard** in `/admin/costs`. New `lib/providers/balance.ts` fetches live capacity from all 4 paid providers in parallel, soft-fails per-provider, caches 60s. Cards show: Kling (remaining units / clips / USD value, per-pack table with expiry), PixVerse (credit_monthly + credit_package / scenes / USD), ElevenLabs (tier + chars + reset date / scenes / USD), OpenAI (24h / 7d / 30d spend cuts via `/v1/organization/costs`). |
| **V12.4** | 2026-04-30 | **Voice-sample CORS preflight fix.** R2 bucket returns 403 on OPTIONS preflight (admin-only token can configure CORS), so `<audio>` Range requests for cross-origin samples failed with "Failed to fetch". Reverted `voice-presets.ts sampleUrl` to `/api/voice/sample/<id>` (same-origin). API route lookup chain now: R2 first → local disk → ElevenLabs synth on demand → cache to BOTH R2 + disk. Saves ~$0.005 per click after first hit. New helper script: `scripts/set-r2-cors.ts` (waiting for an admin-scope R2 token to apply). |
| **V12.3** | 2026-04-30 | All disk reads via `readPublicAsset`. Patched `kling.imageToPayload`, `kling.downloadAsBuffer`, `pixverse.resolveToBytes`, `mux-audio.readUrlAsBuffer` so the entire downstream pipeline (Kling i2v / PixVerse lip-sync / ffmpeg mux) is Vercel-safe. No more `process.cwd()/public/` calls outside `LocalStorage` adapter + the helper itself. |
| **V12.2** | 2026-04-30 | Static catalogs migrated to R2. 25 avatars + 17 music tracks + 30 voice samples uploaded to bucket `ugc-video` (132 MB). `apps/web/lib/avatars/catalog.ts` returns `https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/avatars/<id>.png`; same pattern for music + voice samples. New uploader: `npx tsx apps/web/scripts/upload-static-assets-to-r2.ts`. |
| **V12.1** | 2026-04-30 | `lib/storage/read-public-asset.ts` — central helper with disk-first + HTTP-fallback strategy. Replaces 5 disk-only readers (scene-images, motion-analysis, face-gate, image-qa, product-visual-analysis). Solves Vercel ENOENT after `7aac7bc` excluded `public/` from the function bundle. |
| **Production deploy** | 2026-04-29 | URL: https://tachles-lac.vercel.app. Vercel (web, region `bom1`), Railway (worker, Dockerfile), Supabase (Postgres + Auth, ap-south-1 pooler), Redis Cloud free tier (BullMQ), Cloudflare R2 (static + generated assets). Configs: `vercel.json`, `railway.toml`, `apps/worker/Dockerfile`, `.railwayignore`. |
| **V12** | 2026-04-29 | Caption presets — 5 styles (`classic`, `bold_yellow`, `block_card`, `gradient_pink`, `word_pop`). Picker UI on videos page. Per-word ASS events for `word_pop` consume `Scene.wordTimingsJson`. Parallel single-scene regen via Route Handler. Single-scene "🎲 פרומט חדש" — LLM-suggested visual prompt variant without firing image gen. |
| **V11** | 2026-04-29 | Creative Intelligence pipeline. Product Dossier (32 fields) + Visual Analysis (vision) + Audience Inference. Deterministic Image Brief Builder replaces narration→prompt path. Image QA evaluator + auto-regen loop. Schema migration `v11_image_qa`. Scraper hardening: CSS-leak guard, body-content extraction (replaces meta-description-only fallback), quick auto-suggest at scrape time for category + targetAudience. |
| **V10** | 2026-04-29 | Premium Hebrew captions. ElevenLabs `with-timestamps` → `charactersToWords` → `chunkCaptions` → ASS v4+. `Scene.wordTimingsJson` + `captionChunksJson`. Migration `v10_scene_captions`. Removed proportional 5-word chunking — scenes without alignment data are EXCLUDED from captions, not approximated. |
| **V9** | 2026-04-29 | Background music live. 17-track Mixkit library at `apps/web/public/music/`. `music_profile` per script (mood/energy/style). Auto-selection with voice-dominance penalty. ffmpeg loop + trim + 300 ms fade-in + 2 s fade-out. |
| **V8** | 2026-04-29 | Pricing recalibrated for PixVerse. Pack math `$10/2,250 credits = $0.00444`. Observed 16 px-credits/scene → **$0.071/scene** (was $0.30 — 4× over). Central `lib/pricing/provider-costs.ts`. Operation pricing split: `kling_i2v_clip` and `pixverse_lipsync_scene` charged separately so face-gate skip = 0 PixVerse credits. |
| **V7** | 2026-04-29 | PixVerse-only LipSync. Removed Kling LipSync v1, Sync.so, ElevenLabs Omnihuman, Mock provider, all 4 KlingAvatar v2 variants. Face-detection gate (gpt-4o-mini vision) before PixVerse upload. Migration `v7_pixverse_face_gate`. |
| **V6** | 2026-04-29 | Script streaming (6 frameworks parallel, persisted as each resolves). Avatar gender lock (zachar/nekeva). 30 voices in VoicePicker. Motion analysis cache on Scene. |
| **V5** | 2026-04-29 | Israeli visual realism — explicit per-scene `environment_type` / `environment_style` / `israeli_environment_required`. Expanded creative_strategy (5 new fields). 5 hook_options + 12-axis quality_score. |
| **V4** | 2026-04-28 | Duration mode (15s / 30s) end-to-end. Product-first scene metadata: `primarySubject`, `mustShowProduct`, `productVisibilityPriority`, `cameraFocus`, `showFace`. Migration `v4_scene_product_metadata`. |

---

## Conventions for new contributors

- **Workspaces:** add new shared types to `packages/shared/src/types/`. Worker can only import via the package root (`@ugc-video/shared`) — `Node` moduleResolution doesn't read package.json subpath exports. Web supports both styles but prefer the root for consistency.
- **Migrations:** name as `v<N>_<short_topic>` (e.g. `v12_captions_preset` — would have been the migration for V12 if we hadn't kept it in JSON).
- **Persisted state:** prefer `Project.productData` JSON for evolving product/wizard fields; promote to a dedicated column only when needed in the UI's filter/sort layer or a unique constraint.
- **Provider calls:** ALWAYS go through `recordApiCallStart` + `recordApiCallComplete` (or `recordApiCall` for one-shot). The two-phase pattern is what makes `/admin/costs` show in-flight calls.
- **Server actions vs Route Handlers:** anything that the user might fire concurrently across multiple scenes/cards MUST be a Route Handler. Server actions serialize per route in Next.js 15.
- **Hebrew:** always RTL in UI (`dir="rtl"`), but keep image prompts and provider calls English. Hebrew sneaking into `visual_prompt_english` causes safety-system rejections on gpt-image-2.
- **Captions:** never fall back to proportional timing. If `captionChunksJson` is missing for a scene, skip captions for it.
- **Comments:** keep them sparse and load-bearing. Document the WHY, not the WHAT (the function name and types already say what).
