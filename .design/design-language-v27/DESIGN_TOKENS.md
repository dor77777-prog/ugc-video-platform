# Design Tokens: V27 — Tri-Modal Liquid

**Source of truth for the V27 visual-language redesign.**
**Companion to**: `DESIGN_BRIEF.md`
**Stack**: Next.js 15 + Tailwind 3.4 + shadcn/ui · CSS variables (HSL component split) + `tailwind.config.ts` extensions
**Application target**: `apps/web/app/globals.css` + `apps/web/tailwind.config.ts` + `apps/web/app/layout.tsx`
**Applied during**: Wave 1, Phase 6 (alongside wizard restyle — never alone)
**Date**: 2026-05-01

---

## Deliberate deviations from the design-tokens skill defaults

| Skill default | V27 choice | Reason |
|---|---|---|
| Generate light + dark mode | **Dark-only.** No `[data-theme="light"]` block. | Per `DESIGN_BRIEF.md` "Out of Scope": dark-only is a deliberate brand choice, not a backlog item. |
| Replace existing tokens | **Extend + retune.** Backward-compat shadcn variable names (`--primary`, `--background`, `--card`, `--ring`, etc.) preserved. Values changed; names not renamed. | Existing components in the codebase reference these names. Renaming would break the entire app on apply. Values changing cleanly = the redesign goal. |
| One token file | **One spec doc + targeted file edits**. | The brief explicitly ships in waves. Tokens applied alone (without wizard work) would leave the app in a half-restyled state. Spec lives in `.design/`; production files updated in Phase 6. |

---

## Migration strategy

Three categories of change:

| Category | What | Risk on apply |
|---|---|---|
| **🟢 Additive** (zero break) | New CSS variables (`--ai`, `--success`, `--info`, surface ladder names, foreground tiers, providers, motion, easings). New utility classes (`.tier-*`, `.glow-*`, `.edge-pearl`, `.edge-gradient-primary`, `.motion-*`). New Tailwind colors / radii / fonts that components don't yet use. | None. New surface area only. |
| **🟡 Retuned** (visible on apply) | Existing variables get new HSL values: `--background`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--border`, `--ring`, `--destructive`, `--accent`. Existing fonts swapped (IBM Plex → Geist, JetBrains → Geist Mono). Default radius shifts 14 → 12. | Subtle global appearance shift on every screen. No layout / API breakage. |
| **🔴 Deprecated** (legacy behavior preserved) | Old `.glass`, `.glass-strong`, `.glass-liquid` utilities remain functional but marked `@deprecated`. New code uses `.tier-*`. Old code keeps working until Wave 1 wrap-up sweeps them. | None during Wave 1. Components migrate ad-hoc. |

**Deprecation deadline (locked, not advisory)**:

```css
/* In globals.css — top of legacy section */
/*
 * TODO(wave1-wrap, ~2 weeks from V27 ship):
 *   Remove .glass / .glass-strong / .glass-liquid utilities entirely.
 *   Remove the entire `tachles-*` keyframe namespace (NOT just aliases —
 *   delete `@keyframes tachles-fade-in-up` etc. completely; only the
 *   `motion-*` namespace remains).
 *   Remove `.animate-fade-in-up`, `.animate-progress-shimmer`,
 *   `.animate-shimmer-overlay`, `.animate-soft-pulse`, `.animate-aurora-drift`
 *   utility-class aliases. Code must reference `.motion-*` exclusively.
 * Owner: design-language-v27 wave-1 close.
 */
```

**Regression gate (additive to deprecation)**:

A pre-commit grep gate prevents new `.glass-*` references from landing during the deprecation window:

```bash
# .husky/pre-commit (added at Stage 1 of Wave 1)
if git diff --cached --name-only --diff-filter=ACMR | xargs grep -l -E '\bglass(-strong|-liquid)?\b' 2>/dev/null | grep -v 'globals\.css'; then
  echo "ERROR: New .glass / .glass-strong / .glass-liquid usage detected."
  echo "       Use .tier-surface / .tier-elevated / .tier-overlay / .tier-atmosphere instead."
  echo "       Legacy utilities are deprecated and will be removed at wave-1 wrap."
  exit 1
fi
```

After Wave 1 wraps:
- Delete `.glass` / `.glass-strong` / `.glass-liquid` from `globals.css`.
- **Delete the entire `tachles-*` keyframe namespace** — not just the aliases. The `tachles-` prefix is brand, not system token; V27 reserves `motion-*` for system motion. Brand keyframes (if introduced again) get a different prefix.
- Sweep `bg-mesh-soft` instances; consolidate into a single `.canvas-ambient` utility that respects mode.
- Remove the pre-commit `glass` gate (legacy gone, no regression risk).

---

## 1 — Color Tokens

All colors in HSL component form (`H S% L%`) so opacity composition uses `hsl(var(--token) / 0.x)` cleanly.

### 1.1 — Surface ladder (6 steps, 228° 6%, L varies)

```css
--canvas:        228 6% 4%;    /* Application root background */
--surface:       228 6% 7%;    /* Card on Vercel-mode (no blur) */
--elevated:      228 6% 10%;   /* Card on default mode, popover bg */
--overlay:       228 6% 13%;   /* Sheet/Drawer/CommandPalette bg */
--divider:       228 6% 16%;   /* border-subtle (low contrast separator) */
--border:        228 6% 20%;   /* border (visible separator) */

/* shadcn back-compat aliases (DO NOT remove) */
--background:    var(--canvas);     /* aliased; existing code uses --background */
--card:          var(--surface);    /* aliased */
--popover:       var(--elevated);   /* aliased */
--input:         var(--elevated);   /* aliased */
--secondary:     var(--elevated);
--muted:         var(--elevated);
--border-subtle: var(--divider);
```

> Note: `--canvas` becomes the new canonical name; `--background` is preserved as an alias because **shadcn primitives** and **every existing component** reference `bg-background` / `text-background`. Aliasing avoids a global codebase rename.

### 1.2 — Foreground tiers (4 levels)

```css
--fg:            0 0% 98%;       /* Primary text — h1–h6, body emphasis */
--fg-secondary:  228 8% 78%;     /* Body, descriptions, paragraph text */
--fg-tertiary:   228 8% 56%;     /* Labels, kicker muted, captions, metadata */
--fg-disabled:   228 8% 38%;     /* Disabled inputs, placeholder, dimmed */

