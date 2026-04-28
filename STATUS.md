# tachles · STATUS

מסמך חי — מה מומש, מה בעבודה, מה חסר. **עדכון אחרון: 2026-04-28** (אחרי הרחבת קטלוג האווטארים ל-25 דמויות + שיפורי פרומפטים מבוססי `awesome-gpt-image-2`).

נקרא כך:
- ✅ מומש ועובד
- 🟡 חלקי / placeholder / mock
- ⏳ מתוכנן בקומיט הבא או הקרוב
- ❌ עוד לא התחיל / out-of-scope לעכשיו
- 👤 ממתין למידע ממך

> **תמונת מצב גבוהה (אפריל 2026):** שלבים 1-4 של ה-Wizard (מוצר → אווטאר → תסריט → תמונות סצנה) **חיים, אמיתיים, בלי מוקים**, עם OpenAI אמיתי. **שלב התסריט שודרג ל-Script Engine V2** — מנוע creative-strategy עם self-scoring + selective regeneration. השלבים שעוד מוקים/חסרים: **5 קריינות, 6 וידאו לסצנה, 7 הרכבה סופית**. הצינור (BullMQ + Worker) קיים ועובד עם providers מוקיים — מוכן להחליף את כל אחד בנפרד עם ספק אמיתי.

---

## 0. תשתית ובסיס

| נושא | סטטוס |
|------|--------|
| Monorepo (apps/web + apps/worker + packages/shared + packages/prompts + prisma) | ✅ |
| TypeScript, Next.js 15 App Router, Tailwind 3.4, shadcn-style UI | ✅ |
| Prisma + PostgreSQL (Homebrew Postgres מקומי) | ✅ |
| Redis + BullMQ (worker אסינכרוני) | ✅ |
| Docker compose alternative ל-DB/Redis | ✅ (תיעוד ב-README) |
| Health check route (`/api/health`) | ✅ |
| TypeScript path aliases + npm workspaces | ✅ |
| ESLint / Prettier / pre-commit hooks | ❌ (לא קריטי, נוסיף לפני production) |

## 1. מיתוג

| נושא | סטטוס |
|------|--------|
| שם: **tachles** | ✅ |
| צבעים: cream רקע / electric violet / acid lime accent | ✅ |
| Heebo font (עברית + לטינית) | ✅ |
| לוגו (`tachles.` עם נקודה ירוקה) | ✅ |
| RTL מלא | ✅ |

## 2. אותנטיקציה (Supabase Auth)

| נושא | סטטוס |
|------|--------|
| הרשמה / התחברות עם email + password | ✅ |
| Middleware refresh-session על כל בקשה | ✅ |
| auth callback (אישור email) | ✅ |
| התנתקות | ✅ |
| First-user / `ADMIN_EMAILS` → role=admin אוטומטית | ✅ |
| Password reset / forgot password | ❌ |
| OAuth (Google / Apple) | ❌ |
| MFA / 2FA | ❌ |

## 3. דאשבורד אדמין (`/admin`)

| מסך | סטטוס |
|------|--------|
| `/admin` — KPIs כלליים | ✅ |
| `/admin/users` — רשימה + הוספת קרדיטים + ban | ✅ |
| `/admin/projects` — כל הפרויקטים | ✅ |
| `/admin/renders` — רינדורים + פילטר סטטוס + retry/cancel | ✅ |
| `/admin/queue` — BullMQ live (waiting/active/failed/etc) + נקיון | ✅ |
| `/admin/costs` (API usage tab) | ✅ KPIs + פירוק לפי ספק/פעולה/מודל + לוג 50 קריאות אחרונות |
| הגדרות פיצ'רים (feature flags) | ❌ |
| Audit log לפעולות אדמין | ❌ |

## 4. דאשבורד משתמש

| נושא | סטטוס |
|------|--------|
| לוח בקרה ראשי עם סטטיסטיקות | ✅ |
| **פרויקטים בתהליך + כפתור "המשך"** (resume מהשלב האחרון) | ✅ |
| הצגת פרויקטים שהושלמו | ✅ |
| ספריית וידאו (`/library`) | 🟡 רשת ריקה — יתמלא כשרינדור אמיתי קיים |
| הגדרות חשבון (`/settings`) | 🟡 בסיסי — חסר שינוי סיסמה, חיובים, חיבור לחנויות |
| Notifications | ❌ |

---

## 5. Wizard — יצירת סרטון

### 5.1 שלב 1 · מוצר ופרטים (`/projects/new`)

