# Design Brief: Visual Language V27 — "Tri-Modal Liquid"

**Project**: tachles — Hebrew-first AI UGC product video platform
**Scope**: Visual-language redesign across the entire app (chrome, workspace, admin, landing)
**Structure & flow**: Unchanged. This brief touches tokens, components, surfaces, motion — not IA.
**Predecessor**: V19.1–V26 (current cinematic violet+lime dark)
**Author**: Dor Peretz · 2026-05-01

---

## Problem

The current design language (V19.1–V26) is a strong landing page glued to a workspace that lost the thread.

Three concrete user-facing failures:

1. **The app forgets what it promised.** The landing page is glassy, alive, premium. The moment a user signs in, the visual register cools off. By the time they're in `/admin/costs`, they're looking at flat shadcn — same brand, three completely different products. The drop-off between hero and workspace breaks the "this is a 2026 AI product" promise.

2. **AI feedback isn't visually distinct from decoration.** Lime appears as decoration (badges, bullets, hover dots) AND as live-AI feedback (in-flight pulse, generation progress) in the same UI. Users can't read the screen at a glance — "is the system working, or is this just styling?"

3. **The visual system isn't legible to engineers.** Three glass variants (`glass`, `glass-strong`, `glass-liquid`) named by "amount" not by intent. One radius for everything. No formal density modes. New screens drift; the codebase grows visual entropy.

The redesign isn't about a new look. It's about **making the system speak** — every token, every animation, every surface choice means something.

## Solution

A single design language that **modulates by surface intent**, expressed through three named modes that share one vocabulary:

- **Vercel-mode** — Precision · Engineered · Restraint. For chrome, data, settings, admin. The interface retreats so work can happen.
- **Krea-mode** — Cinematic · Generative · Alive. For creative surfaces where the AI output is the protagonist (wizard step 4–6, scene cards, video reveal, dashboard hero).
- **Granola-mode** — Liquid · Atmospheric · Connective. For transitions, modals, popovers, AI-active states. The connective tissue that makes the app feel like one continuous space.

Three modes, one token system. A surface declares its mode via `data-density` and inherits motion, density, glass policy, and kicker variant. Components don't get new APIs — they get smarter defaults via CSS variants on the data attribute.

The signature 2026 move: **color and motion are state, not decoration**. Lime appears only when AI is active. Pulse means a process is running; static rings mean it succeeded. Glass is privileged — earned by overlays and feature surfaces, never the default. Every motion respects `prefers-reduced-motion`. Every animated affordance has a job.

## Experience Principles

Three principles. Each resolves a tension the current system left unresolved.

1. **Chrome retreats, content leads, motion connects.**
   *Resolves*: "Premium feel" vs "AI-product maturity." Chrome that screams premium drowns AI output. We compress chrome (Vercel-mode) so creative content (Krea-mode) carries the wow. Motion (Granola-mode) is the connective tissue between the two — it's how the user feels the app is alive without competing with the work.

2. **Color and motion are state, not decoration.**
   *Resolves*: "Brand expressiveness" vs "Cognitive clarity." Every accent and every animation must communicate something. If a lime dot doesn't mean "AI is working," it doesn't ship. If a card hover doesn't communicate interactivity, it doesn't tilt. The user reads the screen with their eyes, not their attention.

3. **The system teaches the eye.**
   *Resolves*: "Explicit labels" vs "Intuitive UI." Differences between modes are encoded in measured visual deltas — 4px radius shift between Vercel-mode and Krea-mode, 0.06em tracking shift between muted and loud kickers, ai-pulse vs success-static — that the user absorbs without copy. Like `ai ≠ success`, the dual encoding (color + motion) communicates state to colorblind users and screen-reader users alike.

## Aesthetic Direction

- **Philosophy**: Tri-Modal Liquid — a hybrid that maps Vercel/Krea/Granola onto surface intent. Each mode is a coherent register of the same vocabulary; they don't compete, they collaborate.

- **Tone**: Mature, calm, alive. Not loud. Not cute. Not corporate. The product feels confident enough to use restraint where it matters and expressiveness where it earns it.

- **Reference points**:
  - **Vercel** (chrome, admin, data) — precise typography, neutral elevation by tonal lift, restraint, Geist family.
  - **Krea** (creative surfaces) — content-as-protagonist, glass-on-content, generous breath around AI output, kicker as label.
  - **Granola** (connective) — slow blur transitions, ai-active glow rings that breathe, edge-pearl on overlays, color = state.
  - **Apple Intelligence / macOS Tahoe** — pearlescent top edges, blur capped at 28px, motion as feedback.

