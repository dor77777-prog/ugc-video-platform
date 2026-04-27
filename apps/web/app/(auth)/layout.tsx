import { Logo } from '@/components/brand/logo';
import { BRAND } from '@/lib/brand';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-background">
      {/* Decorative gradient orb in lime accent */}
      <div
        className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20 blur-3xl bg-accent"
        aria-hidden
      />
      <div
        className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-15 blur-3xl bg-primary"
        aria-hidden
      />

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