| נושא | סטטוס |
|------|--------|
| URL extractor (Shopify + JSON-LD + OG + microdata + CTA detection + cheerio fallback) | ✅ |
| SSRF protection (חוסם localhost + private IPs) | ✅ |
| Confidence score + signals מוצגים למשתמש | ✅ |
| טופס פרטי מוצר (שם, מותג, קהל יעד, תיאור) | ✅ |
| בחירת תמונה ראשית (chip selector מהתמונות שחולצו) | ✅ |
| תמונות נוספות (add/remove) | ✅ |
| יחס מסך (9:16 / 1:1 / 16:9) | ✅ |
| משך (15s / 30s, 60s "soon") | ✅ |
| Toggles: מוזיקת רקע, כתוביות | ✅ |
| העלאת תמונת מוצר ידנית (file upload) | ❌ (צריך Supabase Storage) |
| שמירת state אוטומטית כל X שניות (autosave) | ❌ |
| Progress indicator בייבוא URL | ✅ |

### 5.2 שלב 2 · בחירת אווטאר (`/projects/[id]/avatar`)

| נושא | סטטוס |
|------|--------|
| גריד עם **25 אווטארי AI ישראליים** (16 מקוריים + 9 חדשים מגוונים) | ✅ |
| ייצור חד-פעמי ע״י gpt-image-2 (`scripts/generate-avatar-portraits.ts`, idempotent) | ✅ |
| קבצי PNG ב-`apps/web/public/avatars/{id}.png` (1024×1536) | ✅ |
| גיוון: מזרחי, תימני, אתיופי, רוסי, אשכנזי, דתי-לאומי (מטפחת), חילוני | ✅ |
| גיוון אזורי: ת״א, חיפה, ירושלים, רמת גן, מודיעין, באר שבע, אילת, גליל | ✅ |
| גיוון גילאי: 18-58, כולל טווח חדש `18-20` | ✅ |
| גיוון סגנון: casual / sporty / professional / lifestyle | ✅ |
| פרומפטים אישיים מבוססי `awesome-gpt-image-2` (lens specs, bio-fidelity skin) | ✅ |
| פילטרים בממשק: מגדר, טווח גיל | ✅ |
| בחירה ושמירה (`Project.productData.selectedAvatarId`) | ✅ |
| Avatar הוא ה-single source of truth לזהות בכל הסצנות (Image 1) | ✅ |
| העלאת אווטאר ידני (custom upload) | ❌ |
| HeyGen integration (קטלוג מקצועי) | ❌ |
| Avatar model נפרד ב-DB (כרגע ב-JSON של Project) | ❌ (לא קריטי) |

### 5.3 שלב 3 · תסריט (`/projects/[id]/scripts`) — **Script Engine V2** ✨

