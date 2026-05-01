// V20 — cinematic landing rebuild. Goes well beyond V19's "dark theme
// over shadcn" — adds a real visual showcase (floating tier-elevated cards
// with R2 avatars), animated SVG aurora, mouse-parallax, animated
// counters on scroll, live activity ticker, real avatar grid as
// "30 voices · 25 avatars" proof.
//
// Inspiration honestly applied: krea.ai (workspace + showcase canvas),
// kling.ai (cinematic dark + neon), runway.ml (heavy hero typography),
// stripe.com (premium layering).

import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import {
  Sparkles,
  ArrowLeft,
  Wand2,
  Mic2,
  Film,
  ShieldCheck,
  Zap,
  ChevronDown,
  CircleCheckBig,
  Layers,
  Globe,
} from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BRAND } from '@/lib/brand';
import { Logo } from '@/components/brand/logo';
import { PLAN_CONFIGS } from '@/lib/plans';
import { HeroShowcase, AnimatedCounter, LiveActivityTicker } from './landing-hero';

const R2_BASE = 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev';

// 25 avatars in catalog — show 12 in the proof grid below the hero.
// V20.1 — fixed broken IDs (was using yossi/eyal/guy which aren't in
// the catalog; replaced with yosef/eran/gil from
// `apps/web/lib/avatars/catalog.ts`). Verified each returns HTTP 200
// from R2 before listing.
const AVATAR_PROOF_GRID = [
  'noa', 'liat', 'shira', 'maya', 'tamar', 'galit',
  'einat', 'ortal', 'avi', 'yosef', 'eran', 'gil',
];

