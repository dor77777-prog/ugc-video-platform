import Link from 'next/link';
import type { UserRole } from '@prisma/client';
import { Sparkles, Coins, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/lib/brand';

interface TopbarProps {
  email: string;
  creditsBalance: number;
  role: UserRole;
}

export function Topbar({ email, creditsBalance, role }: TopbarProps) {
  const initials = email.slice(0, 2).toUpperCase();
  const isAdmin = role === 'admin';

  return (
    <header className="h-16 border-b border-border-subtle bg-background/60 backdrop-blur-xl sticky top-0 z-30">
      <div className="h-full flex items-center justify-between gap-4 px-6">
        {/* Right (in RTL): logo + admin pill */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary via-primary to-accent flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform">
              <Sparkles className="h-4 w-4 text-background" />
            </span>
            <span className="text-base font-bold tracking-tight text-gradient">
              {BRAND.name}
            </span>
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="text-[10px] flex items-center gap-1 px-2 h-6 rounded-md bg-accent/15 border border-accent/30 text-accent font-bold tracking-widest uppercase hover:bg-accent/25 transition-colors"
            >
              <ShieldCheck className="h-3 w-3" />
              Admin
            </Link>
          )}
        </div>

        {/* Left (in RTL): credits, plan, user */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 h-9 rounded-lg bg-accent/15 border border-accent/30 text-sm font-medium">
            <Coins className="h-3.5 w-3.5 text-accent" />
            <span className="font-mono font-bold">{creditsBalance}</span>
            <span className="text-muted-foreground text-xs">קרדיטים</span>
          </div>

          <Button asChild size="sm" variant="outline" className="border-border bg-card/40">
            <Link href="/pricing">תוכניות</Link>
          </Button>

          <form action="/auth/signout" method="post" className="flex items-center">
            <button
              type="submit"
              title={`התנתקות (${email})`}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent text-background text-xs font-bold hover:opacity-90 transition-opacity shadow-glow"
            >
              {initials}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
