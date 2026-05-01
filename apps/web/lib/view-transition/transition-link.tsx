'use client';

import Link from 'next/link';
import { forwardRef } from 'react';
import { useViewTransitionRouter } from './router';

// V27 Wave 3 — drop-in replacement for `<Link>` that fires the browser's
// View Transitions API on same-origin navigation. Falls through to
// plain Next.js soft-nav when the browser doesn't support it or the
// user has prefers-reduced-motion. Same prefetching, same accessibility,
// same focus management — only the visual transition is enhanced.
//
// Use on the wizard "Continue" buttons + any cross-page nav where
// shared elements (declared via `view-transition-name` CSS) should
// morph instead of crossfade.

type TransitionLinkProps = React.ComponentProps<typeof Link>;

export const TransitionLink = forwardRef<HTMLAnchorElement, TransitionLinkProps>(
  function TransitionLink({ href, onClick, ...rest }, ref) {
    const navigate = useViewTransitionRouter();

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      // Let modifier-clicks (cmd, ctrl, shift, middle-mouse) pass through
      // to the browser's default behavior — these open in new tab/window
      // where view transitions don't apply.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      // External / hash-only / anchor-on-same-page → no view transition.
      const hrefStr = typeof href === 'string' ? href : (href as { pathname?: string })?.pathname ?? '';
      if (
        !hrefStr ||
        hrefStr.startsWith('http') ||
        hrefStr.startsWith('mailto:') ||
        hrefStr.startsWith('tel:') ||
        hrefStr.startsWith('#')
      ) {
        return;
      }
      e.preventDefault();
      navigate(hrefStr);
    };

    return <Link ref={ref} href={href} onClick={handleClick} {...rest} />;
  },
);
