import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/* V27 — Tri-Modal Liquid design language.
 * Source of truth: .design/design-language-v27/DESIGN_TOKENS.md
 *
 * Three modes share one vocabulary; mode is declared via data-density.
 * Vercel-mode = dense / chrome / admin. Krea-mode = comfortable /
 * creative / wizard 4-6. Granola-mode = the connective tissue
 * (transitions, glass, motion).
 */
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
        // Heebo first (Hebrew anchor), Geist Sans next (Latin / numbers,
        // Vercel-mode DNA, tnum built in), system fallback last.
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
        // Geist Mono for kickers, IDs, tabular data, badges.
        mono: [
          'var(--font-geist-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'monospace',
        ],
      },
      colors: {
        // ─── Surface ladder (canonical) ───
        canvas:    'hsl(var(--canvas))',
        surface:   'hsl(var(--surface))',
        elevated:  'hsl(var(--elevated))',
        overlay:   'hsl(var(--overlay))',
        divider:   'hsl(var(--divider))',
        border:    'hsl(var(--border))',
        'border-subtle': 'hsl(var(--divider))',

        // shadcn back-compat aliases
        background: 'hsl(var(--background))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',

        // ─── Foreground tiers ───
        fg:             'hsl(var(--fg))',
        'fg-secondary': 'hsl(var(--fg-secondary))',
        'fg-tertiary':  'hsl(var(--fg-tertiary))',
        'fg-disabled':  'hsl(var(--fg-disabled))',
        foreground:     'hsl(var(--foreground))',

        // ─── Primary (violet) ───
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          hover:      'hsl(var(--primary-hover))',
          press:      'hsl(var(--primary-press))',
          soft:       'hsl(var(--primary-soft))',
          'on-glass': 'hsl(var(--primary-on-glass))',
          foreground: 'hsl(var(--primary-foreground))',
        },

        // ─── AI Active (semantic-only) ───
        ai: {
          DEFAULT:    'hsl(var(--ai))',
          soft:       'hsl(var(--ai-soft))',
          foreground: 'hsl(var(--ai-foreground))',
        },

        // ─── Semantic state ───
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

        // ─── Provider dots (admin-only namespace) ───
        'provider-openai':     'hsl(var(--provider-openai))',
        'provider-gemini':     'hsl(var(--provider-gemini))',
        'provider-xai':        'hsl(var(--provider-xai))',
        'provider-kling':      'hsl(var(--provider-kling))',
        'provider-pixverse':   'hsl(var(--provider-pixverse))',
        'provider-elevenlabs': 'hsl(var(--provider-elevenlabs))',
        'provider-r2':         'hsl(var(--provider-r2))',

        // ─── Legacy shadcn props (point to new system) ───
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        // V27 Stage 5 — `accent` namespace removed; bg-accent / text-accent
        // swept to bg-ai / text-ai. Re-introduce only if a non-AI semantic
        // accent is needed in the future.
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
        '0.5': '0.125rem', // 2px
        '13':  '3.25rem',  // 52px (Button intent="hero")
        '18':  '4.5rem',   // 72px
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
