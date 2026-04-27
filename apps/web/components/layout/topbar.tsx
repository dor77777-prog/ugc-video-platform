import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

interface TopbarProps {
  email: string;
  creditsBalance: number;
}

export function Topbar({ email, creditsBalance }: TopbarProps) {
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <header className="h-16 border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-30">
      <div className="h-full flex items-center justify-between gap-4 px-6">
        {/* Right side (in RTL): logo */}
        <div className="flex items-center gap-3">
          <Logo size="md" />
        </div>

        {/* Left side (in RTL): credits, plan, user */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 h-9 rounded-md bg-accent/30 border border-accent/50 text-sm font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span>{creditsBalance} קרדיטים</span>
          </div>

          <Button size="sm" variant="outline">
            תוכניות
          </Button>

          <form action="/auth/signout" method="post" className="flex items-center">
            <button
              type="submit"
              title={`התנתקות (${email})`}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              {initials}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
