import Link from 'next/link';
import type { UserRole } from '@prisma/client';
import { Coins, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';

interface TopbarProps {
  email: string;
  creditsBalance: number;
  role: UserRole;
  /** V24 — mobile nav drawer (passed as ReactNode so this stays a
   *  Server Component). Only renders on screens < md. */
  mobileNav?: React.ReactNode;
}

export function Topbar({ email, creditsBalance, role, mobileNav }: TopbarProps) {
  const initials = email.slice(0, 2).toUpperCase();
  const isAdmin = role === 'admin';

  // V27 — Vercel-mode chrome: tier-surface no-blur on the topbar itself,
  // primary tones for credits chrome (not ai — ai is semantic-only),
  // success tones for the admin pill (elevated permissions = "blessed"
  // state), glow-primary on the avatar.
  return (
    <header
      data-density="dense"
      className="h-16 border-b border-divider bg-canvas/80 backdrop-blur-xl sticky top-0 z-30"
    >
      <div className="h-full flex items-center justify-between gap-3 px-4 md:px-6">
        {/* Right (in RTL): logo + admin pill */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="hover:opacity-90 transition-opacity motion-press">
            <Logo size="md" />
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="hidden sm:flex text-[10px] items-center gap-1 px-2 h-6 rounded-md bg-success-soft/60 border border-success/30 text-success font-bold tracking-[0.18em] uppercase hover:bg-success-soft transition-colors motion-press"
            >
              <ShieldCheck className="h-3 w-3" />
              Admin
            </Link>
          )}
        </div>

        {/* Left (in RTL): credits, plan, user, mobile menu */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* V27 Wave 3: view-transition-name persists this credit meter
              across route changes, so navigating step 4 → step 5 doesn't
              flicker the credits chip out and back in. */}
          <div
            className="hidden sm:flex items-center gap-2 px-3 h-9 rounded-md tier-surface text-sm font-medium"
            style={{ viewTransitionName: '--vt-credits-meter' } as React.CSSProperties}
          >
            <Coins className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono font-bold tabular-nums">{creditsBalance}</span>
            <span className="text-fg-tertiary text-xs">קרדיטים</span>
          </div>

          <Button asChild intent="default" variant="outline" className="hidden md:inline-flex">
            <Link href="/pricing">תוכניות</Link>
          </Button>

          <form action="/auth/signout" method="post" className="flex items-center">
            <button
              type="submit"
              title={`התנתקות (${email})`}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-br from-primary to-primary-press text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity glow-primary motion-press"
            >
              {initials}
            </button>
          </form>

          {mobileNav}
        </div>
      </div>
    </header>
  );
}
