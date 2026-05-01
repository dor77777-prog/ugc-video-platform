# Build Tasks: V27 Visual Language — Wave 1

**Generated from**: [`DESIGN_BRIEF.md`](./DESIGN_BRIEF.md) + [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md)
**Date**: 2026-05-01
**Wave 1 scope**: Tokens infrastructure + wizard end-to-end (steps 0–6) for system validation
**Out of scope (Wave 2/3)**: Dashboard restyle, library, admin, settings, View Transitions, framer-motion activation

---

## Stage ordering — locked

**Each stage is independently mergeable.** tachles is live (V26.SEC just shipped). No stage may leave the app in a non-deployable state.

```
Stage 1 ─ Tokens Infrastructure         (additive: zero break, unblocks 2/3/4/5)
Stage 2 ─ Font Swap                     (visual-only break, no functional risk)
Stage 3 ─ Density Attribute System      (additive: pages opt-in)
Stage 4 ─ Wizard Migration              (visible blast radius: 1 zone, fast feedback loop)
Stage 5 ─ Legacy Sweep                  (cleanup: only after 1–4 stable)
Stage 6 ─ Wave 1 Wrap & Review          (design-review + version bump)
```

Each stage = one PR (or a tight cluster of PRs). Don't queue stages; ship each green before the next.

---

## Stage 1 — Tokens Infrastructure

**Risk**: 🟢 Additive · **Blast radius**: app-wide palette shift on apply, no layout/API break · **Mergeable alone**: yes

### T1.1 — Update `:root` CSS variables in globals.css

