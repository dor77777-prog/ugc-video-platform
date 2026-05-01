'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

// V27.6 — Theme provider wrapper.
//
// Configuration:
//   • attribute="data-theme" — writes data-theme="dark|light" on <html>
//     (we don't use the .dark class because our CSS targets [data-theme]
//     selectors).
//   • defaultTheme="dark" — the V27 canonical experience. New users
//     and SSR start dark; the user can opt into light via the toggle.
//   • enableSystem — respects prefers-color-scheme on first visit if
//     the user hasn't picked manually. The toggle still wins.
//   • disableTransitionOnChange — suppresses CSS transitions during
//     the theme swap to prevent the brief crossfade of every
//     transition-property element on flip. Themes are an instant cut.
//
// SSR / FOUC: next-themes injects a tiny script in <head> that reads
// localStorage + system pref BEFORE first paint, so there's no
// flash-of-wrong-theme. Combined with suppressHydrationWarning on
// <html>/<body> in layout.tsx, hydration is clean.

export function ThemeProvider({
  children,
  ...rest
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...rest}
    >
      {children}
    </NextThemesProvider>
  );
}
