---
name: tachles-design-system
description: Unified design system for tachles — combines Dashboard (Vercel/GitHub cloud-platform feel) + Glassmorphism (multi-layer blur) + Contemporary (bento grid) + Perspective (subtle 3D depth). Hebrew-first RTL.
license: MIT
metadata:
  author: tachles
  combines:
    - dashboard
    - glassmorphism
    - contemporary
    - perspective
---

# tachles Design System

## Mission

Premium AI-tool aesthetics for an Hebrew-first UGC ad-generator. Aim:
visual parity with kling.ai, krea.ai, vercel.com, github.com — modern
cloud-platform feel, dark cinema-grade canvas, glass surfaces, neon
accents. Avoid: cream / warm / playful / brutalist / arcade.

## Foundations

### Tokens (HSL via CSS custom properties — see `apps/web/app/globals.css`)

- `--background: 240 18% 5%` — near-black with violet undertone.
- `--card: 240 14% 8%` — first elevation step.
- `--popover: 240 16% 7%` — slightly lifted from card.
- `--primary: 258 100% 68%` — electric violet (brand).
- `--accent: 73 95% 62%` — acid lime (brand).
- `--gradient-from / -to / -third` — three-stop hot gradient for hero
  text and accent CTAs.
- `--border: 240 10% 16%` / `--border-subtle: 240 10% 12%`.
- `--radius: 0.875rem` — slightly bigger than shadcn default.

### Typography

- **Hebrew:** Heebo (Google Font, loaded via `next/font`).
- **Latin / Numbers:** IBM Plex Sans (cloud-platform feel, Vercel-grade).
- **Code / Mono:** JetBrains Mono.
- Headings: `font-weight: 800-900`, `letter-spacing: -0.025em` (h2-h4)
  or `-0.04em` (h1). Line height 1.05.
- Body: line-height 1.55 for density-vs-readability balance.
- Selection: `hsl(primary / 0.35)`.

### Spacing

- 8pt baseline grid (4/8/12/16/24/32/48/64).
- Section gaps: `space-y-10` to `space-y-24` for landing, `space-y-8`
  for app pages.
- Card padding: `p-5` (compact) to `p-7` (feature) to `p-10` (hero).

### Surfaces — when to use which

- **Plain bg-background** — full-page canvas.
- **`bg-mesh`** — landing hero (3-stop radial gradient mesh).
- **`bg-mesh-soft`** — inner pages (subdued version).
- **`bg-noise`** — pseudo-element noise overlay; layer with mesh.
- **`bg-spotlight`** — conic spotlight behind hero element.
- **`glass`** — standard cards. `bg-card/55` + `backdrop-blur-xl` +
  saturate 140% + inset top highlight.
- **`glass-strong`** — hero / featured cards. blur-28 + saturate 160%
  + primary box-shadow.
- **`glass-liquid`** — heaviest variant for big CTAs. blur-40 +
  saturate 180% + 3-layer shadow + multi-stop overlay.

### Shadows (cloud-platform tier system)

- **`shadow-soft`** — default cards (3-layer black on dark surface).
- **`shadow-elevated`** — hovers (deeper, pulled up).
- **`shadow-floating`** — popovers / modals (deepest).
- **`shadow-glow`** — primary CTAs (3-layer neon: 1px ring + 24px
  inner + 32px outer).
- **`shadow-glow-accent`** — accent CTAs (lime variant).

### Color text utilities

- **`text-gradient`** — three-stop primary→magenta→lime gradient text.
- **`text-gradient-cool`** — white→primary, calmer headline use.

### Layout patterns

- **Bento grid** (`bento` + `bento-2x1` / `bento-2x2` / `bento-3x1` /
  `bento-4x1` / `bento-1x2`) — asymmetric grids for dashboards. 4-col
  desktop, 2-col mobile, `grid-auto-rows: minmax(140px, auto)`,
  `gap: 1rem`.
- **Perspective tilt** (`tilt-hover`) — subtle 3D depth on hover; 2deg
  rotateX with 900px perspective. Use sparingly on featured cards.
- **Gradient border** (`gradient-border`) — primary→magenta→lime
  pseudo-element border for featured pricing tier / hero panels.

## Component Rules

### Buttons

