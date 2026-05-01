// V19 — cinematic landing page rebuild. Dark-mode first, massive
// typography, aurora gradient washes, glass panels, refined hover.
// Inspiration: kling.ai (cinematic deep-violet) + krea.ai (workspace
// glass + neon accents).

import Link from 'next/link';
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
} from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BRAND } from '@/lib/brand';
import { PLAN_CONFIGS } from '@/lib/plans';

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
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ───────────── Aurora background layers ───────────── */}
      <div className="fixed inset-0 -z-10 bg-mesh bg-noise" aria-hidden />
      <div
        className="fixed inset-0 -z-10 opacity-60 mix-blend-screen pointer-events-none animate-aurora-drift"
        aria-hidden
      >
        <div
          className="absolute -top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full opacity-50 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, hsl(258 100% 65% / 0.55), transparent 60%)',
          }}
        />
        <div
          className="absolute top-[10%] -left-[15%] w-[55vw] h-[55vw] rounded-full opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, hsl(290 100% 60% / 0.45), transparent 60%)',
          }}
        />
        <div
          className="absolute bottom-[5%] left-[30%] w-[40vw] h-[40vw] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              'radial-gradient(circle, hsl(73 95% 60% / 0.3), transparent 60%)',
          }}
        />
      </div>

      {/* ───────────── Top nav ───────────── */}
      <nav className="sticky top-0 z-30 border-b border-border-subtle backdrop-blur-xl bg-background/60">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary via-primary to-accent flex items-center justify-center shadow-glow">
              <Sparkles className="h-4 w-4 text-background" />
            </span>
            <span className="text-gradient">{BRAND.name}</span>
          </Link>
          <div className="hidden md:flex items-center gap-1 text-sm">
            <NavLink href="#features">תכונות</NavLink>
            <NavLink href="#pipeline">איך זה עובד</NavLink>
            <NavLink href="#pricing">מחירים</NavLink>
            <NavLink href="#faq">שאלות</NavLink>
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

      {/* ───────────── Hero ───────────── */}
      <section className="relative px-6 md:px-8 pt-24 md:pt-32 pb-24 md:pb-40 max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur-md animate-fade-in-up">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-soft-pulse" />
          AI-native לשוק הישראלי · 2026
        </div>

        <h1 className="mt-8 text-5xl md:text-7xl lg:text-[7.5rem] font-black leading-[0.95] animate-fade-in-up [animation-delay:80ms]">
          <span className="block">סרטוני <span className="text-gradient">UGC</span></span>
          <span className="block mt-2">בעברית. <span className="text-gradient-cool">תכל&apos;ס.</span></span>
        </h1>

        <p className="mt-8 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-fade-in-up [animation-delay:160ms]">
          הזינו URL של מוצר. אנחנו כותבים תסריט, בוחרים אווטאר ישראלי, מקליטים voice-over,
          מנפישים את הסצנות ומרכיבים מודעת וידאו אנכית 9:16 — מוכנה לפייסבוק וטיקטוק
          בפחות מ־5 דקות.
        </p>

        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in-up [animation-delay:240ms]">
          <Button asChild size="lg" className="shadow-glow min-w-[220px] h-12 text-base">
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
            className="min-w-[180px] h-12 text-base border-border bg-card/40 backdrop-blur-md"
          >
            <Link href="#pipeline">איך זה עובד</Link>
          </Button>
        </div>

        <div className="mt-8 flex items-center justify-center gap-5 text-xs text-muted-foreground animate-fade-in-up [animation-delay:320ms]">
          <span className="flex items-center gap-1.5">
            <CircleCheckBig className="h-3.5 w-3.5 text-accent" />
            ללא כרטיס אשראי
          </span>
          <span className="flex items-center gap-1.5">
            <CircleCheckBig className="h-3.5 w-3.5 text-accent" />
            ביטול בכל רגע
          </span>
          <span className="flex items-center gap-1.5 hidden sm:inline-flex">
            <CircleCheckBig className="h-3.5 w-3.5 text-accent" />
            פלט MP4 9:16
          </span>
        </div>

        {/* Glow plate behind the hero stats. */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up [animation-delay:400ms]">
          {[
            { num: '6', label: 'תסריטים במקביל' },
            { num: '30', label: 'קולות עבריים' },
            { num: '25', label: 'אווטארים ישראלים' },
            { num: '<5', label: 'דקות לסרטון' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl glass p-5 text-center"
            >
              <div className="text-3xl md:text-4xl font-black text-gradient leading-none">
                {s.num}
              </div>
              <div className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────── Pipeline strip ───────────── */}
      <section id="pipeline" className="relative px-6 md:px-8 py-20 md:py-28 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-xs uppercase tracking-[0.25em] text-primary mb-4">
            הצינור המלא
          </div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tight">
            7 שלבים. <span className="text-gradient">לחיצה אחת.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            מה שלוקח לצוות מלא יום עבודה, אצלנו רץ אוטומטי ברקע. אתה רואה את התוצאה
            בזמן אמת, צעד אחר צעד.
          </p>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-7 gap-3">
          {PIPELINE_STEPS.map((step, i) => (
            <div
              key={step.label}
              className="relative rounded-2xl glass p-4 card-hover animate-fade-in-up"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="text-[10px] font-mono text-primary mb-2">
                0{i + 1}
              </div>
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/15 mb-3">
                <step.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="text-sm font-bold mb-1">{step.label}</div>
              <div className="text-[11px] text-muted-foreground leading-snug">
                {step.detail}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────── Features ───────────── */}
      <section id="features" className="relative px-6 md:px-8 py-20 md:py-28 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-xs uppercase tracking-[0.25em] text-primary mb-4">
            מה שמייחד אותנו
          </div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tight">
            לא עוד <span className="text-gradient">stock UGC</span>.
            <br />
            תוכן ישראלי <span className="text-gradient-cool">אמיתי</span>.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <Card
              key={f.title}
              className="glass card-hover animate-fade-in-up bg-card/40"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <CardContent className="p-7 space-y-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/25 to-accent/15 flex items-center justify-center">
                  <f.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="text-lg font-bold tracking-tight">{f.title}</div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {f.body}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ───────────── Pricing ───────────── */}
      <section id="pricing" className="relative px-6 md:px-8 py-20 md:py-28 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="text-xs uppercase tracking-[0.25em] text-primary mb-4">
            תוכניות
          </div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tight">
            תשלום פשוט. <span className="text-gradient">ללא סודות.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            תוכנית חודשית מתחדשת. מתחילים בחינם, משדרגים מתי שצריך, מבטלים בכל רגע.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {(['free_trial', 'creator', 'brand', 'agency'] as const).map((slug) => {
            const cfg = PLAN_CONFIGS[slug];
            const isFree = slug === 'free_trial';
            const isFeatured = slug === 'brand';
            return (
              <Card
                key={slug}
                className={
                  isFeatured
                    ? 'glass-strong gradient-border card-hover relative'
                    : 'glass card-hover bg-card/40'
                }
              >
                {isFeatured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-br from-primary to-accent text-background text-[10px] font-bold uppercase tracking-widest shadow-glow">
                    הכי פופולרי
                  </div>
                )}
                <CardContent className="p-6 space-y-5">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      {cfg.displayName}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-4xl font-black tracking-tight">
                        {isFree ? 'חינם' : `$${cfg.monthlyPriceUsd}`}
                      </span>
                      {!isFree && (
                        <span className="text-xs text-muted-foreground">/ חודש</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2.5 pt-3 border-t border-border-subtle">
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
                        ? 'w-full shadow-glow h-11 font-bold'
                        : 'w-full h-11 border-border bg-card/40'
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

        <div className="text-center mt-8 text-xs text-muted-foreground">
          השוואה מלאה ב־
          <Link href="/pricing" className="text-primary hover:underline">
            /pricing
          </Link>
          {' · '}
          סליקה מאובטחת דרך Stripe (סוף 2026)
        </div>
      </section>

      {/* ───────────── FAQ ───────────── */}
      <section id="faq" className="relative px-6 md:px-8 py-20 md:py-28 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <div className="text-xs uppercase tracking-[0.25em] text-primary mb-4">
            FAQ
          </div>
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

      {/* ───────────── CTA bottom ───────────── */}
      <section className="relative px-6 md:px-8 py-20 md:py-28 max-w-4xl mx-auto text-center">
        <div className="rounded-3xl glass-strong p-10 md:p-16 relative overflow-hidden">
          <div
            className="absolute inset-0 -z-10 opacity-50"
            style={{
              background:
                'radial-gradient(circle at 50% 0%, hsl(258 100% 65% / 0.4), transparent 70%)',
            }}
          />
          <h2 className="text-3xl md:text-5xl font-black tracking-tight">
            מוכנים לסרטון <span className="text-gradient">הראשון שלכם</span>?
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            30 קרדיטים חינם בכניסה, ללא כרטיס אשראי. רוב המשתמשים מסיימים את הסרטון
            הראשון תוך 8 דקות.
          </p>
          <Button asChild size="lg" className="mt-8 shadow-glow h-12 px-8 text-base">
            <Link href="/register" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              התחל עכשיו
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ───────────── Footer ───────────── */}
      <footer className="relative border-t border-border-subtle bg-card/30 backdrop-blur-md">
        <div className="px-6 md:px-8 py-10 max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold text-gradient">{BRAND.name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{BRAND.tagline}</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">
              התחבר
            </Link>
            <Link href="/register" className="hover:text-foreground transition-colors">
              הרשם
            </Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              מחירים
            </Link>
            <Link href="#faq" className="hover:text-foreground transition-colors">
              שאלות
            </Link>
          </div>
        </div>
      </footer>
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
    <div className="flex items-start gap-2 text-xs">
      <CircleCheckBig className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
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
      className="group glass rounded-2xl px-6 py-4 cursor-pointer hover:border-primary/30 transition-colors"
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

const PIPELINE_STEPS = [
  { label: 'Scrape', detail: 'cheerio + JSON-LD + OG', icon: Layers },
  { label: 'Intelligence', detail: 'gpt-5.4-mini dossier', icon: Wand2 },
  { label: 'Avatar', detail: '25 ישראלים', icon: Sparkles },
  { label: 'Scripts', detail: '6 במקביל', icon: Wand2 },
  { label: 'Voice', detail: 'ElevenLabs eleven_v3', icon: Mic2 },
  { label: 'Animate', detail: 'Kling + PixVerse', icon: Film },
  { label: 'Render', detail: 'ffmpeg → MP4', icon: Zap },
];

const FEATURES = [
  {
    title: '6 תסריטים במקביל',
    body: 'gpt-5.4-mini כותב 6 גרסאות בזוויות שיווקיות שונות (כאב + פתרון, סקפטיקל, הוכחה, עוגן מחיר, רגע ישראלי, דיירקט-ריספונס). אתה בוחר או עורך ידנית.',
    icon: Wand2,
  },
  {
    title: 'קולות ישראליים אמיתיים',
    body: 'ElevenLabs eleven_v3 עם word-level timestamps. 30 קולות בעברית — אישה / גבר, צעיר / מבוגר, רגוע / אנרגטי. בחירה במקום אחד.',
    icon: Mic2,
  },
  {
    title: 'הנפשה + lipsync אוטומטי',
    body: 'Kling Omni v3 i2v הופך כל תמונה לקליפ של 5 שניות. PixVerse מסנכרן שפתיים אוטומטית כשרואים פנים. בלי lipsync — ffmpeg מערבב את הקול.',
    icon: Film,
  },
  {
    title: 'עיצוב ישראלי מזוהה',
    body: '51 cues חזותיים מותאמי שוק (שקעים עגולים, פלאטות חומות, חניית בלוקים, חצרות אבן ירושלמית) שמופיעים אוטומטית בתמונות.',
    icon: Sparkles,
  },
  {
    title: 'הרכבה סופית בקליק',
    body: 'ffmpeg על worker אוטונומי מרכיב MP4 9:16 עם voice-over, מוזיקת רקע ב־8% volume וכתוביות בעברית עם RTL נכון, חלוקה לבלוקים של 2-5 מילים.',
    icon: Zap,
  },
  {
    title: 'שקיפות עלויות מוחלטת',
    body: 'כל קריאה ל־AI נרשמת ב־ApiCall עם cost בדולרים. /admin/costs מציג סיכום בזמן אמת מ־OpenAI / Kling / PixVerse / ElevenLabs.',
    icon: ShieldCheck,
  },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'כמה זמן לוקח לקבל סרטון מוכן?',
    a: 'הצינור המלא לוקח 4-7 דקות מרגע הזנת ה־URL: סקרייפינג + תסריט (60s) → תמונות 6 סצנות (60s במקביל) → voice-over (10s במקביל) → הנפשה ו־lipsync (3-5 דק׳) → הרכבה סופית (30s).',
  },
  {
    q: 'אילו פלטפורמות אפשר להעלות אליהן את הסרטון?',
    a: 'כל סרטון יוצא ב־9:16 (vertical) MP4 H.264 — מוכן ישירות ל־TikTok, Instagram Reels, Facebook Reels, YouTube Shorts ו־WhatsApp Status. אפשר להוריד את הקובץ או לקבל URL ישיר.',
  },
  {
    q: 'מה קורה אם לא אהבתי את התוצאה?',
    a: 'בכל שלב אפשר לרגנר. רגן ראשון של תמונה או voice-over חינם (1 קרדיט נחסך). אם הסרטון הסופי לא מתאים אפשר לחזור לכל שלב, לערוך פרומפט / תסריט / קול / מוזיקה ולהריץ מחדש. אנחנו לא חוסמים גרסאות.',
  },
  {
    q: 'האם הקולות והאווטארים באמת ישראלים?',
    a: 'כן. 30 קולות בעברית מ־ElevenLabs (כולל voice cloning של מובילי תוכן ישראלים) ו־25 אווטארים שיוצרו ב־gpt-image-2 על מאפיינים ישראלים אמיתיים — מבטא, סטייל, צבעי עור, שיער. כל אווטאר עם profile של region (ת״א / ירושלים / חיפה) ו־religious register (חילוני / מסורתי / דתי).',
  },
  {
    q: 'איך אני משלם? יש מנוי או pay-per-use?',
    a: 'מנויים חודשיים בלבד עם קרדיטים מתחדשים. ללא כרטיס בנקודה הראשונה — מתחילים עם 30 קרדיטים חינם, ביטול בכל רגע. תשלום מאובטח דרך Stripe (סוף 2026).',
  },
];