/* shadcn back-compat */
--foreground:        var(--fg);
--card-foreground:   var(--fg);
--popover-foreground: var(--fg);
--secondary-foreground: var(--fg);
--muted-foreground:  var(--fg-tertiary);   /* shifted from 240 6% 60% to 228 8% 56% */
```

**Contrast checks (on `--canvas` 228 6% 4%)**:
- `--fg` → 19.8:1 (AAA)
- `--fg-secondary` → 12.4:1 (AAA)
- `--fg-tertiary` → 5.2:1 (AA)
- `--fg-disabled` → 2.7:1 (intentionally below AA — disabled text)

### 1.3 — Primary (violet, desat from `100→92`, L unchanged at `66`)

```css
--primary:           258 92% 66%;   /* Buttons, focus, links, primary CTAs */
--primary-hover:     258 92% 72%;   /* Hover state — lighter */
--primary-press:     258 92% 60%;   /* Active/pressed — darker */
--primary-soft:      258 50% 16%;   /* Background tint for primary-flavored containers */
--primary-on-glass:  258 92% 76%;   /* Lifted +10L for use over glass surfaces (blur eats contrast) */
--primary-foreground: 228 6% 4%;    /* Text on primary bg — canvas color */
```

**Contrast (on `--canvas`)**: 7.4:1 (AAA for 18px+, AA for body).

> **Rationale**: The 8-point saturation drop from 100% to 92% is the single most important color change in V27. After 4+ seconds of `text-primary` reading, the eye fatigues at full saturation; 92% reads as equally "alive" but doesn't burn. Verified across all current uses of `--primary` in `globals.css` (CTAs, focus rings, gradient stops, glow shadows).

### 1.4 — AI Active (semantic — color = state)

```css
--ai:               78 82% 58%;    /* Lime — "AI is working right now" */
--ai-soft:          78 35% 14%;    /* Background rail for progress bars */
--ai-glow:          78 82% 58%;    /* Used in box-shadow glows; opacity per shadow */
--ai-foreground:    228 6% 4%;     /* Text on ai bg */

/* Migration aliasing — old --accent points here for back-compat.
 * NEW CODE WRITTEN FROM V27 ONWARD MUST NOT REFERENCE bg-accent / text-accent.
 * Use bg-ai / text-ai for AI-active surfaces. The --accent alias exists
 * only to keep legacy components rendering through the deprecation window.
 * Pre-commit gate (Stage 1 of wave 1) blocks new bg-accent usage, same as
 * the .glass regression gate. */
--accent:           var(--ai);
--accent-soft:      var(--ai-soft);
--accent-foreground: var(--ai-foreground);
```

**Contrast (on `--canvas`)**: 9.6:1 (AAA).

> **Rationale for hue shift 73° → 78°**: The current `73 95% 62%` reads as "radioactive lime" — too far toward yellow. Pushing to 78° pulls it into a "live pixel" register: still distinctive, but it doesn't compete with warning yellow.
>
> **Critical contract**: `--ai` is **only** used inside `[data-ai-active]` containers and `<Progress variant="ai">` rails. No decorative use anywhere. Linting rule (Wave 1 wrap-up): grep for `text-accent` / `bg-accent` / `--ai` outside the AI-active subtree triggers a warning.

### 1.5 — Semantic state colors

```css
--success:           150 60% 50%;   /* Job/scene/render completed */
--success-soft:      150 35% 14%;   /* Background tint */
--success-foreground: 228 6% 4%;

--warning:           38 92% 58%;    /* Non-blocking advisory: low credits, deprecated feature */
--warning-soft:      38 35% 14%;
--warning-foreground: 228 6% 4%;

--destructive:       358 75% 58%;   /* Irreversible action: Delete, Cancel render, Refund */
--destructive-soft:  358 50% 64%;   /* Soft variant — toasts, form validation messages */
--destructive-foreground: 0 0% 98%;

--info:              218 88% 64%;   /* Empty states, hints, "did you know" tooltips */
--info-soft:         218 40% 14%;
--info-foreground:   228 6% 4%;
```

**Contrast (all on `--canvas`)**: success 6.8:1 · warning 8.4:1 · destructive 5.9:1 · destructive-soft 7.1:1 · info 7.5:1 — all pass AA, success/destructive/info pass AAA-Large.

> **`success` ≠ `ai`**: This is the most load-bearing distinction in V27. `ai` (78° lime) appears only during work; `success` (150° green) appears only after completion. The eye learns the difference within minutes of using the app and stops needing to read labels.

### 1.6 — Provider dots (admin-only, namespaced)

Used **exclusively** in `/admin/costs` charts, rows, and provider-balance cards. **Forbidden** elsewhere — namespace `--provider-*` makes accidental misuse easy to grep.

```css
--provider-openai:     162 35% 58%;   /* teal */
--provider-gemini:     218 60% 64%;   /* Google blue, desaturated */
--provider-xai:        220 8% 72%;    /* light cool gray (Grok DNA) */
--provider-kling:      285 45% 60%;   /* purple, separated from --primary 258° */
--provider-pixverse:   330 55% 64%;   /* magenta-pink */
--provider-elevenlabs: 42 70% 60%;    /* amber */
--provider-r2:         14 65% 58%;    /* Cloudflare orange */
```

Usage pattern:
```tsx
<span
  className="h-2 w-2 rounded-full"
  style={{ backgroundColor: 'hsl(var(--provider-openai))' }}
  aria-label="OpenAI"
