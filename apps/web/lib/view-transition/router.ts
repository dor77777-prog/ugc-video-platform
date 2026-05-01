'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

// V27 Wave 3 — programmatic-navigation hook that opt-ins the browser's
// native View Transitions API.
//
// Browser support: Chrome 111+, Safari 18+, Firefox 134+.
// In unsupported browsers we fall through to plain router.push — no
// behavior change. Pure progressive enhancement.
//
// How it works
//   1. document.startViewTransition is called with a callback.
//   2. Inside the callback we trigger router.push.
//   3. The browser captures the OLD DOM snapshot, runs the navigation,
//      then captures the NEW DOM snapshot and crossfades between them.
//   4. Any element with `view-transition-name: --vt-foo` appearing in
//      both snapshots is treated as a single shared element — the
//      browser morphs the old position/size to the new instead of
//      crossfading. This is the "the strip persists across step 3 → 4"
//      effect.
//
// Reserved view-transition-name targets are documented in globals.css
// §10. Adding new ones is fine; just keep them under `--vt-` prefix.
//
// Usage
//   const navigate = useViewTransitionRouter();
//   <button onClick={() => navigate('/projects/xxx/scenes')}>Continue</button>
//
// For <Link> clicks: this hook is unnecessary — Next.js's soft
// navigation already triggers a route change, but the BROWSER's view
// transition won't fire because soft nav is just a React tree swap,
// not a full document transition. The hook wraps the swap in a
// startViewTransition() so the browser captures the snapshots around
// it. Use this for paid CTAs, wizard "Continue" buttons, or any
// programmatic navigation where the carry-forward effect matters.

export type ViewTransitionNavigate = (
  href: string,
  options?: { scroll?: boolean },
) => void;

// TS 5.6+'s lib.dom.d.ts already declares Document.startViewTransition.
// We just check for runtime support via `in document` because some
// older browsers (Safari < 18, Firefox < 134) lack the API even with
// the type definition present.

export function useViewTransitionRouter(): ViewTransitionNavigate {
  const router = useRouter();

  return useCallback(
    (href, options) => {
      // Fall through to plain push when:
      //   • SSR / build-time
      //   • Browser doesn't support startViewTransition
      //   • User has prefers-reduced-motion (respect their choice)
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (
        typeof document === 'undefined' ||
        !('startViewTransition' in document) ||
        reduced
      ) {
        router.push(href, options);
        return;
      }

      // Wrap in startViewTransition. Returns a transition handle whose
      // .finished promise resolves when crossfade completes; we don't
      // await it — fire-and-forget is the right semantics for a router
      // push (caller already returned).
      document.startViewTransition(() => {
        router.push(href, options);
      });
    },
    [router],
  );
}
