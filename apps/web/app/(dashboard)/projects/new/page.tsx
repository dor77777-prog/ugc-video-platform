'use client';

import Image from 'next/image';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Stepper } from '@/components/wizard/stepper';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ElapsedTimer } from '@/components/ui/elapsed-timer';
import { CATEGORIES, guessCategory, type ProductCategoryId } from '@/lib/categories';
import { cn } from '@/lib/utils';
import { createProjectAction } from './actions';

interface ScrapeResponse {
  isProduct: boolean;
  confidence: number;
  signals: string[];
  warnings: string[];
  data: {
    productName: string;
    description: string;
    price?: string;
    currency?: string;
    brand?: string;
    images: string[];
    heroImageUrl?: string;
    sourcePlatform: string;
  };
  /** V11.7 — small LLM auto-suggest. Null when the helper had nothing
   *  useful to say (missing description / API key not set / quota). */
  suggestions?: {
    targetAudience: string;
    categoryId: ProductCategoryId;
    reason: string;
  } | null;
}

export default function NewProjectWizard() {
  const [url, setUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResponse | null>(null);
  const [submitPending, startSubmit] = useTransition();

  // Form fields
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [description, setDescription] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [additionalImages, setAdditionalImages] = useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [durationSeconds, setDurationSeconds] = useState(15);
  const [backgroundMusic, setBackgroundMusic] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [category, setCategory] = useState<ProductCategoryId>('other');

  const handleExtract = async () => {
    if (!url.trim()) return;
    setScraping(true);
    setScrapeError(null);
    setScrapeResult(null);

    try {
      const res = await fetch('/api/products/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as ScrapeResponse | { error: string; message?: string };

      if (!res.ok) {
        const errMsg = 'message' in data && data.message ? data.message : (data as { error: string }).error;
        setScrapeError(translateError(errMsg));
        return;
      }

      const result = data as ScrapeResponse;
      setScrapeResult(result);

      // Auto-fill what we got. User can edit anything.
      setProductName(result.data.productName);
      setBrand(result.data.brand ?? '');
      setDescription(result.data.description);
      setHeroImageUrl(result.data.heroImageUrl ?? '');
      setAdditionalImages(result.data.images.slice(1, 6));

      // V11.7 — prefer LLM suggestions when present (both fields). Fall
      // back to the keyword heuristic for category and an empty
      // targetAudience when the suggester didn't run (missing
      // OPENAI_API_KEY, junk description, etc.).
      const llmCategory = result.suggestions?.categoryId;
      const llmAudience = result.suggestions?.targetAudience?.trim();
      setCategory(
        llmCategory && llmCategory !== 'other'
          ? llmCategory
          : guessCategory({ name: result.data.productName, description: result.data.description }),
      );
      if (llmAudience) {
        setTargetAudience(llmAudience);
      }
    } catch (err) {
      setScrapeError(`שגיאה: ${(err as Error).message}`);
    } finally {
      setScraping(false);
    }
  };

  const handleSubmit = () => {
    const fd = new FormData();
    fd.set('productUrl', url);
    fd.set('productName', productName);
    fd.set('brand', brand);
    fd.set('targetAudience', targetAudience);
    fd.set('description', description);
    fd.set('heroImageUrl', heroImageUrl);
    additionalImages.forEach((img) => fd.append('additionalImages', img));
    fd.set('aspectRatio', aspectRatio);
    fd.set('durationSeconds', String(durationSeconds));
    fd.set('category', category);
    if (backgroundMusic) fd.set('backgroundMusic', 'on');
    if (captions) fd.set('captions', 'on');
    if (scrapeResult) fd.set('rawScrape', JSON.stringify(scrapeResult));

    startSubmit(async () => {
      await createProjectAction(undefined, fd);
    });
  };

  const canSubmit = productName.trim() && description.trim() && !submitPending;

  return (
    <div className="p-6 md:p-10 max-w-5xl space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">צור סרטון מוצר</div>
        <h1 className="text-3xl font-bold tracking-tight">בניית מודעת UGC חדשה</h1>
      </div>

      <Stepper current={1} />

      {/* URL extraction card */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <Label htmlFor="url" className="text-base font-semibold">
              ייבוא מעמוד מוצר
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              הדבק כתובת של עמוד מוצר. המערכת תזהה אם זה אכן עמוד מוצר ותחלץ את התמונה הראשית
              שתשמש רפרנס לכל הסצנות.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              id="url"
              type="url"
              dir="ltr"
              placeholder="https://example.com/products/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={scraping}
              className="flex-1"
            />
            <Button onClick={handleExtract} disabled={!url.trim() || scraping}>
              {scraping ? 'מנתח…' : 'ייבא'}
            </Button>
          </div>
          {scraping && (
            <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="animate-shimmer-overlay">🔎</span>
                  <span className="font-medium">מנתח את הדף — מחלץ מוצר, מחיר, תמונות…</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  <ElapsedTimer keyValue={url} />
                </span>
              </div>
              <ProgressBar variant="primary" />
              <div className="text-xs text-muted-foreground">בדרך כלל לוקח 2–8 שניות.</div>
            </div>
          )}
          {scrapeError && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
              {scrapeError}
            </div>
          )}
          {scrapeResult && !scraping && (
            <ScrapeResultBanner result={scrapeResult} />
          )}
        </CardContent>
      </Card>

      {/* Form */}
      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">פרטי המוצר</h2>
            <p className="text-xs text-muted-foreground">
              ה-AI ימשיך מכאן וייצר תסריטים. ערוך כל שדה כרצונך.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="שם המוצר *" htmlFor="productName">
              <Input
                id="productName"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="לדוגמה: מברשת שיניים חכמה לילדים"
              />
            </Field>
            <Field label="מותג" htmlFor="brand">
              <Input
                id="brand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="שם המותג"
              />
            </Field>
          </div>

          <Field label="קהל יעד" htmlFor="targetAudience">
            <Input
              id="targetAudience"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="למשל: הורים לילדים בגיל 3-8"
            />
          </Field>

          <Field label="תיאור המוצר *" htmlFor="description">
            {scrapeResult?.warnings.includes('weak-description') && (
              <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-xs space-y-1">
                <div className="font-semibold text-yellow-700 dark:text-yellow-400">
                  ⚠ לא הצלחנו לחלץ תיאור איכותי מעמוד המוצר
                </div>
                <div className="text-muted-foreground">
                  הסקרייפר זיהה שהתיאור שמגיע מהאתר הוא קוד CSS / JavaScript (לא טקסט אמיתי על המוצר). המערכת ניקתה את זה — אבל זה אומר שאין מספיק מידע לתסריטים.
                  <strong className="block mt-1 text-foreground">
                    הדבק/כתוב כאן ידנית מה המוצר עושה, למי הוא מיועד, ואילו בעיות הוא פותר — אחרת ה-LLM יקבל קלט חלש וייצר תסריטים גנריים.
                  </strong>
                </div>
              </div>
            )}
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="מה המוצר עושה ולמי הוא מיועד? אילו בעיות הוא פותר?"
              rows={5}
            />
          </Field>

          {/* Images */}
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-semibold">תמונה ראשית (רפרנס)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                התמונה הזו תשמש כרפרנס ויזואלי לכל הסצנות שייוצרו.
              </p>
            </div>
            <div className="flex items-start gap-4">
              <ImagePreview src={heroImageUrl} alt="hero" />
              <div className="flex-1 space-y-2">
                <Input
                  type="url"
                  dir="ltr"
                  placeholder="https://..."
                  value={heroImageUrl}
                  onChange={(e) => setHeroImageUrl(e.target.value)}
                />
                {scrapeResult && scrapeResult.data.images.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    {scrapeResult.data.images.slice(0, 6).map((img) => (
                      <button
                        key={img}
                        type="button"
                        onClick={() => setHeroImageUrl(img)}
                        className={cn(
                          'w-12 h-12 rounded border-2 overflow-hidden bg-muted',
                          heroImageUrl === img ? 'border-primary' : 'border-transparent',
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <AdditionalImages images={additionalImages} setImages={setAdditionalImages} />

          {/* Category — drives how the LLM writes scenes per product type */}
          <Field label="קטגוריית מוצר *" htmlFor="category">
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ProductCategoryId)}
              className="flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.labelHebrew}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              קובע איך ה-AI יבחר מקומות, פוזות, outfits לסצנות. סקינקייר ↔ מטבח ↔ אופנה →
              סצנות שונות לגמרי.
            </p>
          </Field>

          {/* Aspect ratio + duration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">יחס מסך</Label>
              {/* V26.16 — visual SVG of each aspect with platform
                  guidance. Picking 1:1 or 16:9 now actually changes
                  the output MP4 dimensions end-to-end (image gen,
                  i2v provider, ffmpeg normalize, ASS captions). */}
              <div className="grid grid-cols-3 gap-2" dir="ltr">
                {([
                  {
                    id: '9:16' as const,
                    label: '9:16',
                    sub: 'TikTok · Reels',
                    box: { w: 18, h: 32 },
                  },
                  {
                    id: '1:1' as const,
                    label: '1:1',
                    sub: 'Instagram · LinkedIn',
                    box: { w: 26, h: 26 },
                  },
                  {
                    id: '16:9' as const,
                    label: '16:9',
                    sub: 'YouTube · Twitter',
                    box: { w: 36, h: 20 },
                  },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAspectRatio(opt.id)}
                    className={cn(
                      'flex flex-col items-center justify-center gap-1.5 py-3 rounded-md border-2 transition-colors text-xs',
                      aspectRatio === opt.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    <div
                      className={cn(
                        'rounded-sm border-2',
                        aspectRatio === opt.id
                          ? 'border-primary bg-primary/30'
                          : 'border-current opacity-60',
                      )}
                      style={{ width: opt.box.w, height: opt.box.h }}
                      aria-hidden
                    />
                    <span className="font-mono font-semibold">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {opt.sub}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">משך הסרטון</Label>
              <div className="flex gap-2" dir="ltr">
                {[15, 30, 60].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => s !== 60 && setDurationSeconds(s)}
                    disabled={s === 60}
                    className={cn(
                      'flex-1 h-11 rounded-md border-2 text-sm font-mono font-semibold transition-colors relative',
                      durationSeconds === s
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-muted',
                      s === 60 && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    {s}s
                    {s === 60 && (
                      <Badge variant="muted" className="absolute -top-2 -end-2 scale-75">
                        soon
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-2">
            <ToggleRow
              label="מוזיקת רקע"
              description="מוזיקה אינסטרומנטלית עדינה ברקע"
              checked={backgroundMusic}
              onCheckedChange={setBackgroundMusic}
            />
            <ToggleRow
              label="כתוביות בעברית"
              description="כתוביות מסונכרנות אוטומטית עם הקריינות"
              checked={captions}
              onCheckedChange={setCaptions}
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-between gap-3" dir="ltr">
        <div />
        <Button onClick={handleSubmit} disabled={!canSubmit} size="lg">
          {submitPending ? 'שומר…' : 'המשך לשלב הבא →'}
        </Button>
      </div>
    </div>
  );
}

function ScrapeResultBanner({ result }: { result: ScrapeResponse }) {
  const pct = Math.round(result.confidence * 100);
  return (
    <div
      className={cn(
        'rounded-md border p-3 text-sm space-y-1',
        result.isProduct
          ? 'border-accent/40 bg-accent/15'
          : 'border-yellow-500/40 bg-yellow-500/10',
      )}
    >
      <div className="font-semibold">
        {result.isProduct
          ? `✓ זוהה כעמוד מוצר (ביטחון: ${pct}%)`
          : `⚠ זה לא נראה כמו עמוד מוצר (ביטחון: ${pct}%) — תוכל להמשיך ידנית`}
      </div>
      <div className="text-xs text-muted-foreground" dir="ltr">
        platform: {result.data.sourcePlatform} · signals: {result.signals.join(', ') || 'none'}
        {result.warnings.length > 0 && ` · warnings: ${result.warnings.join(', ')}`}
      </div>
    </div>
  );
}

function ImagePreview({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="w-32 h-32 rounded-md border-2 border-dashed border-border bg-muted/30 overflow-hidden flex items-center justify-center flex-shrink-0">
      {src ? (
        // Use plain img — we don't know the domain, can't safely add to next.config.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <span className="text-xs text-muted-foreground text-center px-2">אין תמונה</span>
      )}
    </div>
  );
}

function AdditionalImages({
  images,
  setImages,
}: {
  images: string[];
  setImages: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch {
      return;
    }
    setImages([...images, trimmed]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-sm font-semibold">תמונות נוספות</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          תמונות עזר נוספות. ה-AI עשוי להשתמש בהן כרפרנס משני.
        </p>
      </div>
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((img, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="" className="w-16 h-16 rounded object-cover border border-border" />
              <button
                type="button"
                onClick={() => setImages(images.filter((_, j) => j !== i))}
                className="absolute -top-2 -end-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          type="url"
          dir="ltr"
          placeholder="https://..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
          הוסף
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold">{label}</Label>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </Label>
      {children}
    </div>
  );
}

function translateError(msg: string | undefined): string {
  if (!msg) return 'שגיאה לא ידועה';
  if (msg.includes('private_host')) return 'הכתובת לא מותרת (הוסט פרטי / מקומי)';
  if (msg.includes('invalid_url')) return 'הכתובת לא תקינה';
  if (msg.includes('timeout')) return 'הדף לא הגיב בזמן (10 שניות)';
  if (msg.includes('too_large')) return 'הדף גדול מדי (>5MB)';
  if (msg.includes('http_error')) return msg.replace('http_error', 'הדף החזיר שגיאה:');
  if (msg.includes('bad_content_type')) return 'הכתובת לא הגיבה ב-HTML';
  return msg;
}