export default async function RootPage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect('/login');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* ───────────── Animated SVG Aurora Background ───────────── */}
      <AuroraBackground />

      {/* ───────────── Top nav ───────────── */}
      <nav className="sticky top-0 z-40 border-b border-border-subtle backdrop-blur-2xl bg-background/70">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between">
          <Link href="/" className="hover:opacity-90 transition-opacity">
            <Logo size="md" />
          </Link>
          <div className="hidden md:flex items-center gap-1 text-sm">
            <NavLink href="#showcase">דוגמאות</NavLink>
            <NavLink href="#pipeline">איך זה עובד</NavLink>
            <NavLink href="#features">תכונות</NavLink>
            <NavLink href="#pricing">מחירים</NavLink>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            >
              התחבר
            </Link>
            <Button asChild size="sm" className="shadow-glow">
              <Link href="/register">התחל חינם</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ───────────── HERO ───────────── */}
      <section className="relative max-w-7xl mx-auto px-6 md:px-10 pt-16 md:pt-20 pb-32 md:pb-40">
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          {/* Right side: copy (RTL → right column lg:col-7) */}
          <div className="lg:col-span-7 text-center lg:text-right space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary backdrop-blur-md motion-fade-up">
              <span className="h-1.5 w-1.5 rounded-full bg-ai motion-pulse-ai" />
              AI-native לשוק הישראלי · 2026
            </div>

            <h1
              className="text-5xl md:text-7xl lg:text-[6.5rem] xl:text-[8rem] font-black leading-[0.92] motion-fade-up [animation-delay:80ms]"
              style={{ letterSpacing: '-0.05em' }}
            >
              <span className="block">
                סרטוני <span className="text-gradient">UGC</span>
              </span>
              <span className="block mt-1">
                בעברית.
              </span>
              <span className="block mt-1 text-gradient-cool">
                תכל&apos;ס.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed motion-fade-up [animation-delay:160ms]">
              URL של מוצר → מודעת וידאו 9:16 בעברית, מוכנה לפייסבוק וטיקטוק.{' '}
              <span className="text-foreground font-semibold">בפחות מ־5 דקות.</span>
            </p>

            <div className="flex flex-col sm:flex-row items-center lg:items-start lg:justify-start justify-center gap-3 motion-fade-up [animation-delay:240ms]">
              <Button asChild size="lg" className="shadow-glow h-14 px-8 text-base">
                <Link href="/register" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  התחל חינם · 30 קרדיטים
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-14 px-6 text-base border-border bg-card/40 backdrop-blur-md"
              >
                <Link href="#pipeline" className="flex items-center gap-2">
                  <Film className="h-4 w-4" />
                  צפה בדוגמאות
                </Link>
              </Button>
            </div>

            <div className="flex items-center justify-center lg:justify-start gap-5 text-xs text-muted-foreground motion-fade-up [animation-delay:320ms]">
              <span className="flex items-center gap-1.5">
                <CircleCheckBig className="h-3.5 w-3.5 text-ai" />
                ללא כרטיס אשראי
              </span>
              <span className="flex items-center gap-1.5">
                <CircleCheckBig className="h-3.5 w-3.5 text-ai" />
                ביטול בכל רגע
              </span>
            </div>

            <div className="pt-4 motion-fade-up [animation-delay:480ms]">
              <LiveActivityTicker />
            </div>
          </div>

          {/* Left side: showcase visual (RTL → lg:col-5 left) */}
          <div className="lg:col-span-5 hidden lg:block">
            <HeroShowcase />
          </div>
        </div>
      </section>

      {/* ───────────── Stats strip ───────────── */}
      <section className="relative max-w-6xl mx-auto px-6 md:px-10 mb-32">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {[
            { num: 30, suffix: '', label: 'קולות עבריים', icon: Mic2 },
            { num: 25, suffix: '', label: 'אווטארים ישראלים', icon: Globe },
            { num: 6, suffix: '', label: 'תסריטים במקביל', icon: Wand2 },
            { num: 5, suffix: ' דק׳', label: 'לסרטון מוכן', icon: Zap },
          ].map((s, i) => (
            <div
              key={s.label}
              className="rounded-3xl tier-elevated glow-primary p-6 md:p-8 text-center card-hover motion-fade-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="h-10 w-10 mx-auto rounded-2xl bg-gradient-to-br from-primary/30 to-ai/20 flex items-center justify-center mb-4">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="text-4xl md:text-5xl font-black text-gradient leading-none tracking-tight">
                <AnimatedCounter end={s.num} suffix={s.suffix} />
              </div>
              <div className="mt-3 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────── Avatar showcase grid ───────────── */}
      <section id="showcase" className="relative max-w-7xl mx-auto px-6 md:px-10 py-20 md:py-32">
        <div className="text-center mb-16">
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-4 font-mono">
            הדמויות · The Cast
          </div>
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[0.95]">
            <span className="text-gradient-cool">25 פנים.</span>
            <br />
            <span className="text-gradient">ישראלים אמיתיים.</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            אווטארים שיוצרו במיוחד עם מאפיינים ישראלים — מבטא, סטייל, רקע. בחר את
            הדמות שמדברת לקהל שלך, או תן ל־AI לבחור.
          </p>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
          {AVATAR_PROOF_GRID.map((id, i) => (
            <div
              key={id}
              className="group relative aspect-[4/5] rounded-2xl overflow-hidden tier-elevated card-hover motion-fade-up cursor-pointer"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <Image
                src={`${R2_BASE}/avatars/${id}.png`}
                alt={id}
                fill
                sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
                className="object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  AI generated
                </div>
                <div className="text-sm font-bold capitalize">{id}</div>
              </div>
              <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-background/80 backdrop-blur-md text-[9px] font-black tracking-widest uppercase border border-border-subtle">
                {String(i + 1).padStart(2, '0')}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Button asChild variant="outline" className="border-border bg-card/40">
            <Link href="/register">+ עוד 13 אווטארים בקטלוג</Link>
          </Button>
        </div>
      </section>

      {/* ───────────── Pipeline ───────────── */}
      <section id="pipeline" className="relative max-w-7xl mx-auto px-6 md:px-10 py-20 md:py-28">
        <div className="text-center mb-16">
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-4 font-mono">
            הצינור · The Pipeline
          </div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tight">
            7 שלבים. <span className="text-gradient">לחיצה אחת.</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            מה שלוקח לצוות מלא יום עבודה, אצלנו רץ אוטומטי ברקע. אתה רואה את התוצאה
            בזמן אמת — שלב אחר שלב.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {PIPELINE_STEPS.map((step, i) => (
            <div
              key={step.label}
              className="relative rounded-2xl tier-elevated p-5 card-hover motion-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="absolute top-3 right-3 text-[10px] font-mono text-primary opacity-60">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/25 to-ai/15 mb-4">
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="text-base font-bold mb-1.5">{step.label}</div>
              <div className="text-xs text-muted-foreground leading-snug">
                {step.detail}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────── Features ───────────── */}
      <section id="features" className="relative max-w-7xl mx-auto px-6 md:px-10 py-20 md:py-28">
        <div className="text-center mb-16">
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-4 font-mono">
            מה שמייחד · Why us
          </div>
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[0.95]">
            לא עוד <span className="text-gradient">stock</span>.
            <br />
            תוכן ישראלי <span className="text-gradient-cool">אמיתי</span>.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <Card
              key={f.title}
              className="tier-elevated card-hover tilt-hover motion-fade-up bg-card/40 group"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <CardContent className="p-7 space-y-5 h-full">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/30 to-ai/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <f.icon className="h-7 w-7 text-primary" />
                </div>
                <div className="text-xl font-black tracking-tight">{f.title}</div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {f.body}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ───────────── Pricing ───────────── */}
      <section id="pricing" className="relative max-w-7xl mx-auto px-6 md:px-10 py-20 md:py-28">
        <div className="text-center mb-16">
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-4 font-mono">
            מחירים · Plans
          </div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tight">
            תשלום פשוט. <span className="text-gradient">ללא סודות.</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            תוכנית חודשית מתחדשת. מתחילים בחינם. משדרגים מתי שצריך. מבטלים בלחיצה.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(['free_trial', 'creator', 'brand', 'agency'] as const).map((slug, i) => {
            const cfg = PLAN_CONFIGS[slug];
            const isFree = slug === 'free_trial';
            const isFeatured = slug === 'brand';
            return (
              <Card
                key={slug}
                className={`relative motion-fade-up ${
                  isFeatured
                    ? 'tier-atmosphere gradient-border card-hover lg:scale-[1.04] z-10'
                    : 'glass card-hover bg-card/40'
                }`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {isFeatured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-br from-primary to-ai text-background text-[10px] font-black uppercase tracking-widest shadow-glow">
                    הכי פופולרי
                  </div>
                )}
                <CardContent className="p-7 space-y-5">
                  <div className="space-y-2">
                    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {cfg.displayName}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-5xl font-black tracking-tight font-mono">
                        {isFree ? 'חינם' : `$${cfg.monthlyPriceUsd}`}
                      </span>
                      {!isFree && (
                        <span className="text-xs text-muted-foreground">/ חודש</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3 pt-4 border-t border-border-subtle">
                    <Bullet text={`${cfg.monthlyCredits} קרדיטים${isFree ? ' חד-פעמיים' : ' / חודש'}`} />
                    <Bullet text="כל 30 הקולות + 25 אווטארים" />
                    <Bullet text="הנפשה + lipsync אוטומטי" />
                    {!isFree && <Bullet text="ייצוא MP4 איכות מקסימלית" />}
                    {(slug === 'brand' || slug === 'agency') && (
                      <Bullet text="עדיפות בתור הרינדור" />
                    )}
                    {slug === 'agency' && <Bullet text="תמיכת priority + Slack" />}
                  </div>
                  <Button
                    asChild
                    variant={isFeatured ? 'default' : 'outline'}
                    className={
                      isFeatured
                        ? 'w-full shadow-glow h-12 font-bold'
                        : 'w-full h-12 border-border bg-card/40'
                    }
                  >
                    <Link href="/register">
                      {isFree ? 'התחל בחינם' : 'בחר תוכנית'}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-10 text-xs text-muted-foreground">
          השוואה מלאה ב־
          <Link href="/pricing" className="text-primary hover:underline">
            /pricing
          </Link>
          {' · '}
          סליקה מאובטחת דרך Stripe (סוף 2026)
        </div>
      </section>

      {/* ───────────── FAQ ───────────── */}
      <section id="faq" className="relative max-w-3xl mx-auto px-6 md:px-10 py-20 md:py-28">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-4 font-mono">FAQ</div>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight">
            שאלות נפוצות
          </h2>
        </div>
        <div className="space-y-3">
          {FAQ.map((q, i) => (
            <FAQItem key={i} question={q.q} answer={q.a} defaultOpen={i === 0} />
          ))}
        </div>
      </section>

      {/* ───────────── Big bottom CTA ───────────── */}
      <section className="relative max-w-5xl mx-auto px-6 md:px-10 py-24 md:py-32">
        <div className="rounded-[2rem] tier-liquid p-12 md:p-20 relative overflow-hidden text-center">
          <div
            className="absolute inset-0 -z-10 opacity-80"
            style={{
              background: `
                radial-gradient(circle at 30% 0%, hsl(258 100% 65% / 0.5), transparent 50%),
                radial-gradient(circle at 70% 100%, hsl(290 100% 65% / 0.4), transparent 50%),
                radial-gradient(circle at 50% 50%, hsl(73 95% 60% / 0.2), transparent 60%)
              `,
            }}
          />
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-6 font-mono">
            Ready when you are
          </div>
          <h2 className="text-4xl md:text-7xl font-black tracking-tight leading-[0.95]">
            הסרטון <span className="text-gradient">הראשון שלך</span>.
            <br />
            <span className="text-gradient-cool">תוך 5 דקות.</span>
          </h2>
          <p className="mt-8 text-muted-foreground max-w-xl mx-auto text-lg">
            30 קרדיטים חינם בכניסה, ללא כרטיס אשראי. רוב המשתמשים מסיימים את הסרטון
            הראשון תוך 8 דקות.
          </p>
          <Button asChild size="lg" className="mt-10 shadow-glow h-14 px-10 text-base font-bold">
            <Link href="/register" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              התחל עכשיו · חינם
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ───────────── Footer ───────────── */}
      <footer className="relative border-t border-border-subtle bg-card/30 backdrop-blur-md mt-20">
        <div className="px-6 md:px-10 py-10 max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm">
            <Logo size="sm" />
            <span className="text-muted-foreground hidden md:inline">·</span>
            <span className="text-muted-foreground hidden md:inline">{BRAND.tagline}</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">התחבר</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">הרשם</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">מחירים</Link>
            <Link href="#faq" className="hover:text-foreground transition-colors">שאלות</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// Aurora background — animated SVG with multiple drifting blobs
// rendered at fixed position behind everything.
// ============================================================
function AuroraBackground() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-mesh" />
      <svg
        className="absolute inset-0 w-full h-full opacity-60 mix-blend-screen"
        viewBox="0 0 1200 1200"
        preserveAspectRatio="none"
      >
        <defs>
          <radialGradient id="aurora-1" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(258 100% 65%)" stopOpacity="0.7" />
            <stop offset="100%" stopColor="hsl(258 100% 65%)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="aurora-2" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(290 100% 65%)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="hsl(290 100% 65%)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="aurora-3" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(73 95% 60%)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="hsl(73 95% 60%)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="200" r="500" fill="url(#aurora-1)">
          <animate
            attributeName="cx"
            values="100;300;200;100"
            dur="20s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values="200;400;300;200"
            dur="22s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="1000" cy="100" r="450" fill="url(#aurora-2)">
          <animate
            attributeName="cx"
            values="1000;800;900;1000"
            dur="24s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values="100;300;200;100"
            dur="26s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="600" cy="900" r="400" fill="url(#aurora-3)">
          <animate
            attributeName="cx"
            values="600;800;500;600"
            dur="28s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="cy"
            values="900;700;800;900"
            dur="30s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
      <div className="absolute inset-0 bg-noise" />
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
    </Link>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <CircleCheckBig className="h-4 w-4 text-ai flex-shrink-0 mt-0.5" />
      <span className="text-foreground/85">{text}</span>
    </div>
  );
}

function FAQItem({
  question,
  answer,
  defaultOpen,
}: {
  question: string;
  answer: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group tier-elevated rounded-2xl px-6 py-5 cursor-pointer hover:border-primary/30 transition-colors"
      open={defaultOpen}
    >
      <summary className="flex items-center justify-between gap-4 text-base font-bold list-none">
        <span>{question}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 flex-shrink-0" />
      </summary>
      <div className="mt-3 text-sm text-muted-foreground leading-relaxed">
        {answer}
      </div>
    </details>
  );
}

// V26.15 — public-page IP scrub. The strip + features + FAQ used to
// name every provider in the stack (Kling, PixVerse, ElevenLabs, gpt-
// image-2, etc.). Replaced with marketing-focused copy that describes
// the OUTCOME for the user — not the engine. Internal pipeline detail
// stays in private MD files (STATUS.md / CLAUDE.md / BUSINESS_MODEL.md
// are gitignored as of V26.15).
const PIPELINE_STEPS = [
  { label: 'הזן URL', detail: 'דף מוצר → מוכן', icon: Layers },
  { label: 'מודיעין מוצר', detail: 'נישה + קהל יעד', icon: Wand2 },
  { label: 'אווטאר', detail: '25 דמויות', icon: Sparkles },
  { label: 'תסריטים', detail: '6 גרסאות', icon: Wand2 },
  { label: 'קריינות', detail: 'עברית טבעית', icon: Mic2 },
  { label: 'הנפשה', detail: 'תמונה → וידאו', icon: Film },
  { label: 'הרכבה', detail: 'MP4 לשיתוף', icon: Zap },
];

const FEATURES = [
  {
    title: '6 תסריטים במקביל',
    body: '6 גרסאות תסריט בזוויות שיווקיות שונות — כאב + פתרון, סקפטיקל, הוכחה, עוגן מחיר, רגע ישראלי, דיירקט. אתה בוחר או עורך.',
    icon: Wand2,
  },
  {
    title: 'קולות ישראלים אמיתיים',
    body: '30 קולות עברית טבעיים — אישה / גבר, צעיר / מבוגר, רגוע / אנרגטי. סנכרון word-level עם הוידאו.',
    icon: Mic2,
  },
  {
    title: 'הנפשה + סנכרון שפתיים',
    body: 'תמונה סטטית הופכת לקליפ דובר. סנכרון שפתיים אוטומטי כשרואים פנים — ללא צורך בצילום.',
    icon: Film,
  },
  {
    title: 'עיצוב ישראלי מזוהה',
    body: 'עשרות פרטים חזותיים שמייחדים את הוויב הישראלי נכנסים אוטומטית — מהפרטים הקטנים ועד שפת הגוף. נראה כאן, לא בפלורידה.',
    icon: Sparkles,
  },
  {
    title: 'הרכבה סופית בקליק',
    body: 'MP4 9:16 מוכן לפרסום, עם voice-over, מוזיקת רקע מאוזנת וכתוביות עברית RTL מסונכרנות פרים-פרים.',
    icon: Zap,
  },
  {
    title: 'שקיפות עלויות מוחלטת',
    body: 'כל פעולה ב-AI נרשמת עם עלות מדויקת בדולרים. דשבורד אדמין בזמן אמת — תמיד תדע על מה אתה משלם.',
    icon: ShieldCheck,
  },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'כמה זמן לוקח לקבל סרטון מוכן?',
    a: 'הצינור המלא לוקח 4-7 דקות מרגע הזנת ה־URL: ניתוח המוצר ובחירת זוויות שיווקיות → תסריטים → תמונות סצנה → קריינות עברית → הנפשה וסנכרון שפתיים → הרכבה סופית. רוב התהליך רץ במקביל.',
  },
  {
    q: 'אילו פלטפורמות אפשר להעלות אליהן את הסרטון?',
    a: 'כל סרטון יוצא ב־9:16 (vertical) MP4 H.264 — מוכן ישירות ל־TikTok, Instagram Reels, Facebook Reels, YouTube Shorts ו־WhatsApp Status. אפשר להוריד את הקובץ או לקבל URL ישיר.',
  },
  {
    q: 'מה קורה אם לא אהבתי את התוצאה?',
    a: 'בכל שלב אפשר לרגנר. רגן ראשון של תמונה או קריינות חינם (1 קרדיט נחסך). אם הסרטון הסופי לא מתאים אפשר לחזור לכל שלב, לערוך פרומפט / תסריט / קול / מוזיקה ולהריץ מחדש.',
  },
  {
    q: 'האם הקולות והאווטארים באמת ישראלים?',
    a: 'כן. 30 קולות עברית טבעיים ו־25 אווטארים שיוצרו במיוחד עם מאפיינים ישראלים אמיתיים — מבטא, סטייל, צבעי עור, שיער. כל אווטאר עם פרופיל region (ת״א / ירושלים / חיפה) ו־religious register (חילוני / מסורתי / דתי).',
  },
  {
    q: 'איך אני משלם? יש מנוי או pay-per-use?',
    a: 'מנויים חודשיים בלבד עם קרדיטים מתחדשים. ללא כרטיס בנקודה הראשונה — מתחילים עם 30 קרדיטים חינם, ביטול בכל רגע. תשלום מאובטח דרך Stripe (סוף 2026).',
  },
];
