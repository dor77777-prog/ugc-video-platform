// V18 — public landing page. Replaces the prior auth-gated redirect.
//
// Logged-in users still redirect to /dashboard so the marketing page
// is exclusive to anonymous visitors. Anonymous users see hero +
// features + pricing teaser + FAQ + footer — full Israeli-AI-startup
// pitch in a single scroll.

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
} from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BRAND } from '@/lib/brand';
import { PLAN_CONFIGS } from '@/lib/plans';

export default async function RootPage() {
  // If Supabase isn't configured, send the user to login (legacy guard).
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

  // Already logged in → straight to dashboard.
  if (user) redirect('/dashboard');

  return (
    <div className="relative bg-mesh bg-noise min-h-screen overflow-hidden">
      {/* ───────────── Top nav ───────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="text-gradient">{BRAND.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            התחבר
          </Link>
          <Button asChild size="sm" className="shadow-glow">
            <Link href="/register">התחל חינם</Link>
          </Button>
        </div>
      </nav>

      {/* ───────────── Hero ───────────── */}
      <section className="relative px-6 md:px-10 pt-12 md:pt-20 pb-16 md:pb-24 max-w-5xl mx-auto text-center">
        <Badge
          variant="outline"
          className="border-primary/30 text-primary bg-primary/5 gap-1.5 mx-auto mb-6 animate-fade-in-up"
        >
          <Sparkles className="h-3 w-3" />
          AI-native לשוק הישראלי · 2026
        </Badge>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] animate-fade-in-up [animation-delay:80ms]">
          סרטוני <span className="text-gradient">UGC בעברית</span>
          <br />
          שמוכרים. תכל&apos;ס.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-fade-in-up [animation-delay:160ms]">
          הזינו URL של מוצר. אנחנו כותבים תסריט, בוחרים אווטאר ישראלי, מקליטים voice-over,
          מנפישים את הסצנות ומרכיבים מודעת וידאו אנכית 9:16 מוכנה לפייסבוק וטיקטוק —
          הכול בפחות מ־5 דקות.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-in-up [animation-delay:240ms]">
          <Button asChild size="lg" className="shadow-glow min-w-[200px]">
            <Link href="/register" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              התחל חינם
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-w-[200px]">
            <Link href="/login">התחבר לחשבון קיים</Link>
          </Button>
        </div>
        <div className="mt-6 text-xs text-muted-foreground animate-fade-in-up [animation-delay:320ms]">
          ✓ 30 קרדיטים חינם · ✓ ללא כרטיס אשראי · ✓ ביטול בכל רגע
        </div>
      </section>

      {/* ───────────── Features grid ───────────── */}
      <section className="relative px-6 md:px-10 pb-16 md:pb-24 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            כל הצינור — אוטומטי
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            7 שלבים שבאופן רגיל לוקחים יום עבודה של צוות מלא — אצלנו לוחצים פעם אחת.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard
            icon={Wand2}
            title="6 תסריטים במקביל"
            body="gpt-5.4-mini כותב 6 גרסאות שונות בזוויות שיווקיות (כאב + פתרון, סקפטיקל, הוכחה, עוגן מחיר, רגע ישראלי, דיירקט-ריספונס). אתה בוחר אחד או עורך ידנית."
          />
          <FeatureCard
            icon={Mic2}
            title="קולות ישראלים אמיתיים"
            body="ElevenLabs eleven_v3 עם word-level timestamps. בוחר מתוך 30 קולות עבריים — אישה / גבר, צעיר / מבוגר, רגוע / אנרגטי."
          />
          <FeatureCard
            icon={Film}
            title="הנפשה + סנכרון שפתיים"
            body="Kling Omni v3 הופך כל תמונה לקליפ של 5 שניות. PixVerse LipSync מסנכרן שפתיים אוטומטית כשרואים פנים — אחרת ffmpeg מערבב את הקול ישירות."
          />
          <FeatureCard
            icon={Sparkles}
            title="עיצוב ישראלי שאפשר להזדהות"
            body="51 cues חזותיים מותאמי שוק (שקעים עגולים, פלאטות חומות, חניית בלוקים, חצרות אבן ירושלמית) שמופיעים אוטומטית בתמונות."
          />
          <FeatureCard
            icon={Zap}
            title="הרכבה סופית בקליק"
            body="ffmpeg על worker אוטונומי מרכיב MP4 9:16 עם voice-over, מוזיקת רקע ב־8% volume וכתוביות בעברית עם דגש RTL נכון."
          />
          <FeatureCard
            icon={ShieldCheck}
            title="שקיפות מלאה של עלויות"
            body="כל קריאה ל־AI נרשמת ב־ApiCall עם cost בדולרים. /admin/costs מציג סיכום בזמן אמת מ־OpenAI / Kling / PixVerse / ElevenLabs."
          />
        </div>
      </section>

      {/* ───────────── Pricing teaser ───────────── */}
      <section className="relative px-6 md:px-10 pb-16 md:pb-24 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            תוכניות פשוטות
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            תשלום חודשי, ביטול בלחיצה. כל תוכנית מתחדשת אוטומטית עם הקרדיטים החודשיים.
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
                    ? 'glass border-primary/40 shadow-glow scale-[1.02] card-hover'
                    : 'glass card-hover'
                }
              >
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-muted-foreground">
                      {cfg.displayName}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold tracking-tight">
                        {isFree ? 'חינם' : `$${cfg.monthlyPriceUsd}`}
                      </span>
                      {!isFree && (
                        <span className="text-xs text-muted-foreground">/ חודש</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-border-subtle">
                    <Feature
                      yes
                      text={`${cfg.monthlyCredits} קרדיטים${isFree ? ' חד-פעמיים' : ' / חודש'}`}
                    />
                    <Feature yes text="כל הקולות + 25 אווטארים" />
                    <Feature yes text="הנפשה + lipsync אוטומטי" />
                    {!isFree && <Feature yes text="ייצוא MP4 איכות מקסימלית" />}
                    {(slug === 'brand' || slug === 'agency') && (
                      <Feature yes text="עדיפות בתור הרינדור" />
                    )}
                  </div>
                  <Button
                    asChild
                    variant={isFeatured ? 'default' : 'outline'}
                    className={isFeatured ? 'w-full shadow-glow' : 'w-full'}
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
        <div className="text-center mt-6 text-xs text-muted-foreground">
          השוואה מלאה ב־
          <Link href="/pricing" className="text-primary underline">
            /pricing
          </Link>
        </div>
      </section>

      {/* ───────────── FAQ ───────────── */}
      <section className="relative px-6 md:px-10 pb-20 md:pb-32 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">שאלות נפוצות</h2>
        </div>
        <div className="space-y-3">
          {FAQ.map((q, i) => (
            <FAQItem key={i} question={q.q} answer={q.a} defaultOpen={i === 0} />
          ))}
        </div>
      </section>

      {/* ───────────── Footer ───────────── */}
      <footer className="relative border-t border-border-subtle bg-card/40 backdrop-blur-md">
        <div className="px-6 md:px-10 py-10 max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold text-gradient">{BRAND.name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{BRAND.tagline}</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/login" className="hover:text-foreground">
              התחבר
            </Link>
            <Link href="/register" className="hover:text-foreground">
              הרשם
            </Link>
            <Link href="/pricing" className="hover:text-foreground">
              מחירים
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Card className="glass card-hover">
      <CardContent className="p-6 space-y-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div className="text-base font-semibold tracking-tight">{title}</div>
        <div className="text-sm text-muted-foreground leading-relaxed">{body}</div>
      </CardContent>
    </Card>
  );
}

function Feature({ yes, text }: { yes: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={
          yes
            ? 'h-4 w-4 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0'
            : 'h-4 w-4 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold flex-shrink-0'
        }
      >
        {yes ? '✓' : '—'}
      </span>
      <span className={yes ? 'text-foreground' : 'text-muted-foreground'}>{text}</span>
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
      className="group glass rounded-xl px-5 py-4 cursor-pointer"
      open={defaultOpen}
    >
      <summary className="flex items-center justify-between gap-4 text-sm font-semibold list-none">
        <span>{question}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 text-sm text-muted-foreground leading-relaxed">
        {answer}
      </div>
    </details>
  );
}

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