- **Anti-references**:
  - **2024-saturated AI products** (deep gradients everywhere, neon-on-black, "Cyberpunk SaaS") — we're stepping out of this register.
  - **Linear** (alone) — too monastic for a creative tool. Our admin can read like Linear; our wizard cannot.
  - **Runway** — too cold, too clinical for an Israeli UGC product. Krea over Runway.
  - **Generic shadcn** (untouched defaults) — our admin uses shadcn primitives, but Vercel-mode CSS variants reskin them entirely.
  - **Windows-error red, fashion-forward 0.3em mono kickers, animated everything** — these read 2024.

## Existing Patterns

**Typography (current)**:
- Heebo (Hebrew) — `weights 400-700`. **Stays as Hebrew anchor.**
- IBM Plex Sans (Latin) — `weights 300-700`. **Replaced by Geist Sans** (`400-700`).
- JetBrains Mono — `weights 400-600`. **Replaced by Geist Mono** (`400-600`).

**Colors (current)**:
- `--primary: 258 100% 68%` (electric violet). **Tuned to `258 92% 66%`** — slight desat, lower fatigue.
- `--accent: 73 95% 62%` (acid lime). **Repurposed as `--ai: 78 82% 58%`** — semantic-only ("AI active").
- `--background: 240 18% 5%` (violet-tinted dark). **Tuned to `228 6% 4%`** — cooler-neutral, lets violet primary breathe.
- Surface ladder is inconsistent today (240 18%/14%/16%/10%). **Replaced by 6-step ladder at constant `228 6%`, only L varies.**
- `--destructive: 0 70% 60%` (pure red). **Tuned to `358 75% 58%`** + new `--destructive-soft: 358 50% 64%` for toasts/validation.

**Spacing (current)**:
- Tailwind 4px-step default — **kept as-is**. Add `0.5` (2px) and `18` (72px). Density modes (`dense`/`default`/`comfortable`) layer on top via `data-density` CSS variants.

**Radius (current)**:
- Single `--radius: 0.875rem` (14px). **Replaced by 7-step scale**, default `12px`, Krea-mode override `16px`.