/>
```

### 1.7 — Focus ring (3-state)

```css
--ring:           258 92% 66%;   /* Default — same as --primary */
--ring-error:     358 75% 58%;   /* Validation/error state — same as --destructive */
/* --ring-disabled: omitted — disabled fields have no ring */
```

Application via utility class `.focus-ring`:
```css
.focus-ring {
  outline: none;
}
.focus-ring:focus-visible {
  box-shadow:
    0 0 0 2px hsl(var(--canvas)),
    0 0 0 4px hsl(var(--ring) / 0.55);
}
.focus-ring[aria-invalid="true"]:focus-visible {
  box-shadow:
    0 0 0 2px hsl(var(--canvas)),
    0 0 0 4px hsl(var(--ring-error) / 0.55);
}
[disabled] .focus-ring:focus-visible {
  box-shadow: none;
}
```

> **Radix `<Select>` RTL clipping** — verified in Wave 1: requires `<Select.Content position="popper" align="end" />` + `transform-origin: top right` override. Tracked as a Wave 1 task.

### 1.8 — Selection styling

```css
::selection {
  background: hsl(var(--primary) / 0.3);
  color: hsl(var(--fg));
}
```

(Same as today; opacity drops 0.35 → 0.3 to match the desaturated primary.)

### 1.9 — Gradient anchors (landing-only)

```css
--gradient-from:   258 92% 70%;    /* harmonized with --primary 92% saturation */
--gradient-to:     290 92% 70%;    /* magenta companion */
--gradient-third:  78 82% 58%;     /* matches new --ai */
```

Used in `.bg-mesh`, `.bg-mesh-soft`, `.bg-spotlight`, `.text-gradient-shimmer`, `.gradient-border`. Existing utilities continue working; only the anchor values shift.

---

## 2 — Typography Tokens

### 2.1 — Font families (3 fonts)

| Variable | Font | Subsets | Weights | Use |
|---|---|---|---|---|
| `--font-heebo` | Heebo (Google) | hebrew, latin | 400 500 600 700 800 | Hebrew primary; falls through to Geist Sans for Latin |
| `--font-geist-sans` | Geist (Google) | latin | 400 500 600 700 | Latin display + body, numbers (tabular by default), brand names |
| `--font-geist-mono` | Geist Mono (Google) | latin | 400 500 600 | Kickers, IDs, tabular data, badges |

`tachles-*` font CSS variable name kept stable (`--font-heebo`); new variables added (`--font-geist-sans`, `--font-geist-mono`); old variables (`--font-ibm-plex`, `--font-jetbrains`) deleted from `layout.tsx`.

Tailwind family stacks:

```ts
// tailwind.config.ts -> theme.extend.fontFamily
sans: [
  'var(--font-heebo)',
  'var(--font-geist-sans)',
  'system-ui',
  'sans-serif',
],
display: [
  'var(--font-heebo)',
  'var(--font-geist-sans)',
  'system-ui',
  'sans-serif',
],
mono: [
  'var(--font-geist-mono)',
  'ui-monospace',
  'SFMono-Regular',
  'monospace',
],
```

> **Heebo 800 pickup**: Current `font-black` (`900`) on `<h1>` falls through to system fallback because Heebo tops out at 800. CSS `@layer base` updated: `h1` weight changes from `900` → `800`. Visually identical (Heebo 800 already renders at h1 sizes); CSS now correct.

### 2.2 — Font size scale

Tailwind defaults are kept (`text-xs` 12px through `text-7xl` 72px). Two adjustments to **line-height defaults per density mode**:

```css
[data-density="dense"] {
  --line-height-body: 1.45;
}
:root,
[data-density="default"] {
  --line-height-body: 1.55;
}
[data-density="comfortable"] {
  --line-height-body: 1.6;
}
[data-density="showcase"] {  /* landing only */
  --line-height-body: 1.65;
}

body, p, li, td {
  line-height: var(--line-height-body);
}
```

Heading line-heights stay at `1.05` regardless of density.

### 2.3 — Letter spacing — kicker variants (explicit)

```css
/* Set on the SectionKicker component, not global CSS */
.kicker-loud  { letter-spacing: 0.24em; color: hsl(var(--primary)); }
.kicker-muted { letter-spacing: 0.18em; color: hsl(var(--fg-tertiary)); }
```

Both use `font-mono` + `text-xs` + `uppercase` + `font-medium`. Variant determines spacing + color only.

### 2.4 — `:layer base` — typography updates

```css
@layer base {
  body {
    background: hsl(var(--canvas));
    color: hsl(var(--fg));
    font-family: var(--font-heebo), var(--font-geist-sans), system-ui, sans-serif;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11', 'tnum', 'cv05';
    font-variant-numeric: tabular-nums;   /* Geist tnum on by default */
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    line-height: var(--line-height-body);
  }

  /* Headings opt OUT of tabular-nums.
   * Reason: Hebrew titles often mix numerals with words ("6 תסריטים נוצרו",
   * "סצנה 3 מתוך 7"). Heebo wasn't designed with `tnum` glyph slots, so
   * forcing tabular renders inconsistently — sometimes letter-spacing
   * collapses, sometimes the digit appears too narrow. Tabular nums are
   * useful for data context (table cells, badges, costs, durations);
   * headings are not data context. Free them. */
  h1, h2, h3, h4 {
    letter-spacing: -0.025em;
    font-weight: 700;       /* was 800 */
    line-height: 1.05;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';   /* tnum + cv05 omitted */
    font-variant-numeric: normal;
  }
  h1 {
    letter-spacing: -0.04em;
    font-weight: 800;       /* was 900 — Heebo caps at 800 */
  }
  h2 { letter-spacing: -0.03em; }
  ::selection {
    background: hsl(var(--primary) / 0.3);
    color: hsl(var(--fg));
  }
}
```

---

## 3 — Spacing & Density Tokens

### 3.1 — Spacing scale (Tailwind extensions)

```ts
// tailwind.config.ts -> theme.extend.spacing
spacing: {
  '0.5': '0.125rem',   // 2px — badge horizontal pad
  '18':  '4.5rem',     // 72px — section spacers between hero and content
}
```

All other Tailwind defaults (`0`, `1`, `2`, … `96`) are preserved.

### 3.2 — Density mode contracts

Density is declared via `data-density` on a wrapping element. CSS variants cascade to descendants. **No new component props**.

```css
:root,
[data-density="default"] {
  --pad-card-y: 1.25rem;   /* 20px — py-5 */
  --pad-card-x: 1.5rem;    /* 24px — px-6 */
  --gap-section: 1.5rem;   /* 24px — space-y-6 */
  --row-height: 2.75rem;   /* 44px — table/list rows */
  --bento-gap: 1rem;       /* 16px */
}

[data-density="dense"] {
  --pad-card-y: 0.75rem;   /* 12px — py-3 */
  --pad-card-x: 1rem;      /* 16px — px-4 */
  --gap-section: 1rem;     /* 16px — space-y-4 */
  --row-height: 2.25rem;   /* 36px */
  --bento-gap: 0.75rem;    /* 12px */
  --line-height-body: 1.45;
}

[data-density="comfortable"] {
  --pad-card-y: 1.75rem;   /* 28px — py-7 */
  --pad-card-x: 1.75rem;   /* 28px — px-7 */
  --gap-section: 2rem;     /* 32px — space-y-8 */
  --row-height: 3.5rem;    /* 56px */
  --bento-gap: 1.25rem;    /* 20px */
  --line-height-body: 1.6;
}

