'use client';

import * as React from 'react';

// V27 — Tri-Modal Liquid density scope.
//
// Declares a density mode for everything inside. CSS variants on
// [data-density="…"] cascade to descendants and adjust card padding,
// section gap, row height, line-height, bento gap, and (Krea-mode
// only) the default --radius.
//
// Inheritance rule: downward only.
//   ✓ comfortable page → dense widget (e.g., a tiny captions table
//     inside a Krea-mode scene card).
//   ✗ dense page → comfortable modal. Dev-time warning if violated.
//
// Hard limit (IA-level, not enforced here): max 2 mode changes per
// screen. Three indicates the IA is wrong, not a density bug.
//
// Source of truth: .design/design-language-v27/DESIGN_TOKENS.md §3.2

export type DensityMode = 'dense' | 'default' | 'comfortable' | 'showcase';

const ORDER: Record<DensityMode, number> = {
  dense: 1,
  default: 2,
  comfortable: 3,
  showcase: 4,
};

interface DensityScopeProps {
  mode: DensityMode;
  children: React.ReactNode;
  /** Optional: render as a different element. Default `section`. */
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
}

export function DensityScope({
  mode,
  children,
  as = 'section',
  className,
}: DensityScopeProps) {
  const ref = React.useRef<HTMLElement | null>(null);

  // Dev-time guard: warn on upward override (e.g., comfortable inside
  // dense). Stripped from production by the bundler when the dead
  // branch is unreachable.
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (!ref.current) return;
    let parent: HTMLElement | null = ref.current.parentElement;
    while (parent) {
      const ancestor = parent.dataset.density as DensityMode | undefined;
      if (ancestor && ancestor in ORDER) {
        if (ORDER[mode] > ORDER[ancestor]) {
          console.warn(
            `[DensityScope] Mode "${mode}" inside ancestor "${ancestor}" violates downward-only rule.`,
            ref.current,
          );
        }
        break;
      }
      parent = parent.parentElement;
    }
  }, [mode]);

  // `display: contents` so the wrapper doesn't introduce a layout box;
  // it is a pure scoping element for CSS variants only.
  const Element = as as React.ElementType;
  return (
    <Element
      ref={ref as React.Ref<HTMLElement>}
      data-density={mode}
      className={className}
      style={className ? undefined : { display: 'contents' }}
    >
      {children}
    </Element>
  );
}