**Components (already in codebase, will be retro'd)**:
- `components/ui/{button,card,input,badge,switch,progress-bar,table,textarea,label,audio-preview,video-preview,loading-card,elapsed-timer,ai-thinking,section-kicker}.tsx` — primitives stay; CSS reskinned via tokens.
- `components/wizard/*` — Stepper, WizardProgressStrip, multi-step flow scaffold.
- `components/layout/*` — Topbar, Sidebar, MobileNav, DashboardAurora, CommandPalette.
- 8 custom utility classes in `globals.css` (`.glass`, `.glass-strong`, `.glass-liquid`, `.bento`, `.bg-mesh`, `.shadow-soft`, `.text-gradient`, etc.) — replaced/superseded by tier system.
- 6 custom keyframes (`tachles-fade-in-up`, `tachles-aurora-drift`, `tachles-text-shimmer`, etc.) — consolidated into 12 named motion patterns.

**Frameworks**:
- `framer-motion@12.38` installed. **Stays installed but unused in wave 1.** Re-evaluated at 6-month mark — remove if untouched. Wave 2/3 may use `LayoutGroup` + `unstable_ViewTransition` (see Key Interactions).

## Component Inventory

| Component | Status | Notes |
|---|---|---|
| `Card` | Modify | Picks tier from `data-density` ancestor. `data-tier` override allowed downward only. |
| `Button` | Modify | New `intent` prop: `default` (36px, chrome), `action` (44px, paid CTAs), `hero` (52px, Render Final / landing CTAs). Size scale (`xs/sm/md/lg/xl`) deprecated in favor of intent. |
| `Input` / `Textarea` | Modify | New focus-ring 3-state (default/error/disabled). RTL Radix `<Select>` clipping fix required. |
| `Badge` | Modify | Switches to Geist Mono uppercase; tabular numbers for counts. |
| `Switch` | Modify | Lime "active" track repurposed — only fires when `data-ai-active` ancestor matches. Default state uses primary. |
| `Progress` | Modify | Two variants: `<Progress variant="ai">` lime shimmer (in-flight); `<Progress variant="success">` static fill (completed). |
| `Table` | Modify | Density-aware row heights (36/44/56). Tabular numbers via Geist tnum. Provider dot column for `/admin/costs`. |
| `SectionKicker` | Modify | New explicit `variant` prop: `loud` (Krea, `text-primary`, tracking-[0.24em]) / `muted` (Vercel, `text-muted-foreground`, tracking-[0.18em]). Context-aware behavior removed. |
| `DensityScope` | New | Sugar wrapper around `<section data-density="…">`. Read-only ergonomic helper for DX. |
| `Glow` modifier classes | New | `.glow-primary`, `.glow-ai`, `.edge-pearl`, `.edge-gradient-primary`. Mounted via className concat. |
| `tier-*` classes | New | `.tier-surface`, `.tier-elevated`, `.tier-overlay`, `.tier-atmosphere`, `.tier-liquid` (landing-only). Replace `.glass`/`.glass-strong`/`.glass-liquid`. |
| `Provider Dot` | New | 8px round dot with `--provider-{openai,gemini,xai,kling,pixverse,elevenlabs,r2}` namespace. Used only in `/admin/costs` charts and rows. |
| `AIActiveContainer` (concept) | New | Any component with `data-ai-active="image|voice|clip|script-batch|render"` automatically gets `glow-ai`, kicker `loud`, and matching pulse/static behavior. Server-rendered from `*InFlightAt` columns; no client-side wiring needed. |
| `<Stepper>`, `<WizardProgressStrip>` | Modify | View Transitions–ready. Marked `view-transition-name` on persistent elements. (Wave 2/3.) |
| `framer-motion` imports | Defer | Not loaded in wave 1. Reserved for `unstable_ViewTransition` (wave 2) + drag-to-reorder if it ever ships (wave 3+). |

**Components NOT touched in this redesign**: business logic, Prisma models, queue processors, ffmpeg pipeline, scrapers, LLM clients. The redesign is visual-only.

## Key Interactions

### 1. The AI Breathing Contract

Every place AI works carries `data-ai-active="image|voice|clip|script-batch|render"` on the **outcome unit** (the unit the user is waiting for), not the trigger button. Examples:

| AI work | Container | Enum value |
|---|---|---|
| Scene image generation | `<SceneCard>` of that scene | `"image"` |
| Scene voice generation | `<SceneCard>` of that scene | `"voice"` |
| Scene clip generation | `<SceneCard>` of that scene | `"clip"` |
| Script batch (6 frameworks parallel) | each `<ScriptCard>` independently — NOT the grid | `"script-batch"` |
| Final render | `<RenderStatusPanel>` | `"render"` |

Behavior wiring (CSS only, no JS event listeners — server reads `*InFlightAt` from DB and emits attribute; polling handles refresh):

| Enum value | Glow | Pulse | Kicker | Progress |
|---|---|---|---|---|
| `image` / `voice` / `clip` / `script-batch` | `glow-ai` ring | `motion-pulse-ai` (1.6s breathe) | auto-`loud` + `text-ai` | shimmer rail if `<Progress variant="ai">` |
| `render` | `glow-ai` ring | **STATIC** (no pulse — render runs minutes) | auto-`loud` + `text-ai` | shimmer rail (linear, infinite) on internal progress bar |

When the work completes:
- The container drops `data-ai-active`, gets `data-state="success"` for 800ms.
- A **static** success ring (`success` color, `150 60% 50%`) holds for 800ms, then fades.
- For `script-batch`: each card transitions independently as its script returns — the grid never breathes as a whole.

This dual encoding (`ai = motion`, `success = static`) is intentional accessibility for colorblind users and screen-reader cohorts — `aria-busy` rides on `data-ai-active`.

### 2. Mode Inheritance with Downward-Only Override

Surfaces declare mode by setting `data-density` on a wrapping `<section>` (or via `<DensityScope>`):

```tsx
<DensityScope mode="dense">      {/* Vercel-mode page */}
  <Card />                       {/* inherits dense — surface tier, no blur, 12px radius */}
  <Button intent="default" />    {/* inherits dense — 36px height, lift-hover */}
  <Table />                      {/* inherits dense — 36px row height */}
</DensityScope>
```

CSS variants (`[data-density="dense"] .card { … }`) handle propagation. **No new component props.**

**Override rule (downward only)**:
- ✅ `comfortable` page → `dense` widget (e.g., a tiny captions table inside a Krea-mode scene card).
- 🚫 `dense` page → `comfortable` modal. Dev warning if violated.
- 🚫 More than 2 mode changes per screen. If the screen needs three, the IA is wrong.

### 3. Glass is Earned

Glass is no longer a default for `Card`. It's allocated by tier:

| Tier | Use | blur | saturate | bg | edge |
|---|---|---|---|---|---|
| `tier-surface` | Vercel-mode cards, settings, admin | 0px | 100% | `--surface` | `inset 0 1px 0 white/0.06` |
| `tier-elevated` | Default-mode cards, wizard step 1–3 | 8px | 115% | `--elevated` | static highlight |
| `tier-overlay` | Popover, Sheet, Drawer, CommandPalette | 20px | 140% | `--overlay/0.85` | **edge-pearl** |
| `tier-atmosphere` | Modal scrims, hero featured tiles, render-status overlay | 28px | 165% | `--canvas/0.55` | edge-pearl + optional `edge-gradient-primary` |
| `tier-liquid` | **Landing hero only** | 40px | 180% | `--canvas/0.4` | edge-pearl + edge-gradient |

**Hard limit**: max 2 glass tiers per screen. Three glass tiers means the system has lost the thread.

### 4. Per-Card Pulse for Parallel AI Work

When `script-batch` runs, 6 framework cards generate in parallel and finish at staggered times (5–12 seconds apart). The grid as a whole does NOT pulse — each card has its own `data-ai-active="script-batch"` attribute, mounted at request time, removed when its script returns. The card's glow transitions to `data-state="success"` (800ms static ring) and then settles.

The user reads "4 of 6 done" without text, just by looking at which cards are still breathing.

### 5. Future: View Transitions API (Wave 2/3 anchor)

Next 15 + React 19 ship `unstable_ViewTransition`. Native, free, server-component-compatible.

**Concrete wave-2 use case**: the route change from `/projects/[id]/scripts` → `/projects/[id]/scenes` (wizard step 3 → step 4). Today this is a hard route change. With View Transitions:
- `<WizardProgressStrip>` continues smoothly (the active dot slides one position right, the labels reflow).
- The selected script card "carries" its title — `view-transition-name: selected-script` on both pages.
- The Generate Scenes button morphs into the loading state of step 4.

This is mentioned now (not built now) so motion patterns chosen in wave 1 don't conflict with view-transitions later. **No `framer-motion` `<AnimatePresence>` for route exits** — that path is reserved for View Transitions.

### 6. Tactile Press Feedback (always-on)

`motion-press` (`scale 1→0.97`, 80ms) fires on **every** button across **every** density mode AND under `prefers-reduced-motion`. Tactile feedback is not animation — it's state confirmation. A button that doesn't acknowledge a click feels broken.

## Responsive Behavior

**Breakpoints**: Tailwind defaults (`sm: 640, md: 768, lg: 1024, xl: 1280, 2xl: 1536`). No custom breakpoints in v27.

**RTL is the default direction.** All `slide-side` motions, `translateX` patterns, and Radix popper positions must be RTL-aware:
- `motion-slide-side` enters from the inline-start (right in RTL, left in LTR — `inset-inline-start`).
- Radix `<Select>` clipping bug under `dir="rtl"` requires either `position="popper"` + explicit `align="end"`, or a custom Portal wrapper. Validated and fixed during Wave 1.
- Tabular numbers (`tnum`) stay LTR even in RTL contexts (Geist Sans handles this).

**Mode-by-breakpoint behavior**:
- **Vercel-mode** at `<md`: rows collapse to stacked cards, tables become card lists. Density stays `dense` (the user came here to work).
- **Krea-mode** scene grid: 4 cols `xl` → 3 cols `lg` → 2 cols `md` → 1 col `<md`. Stagger entry caps at 6 children on mobile (`< md`) so the user isn't waiting 360ms+ on a single column.
- **Granola-mode** drawers/sheets: full-width on `<md`, side-anchored 480px on `≥md`.

**Motion budget on mobile**: `motion-tilt-hover` disabled below `md` (touch devices don't hover meaningfully and the perspective transform reads as jitter on touch). `motion-cinematic-reveal` clamped to `motion-fade-up` on `<md`.

## Accessibility Requirements

**Contrast (WCAG 2.2 AA minimum)**:
- All `--fg` text on `--canvas`/`--surface` ≥ 7:1 (AAA where possible).
- `--ai (78 82% 58%)` on `--canvas` measures ~9.5:1 — passes AAA.
- `--primary (258 92% 66%)` on `--canvas` measures ~7.2:1 — passes AAA for body, AA-large for accent text.
- `--fg-tertiary` (kicker muted) on `--canvas` ≥ 4.5:1 — minimum AA.
- `--destructive-soft` on `--surface` ≥ 4.5:1 — minimum AA.

**`prefers-reduced-motion` contract (global)**:
- `*` animation-duration ⇒ `0.01ms !important`, transition-duration ⇒ `80ms !important`.
- Allowed exceptions:
  - `motion-fade` keeps `200ms` transition-duration (without it, screen flips feel jarring — worse for vestibular sensitivity).
  - `motion-press` stays at `80ms` (state confirmation, not animation).
- `[data-ai-active]` `animation: none` — pulse rings become static.
- `.motion-aurora` `display: none` — canvas drift disabled.
- `.motion-shimmer` `animation: none` — replaced by static gradient fill.

**Focus management**:
- Focus-ring 3-state, all 2px offset:
  - Default: `0 0 0 2px var(--canvas), 0 0 0 4px hsl(var(--primary) / 0.55)`.
  - Error: same shape, `--destructive` at 55%.
  - Disabled: no ring.
- Tab order: respects `dir="rtl"` natural order. No `tabindex` overrides except for skip-links.
- Skip-link: hidden by default, visible on focus, jumps to `<main>`.

**Screen-reader contracts**:
- `[data-ai-active]` always co-occurs with `aria-busy="true"` (server-rendered).
- `data-state="success"` co-occurs with `aria-live="polite"` announcement.
- Provider dots in `/admin/costs` carry `aria-label="OpenAI"` etc. — color is supplementary, never the only signal.
- `<SectionKicker>` is `<span role="presentation">` — kickers are decorative; the heading after carries the semantic label.

**Keyboard navigation**:
- `Cmd+K` opens CommandPalette (existing — preserved).
- Wizard `Enter` from any field advances to next step if step is valid.
- Modal/Sheet trap focus (Radix default — preserved).
- `Esc` closes overlays in reverse open order.

## Out of Scope

This brief is **wave 1 only**. Explicitly deferred:

**Wave 1 ships**:
- Token migration (CSS variables + Tailwind config).
- 12 named motion patterns + reduced-motion contract.
- Tier system replacing 3 glass utilities.
- `data-density` + `data-ai-active` infrastructure.
- Wizard end-to-end (steps 0–6) restyled to validate the system.

**Wave 2 (after wizard validation)**:
- Dashboard restyle.
- Library list + library cards.
- Pricing page restyle.
- Admin pages: `/admin/costs`, `/admin/users`, `/admin/queue`, `/admin/projects`, `/admin/scenes/[id]/debug`, `/admin/projects/[id]/diagnostic`, `/admin/renders`.
- Settings page.
- View Transitions API: step 3 → step 4 wizard navigation.

**Wave 3 (later, if signal supports)**:
- Drag-to-reorder scenes (only if product evidence shows users want it; today scenes are LLM-ordered).
- `framer-motion` activation (only if a use case emerges that View Transitions can't cover).
- Light mode (deferred indefinitely — dark-only is a deliberate brand choice, not a backlog item).
- Premium Hebrew typography upgrade (Ploni / Almoni / Fraktion). Not happening mid-redesign; reconsider when budget allows.
- Internationalization beyond Hebrew/English. Not on the roadmap.

**Never**:
- Reverting to `concat-demuxer` for ffmpeg compose. (See `CLAUDE.md` "What NOT to do.")
- Any of the existing platform "do not"s. The visual redesign does not touch infrastructure.
- Component prop bloat. Mode-driven changes happen via `data-*` attributes + CSS variants. Components keep clean APIs.
- Magic context-aware behavior. Variants are explicit (`<SectionKicker variant="loud" />`). Future-Claude reads the code and sees the choice.

---

## Validation

The success of this brief is measured by:

1. **The wizard end-to-end (steps 0–6) feels like one continuous experience**, not three separate modes glued together. The user crosses Vercel→Krea→Granola without conscious noticing of the shift.

2. **A new user can identify "AI is working" within 1 second of arriving on a screen** — by ai-glow + pulse alone, no copy required.

3. **`/admin/costs` reads as Vercel-grade chrome** (precision, restraint, dense data) while `/projects/[id]/scenes` reads as Krea-grade creative surface (cinematic, breathing, content-led) — **and they share the same primitives**. Tokens, components, spacing scale all identical; only `data-density` differs.

4. **WCAG 2.2 AA passes across all surfaces.** Reduced-motion users get a usable, calm app. Colorblind users distinguish `ai`/`success`/`destructive` by motion + shape, not just hue.

5. **A future contributor (or future Claude) reading the code understands the system in under 30 minutes.** Names speak intent. `tier-overlay` says what it does. `data-ai-active="render"` says where the AI is. `<Button intent="action">` says what kind of action this is. The brief lives in the code via tokens, attributes, and explicit variants.

---

*"Use cases אסורים: לתקן jank, להאיץ build perceived performance, להחביא bug. אם זה התשובה, ה-bug במקום אחר."* — guardrail comment for `data-motion="off"`, locked into Wave 1.
