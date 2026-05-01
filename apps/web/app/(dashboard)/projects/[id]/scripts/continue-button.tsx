'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { continueAfterSelectAction } from './actions';

// V27.4 Wave 3 — canonical wizard hop: scripts → scenes ("script
// chosen → scenes born"). The action returns the redirect target;
// the client wraps router.push in document.startViewTransition so
// the WizardProgressStrip + credits-meter + selected-script morph
// across the navigation instead of full-rerendering.
//
// Same guardrails as TransitionLink:
//   • startViewTransition feature-detect → fallback to plain push
//   • prefers-reduced-motion → fallback to plain push
//   • CMD/CTRL/SHIFT/middle-click → still triggers the action (no
//     "open in new tab" semantics on a submit button anyway, but
//     we skip the view-transition wrapper to keep behavior boring)

export function ContinueButton({
  projectId,
  disabled,
  children,
}: {
  projectId: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isPending) return;

    const fd = new FormData();
    fd.set('projectId', projectId);

    const wantsModifier = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const supportsVT =
      typeof document !== 'undefined' && 'startViewTransition' in document;

    startTransition(async () => {
      const res = await continueAfterSelectAction(fd);
      if (!res.ok) return;

      if (wantsModifier || reduced || !supportsVT) {
        router.push(res.redirectTo);
        return;
      }
      document.startViewTransition(() => {
        router.push(res.redirectTo);
      });
    });
  };

  return (
    <Button
      type="button"
      intent="action"
      disabled={disabled || isPending}
      onClick={handleClick}
    >
      {children}
    </Button>
  );
}
