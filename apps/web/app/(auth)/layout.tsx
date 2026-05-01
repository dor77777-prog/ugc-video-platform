import { Logo } from '@/components/brand/logo';
import { BRAND } from '@/lib/brand';
import { ThemeToggle } from '@/components/theme/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-background">
      {/* Decorative gradient orbs — V27.6 light mode handled by token
          opacity (bg-ai/bg-primary use --ai/--primary which are
          theme-aware) plus the blur softens the alpha cast on white. */}
      <div
        className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20 blur-3xl bg-ai"
        aria-hidden
      />
      <div
        className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-15 blur-3xl bg-primary"
        aria-hidden
      />

      {/* V27.6 — theme toggle anchored top-left so unauthenticated
          /login + /register pages still let the user pick mode. */}
      <div className="absolute top-4 left-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative min-h-screen flex flex-col items-center justify-center p-6">
        <div className="mb-8">
          <Logo size="xl" />
        </div>
        <div className="w-full max-w-md">{children}</div>
        <div className="mt-8 text-center text-sm text-muted-foreground max-w-md">
          {BRAND.tagline}
        </div>
      </div>
    </div>
  );
}