- Primary: `shadow-glow`, height 44+ on lg size for touch targets.
- Outline: `border-border bg-card/40` — keeps glass coherence.
- Always include focus-visible ring (`.focus-ring` utility or
  default Tailwind ring on focus-visible).
- Loading: replace label with localized phase ("יוצר…") + keep button
  width stable to prevent layout shift.

### Cards

- All cards on dark surfaces use `glass` minimum. `card-hover` on
  interactive cards (lifts 3px + adds primary border-tint + glow).
- Border-subtle on static cards; border (full intensity) reserved for
  emphasis.
- Featured cards use `glass-strong` or `glass-liquid` + `gradient-border`.

### Stats / KPI tiles

- 3-row layout: gradient icon tile (h-9 w-9 rounded-xl), big number
  in `font-mono font-black tracking-tight`, label in
  `text-[11px] uppercase tracking-[0.2em] text-muted-foreground`.
- Number always mono so unequal digit widths align across tiles.

### Form inputs

- Background `bg-card/40` with `border-border` (not raw white).
- Focus state: primary ring + slight bg lift to `bg-card/60`.
- Labels above field, font-medium, text-sm, mb-2.

### Badges / Pills

- Outline variant uses tinted background to match dark surfaces:
  `border-primary/40 bg-primary/10 text-primary`.
- Status badges use the matching color family token (success / warning
  / danger).
- Numbers / counts in font-mono for visual alignment.

### Headings

- h1: massive (`text-5xl md:text-7xl lg:text-8xl` for hero), font-black.
- h2: section headers, `text-3xl md:text-5xl`, font-black.
- h3: card titles, `text-lg`, font-bold, tracking-tight.
- All h-tags use `letter-spacing: -0.025em` minimum.

### RTL

- All flex / grid layouts must work in `dir="rtl"`. Avoid `left-N` /
  `right-N` for spacing; use `start-N` / `end-N` (Tailwind logical
  properties) when relevant.
- Icons that have direction (arrows) flip via context — see
  `<ArrowLeft />` rendered as "back" in RTL.
- Mono numbers stay LTR even within RTL paragraphs (via `dir="ltr"`
  on the wrapping span when needed).

## Animations

- `animate-fade-in-up` — staggered card entry (60-80ms × index).
- `animate-aurora-drift` — 22s loop on hero gradient backgrounds.
- `animate-soft-pulse` — live indicators (rendering, in-flight).
- `animate-progress-shimmer` — indeterminate progress bars.
- `animate-shimmer-overlay` — skeleton loaders.
- Respect `prefers-reduced-motion: reduce` — disable aurora-drift
  + soft-pulse for users who request it (future task).

## Accessibility (WCAG 2.2 AA)

- 44px+ touch targets on all interactive elements.
- Visible focus-ring on all keyboard-reachable elements.
- Contrast ≥ 4.5:1 for body, ≥ 3:1 for large text. Check tokens
  before introducing new combinations.
- `prefers-reduced-motion` respected on all decorative animations.
- Screen-reader text via `sr-only` for icon-only buttons (avatar,
  delete, command-palette trigger).
- Labels above inputs, aria-describedby for help text.

## Anti-patterns

- ❌ Light cream backgrounds (V14 era) — feels amateur on AI tool.
- ❌ Border-only cards on dark surface — too cold; always pair with
  shadow-soft minimum.
- ❌ Press Start 2P / arcade fonts — wrong vibe for B2B AI.
- ❌ Neumorphism soft shadows on dark — invisible, accessibility fail.
- ❌ Multiple gradient text in same hero — one accent at most per row.
- ❌ Emoji as branding-relevant icons — use Lucide for everything that
  needs to read as "the app". Emoji OK only in user-facing copy.
- ❌ `dir="ltr"` overrides on Hebrew text blocks — breaks RTL flow.

## QA checklist

- [ ] Dark surface contrast verified for body + muted-foreground.
- [ ] Focus-visible ring present and on-brand on every interactive.
- [ ] Touch targets ≥ 44px on mobile-first review.
- [ ] No animation runs on `prefers-reduced-motion: reduce`.
- [ ] RTL tested in Hebrew browser locale; mixed Hebrew+English text
      flows correctly.
- [ ] Skeletons / empty / error states defined for every async surface.
- [ ] Gradient text only on premium / hero contexts; not regular body.
- [ ] Mono used for all digit-heavy displays (counts, timestamps).
