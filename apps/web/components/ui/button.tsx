// V27 — Button primitive.
//
// Adds an `intent` prop (semantic) on top of legacy `size`+`variant`.
// intent encodes "what kind of action is this" — chrome, paid CTA, or
// once-per-flow hero — and locks heights at 36/44/52.
//
//   <Button>                       → 36px, chrome (Refresh, Filter, Back)
//   <Button intent="action">       → 44px, paid CTAs ("צור תסריטים")
//   <Button intent="hero">         → 52px, hero / landing CTAs (Render Final)
//
// `intent` overrides `size` when set. The legacy `size` prop is preserved
// for back-compat — sweep gradually in Wave 2.
//
// motion-press is wired in: scale 1→0.97 on :active, 80ms ease-snap. Lives
// even under prefers-reduced-motion (state confirmation, not animation).
//
// Source of truth: .design/design-language-v27/DESIGN_TOKENS.md §7.1

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base: motion-press (state confirmation), focus-ring 3-state, anti-aliasing.
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-press',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-ai hover:text-ai-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-ai hover:text-ai-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
      intent: {
        // V27 semantic intents. When set, override the size class.
        default: 'h-9 px-3.5 py-2', // 36px chrome
        action: 'h-11 px-5 py-2.5', // 44px paid CTAs
        hero: 'h-13 px-7 py-3 text-base', // 52px hero / landing
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, intent, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    // intent overrides size: if intent is set, drop the legacy size class.
    const resolvedSize = intent ? undefined : size;
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size: resolvedSize, intent, className }),
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