[data-density="showcase"] {  /* landing only */
  --pad-card-y: 2.5rem;
  --pad-card-x: 2.5rem;
  --gap-section: 3rem;
  --row-height: auto;
  --bento-gap: 1.5rem;
  --line-height-body: 1.65;
}
```

**Inheritance rule**: child elements inherit unless they declare their own `data-density`. Override allowed downward only:
- ✅ `comfortable` page → `dense` widget (e.g., a captions table inside a Krea-mode scene card).
- 🚫 `dense` page → `comfortable` modal. Dev warning if violated.
- 🚫 More than 2 mode changes per screen — IA red flag.

A dev-time runtime guard is added in `apps/web/components/density/density-scope.tsx`:
```tsx
// Check: nested DensityScope where parent is dense but child is comfortable → warn
```

### 3.3 — Container max-widths

```css
--container-form:      48rem;    /* 768px — wizard step 1–3 */
--container-grid:      80rem;    /* 1280px — wizard step 4–5 scene grid */
--container-showcase:  90rem;    /* 1440px — library, video showcase */
--container-admin:     82.5rem;  /* 1320px — admin tables */
```

Used as Tailwind utilities or inline `max-width`. No global page-level wrapper.

---

## 4 — Radius Tokens

### 4.1 — 7-step scale

```css
--radius-xs:   0.25rem;    /* 4px — dots, micro-pills, badge pills */
--radius-sm:   0.375rem;   /* 6px — sm inputs, sm buttons, switches */
--radius-md:   0.5rem;     /* 8px — md buttons, tags */
--radius-lg:   0.75rem;    /* 12px — DEFAULT card radius (Vercel-mode) */
--radius-xl:   1rem;       /* 16px — Krea-mode card radius (mode override) */
--radius-2xl:  1.5rem;     /* 24px — hero, atmosphere tiles, video showcase */
--radius-pill: 9999px;     /* pill, segmented controls, AI rails */

/* Default for components without explicit radius (most cards/inputs) */
--radius: var(--radius-lg);   /* 12px, was 14px */

/* Krea-mode override — applied when ancestor has data-density="comfortable" */
[data-density="comfortable"] {
  --radius: var(--radius-xl);   /* 16px */
}
```

### 4.2 — Tailwind config

```ts
borderRadius: {
  xs:   'var(--radius-xs)',
  sm:   'var(--radius-sm)',
  md:   'var(--radius-md)',
  lg:   'var(--radius-lg)',     // also 'rounded' default via `--radius` aliasing
  xl:   'var(--radius-xl)',
  '2xl': 'var(--radius-2xl)',
  pill: 'var(--radius-pill)',
}
```

> **Migration note**: Tailwind's `rounded-md` (currently 0.375rem hardcoded) and `rounded-sm` are overridden via the config. `rounded-full` continues to mean 9999px. `rounded-pill` is a new explicit name.

---

## 5 — Glass / Tier System

### 5.1 — 5 tiers

The `.tier-*` classes replace `.glass`, `.glass-strong`, `.glass-liquid` (which remain functional but `@deprecated`).

```css
/* Tier 1 — surface (no blur, just tonal lift) */
.tier-surface {
  background: hsl(var(--surface));
  border: 1px solid hsl(var(--divider));
  box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.06);
}

/* Tier 2 — elevated (light blur, default-mode card) */
.tier-elevated {
  background: hsl(var(--elevated) / 0.92);
  backdrop-filter: blur(8px) saturate(115%);
  -webkit-backdrop-filter: blur(8px) saturate(115%);
  border: 1px solid hsl(var(--divider));
  box-shadow:
    inset 0 1px 0 hsl(0 0% 100% / 0.06),
    0 4px 16px -8px hsl(0 0% 0% / 0.45);
}

/* Tier 3 — overlay (popovers, sheets, drawers) */
.tier-overlay {
  background: hsl(var(--overlay) / 0.85);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid hsl(var(--border));
  box-shadow:
    inset 0 1px 0 hsl(0 0% 100% / 0.08),
    0 8px 32px -12px hsl(0 0% 0% / 0.55);
}
.tier-overlay::before {
  /* edge-pearl applied automatically at tier-overlay+ */
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(
      180deg,
      hsl(0 0% 100% / 0.12) 0%,
      transparent 1.5px,
      transparent 100%
    );
  mask:
    linear-gradient(black, black) content-box,
    linear-gradient(black, black);
  mask-composite: exclude;
}

/* Tier 4 — atmosphere (modal scrims, hero, render-status overlay) */
.tier-atmosphere {
  background: hsl(var(--canvas) / 0.55);
  backdrop-filter: blur(28px) saturate(165%);
  -webkit-backdrop-filter: blur(28px) saturate(165%);
  border: 1px solid hsl(var(--border));
  box-shadow:
    inset 0 1px 0 hsl(0 0% 100% / 0.1),
    inset 1px 0 0 hsl(0 0% 100% / 0.04),
    0 1px 0 hsl(0 0% 0% / 0.5),
    0 24px 60px -16px hsl(0 0% 0% / 0.6);
}
.tier-atmosphere::before {
  /* edge-pearl */
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(
      90deg,
      hsl(0 0% 100% / 0.04),
      hsl(var(--primary) / 0.18) 50%,
      hsl(0 0% 100% / 0.04)
    );
  mask:
    linear-gradient(180deg, black 0, black 1.5px, transparent 1.5px),
    linear-gradient(black, black);
  mask-composite: source-in;
}

/* Tier 5 — liquid (LANDING HERO ONLY — costs allowed because single visit) */
.tier-liquid {
  background:
    linear-gradient(
      135deg,
      hsl(0 0% 100% / 0.06) 0%,
      hsl(0 0% 100% / 0.02) 50%,
      hsl(var(--primary) / 0.04) 100%
    ),
    hsl(var(--canvas) / 0.4);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border: 1px solid hsl(var(--border));
  box-shadow:
    inset 0 1px 0 hsl(0 0% 100% / 0.1),
    inset 1px 0 0 hsl(0 0% 100% / 0.04),
    0 1px 0 hsl(0 0% 0% / 0.4),
    0 24px 60px -20px hsl(var(--primary) / 0.3);
}
```

> **`.tier-elevated` does NOT get edge-pearl** — too small/dense for the gradient to read. Static `inset 0 1px 0 white/0.06` highlight is enough.

### 5.2 — Modifiers (glow, edge-gradient)

```css
/* Glow modifiers — additive to any tier */
.glow-primary {
  box-shadow:
    0 0 0 1px hsl(var(--primary) / 0.18),
    0 0 24px -8px hsl(var(--primary) / 0.4),
    0 8px 32px -12px hsl(var(--primary) / 0.32);
}