| נושא | סטטוס |
|------|--------|
| יצירת 6 תסריטים עם gpt-5.4-mini, structured outputs (strict JSON) | ✅ |
| **Creative Strategy Layer חובה** — לכל תסריט יש 11 שדות אסטרטגיים שהמודל חייב למלא לפני שכותב סצנות (core_insight / audience_pain / emotional_trigger / product_mechanism / main_objection / persuasion_angle / why_this_would_stop_scroll / ugc_situation / hook_type / script_promise / conversion_goal / assumptions) | ✅ |
| **6 פריימוורקים חדים חדשים** (PAS / Skeptical Testimonial / Demonstration Proof / Price Anchor / Relatable Israeli Moment / Fast Direct Response) — מחליפים את ה-angles הגנריים | ✅ |
| **3 hook_options + selected_hook + hook_reason** לכל תסריט | ✅ |
| **9 hook archetypes** (confession / frustration / mistake / curiosity / price_shock / before_after / wish_i_knew / i_stopped_doing / nobody_tells_you) | ✅ |
| **Anti-cliché blacklist** — 12 ביטויים אסורים שלא יופיעו בתסריט (שינה לי את החיים, חייבים לנסות, וכו') | ✅ |
| **Quality Score עצמי** — המודל מדרג כל תסריט על 8 צירים (hook_strength / specificity / israeli_authenticity / emotional_pull / visual_clarity / conversion_potential / tts_naturalness / no_generic_cliches) + overall + weakness_note | ✅ |
| **Selective regeneration** — wrapper מזהה תסריטים עם overall<8 ושולח קריאה ממוקדת לחזק את התסריט החלש (cap=3 ריצות חוזרות per generation) | ✅ |
| **שדות Per-scene חדשים**: scene_goal (stop_scroll/establish_pain/introduce_product/prove_it_works/decision_push) + on_screen_caption_hebrew + camera_direction + performance_note | ✅ |
| Category-aware visual prompts (skincare/fitness/fashion/food/tech/wellness/baby/cleaning/jewelry/supplements) | ✅ |
| Pose & Framing dictionary, Mood vocabulary | ✅ |
| 2 דוגמאות מלאות בסגנון V2 בתוך ה-system prompt + אנטי-דוגמה | ✅ |
| Avatar description מוזרק לפרומפט (לא בתוך visual_prompt) | ✅ |
| **חובת ספציפיות מוצרית** — כל תסריט חייב להזכיר ≥2 פרטים קונקרטיים מהמוצר; אם נתונים חסרים, להירשם ב-`assumptions` ולא להמציא טענות | ✅ |
| Backward-compat ל-V1 ב-DB (Script.angle ו-Scene.sceneType ENUMs נשמרים, ממופים מ-V2) | ✅ |
| UI מציג quality score badge (ירוק/ענבר/אדום), 3 hook options, Creative Strategy collapsible, scene goals, captions, camera directions, performance notes | ✅ |
| Test fixtures (skincare/kitchen/tech) — 444/444 assertions עוברים, ציונים 8.6-8.9 | ✅ |
| בחירת תסריט (`selectedScriptId` על Project) | ✅ |
| עריכה ידנית של hook / cta / טקסט סצנות / משך | ✅ |
| Regenerate (1 קרדיט; לא תלוי ב-regen פנימי של V2) | ✅ |
| Progress indicator בייצור | ✅ |
| כתיבה ידנית מאפס (במקום AI) | ❌ |
| עריכה של creative_strategy / quality_score ב-UI | ❌ (read-only כרגע — אם לא מרוצים, מרגנרים) |

### 5.4 שלב 4 · תמונות סצנה (`/projects/[id]/scenes`)

| נושא | סטטוס |
|------|--------|
| gpt-image-2 medium @ 1024×1536 portrait (true 9:16) | ✅ |
| Multi-image input: **avatar (Image 1, identity anchor) + product (Image 2)** | ✅ |
| Avatar = single source of truth — בוטל reference לסצנה הקודמת (זהות יציבה יותר) | ✅ |
| **Identity Lock block** (preserve eye/brow/nose/jaw/hairline/hair density/skin tone) | ✅ |
| **Bio-fidelity skin tokens** (pores, vellus hair, hydration, no airbrush) | ✅ |
| Lens specs ב-opener (35mm, f/4, authentic phone-camera grain) | ✅ |
| Auto-detect framing מתוך הברייף: mirror-selfie / selfie / POV / over-shoulder / close-up | ✅ |
| כפתור "צור" לכל סצנה בנפרד | ✅ |
| **One-click "Generate all scenes"** — סדרתי, עם live progress | ✅ |
| עריכת `visual_prompt_english` ידנית לכל סצנה | ✅ |
| Regenerate (1 קרדיט לכל ניסיון) | ✅ |
| Progress overlay על אזור התמונה | ✅ |
| Streaming partial images (`partial_images` param) | ❌ (אופטימיזציה עתידית) |
| שמירת תמונות ב-cloud storage | ❌ (כרגע `apps/web/public/uploads/` — לא יעבוד ב-prod) |

### 5.5 שלב 5 · קריינות (`ElevenLabs` voice-over per scene)

| נושא | סטטוס |
|------|--------|
| מפתח ElevenLabs ב-.env | ✅ |
| לכל סצנה: כפתור "צור קריינות" → mp3 בעברית | ⏳ הקומיט הבא |
| בחירת קול (גבר/אישה, מאפיינים) | ⏳ |
| שמירת מאפייני voice ב-Project (consistency בין סצנות) | ⏳ |
| Hebrew TTS normalization middleware (מספרים, מטבעות, קיצורים) | ❌ (יבנה עם הקומיט הבא) |

### 5.6 שלב 6 · וידאו לסצנה (Image → Video)

| נושא | סטטוס |
|------|--------|
| בחירת ספק (Kling 2.0 / Runway Gen-4 / Luma / Pika) | 👤 ממתין להחלטה ממך |
| API integration | ⏳ |
| מיזוג קול + וידאו לקליפ (ffmpeg / Creatomate) | ⏳ |

### 5.7 שלב 7 · הרכבה סופית (Composition)

| נושא | סטטוס |
|------|--------|
| Creatomate API integration | ⏳ |
| Concat קליפים + מוזיקת רקע + כתוביות | ⏳ |
| כתוביות עברית RTL מסונכרנות עם הקריינות | ⏳ |
| הורדת MP4 סופי | ⏳ |
| העלאה אוטומטית ל-cloud storage | ❌ |

---

## 6. Worker / Queue (BullMQ)

| נושא | סטטוס |
|------|--------|
| מבנה queue + processor | ✅ |
| Mock providers (TTS / Avatar / B-Roll / Composition) | ✅ |
| Smoke test (`npm run test:render`) | ✅ |
| חיבור הצינור האמיתי (כשהשלבים יהיו מוכנים) | ⏳ |
| Retry policy + exponential backoff | ✅ (BullMQ default) |
| Dead-letter queue / failure handling | 🟡 בסיסי |

---

## 7. תמחור וקרדיטים

| נושא | סטטוס |
|------|--------|
| `User.creditsBalance` (Prisma) | ✅ |
| Free signup → 5 קרדיטים | ✅ |
| חיוב 1 קרדיט/ייצור תסריט | ✅ |
| חיוב 1 קרדיט/תמונת סצנה | ✅ |
| תוכניות סובסקריפשן (Free/Starter/Pro/Agency) | ❌ |
| Stripe / payment integration | ❌ |
| מנגנון rollback קרדיטים על כשלון | 🟡 חלקי |
| Usage tracking + dashboard למשתמש | ❌ |
| **תמחור מאושר**: מבנה 18 קרדיטים/וידאו, $0.50/קרדיט | 👤 ממתין לאישור סופי ממך |

---

## 8. אבטחה ו-prod readiness

| נושא | סטטוס |
|------|--------|
| Row-Level Security (RLS) ב-Supabase | ❌ |
| Rate limiting על endpoints | ❌ |
| File upload size limits | 🟡 בסיסי בסקרייפר בלבד |
| Webhook signature validation | ❌ (כשנחבר ספקים אמיתיים) |
| Logging מובנה (Pino / Winston) | ❌ |
| Error monitoring (Sentry) | ❌ |
| Cloud storage (Supabase Storage / S3) | ❌ |
| Environment-aware config | 🟡 חלקי |
| Audit log למשתמשים | ❌ |
| GDPR compliance, data retention policy | ❌ |

---

## 9. ניווט ושמירת state

| נושא | סטטוס |
|------|--------|
| `/projects/[id]` → auto-redirect לשלב הנכון | ✅ |
| Stepper לחיץ — קליק על שלב שעבר → חזרה אליו | ✅ |
| פרויקטים בתהליך מוצגים בדאשבורד | ✅ |
| State נשמר ב-DB אחרי כל פעולה (לא אבד אם המשתמש יצא) | ✅ |
| URL deep-linking (bookmark של שלב מסוים) | ✅ |
| Undo / Redo בעריכת תסריט/פרומפט | ❌ |

---

## 10. תכונות עתידיות שעלו בשיחה

- העלאת תמונות מוצר ידני (file upload, צריך Supabase Storage)
- העלאת אווטאר ידני
- HeyGen integration לאווטארים מקצועיים
- A/B testing של תסריטים שונים על אותו מוצר
- Templates / presets שיווקיים
- Team accounts (משתמש ראשי + עורכים)
- חיבור לחנות שופיפיי / ווקומרס לאוטומציה
- Brand kit (צבעים, פונטים, לוגו לכל הסרטונים)
- Analytics (CTR, conversion) למודעות שהורדו

---

## 11. Open questions (החלטות תכן שעוד לא סגורות)

- **ספק וידאו (image→video)**: Kling 2.0 / Runway Gen-4 / Luma / Pika / Sora? — 👤 ממתין להחלטה
- **תוכניות חבילה**: לאשר טבלת קרדיטים ($0.50/credit, 18/video)? — 👤
- **אווטאר ידני**: לאפשר העלאה? קטלוג של 25 כרגע — מספיק? — 👤
- **רגנרציה על תקלה**: להחזיר קרדיט אוטומטית או רק אחרי תמיכה? — 👤
- **משך וידאו ברירת מחדל**: 15s או 30s? — 👤
- **TTS provider**: ElevenLabs (איכות גבוהה, יקר) או Azure/Google Hebrew (זול, פחות טבעי)? — 👤

---

מסמך זה נכתב/יתעדכן בכל קומיט שמעביר נושא ממצב לאחר. אם נראה לך שמשהו חסר — תגיד.