- **What**: Replace the existing `:root` block in [`apps/web/app/globals.css`](apps/web/app/globals.css) with the V27 token block (per [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md#1--color-tokens) §1.1–§1.9). Keep `--background` / `--card` / `--popover` / etc. as **aliases** to the new canonical names — do NOT rename. Add deprecation TODO comments to the legacy utility section.
- **Where**: `apps/web/app/globals.css`
- **Why safe**: existing components reference `bg-background`, `bg-card`, `text-foreground` — aliases preserve resolution. Color values shift; nothing else.
- **Verification**:
  1. `grep -E '^\s*--canvas:' apps/web/app/globals.css` returns the new variable.
  2. `grep -E '^\s*--background:' apps/web/app/globals.css` returns `var(--canvas)` (alias intact).
  3. `npm run dev:web` → visit [http://localhost:3000/dashboard](http://localhost:3000/dashboard) → body background reads visibly cooler/less-violet than V26 (compare side-by-side with prod). No layout shift, no broken cards.
  4. Browser DevTools → inspect `<body>` → `getComputedStyle().backgroundColor` resolves to `hsl(228, 6%, 4%)`.
  5. `[SLOW QUERY]` and Vercel logs unchanged — no perf regression on token swap.
- **Depends on**: nothing.

### T1.2 — Update `tailwind.config.ts`

- **What**: Replace the `theme.extend` block with the V27 config (per [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md#82--appswebtailwindconfigts) §8.2). Adds new color namespaces (`canvas`, `surface`, `elevated`, `overlay`, `ai`, `success`, `warning`, `info`, `provider-*`, `fg-*`, `primary.hover/press/on-glass`), new radius scale (`xs/sm/md/lg/xl/2xl/pill`), new spacing (`0.5`, `13`, `18`), new max-widths, new transition tokens. Keeps `border`, `border-subtle`, `input`, `ring`, `card`, `popover`, `secondary`, `muted`, `accent`, `destructive`, `foreground`, `background` aliases pointing to new vars. Font stacks updated (`var(--font-geist-sans)` replaces `var(--font-ibm-plex)`; `var(--font-geist-mono)` replaces `var(--font-jetbrains)`) — but the `next/font` imports themselves change in Stage 2.
- **Where**: `apps/web/tailwind.config.ts`
- **Why safe**: additive plus aliases. Existing `bg-card`, `text-foreground`, `rounded-lg` continue resolving via aliases. New utilities (`bg-canvas`, `text-ai`, `rounded-xl`, `rounded-pill`) become available but unused until consumed.
- **Verification**:
  1. `npm run typecheck` passes (no type errors in config).
  2. `npm run dev:web` boots without Tailwind warnings.
  3. Add a test element in any page: `<div className="bg-ai text-ai-foreground rounded-pill px-3 py-0.5">test</div>` — renders with lime bg + dark text + pill radius. Remove after verification.
  4. `grep -E "rounded-(xs|md|xl|2xl|pill)" apps/web/components/` returns existing usages still resolving correctly (some may now have slightly different values — acceptable, see T1.3 verify).
  5. Lighthouse `/dashboard` perf score ≥ 95.
- **Depends on**: T1.1 (uses CSS variables defined there).

### T1.3 — Update `@layer base` typography rules

- **What**: Update the `@layer base` block in `globals.css` to match [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md#24--layer-base--typography-updates) §2.4: body gets `font-feature-settings` extended with `'tnum'`, `font-variant-numeric: tabular-nums`, `line-height: var(--line-height-body)`. Headings (`h1, h2, h3, h4`) opt OUT of `tnum` (per the user's caveat — Heebo doesn't ship tnum glyphs cleanly for Hebrew titles with mixed numerals). `h1` weight `900` → `800`. `h2-h4` weight `800` → `700`.
- **Where**: `apps/web/app/globals.css` (`@layer base` block at line ~62)
- **Why safe**: tabular nums = visual sub-pixel adjustment in numeric data. Body text without numerals unchanged. Heading weight 700/800 visually identical to current 800/900 (Heebo caps at 800, so 900 was already falling back).
- **Verification**:
  1. Visit [http://localhost:3000/admin/costs](http://localhost:3000/admin/costs) → all cost-column digits vertically aligned (test with values like `$0.0042` / `$0.0089` — decimal points stack).
  2. Visit dashboard → any h1 like "6 פרויקטים פעילים" or "סצנה 3 מתוך 7" → digit spacing reads natural, not forced-tabular.
  3. Browser DevTools → inspect `body` → `font-feature-settings` includes `'tnum'`.
  4. Inspect any `<h1>` → `font-variant-numeric: normal` (overrides body inheritance).
  5. `<h1>` computed `font-weight: 800` (not 900).
- **Depends on**: T1.1.

### T1.4 — Pre-commit regression gate (`.glass-*` + `bg-accent`)

- **What**: Add a `.husky/pre-commit` (or extend existing) that blocks new `.glass-strong` / `.glass-liquid` / `bg-accent` / `text-accent` references in JSX/TSX files (per [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md#migration-strategy) Migration Strategy section). The check excludes `globals.css` and `tailwind.config.ts` (where the legacy utilities/aliases live during the deprecation window).
- **Where**: `.husky/pre-commit` (project root) — add to existing or create
- **Why safe**: lint-only, can't break runtime. Exempts the two files where legacy code legitimately lives. False positives can be silenced per-line with `// eslint-disable-next-line tachles/no-legacy-glass`.
- **Verification**:
  1. Stage a test file: `echo 'export const X = () => <div className="glass-strong" />' > /tmp/test.tsx && cp /tmp/test.tsx apps/web/components/test.tsx && git add apps/web/components/test.tsx`.
  2. `git commit -m "test"` → blocks with: `ERROR: New .glass-strong / .glass-liquid usage detected.`
  3. Remove test file. Confirm an unrelated commit (e.g., readme typo) passes through cleanly.
  4. `git log -1 --name-only` confirms the test file did NOT land in history.
- **Depends on**: nothing.

### T1.5 — Verify Stage 1 in Vercel preview

- **What**: Open a PR with all of T1.1–T1.4. Vercel auto-deploys preview. Verify on the preview URL (NOT production yet). Check critical screens for regression: landing, dashboard, /projects/[id]/scenes (an existing project), /admin/costs, /login.
- **Where**: GitHub PR + Vercel preview
- **Why safe**: preview only.
- **Verification**:
  1. Vercel preview URL responds with `x-vercel-id` `bom1::*` (region pinning intact).
  2. Side-by-side comparison: production vs preview. Cooler-neutral bg on preview, slightly different button/badge tones, no layout shift.
  3. Lighthouse on preview `/dashboard` ≥ matching production scores (perf -2pt acceptable due to extra CSS variables; a11y must NOT drop).
  4. `curl -sI https://<preview>.vercel.app/api/health | grep x-vercel-id` returns `bom1::*`.
  5. No console errors in any of the 5 sample pages.
  6. Manually click through the wizard end-to-end with an existing project. Each step renders without crashes (visual quality unchanged from V26 except palette tone).
- **Depends on**: T1.1–T1.4. Merge to main when green.

---

## Stage 2 — Font Swap

**Risk**: 🟡 Visual · **Blast radius**: every Latin character + numeric in the app · **Mergeable alone**: yes

### T2.1 — Replace IBM Plex with Geist Sans, JetBrains Mono with Geist Mono

- **What**: Update [`apps/web/app/layout.tsx`](apps/web/app/layout.tsx) per [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md#81--appsweblayouttsx) §8.1:
  - `import { Heebo, Geist, Geist_Mono } from 'next/font/google'` (drops `IBM_Plex_Sans`, `JetBrains_Mono`).
  - `Heebo` gets `weight: ['400', '500', '600', '700', '800']` (adds 800 for h1).
  - New `geistSans` with `--font-geist-sans` variable.
  - New `geistMono` with `--font-geist-mono` variable.
  - `<html className=...>` uses the 3 new variable names.
  - The `Toaster` `fontFamily: 'var(--font-heebo)'` reference unchanged.
- **Where**: `apps/web/app/layout.tsx`
- **Why safe**: Tailwind config already references `var(--font-geist-sans)` / `var(--font-geist-mono)` as of Stage 1 (T1.2) — `next/font` defines those variables, the stack picks them up. Old `--font-ibm-plex` and `--font-jetbrains` variables go undefined; nothing references them after Stage 1, so no fallback breaks.
- **Verification**:
  1. `grep -rn "ibm-plex\|jetbrains\|IBM_Plex\|JetBrains_Mono" apps/web/` returns zero matches outside of comments/docs.
  2. `npm run dev:web` → no console warnings about missing fonts.
  3. Visit [http://localhost:3000](http://localhost:3000) → DevTools Network tab → filter by "font" → only `Heebo`, `Geist`, `Geist Mono` `.woff2` files load. No `IBMPlex*`, no `JetBrainsMono*`.
  4. Visit `/admin/costs` → numbers in cost column read with Geist's tnum (vertical decimal alignment confirmed in T1.3 still holds).
  5. Visit `/` (landing) → hero `<h1>` renders Heebo 800 — DevTools `font-weight: 800` and `font-family` resolves to `var(--font-heebo)` first.
  6. Visit a kicker (e.g., `<SectionKicker>` on landing) → `font-family` resolves to `var(--font-geist-mono)`.
  7. **Production deploy verify**: after merge → push → `curl -sI https://tachles-lac.vercel.app/_next/static/media/ | grep -i geist` returns Geist files (paths vary by deploy hash).
- **Depends on**: T1.2 (Tailwind config updated to expect the new font CSS variable names).

### T2.2 — Update layout.tsx comment block

- **What**: The current layout.tsx has a V19.1 comment explaining the font choice. Update it to V27 reasoning (Geist family harmony, tnum, Vercel-mode anchor). Tiny but matters for future-Claude reading the file.
- **Where**: `apps/web/app/layout.tsx` (the `// V19.1 — ...` comment)
- **Why safe**: comment-only.
- **Verification**: `grep -A 5 "V27" apps/web/app/layout.tsx` returns the new explanatory block.
- **Depends on**: T2.1.

---

## Stage 3 — Density Attribute System

**Risk**: 🟢 Additive · **Blast radius**: pages without `data-density` keep current behavior · **Mergeable alone**: yes

### T3.1 — Density CSS variants in globals.css

- **What**: Add the 4 density mode blocks (`:root` + `[data-density="default|dense|comfortable|showcase"]`) per [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md#32--density-mode-contracts) §3.2. Each defines `--pad-card-y`, `--pad-card-x`, `--gap-section`, `--row-height`, `--bento-gap`, `--line-height-body`. Add the `[data-density="comfortable"] { --radius: var(--radius-xl); }` Krea-mode override. Add the `:root` default values so unattributed pages still render.
- **Where**: `apps/web/app/globals.css`
- **Why safe**: variables only. Until a primitive consumes them (T3.4), they're inert.
- **Verification**:
  1. DevTools `<html>` → `getComputedStyle().getPropertyValue('--pad-card-y')` returns `1.25rem` (default).
  2. Inject `<section data-density="dense">` on any page → its computed `--pad-card-y` returns `0.75rem`.
  3. Same for `comfortable` → `1.75rem`. The cascade works.
  4. Remove the test injection.
- **Depends on**: T1.1.

### T3.2 — Build `<DensityScope>` helper component

- **What**: Create `apps/web/components/density/density-scope.tsx` exporting `<DensityScope mode="dense|default|comfortable|showcase">{children}</DensityScope>`. The wrapper renders a `<section data-density={mode}>...</section>` with `display: contents` so it doesn't introduce a layout box (otherwise it'd shift Tailwind grid layouts).
- **Where**: `apps/web/components/density/density-scope.tsx` (NEW)
- **Why safe**: pure scoping helper. Zero behavior outside its subtree.
- **Verification**:
  1. `npm run typecheck` passes.
  2. Add `<DensityScope mode="dense">` around any existing card on a test page → DevTools shows `<section data-density="dense" style="display: contents">` wrapping. Layout unchanged.
  3. With dev-time runtime guard active (T3.3), nesting `<DensityScope mode="comfortable">` inside `<DensityScope mode="dense">` logs a console warning.
- **Depends on**: T3.1.

### T3.3 — Dev-time inheritance guard (downward-only override)

- **What**: Add a `useEffect` inside `<DensityScope>` (dev-only via `if (process.env.NODE_ENV !== 'production')`) that walks up the DOM, detects ancestor `data-density`, and warns if the descendant violates "downward only" (e.g., a `comfortable` scope inside a `dense` parent). Order: `showcase > comfortable > default > dense`.
- **Where**: `apps/web/components/density/density-scope.tsx` (extends T3.2)
- **Why safe**: dev-only console.warn. Stripped from production bundle.
- **Verification**:
  1. Build dev: `npm run dev:web`. Render nested violation in any page → console: `[DensityScope] Mode "comfortable" inside ancestor "dense" violates downward-only rule.`
  2. Build prod: `npm run build` → `grep -c "DensityScope.*violates" .next/server/**/*.js` returns 0 (stripped).
  3. Compliant nesting (`comfortable → dense`) produces no warning.
- **Depends on**: T3.2.

### T3.4 — Wire `<Card>`, `<Button>`, `<Input>`, `<Table>` to density CSS variables

- **What**: Update existing primitives in `apps/web/components/ui/` to consume `--pad-card-y`, `--pad-card-x`, `--row-height`, `--radius` from the density CSS variables instead of hardcoded Tailwind classes.
  - `Card`: `padding: var(--pad-card-y) var(--pad-card-x)` instead of fixed `p-6`.
  - `Button`: stays Tailwind for size; **add `intent` prop** here per [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md#71--button-intent-driven-replaces-size) §7.1 (`default` 36px / `action` 44px / `hero` 52px). Old `size` prop deprecated but kept functional.
  - `Input`: add `size` prop (`sm`/`md`/`lg`) wired to `h-8`/`h-10`/`h-12` per §7.2; default unchanged for callers without prop.
  - `Table`: row height via `var(--row-height)` instead of fixed.
- **Where**:
  - `apps/web/components/ui/card.tsx`
  - `apps/web/components/ui/button.tsx`
  - `apps/web/components/ui/input.tsx`
  - `apps/web/components/ui/table.tsx`
- **Why safe**: defaults unchanged. Card padding stays 24px in default mode; only changes when ancestor declares `data-density`. Button without `intent` continues to use existing styling (legacy size prop). New `intent="action"` is opt-in.
- **Verification**:
  1. `npm run typecheck` passes.
  2. Without DensityScope: `<Card>` renders with current padding (24px y/x). DevTools confirms.
  3. Inside `<DensityScope mode="dense">`: `<Card>` padding reads `12px 16px`. Inside `comfortable`: `28px 28px`.
  4. `<Button intent="action">` renders 44px tall. `<Button intent="hero">` 52px. `<Button>` (no prop) 36px.
  5. `<Table>` rows in `dense` mode: 36px. In `comfortable`: 56px.
  6. Existing usages of `<Card>`, `<Button>` (without new props) render unchanged from V26 baseline.
- **Depends on**: T3.1, T3.2, T1.2.

### T3.5 — Refactor `<SectionKicker>` to explicit variant

- **What**: Update `apps/web/components/ui/section-kicker.tsx` per [`DESIGN_TOKENS.md`](./DESIGN_TOKENS.md#23--letter-spacing--kicker-variants-explicit) §2.3: add required `variant: 'loud' | 'muted'` prop. `loud` → `tracking-[0.24em] text-primary`. `muted` → `tracking-[0.18em] text-fg-tertiary`. Remove any context-aware behavior. All call sites updated.
- **Where**:
  - `apps/web/components/ui/section-kicker.tsx`
  - All callers (grep: `grep -rln "SectionKicker" apps/web/`)
- **Why safe**: required prop change is a TS error if missed. CI catches all call sites at compile time.
- **Verification**:
  1. `npm run typecheck` passes (zero errors).
  2. `grep -rn "SectionKicker" apps/web/components/ apps/web/app/ | grep -v "variant="` returns zero results (every call site has explicit variant).
  3. Visit landing → kickers render `text-primary` + `tracking-[0.24em]` (loud).
  4. Visit `/admin/costs` (after Wave 2 — for Stage 3 just verify the API works on a test page).
- **Depends on**: T1.2 (color tokens defined).

---

## Stage 4 — Wizard Migration (end-to-end)

**Risk**: 🟡 Visible · **Blast radius**: 7 wizard pages · **Mergeable alone**: yes (Topbar/Sidebar visually old until Wave 2 — acceptable)

> **Hard guard**: do NOT restyle Topbar / Sidebar / DashboardAurora / CommandPalette in this stage. They get Wave 2 treatment. Their tokens auto-update via Stage 1 aliases — they'll look "subtly different" in palette but structure is preserved.

### T4.1 — `<WizardProgressStrip>` refresh

- **What**: Update the strip in `apps/web/components/wizard/` to use new tokens. Apply `<DensityScope mode="default">` wrapper. Active step uses `text-primary`; inactive `text-fg-tertiary`. Step labels use `<SectionKicker variant="muted">` for consistency. Active dot animates with `motion-slide-side` (RTL-aware) when step changes. Persistent across all wizard pages — touch once.
- **Where**: `apps/web/components/wizard/wizard-progress-strip.tsx` (or actual file)
- **Why safe**: structural update; the strip already exists and is tested in V26.
- **Verification**:
  1. `npm run dev:web` → navigate `/projects/[id]/scripts` → strip renders.
  2. Click "המשך לסצנות" → strip updates active step → `motion-slide-side` plays from inline-start (right in RTL).
  3. DevTools: active step `<span>` has `text-primary` class; inactive has `text-fg-tertiary`.
  4. Reduced-motion preference enabled → step transition collapses to fade only (motion-press still works on the strip's clickable areas).
  5. Mobile (<md) → strip layout adapts (existing breakpoint behavior preserved).
- **Depends on**: T3.5.

### T4.2 — Wizard intake forms (steps 0–2: new project + product + avatar + voice)

- **What**: Apply `<DensityScope mode="default">` to the page wrapper. Replace `glass`/`glass-strong` cards with `tier-elevated`. Inputs use new focus-ring 3-state (default/error). Buttons use `intent="default"` for chrome (Cancel/Back), `intent="action"` for the page's primary CTA ("שמור והמשך" / "צור תסריטים" / etc.). Section titles use `<SectionKicker variant="muted">`.
- **Where**:
  - `apps/web/app/(dashboard)/projects/new/page.tsx`
  - `apps/web/app/(dashboard)/projects/[id]/page.tsx` (overview)
  - `apps/web/app/(dashboard)/projects/[id]/avatar/page.tsx` (or actual route)
  - `apps/web/app/(dashboard)/projects/[id]/voices/page.tsx` (V26.19 voice picker)
  - Any other wizard intake step
- **Why safe**: visual replacement; structure and server actions untouched. Layout dimensions identical.
- **Verification**:
  1. Open `/projects/new` → upload an image → drag-and-drop area renders with `tier-elevated` glass + `edge-pearl` ABSENT (tier-elevated rule). Border `divider` color.
  2. Tab through inputs → focus ring renders as 2px primary at 55% opacity, with 2px canvas offset.
  3. Submit form with invalid input → focus ring switches to `--ring-error` (destructive at 55%).
  4. CTA "שמור והמשך" renders 44px tall (`intent="action"`).
  5. "Cancel" renders 36px (default intent).
  6. SectionKicker on every form section renders `tracking-[0.18em]` + `text-fg-tertiary`.
  7. RTL: form labels right-aligned, inputs flow right-to-left, no clipping.
  8. Visit Avatar picker → grid uses `data-density="comfortable"` for the avatar tiles only (downward override) → tiles render with `radius-xl` (16px) instead of `radius-lg` (12px).
- **Depends on**: T3.4, T3.5, T4.1.

### T4.3 — Scripts grid (step 3 — script-batch with per-card pulse)

- **What**: Apply `<DensityScope mode="default">` to the page (chrome stays default; the script grid contents go `comfortable` for the cards). Each `<ScriptCard>` carries `data-ai-active="script-batch"` while its corresponding script is still generating (server reads the framework's progress from DB / streaming response). When that specific framework completes, server emits `data-state="success"` for 800ms, then strips the attribute. The grid as a whole does NOT pulse.
- **Where**:
  - `apps/web/app/(dashboard)/projects/[id]/scripts/page.tsx`
  - `apps/web/components/scripts/script-card.tsx` (or actual)
  - `apps/web/app/(dashboard)/projects/[id]/scripts/actions.ts` (server side that emits state)
- **Why safe**: state attributes are additive. If polling is interrupted, cards default to no `data-ai-active` (idle). The existing 6-batch generation logic untouched.
- **Verification**:
  1. Click "צור תסריטים" → 6 cards mount with `data-ai-active="script-batch"`.
  2. DevTools inspector → first card → `box-shadow` includes `hsl(var(--ai))` ring + `motion-pulse-ai` animation running.
  3. Wait ~5–12 seconds → individual cards transition independently as scripts return: pulse stops, ring becomes static `--success` (150° green), 800ms, then attribute removed.
  4. Test with prefers-reduced-motion ON → no pulse, ring static-lime; transition to success ring still happens (state confirmation, not animation).
  5. Reload mid-generation → polling re-establishes → cards still in flight remount with `data-ai-active="script-batch"` (server-rendered from `*InFlightAt` columns).
  6. After all 6 done → 0 elements have `data-ai-active`. 0 elements have `data-state`.
- **Depends on**: T1.1 (CSS vars), T1.3 (motion patterns), T4.1.

### T4.4 — Scenes step (step 4 — image generation, Krea-mode)

- **What**: This is THE Krea-mode validation. Wrap the page in `<DensityScope mode="comfortable">`. Each `<SceneCard>` is `tier-elevated` (no edge-pearl per spec — it's `tier-elevated`, not `tier-overlay`). When user clicks "צור תמונה" on a scene → server sets `scene.imageInFlightAt` → `<SceneCard>` server-renders with `data-ai-active="image"` → CSS auto-applies `glow-ai` + `motion-pulse-ai` + auto-promotes the kicker to `loud`-lime. Same pattern for `voice` and `clip`.
- **Where**:
  - `apps/web/app/(dashboard)/projects/[id]/scenes/page.tsx`
  - `apps/web/components/scenes/scene-card.tsx`
  - Server side: confirm `imageInFlightAt` / `voiceInFlightAt` / `clipInFlightAt` are read on render and emitted as `data-ai-active="image|voice|clip"`.
- **Why safe**: V26.7 already has polling-driven re-render on flight changes. Adding a server-rendered attribute on top is additive.
- **Verification**:
  1. Open `/projects/[id]/scenes` (with an existing project that has 4 scenes) → all 4 cards render `tier-elevated` + 16px radius (Krea-mode override).
  2. Click "צור תמונה" on scene #2 → DOM updates within polling cycle → scene #2 has `data-ai-active="image"`. Other scenes unchanged.
  3. DevTools → scene #2 → `box-shadow` matches `--ai` ring; `animation-name: motion-pulse-ai-kf`.
  4. Inside the breathing card, the `<SectionKicker>` (e.g., "סצנה 2") renders with `letter-spacing: 0.24em` + `color: hsl(var(--ai))` (auto-promoted from muted).
  5. Image generation completes → next poll cycle → scene #2 strips `data-ai-active`, gains `data-state="success"` for 800ms, then idle.
  6. Switch to prefers-reduced-motion → scene mid-flight has static lime ring (no breathing). Success transition still fades.
  7. Trigger voice generation on scene #1 → `data-ai-active="voice"` sets; same visual treatment.
  8. Trigger clip generation on scene #3 → `data-ai-active="clip"`; same.
  9. ASS captions, audio preview, video preview all render correctly inside cards (existing behavior).
  10. Scroll and rapid clicking does NOT trigger duplicate provider calls (V26.10 in-flight pattern preserved).
- **Depends on**: T3.4, T1.1, T4.1.

### T4.5 — Render + final video reveal (step 6 — atmosphere tier)

- **What**: The render-status overlay that appears when user clicks "Render Final Video" → wrap in `tier-atmosphere` (28px blur, full edge-pearl, primary glow). Inside: a static lime ring (`data-ai-active="render"` — NO pulse, render takes minutes) + `<Progress variant="ai">` with linear shimmer rail. When complete: `motion-cinematic-reveal` plays for the final video tile (700ms, scale 1.04→1 + translateY + fade). Final video player renders at `tier-elevated` with `radius-2xl` and `motion-cinematic-reveal` entry.
- **Where**:
  - `apps/web/app/(dashboard)/projects/[id]/videos/page.tsx` (or render flow)
  - `apps/web/components/render/render-status-panel.tsx`
  - `apps/web/components/ui/progress-bar.tsx` — add `variant="ai"` (lime shimmer) / `variant="success"` (static fill).
- **Why safe**: render-status is overlay-shaped already; tier-atmosphere replaces existing visual without restructure. The cinematic-reveal is opt-in CSS class.
- **Verification**:
  1. Trigger render on existing project → render-status overlay appears with `tier-atmosphere` (28px blur background, edge-pearl gradient on top edge, primary glow shadow).
  2. Inside the overlay: `data-ai-active="render"` element has STATIC lime ring (no breathing animation). Confirm via DevTools: `animation: none` on `[data-ai-active="render"]` rules.
  3. Inside that, `<Progress variant="ai">` renders with `motion-shimmer` continuously sweeping (linear, 1.4s).
  4. Wait for render to complete → final video tile mounts with `motion-cinematic-reveal` (one-shot, 700ms).
  5. Render-status overlay fades out via `motion-fade` reverse.
  6. Reduced-motion: progress shimmer stops (replaced by static gradient fill); cinematic-reveal collapses to fade-up.
  7. Render fails (force a Kling 422 in dev) → status panel surfaces destructive-soft toast (per `apps/web/lib/errors/scene-error-messages.ts`); ring color shifts from `--ai` to `--destructive`.
- **Depends on**: T1.1, T4.1, T4.4.

### T4.6 — RTL fixes (Radix Select clipping + slide-side audit)

- **What**: Fix the known Radix `<Select>` RTL clipping bug (per `DESIGN_BRIEF.md` Accessibility note + `DESIGN_TOKENS.md` §1.7). Apply `<Select.Content position="popper" align="end">` and override `transform-origin: top right` for RTL. Audit all wizard pages for `motion-slide-side` directional correctness. Add a project-wide CSS rule that mirrors `--slide-side-from` direction in RTL contexts (defined in T1.1; just verify it's working).
- **Where**:
  - `apps/web/components/ui/select.tsx` (if exists; otherwise wherever Select is used)
  - Wizard pages with Select dropdowns
- **Why safe**: Radix wrapper update is targeted; positioning prop addition.
- **Verification**:
  1. Open any wizard page with a Select dropdown (likely `voices` step) → click → dropdown renders below trigger, right-aligned (RTL natural anchor).
  2. Dropdown does NOT clip at the right edge of the viewport.
  3. Open Sheet/Drawer (e.g., CommandPalette `Cmd+K`) → enters from inline-start (right edge in RTL).
  4. DevTools `<Select.Content>` → `transform-origin: top right` (or `top end` if logical).
  5. Switch html `dir="ltr"` (test only — revert) → dropdown renders below + left-aligned.
  6. Browser zoom 200% → no clipping at any zoom level.
- **Depends on**: T4.2 (forms with Select).

### T4.7 — Wizard end-to-end smoke test

- **What**: Manual full-flow test of the wizard, start to finish, on a Vercel preview, with screen reader + keyboard nav + reduced-motion setting toggling.
- **Where**: Vercel preview URL after T4.1–T4.6 merge
- **Why safe**: validation only.
- **Verification**:
  1. **Standard flow**: log in → "פרויקט חדש" → upload image → product extracted → choose avatar → choose voice → generate scripts (verify per-card pulse) → choose script → "המשך לסצנות" → generate image for each scene (verify Krea-mode + per-scene pulse) → generate voice → generate clip (face-gate kicks in if mouth visible) → render final video → final video plays. **All 6 steps complete without error in a single session.**
  2. **Keyboard-only flow**: same path, no mouse. Tab order respects RTL (left-to-right Latin, right-to-left within Hebrew sentences). Enter advances each step. Escape closes overlays.
  3. **Screen reader (VoiceOver)**: AI-active scenes announce "loading"/"busy" via `aria-busy="true"`. Success state announces via `aria-live="polite"`. Provider-dot accessibility labels read aloud in admin (defer admin SR to Wave 2).
  4. **Reduced motion**: Cmd+Shift+P → "Reduce motion" toggle → all flow tasks complete; no pulsing rings; cinematic-reveal collapses to fade.
  5. **Lighthouse a11y on `/projects/[id]/scenes` ≥ 95**.
  6. **No console errors** at any point.
- **Depends on**: T4.1–T4.6.

---

## Stage 5 — Legacy Sweep

**Risk**: 🟢 Net-cleanup · **Blast radius**: code-only (visual identical when sweeping correctly) · **Mergeable alone**: yes

> Do NOT start Stage 5 until Stage 4 has been live in production for ≥48 hours without regression reports.

### T5.1 — Sweep `.glass` / `.glass-strong` / `.glass-liquid` → `.tier-*`

- **What**: `grep -rn "glass-strong\|glass-liquid\|className=\"glass\b" apps/web/` → list all sites → replace per the [tier mapping](./DESIGN_BRIEF.md#3-glass-is-earned) in the brief:
  - `.glass` → `.tier-elevated`
  - `.glass-strong` (workspace cards) → `.tier-elevated` + optional `.glow-primary`
  - `.glass-strong` (overlays/popovers) → `.tier-overlay`
  - `.glass-liquid` (anywhere except landing hero) → `.tier-atmosphere`
  - `.glass-liquid` (landing hero) → `.tier-liquid` (preserved)
- **Where**: any `.tsx` referencing `.glass*` (excluding `globals.css` and tests).
- **Why safe**: pre-commit gate already forbids new `.glass*`. Sweep only replaces existing.
- **Verification**:
  1. `grep -rn "glass-strong\|glass-liquid" apps/web/ --include="*.tsx" --include="*.ts"` returns zero matches.
  2. `grep -rn "className=\".*\bglass\b" apps/web/ --include="*.tsx"` returns zero matches.
  3. Side-by-side compare landing/dashboard/wizard between previous deploy and this PR's preview → only the landing hero retains `.tier-liquid` (40px blur). Everything else `.tier-*`.
  4. Lighthouse perf on `/projects/[id]/scenes` ≥ pre-sweep baseline (28px cap delivers expected ~2x faster paint on wizard step 4).
- **Depends on**: Stage 4 stable in production ≥48h.

### T5.2 — Delete legacy utilities from globals.css

- **What**: Remove `.glass`, `.glass-strong`, `.glass-liquid` definitions from `globals.css` (now unused per T5.1). Remove the deprecation TODO comment. Remove the `bg-mesh-soft` instances if they've been consolidated; or leave for Wave 2.
- **Where**: `apps/web/app/globals.css`
- **Why safe**: T5.1 verifies zero references.
- **Verification**:
  1. `grep -n "^\.glass" apps/web/app/globals.css` returns zero.
  2. `npm run build` succeeds; no missing-class errors.
  3. Visual regression: previous PR's preview vs this PR → identical (utilities not referenced anywhere).
- **Depends on**: T5.1.

### T5.3 — Sweep `tachles-*` keyframes → `motion-*`

- **What**: Replace `.animate-fade-in-up`/`.animate-progress-shimmer`/etc. utility-class references with `.motion-fade-up` / `.motion-shimmer` / etc. Same for raw `tachles-*` keyframe names if any inline. Then **delete** all `@keyframes tachles-*` blocks from `globals.css` (per user's stronger position: V27 nukes the `tachles-` namespace completely).
- **Where**:
  - `grep -rn "tachles-\|animate-fade-in-up\|animate-progress-shimmer\|animate-shimmer-overlay\|animate-soft-pulse\|animate-aurora-drift" apps/web/` → list all → replace.
  - `apps/web/app/globals.css` → delete `@keyframes tachles-*` blocks + `.animate-*` aliases.
- **Why safe**: same logic as T5.1, T5.2 — sweep before delete.
- **Verification**:
  1. `grep -rn "tachles-" apps/web/ --include="*.tsx" --include="*.ts" --include="*.css"` returns zero.
  2. `grep -rn "animate-fade-in-up\|animate-progress-shimmer\|animate-soft-pulse\|animate-aurora-drift\|animate-shimmer-overlay" apps/web/ --include="*.tsx"` returns zero.
  3. `npm run build` succeeds.
  4. Visit landing → text shimmer still works (renamed: `.motion-shimmer-text`). Visit `/projects/[id]/scenes` mid-flight → progress shimmer still works (renamed `.motion-shimmer`).
- **Depends on**: Stage 4 stable.

### T5.4 — Sweep `bg-accent` / `text-accent` → `bg-ai` / `text-ai`

- **What**: `grep -rn "bg-accent\|text-accent\|border-accent\|ring-accent" apps/web/` → list → replace with `bg-ai` / `text-ai` etc. Then remove the `--accent` alias from `globals.css` and the `accent` mapping from `tailwind.config.ts`.
- **Where**: any `.tsx` using `accent` Tailwind utility, plus the two config files.
- **Why safe**: pre-commit gate already forbids new `bg-accent`. Old usages migrate cleanly to `ai` (same color).
- **Verification**:
  1. `grep -rn "\b(bg|text|border|ring)-accent\b" apps/web/ --include="*.tsx"` returns zero matches.
  2. `grep "^\s*--accent:" apps/web/app/globals.css` returns zero.
  3. `grep "accent:" apps/web/tailwind.config.ts` returns zero (excluding new `ai` mapping).
  4. Lighthouse a11y unchanged.
- **Depends on**: T5.1, T5.3.

### T5.5 — Remove pre-commit regression gates

- **What**: Now that legacy is gone, remove the `.glass-*` and `bg-accent` blocks from `.husky/pre-commit` (T1.4). Future regressions can't happen because the utilities don't exist.
- **Where**: `.husky/pre-commit`
- **Why safe**: cleanup of guardrail that's no longer needed.
- **Verification**:
  1. Stage a (pretend) test commit with `glass-strong` → commit goes through (gate gone). Don't actually merge this; just verify in a sandbox.
  2. The legitimate test: any code referencing `.glass-strong` is now a Tailwind class that doesn't resolve (red squiggly in IDE). That's the desired regression signal — "this class doesn't exist."
- **Depends on**: T5.2, T5.4.

---

## Stage 6 — Wave 1 Wrap & Review

### T6.1 — Run `/design-review`

- **What**: Trigger the `/design-review` skill against the design brief. Review captures screenshots at desktop/tablet/mobile breakpoints + dark mode + interactive states. Compares wizard (steps 0–6) against the brief's validation criteria.
- **Where**: invoked via slash command; output to `.design/design-language-v27/DESIGN_REVIEW.md` + `.design/design-language-v27/screenshots/`.
- **Verification**:
  1. `DESIGN_REVIEW.md` exists.
  2. Screenshots cover wizard step 0 + step 3 (scripts) + step 4 (scenes) + step 6 (final video) at desktop / mobile / dark / RTL.
  3. Brief's 5 validation criteria explicitly addressed in the review.
  4. Any "must-fix" items in the review get one-off PRs (fast-track).
- **Depends on**: Stage 5 complete.

### T6.2 — Update `STATUS.md`, `CLAUDE.md`, `README.md`

- **What**: Add V27 entry to `.claude/CLAUDE.md` (with full design-system summary + paths to brief/tokens/tasks). Update `STATUS.md` if exists. Bump version reference in README. Same pattern as V26.SEC entry — tight, factual, dated.
- **Where**: project root + `.claude/`
- **Verification**: `grep -A 3 "V27" .claude/CLAUDE.md` returns the new block. Wave 2/3 plans referenced as future work.
- **Depends on**: T6.1.

### T6.3 — Production verification

- **What**: Per project's `feedback_deploy_both.md` memory: deploy via `npx vercel --prod` (NOT `--yes`) + `railway up --detach`. Verify aliases. Region pin.
- **Verification**:
  1. `curl -sI https://tachles-lac.vercel.app/api/health | grep x-vercel-id` → `bom1::*`.
  2. Production wizard end-to-end on real domain: complete one full project ad render. ~3–5 minutes.
  3. `/admin/costs` accessible, balances render, recent calls populating.
  4. Final video plays.
  5. No console errors on mobile Safari + desktop Chrome.
- **Depends on**: T6.2.

### T6.4 — Tag V27.0 release

- **What**: `git tag -a v27.0 -m "V27 visual language — wave 1 (tokens + wizard)"` + push. Open a GitHub release with the wave summary, list of design artifacts, and Wave 2 preview.
- **Verification**: tag exists on origin, release page published.
- **Depends on**: T6.3.

---

## Definition of Done — Wave 1

- [ ] All 6 stages green-merged to main, deployed to production.
- [ ] `DESIGN_REVIEW.md` exists with brief-validation checklist.
- [ ] `.claude/CLAUDE.md` has V27 entry with paths to design artifacts.
- [ ] Pre-commit gates removed (T5.5).
- [ ] Zero `glass-*` / `tachles-*` / `bg-accent` / `text-accent` / `IBM_Plex` / `JetBrains_Mono` references in source (excluding docs).
- [ ] Lighthouse perf ≥ 90, a11y ≥ 95 on `/dashboard`, `/projects/[id]/scenes`, `/projects/[id]/videos`.
- [ ] Wizard complete-flow takes ≤ 5 min on production from start to final video.
- [ ] No regression reports in 7 days post-deploy.

When all are checked → Wave 1 closed. Wave 2 starts on dashboard restyle + admin pages + View Transitions.

---

## Wave 2 preview (NOT in scope of this TASKS.md — anchor for the next breakdown)

- Dashboard restyle (apply tokens + tier-* to dashboard chrome).
- Library + library tiles (apply Krea-mode to completed-video showcase).
- Admin: `/admin/costs`, `/admin/users`, `/admin/queue`, `/admin/projects`, `/admin/scenes/[id]/debug`, `/admin/projects/[id]/diagnostic`, `/admin/renders` — Vercel-mode dense.
- Settings page.
- Topbar / Sidebar / DashboardAurora / CommandPalette restyle.
- Pricing page.
- View Transitions API: step 3 → step 4 wizard nav, using the reserved `--vt-*` names from `DESIGN_TOKENS.md` §10.
- Sweep `bg-mesh-soft` → consolidated `.canvas-ambient` utility.