.glow-ai {
  box-shadow:
    0 0 0 1px hsl(var(--ai) / 0.4),
    0 0 24px -8px hsl(var(--ai) / 0.35),
    0 8px 32px -12px hsl(var(--ai) / 0.28);
}

.glow-success {
  box-shadow:
    0 0 0 1px hsl(var(--success) / 0.45),
    0 0 20px -8px hsl(var(--success) / 0.3);
}

/* Optional edge-gradient — explicit "favored object" decoration */
.edge-gradient-primary {
  position: relative;
  background-clip: padding-box;
  border: 1px solid transparent;
}
.edge-gradient-primary::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    135deg,
    hsl(var(--primary) / 0.6),
    hsl(var(--gradient-to) / 0.4),
    hsl(var(--ai) / 0.5)
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
```

> **`edge-pearl` vs `edge-gradient-primary`**: complementary, not competing.
> `edge-pearl` = "an object that was photographed" (light from above, automatic on `tier-overlay`+).
> `edge-gradient-primary` = "an object marked as favored" (deliberate human choice, opt-in).
> They can stack on the same element in rare cases (e.g., landing hero CTA).

### 5.3 — `data-ai-active` automatic styling

```css
/* Any element with data-ai-active becomes glowy + breathing automatically */
[data-ai-active="image"],
[data-ai-active="voice"],
[data-ai-active="clip"],
[data-ai-active="script-batch"] {
  box-shadow:
    0 0 0 1px hsl(var(--ai) / 0.4),
    0 0 24px -8px hsl(var(--ai) / 0.35),
    0 8px 32px -12px hsl(var(--ai) / 0.28);
  animation: motion-pulse-ai var(--motion-breathe) var(--ease-pulse) infinite;
}

/* Long-running render: static ring, NO pulse (pulsing for 5+ minutes is painful) */
[data-ai-active="render"] {
  box-shadow:
    0 0 0 1px hsl(var(--ai) / 0.5),
    0 0 24px -6px hsl(var(--ai) / 0.4);
  /* No animation. Internal <Progress variant="ai"> shimmer carries the "live" signal. */
}

/* Success state: static green ring for 800ms, then fade */
[data-state="success"] {
  box-shadow:
    0 0 0 1px hsl(var(--success) / 0.45),
    0 0 20px -8px hsl(var(--success) / 0.3);
  animation: motion-success-fade var(--motion-cinematic) var(--ease-out) forwards;
}

/* Section kicker auto-loud-and-lime when ancestor is AI-active */
[data-ai-active] .kicker-muted {
  /* Promote to loud + lime variant during AI work */
  letter-spacing: 0.24em;
  color: hsl(var(--ai));
}
```

---

## 6 — Motion Tokens

### 6.1 — Easing curves (3)

```css
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);     /* Default — entrances, hover, focus */
--ease-snap:   cubic-bezier(0.32, 0.72, 0, 1);    /* State changes, button press, tab switch */
--ease-pulse:  cubic-bezier(0.4, 0, 0.6, 1);      /* Loops only — breathing, shimmer */
```

`linear` is reserved (undocumented) for shimmer-only transforms.

### 6.2 — Duration scale (7)

```css
--motion-instant:    80ms;     /* Hover state, focus on/off, toggle flip, button press */
--motion-fast:       160ms;    /* Tab switch, segment shift, tooltip */
--motion-normal:     240ms;    /* Card hover, dropdown open, popover slide */
--motion-slow:       400ms;    /* Modal open, drawer slide, sheet enter */
--motion-cinematic:  700ms;    /* Video reveal, hero entrance, render-complete flash */
--motion-breathe:    1600ms;   /* AI active pulse — one breath cycle */
--motion-aurora:     22000ms;  /* Canvas ambient drift */
```

> Hard rule: every `transition-duration` and `animation-duration` in component code must reference one of these. PR review checklist item.

### 6.3 — 12 named motion patterns

```css
/* ───── Entrances / state changes ───── */

