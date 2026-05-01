'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// V27.6 — Theme toggle button.
//
// Compact icon button (32×32) that fits in the topbar between the
// credits-meter and the upgrade button. Uses View Transitions to
// crossfade the whole document on theme flip — the API handles the
// snapshot capture; the .disableTransitionOnChange in ThemeProvider
// suppresses individual property transitions inline so we don't
// double-animate.
//
// Hydration: theme is undefined until next-themes hydrates from
// localStorage. We render a placeholder (same dimensions, no icon)
// during SSR so layout doesn't shift.

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === 'dark';

  const toggle = () => {
    const next = isDark ? 'light' : 'dark';
    // Browser-native View Transition wraps the theme swap so the
    // entire document crossfades cleanly. Falls through on browsers
    // without support and on prefers-reduced-motion (the API itself
    // skips the transition when the user has reduced-motion set).
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      document.startViewTransition(() => setTheme(next));
    } else {
      setTheme(next);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
      title={isDark ? 'מצב בהיר' : 'מצב כהה'}
      className={cn(
        'flex items-center justify-center w-9 h-9 rounded-md tier-surface',
        'text-fg-secondary hover:text-fg hover:bg-elevated transition-colors motion-press focus-ring',
        className,
      )}
    >
      {!mounted ? (
        // SSR / pre-hydration placeholder — no icon, just empty button
        // so the topbar layout doesn't shift when next-themes hydrates.
        <span className="w-4 h-4" aria-hidden />
      ) : isDark ? (
        <Sun className="w-4 h-4" aria-hidden />
      ) : (
        <Moon className="w-4 h-4" aria-hidden />
      )}
    </button>
  );
}