@keyframes motion-fade-kf {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.motion-fade {
  animation: motion-fade-kf var(--motion-normal) var(--ease-out) backwards;
}

@keyframes motion-fade-up-kf {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.motion-fade-up {
  animation: motion-fade-up-kf var(--motion-normal) var(--ease-out) backwards;
}

@keyframes motion-pop-in-kf {
  from { opacity: 0; transform: scale(0.94); }
  to   { opacity: 1; transform: scale(1); }
}
.motion-pop-in {
  animation: motion-pop-in-kf var(--motion-fast) var(--ease-snap) backwards;
}

@keyframes motion-slide-down-kf {
  from { opacity: 0; transform: translateY(-12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.motion-slide-down {
  animation: motion-slide-down-kf var(--motion-normal) var(--ease-out) backwards;
}

/* RTL-aware slide-side: enters from the inline-start (right in RTL, left in LTR) */
@keyframes motion-slide-side-kf {
  from { opacity: 0; transform: translateX(var(--slide-side-from, 16px)); }
  to   { opacity: 1; transform: translateX(0); }
}
.motion-slide-side {
  animation: motion-slide-side-kf var(--motion-slow) var(--ease-snap) backwards;
}
[dir="rtl"] .motion-slide-side {
  --slide-side-from: -16px;   /* enters from right in RTL */
}

@keyframes motion-cinematic-reveal-kf {
  from { opacity: 0; transform: translateY(16px) scale(1.04); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.motion-cinematic-reveal {
  animation: motion-cinematic-reveal-kf var(--motion-cinematic) var(--ease-out) backwards;
}

/* ───── Press / hover ───── */

.motion-press {
  transition: transform var(--motion-instant) var(--ease-snap);
}
.motion-press:active {
  transform: scale(0.97);
}

.motion-lift-hover {
  transition:
    transform var(--motion-fast) var(--ease-out),
    filter var(--motion-fast) var(--ease-out);
}
.motion-lift-hover:hover {
  transform: translateY(-1px);
  filter: brightness(1.04);
}

.motion-tilt-hover {
  transform-style: preserve-3d;
  transition: transform var(--motion-normal) var(--ease-out);
}
.motion-tilt-hover:hover {
  transform: perspective(900px) translateY(-3px) rotateX(2deg);
}

/* ───── Loops ───── */

@keyframes motion-shimmer-kf {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.motion-shimmer {
  animation: motion-shimmer-kf 1.4s linear infinite;
}

@keyframes motion-pulse-ai-kf {
  0%, 100% {
    box-shadow:
      0 0 0 1px hsl(var(--ai) / 0.4),
      0 0 24px -8px hsl(var(--ai) / 0.35);
  }
  50% {
    box-shadow:
      0 0 0 1px hsl(var(--ai) / 0.6),
      0 0 32px -6px hsl(var(--ai) / 0.5);
  }
}
.motion-pulse-ai {
  animation: motion-pulse-ai-kf var(--motion-breathe) var(--ease-pulse) infinite;
}

@keyframes motion-aurora-kf {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  50%      { transform: translate(2%, -3%) rotate(8deg); }
}
.motion-aurora {
  animation: motion-aurora-kf var(--motion-aurora) linear infinite;
}

/* ───── Success transition (one-shot, 800ms) ───── */

@keyframes motion-success-fade {
  0%   { opacity: 1; }
  60%  { opacity: 1; }
  100% { opacity: 0; }
}
```

### 6.4 — Stagger system

For multi-card entries (scene grid, script grid):

```css
/* Apply via inline style: style={{ animationDelay: `${i * 60}ms` }} */
/* OR use named utility classes for indices 1-8: */
.stagger-1 { animation-delay: 60ms; }
.stagger-2 { animation-delay: 120ms; }
.stagger-3 { animation-delay: 180ms; }
.stagger-4 { animation-delay: 240ms; }
.stagger-5 { animation-delay: 300ms; }
.stagger-6 { animation-delay: 360ms; }
.stagger-7 { animation-delay: 420ms; }
.stagger-8 { animation-delay: 480ms; }
/* Cap at 8: beyond 8 children, no delay (don't make user wait 480ms+). */
```

### 6.5 — Density-driven motion intensity (no separate attribute)

Motion intensity is **inferred from `data-density`** — no separate `data-motion`:

```css
/* Dense: minimal — motion-press + motion-lift-hover + motion-fade only */
[data-density="dense"] .motion-tilt-hover {
  /* Disabled in dense mode — falls back to motion-lift-hover behavior */
  transition: filter var(--motion-fast) var(--ease-out);
}
[data-density="dense"] .motion-tilt-hover:hover {
  transform: none;
  filter: brightness(1.04);
}
[data-density="dense"] .motion-cinematic-reveal {
  /* Falls back to motion-fade */
  animation: motion-fade-kf var(--motion-normal) var(--ease-out) backwards;
}

/* Comfortable: full vocabulary, all motions enabled (default behavior) */
/* No overrides needed — motion-* classes work as defined */

/* Mobile clamp — disable tilt below md regardless of density */
@media (max-width: 767px) {
  .motion-tilt-hover:hover {
    transform: none;
    filter: brightness(1.04);
  }
}
```

### 6.6 — Reduced-motion contract (global)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  /* Allowed exceptions */
  .motion-fade,
  .motion-fade-up {
    transition-duration: 200ms !important;
    animation-duration: 200ms !important;
  }
  .motion-press {
    transition-duration: 80ms !important;
  }

  /* AI active: ring becomes static, no breathing */
  [data-ai-active] {
    animation: none !important;
  }

  /* Aurora and shimmer disabled entirely */
  .motion-aurora,
  .motion-shimmer {
    animation: none !important;
    display: revert;
  }
  .motion-aurora { display: none; }
}
```

### 6.7 — `data-motion="off"` escape hatch

```css
/* Disable all motion within a subtree (use sparingly) */
[data-motion="off"],
[data-motion="off"] * {
  animation: none !important;
  transition: none !important;
}
```

> **Use cases אסורים — locked into commit comment:**
> Use cases אסורים: לתקן jank, להאיץ build perceived performance, להחביא bug. אם זה התשובה, ה-bug במקום אחר.
>
> *(Forbidden uses: fix jank, fake perceived performance, hide a bug. If that's the answer, the bug is elsewhere.)*

---

## 7 — Component Heights

### 7.1 — Button (intent-driven, replaces size)

```ts
// components/ui/button.tsx — variant signatures (conceptual)
type ButtonProps = {
  intent?: 'default' | 'action' | 'hero';
  variant?: 'solid' | 'outline' | 'ghost' | 'destructive' | 'link';
  /* size prop deprecated — use intent */
};
```

| Intent | Height | Px X | Use |
|---|---|---|---|
| `default` (omit prop) | `h-9` (36px) | `px-3.5` (14px) | Chrome — Refresh, Filter, Back, Save Settings |
| `action` | `h-11` (44px) | `px-5` (20px) | Paid CTAs in wizard — "Generate Scripts", "Generate Image", "Approve Voice" |
| `hero` | `h-13` (52px) | `px-7` (28px) | Once-per-flow — "Render Final Video", landing CTAs |

> **`h-13` is custom** — Tailwind doesn't ship it. Add to `theme.extend.spacing` as `13: '3.25rem'` so `h-13`, `w-13`, etc. work.

### 7.2 — Input + Textarea

```ts
type InputSize = 'sm' | 'md' | 'lg';   // md = default
```

| Size | Height | Px X | Use |
|---|---|---|---|
| `sm` | `h-8` (32px) | `px-3` | Inline filters, table search |
| `md` | `h-10` (40px) | `px-4` | Default — wizard inputs, settings |
| `lg` | `h-12` (48px) | `px-4` | Auth (login, register) |

### 7.3 — Badge

```ts
type BadgeSize = 'xs' | 'sm' | 'md';
```

| Size | Height | Use |
|---|---|---|
| `xs` | `h-[18px]` | Inline counters, micro-labels |
| `sm` | `h-[22px]` | Default — status, tags |
| `md` | `h-[26px]` | Larger emphasis, plan/credit badges |

All badges: `font-mono`, `uppercase`, `tracking-wide`, `tabular-nums`.

### 7.4 — IconButton (square)

```ts
type IconButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
```

| Size | Square | Use |
|---|---|---|
| `xs` | `h-6 w-6` (24×24) | Inline action |
| `sm` | `h-7 w-7` (28×28) | Toolbar tight |
| `md` | `h-8 w-8` (32×32) | Default toolbar |
| `lg` | `h-10 w-10` (40×40) | Topbar action |
| `xl` | `h-12 w-12` (48×48) | Hero, CommandPalette trigger |

### 7.5 — Table row heights (density-driven)

```css
[data-density="dense"]      td, th { height: 2.25rem; /* 36px */ }
[data-density="default"]    td, th { height: 2.75rem; /* 44px */ }
[data-density="comfortable"] td, th { height: 3.5rem; /* 56px */ }
```

---

## 8 — Files to Modify (Wave 1, Phase 6)

The actual code changes happen during Phase 6 alongside the wizard restyle. This section is the **diff plan**.

### 8.1 — `apps/web/app/layout.tsx`

```diff
- import { Heebo, IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
+ import { Heebo, Geist, Geist_Mono } from 'next/font/google';
  ...
  const heebo = Heebo({
    subsets: ['hebrew', 'latin'],
+   weight: ['400', '500', '600', '700', '800'],
    variable: '--font-heebo',
    display: 'swap',
  });
- const ibmPlex = IBM_Plex_Sans({
-   subsets: ['latin'],
-   weight: ['300', '400', '500', '600', '700'],
-   variable: '--font-ibm-plex',
-   display: 'swap',
- });
- const jetbrains = JetBrains_Mono({
-   subsets: ['latin'],
-   weight: ['400', '500', '600'],
-   variable: '--font-jetbrains',
-   display: 'swap',
- });
+ const geistSans = Geist({
+   subsets: ['latin'],
+   weight: ['400', '500', '600', '700'],
+   variable: '--font-geist-sans',
+   display: 'swap',
+ });
+ const geistMono = Geist_Mono({
+   subsets: ['latin'],
+   weight: ['400', '500', '600'],
+   variable: '--font-geist-mono',
+   display: 'swap',
+ });
  ...
  <html
    lang="he"
    dir="rtl"
-   className={`${heebo.variable} ${ibmPlex.variable} ${jetbrains.variable}`}
+   className={`${heebo.variable} ${geistSans.variable} ${geistMono.variable}`}
  >
```

### 8.2 — `apps/web/tailwind.config.ts`

Full replacement file (canonical):

```ts
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--font-heebo)',
          'var(--font-geist-sans)',
          'system-ui',
          'sans-serif',
        ],
        display: [
          'var(--font-heebo)',
          'var(--font-geist-sans)',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'var(--font-geist-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'monospace',
        ],
      },
      colors: {
        // Surface ladder (canonical)
        canvas:    'hsl(var(--canvas))',
        surface:   'hsl(var(--surface))',
        elevated:  'hsl(var(--elevated))',
        overlay:   'hsl(var(--overlay))',
        divider:   'hsl(var(--divider))',
        border:    'hsl(var(--border))',
        'border-subtle': 'hsl(var(--divider))',  // back-compat alias

        // shadcn back-compat aliases
        background: 'hsl(var(--canvas))',
        input:      'hsl(var(--elevated))',
        ring:       'hsl(var(--ring))',

        // Foreground tiers
        fg:           'hsl(var(--fg))',
        'fg-secondary': 'hsl(var(--fg-secondary))',
        'fg-tertiary':  'hsl(var(--fg-tertiary))',
        'fg-disabled':  'hsl(var(--fg-disabled))',
        foreground:   'hsl(var(--fg))',  // back-compat

        // Primary (violet)
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          hover:      'hsl(var(--primary-hover))',
          press:      'hsl(var(--primary-press))',
          soft:       'hsl(var(--primary-soft))',
          'on-glass': 'hsl(var(--primary-on-glass))',
          foreground: 'hsl(var(--primary-foreground))',
        },

        // AI Active (semantic-only)
        ai: {
          DEFAULT:    'hsl(var(--ai))',
          soft:       'hsl(var(--ai-soft))',
          foreground: 'hsl(var(--ai-foreground))',
        },

        // Semantic states
        success: {
          DEFAULT:    'hsl(var(--success))',
          soft:       'hsl(var(--success-soft))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT:    'hsl(var(--warning))',
          soft:       'hsl(var(--warning-soft))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          soft:       'hsl(var(--destructive-soft))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        info: {
          DEFAULT:    'hsl(var(--info))',
          soft:       'hsl(var(--info-soft))',
          foreground: 'hsl(var(--info-foreground))',
        },

        // Provider dots (admin-only namespace)
        'provider-openai':     'hsl(var(--provider-openai))',
        'provider-gemini':     'hsl(var(--provider-gemini))',
        'provider-xai':        'hsl(var(--provider-xai))',
        'provider-kling':      'hsl(var(--provider-kling))',
        'provider-pixverse':   'hsl(var(--provider-pixverse))',
        'provider-elevenlabs': 'hsl(var(--provider-elevenlabs))',
        'provider-r2':         'hsl(var(--provider-r2))',

        // Legacy shadcn props (point to new system)
        card: {
          DEFAULT:    'hsl(var(--surface))',
          foreground: 'hsl(var(--fg))',
        },
        popover: {
          DEFAULT:    'hsl(var(--elevated))',
          foreground: 'hsl(var(--fg))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--elevated))',
          foreground: 'hsl(var(--fg))',
        },
        muted: {
          DEFAULT:    'hsl(var(--elevated))',
          foreground: 'hsl(var(--fg-tertiary))',
        },
        accent: {
          DEFAULT:    'hsl(var(--ai))',          // legacy: --accent → --ai
          soft:       'hsl(var(--ai-soft))',
          foreground: 'hsl(var(--ai-foreground))',
        },
      },
      borderRadius: {
        xs:    'var(--radius-xs)',
        sm:    'var(--radius-sm)',
        md:    'var(--radius-md)',
        lg:    'var(--radius-lg)',
        xl:    'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        pill:  'var(--radius-pill)',
      },
      spacing: {
        '0.5': '0.125rem',  // 2px
        '13':  '3.25rem',   // 52px (Button intent="hero")
        '18':  '4.5rem',    // 72px
      },
      maxWidth: {
        'container-form':     'var(--container-form)',
        'container-grid':     'var(--container-grid)',
        'container-showcase': 'var(--container-showcase)',
        'container-admin':    'var(--container-admin)',
      },
      transitionTimingFunction: {
        out:   'var(--ease-out)',
        snap:  'var(--ease-snap)',
        pulse: 'var(--ease-pulse)',
      },
      transitionDuration: {
        instant:   'var(--motion-instant)',
        fast:      'var(--motion-fast)',
        normal:    'var(--motion-normal)',
        slow:      'var(--motion-slow)',
        cinematic: 'var(--motion-cinematic)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
};

export default config;
```

### 8.3 — `apps/web/app/globals.css`

Full replacement of the `@layer base { :root }` block + utility classes. The complete new `globals.css` is ~450 lines; canonical sections shown above (sections 1.1–1.9 = `:root`, section 2.4 = `@layer base`, section 5 = tier system, section 6 = motion system).

The full file is generated in Phase 6. Sections preserved from the current file (no change):
- `.bg-mesh`, `.bg-mesh-soft`, `.bg-spotlight`, `.bg-noise` — landing-only ambient (gradient-anchor values shift; structure unchanged).
- `.bento`, `.bento-2x1`, `.bento-2x2`, `.bento-3x1`, `.bento-4x1`, `.bento-1x2` — grid utilities (gap value driven by `--bento-gap` instead of hardcoded `1rem`).
- Scroll behavior, font-feature-settings (extended with `tnum`).

Sections marked deprecated but preserved during Wave 1:
- `.glass`, `.glass-strong`, `.glass-liquid` — kept; new code uses `.tier-*`. Sweep at Wave 1 wrap-up.
- `.text-gradient`, `.text-gradient-cool`, `.text-gradient-shimmer` — kept (gradient-anchor values updated).
- `.shadow-soft`, `.shadow-elevated`, `.shadow-floating` — kept.
- `.shadow-glow`, `.shadow-glow-accent` — kept (now superseded by `.glow-primary` / `.glow-ai`); aliased.
- `.card-hover`, `.tilt-hover`, `.gradient-border`, `.focus-ring` — kept; behavior aligned with new motion vocabulary via density-driven CSS variants.

Sections deleted:
- `tachles-text-shimmer` keyframe → renamed to `motion-shimmer-text`. Old keyframe alias kept for back-compat.
- `tachles-progress-shimmer` → renamed to `motion-shimmer`. Old class `.animate-progress-shimmer` aliased.
- `tachles-fade-in-up` → renamed to `motion-fade-up`. Old class `.animate-fade-in-up` aliased.
- `tachles-aurora-drift` → renamed to `motion-aurora`. Old class `.animate-aurora-drift` aliased.
- `tachles-soft-pulse` → renamed to `motion-pulse-ai-soft` (used outside AI context). Aliased.
- `tachles-shimmer-overlay` → renamed to `motion-shimmer-overlay`. Aliased.

---

## 9 — Validation Checklist

Pre-merge gates for Wave 1, Phase 6:

- [ ] All 14 new HSL CSS variables defined in `:root`.
- [ ] All 7 new radius values defined.
- [ ] All 7 motion durations + 3 easing curves defined.
- [ ] Geist Sans + Geist Mono loaded, IBM Plex + JetBrains imports removed.
- [ ] `body` `font-variant-numeric: tabular-nums` active (verify on `/admin/costs`).
- [ ] `--background` aliases `--canvas`; `--card` aliases `--surface`; `--popover` aliases `--elevated`. Existing components render without changes beyond palette.
- [ ] `prefers-reduced-motion` contract present, includes both fade and press exceptions.
- [ ] `data-density` 4 modes defined; `data-density="comfortable"` overrides `--radius` to `var(--radius-xl)`.
- [ ] `data-ai-active` 5-value enum styled; `render` is static (no pulse).
- [ ] `[data-state="success"]` 800ms ring transition defined.
- [ ] `<Button intent>` variants with 3 heights (36/44/52) compiling.
- [ ] Provider dot CSS variables present; rendered only in `/admin/costs`.
- [ ] `.tier-*` utilities defined; `.glass*` legacy utilities preserved.
- [ ] WCAG AA contrast verified for all text-on-bg pairs (lighthouse audit on `/dashboard` + `/admin/costs` + `/projects/[id]/scenes`).
- [ ] No console warnings about font fallback.
- [ ] No layout shift on existing screens (palette-only change should be invisible to layout).
- [ ] Lighthouse score on `/dashboard` ≥ 95 (perf), ≥ 100 (a11y), ≥ 100 (best-practices).

---

## 10 — Reserved Names (Wave 2/3 anchors)

These names are **reserved but not allocated** in Wave 1. Listed here so that a future contributor (or future Claude) writing new motion patterns / view-transition orchestrations doesn't accidentally collide with names that Wave 2 will need. Zero cost now, prevents headaches later.

```css
/* ─────────────────────────────────────────────────────────────
 * Reserved view-transition-name targets — Wave 2 (View Transitions API)
 *
 * When wave 2 implements unstable_ViewTransition for the route change
 * /projects/[id]/scripts → /projects/[id]/scenes (wizard step 3 → 4),
 * the following view-transition-name values will be claimed. Do NOT
 * use any of these names for unrelated transitions (e.g., a
 * theme-toggle morph) without coordinating.
 *
 *   --vt-wizard-progress-strip       — the strip that persists across all wizard steps
 *   --vt-selected-script             — the chosen script card carries forward to step 4
 *   --vt-scene-card-{id}             — each scene card across enter/exit (id = scene.id)
 *   --vt-final-video-poster          — final-video poster between library tile and detail page
 *   --vt-cta-generate                — primary "Generate" CTA morphs into loading state
 *   --vt-credits-meter               — credit-balance pill stays visually anchored across pages
 *
 * Naming convention: kebab-case, --vt- prefix, semantic role (NOT element name).
 * ───────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────
 * Reserved motion-pattern names — Wave 2/3 (additions beyond the 12 in §6.3)
 *
 *   .motion-blur-in                   — large content blocks entering with blur unmask
 *   .motion-stretch-press             — primary-CTA press with stretch easing (haptic-like)
 *   .motion-spring-pop                — spring-physics pop for video-reveal (FM territory)
 * ───────────────────────────────────────────────────────────── */
```

---

## 11 — Out of Scope (for this token doc)

- **Light mode tokens** — deferred indefinitely per `DESIGN_BRIEF.md`. If/when reintroduced, this doc gets a `[data-theme="light"]` block.
- **Component-level tokens** beyond what's needed for the 5 primitives modified in Wave 1 (Button, Card, Input, Badge, SectionKicker). Other primitives keep current behavior; their token alignment happens in Wave 2.
- **Animation library tokens** for `framer-motion` — deferred until/unless FM is actually loaded (per brief, not in Wave 1).
- **`view-transition-name` *values* are reserved (§10) but not *allocated* in Wave 1.** No `view-transition-name: --vt-*` declarations ship in Wave 1 CSS. Wave 2 implementation will claim these.
