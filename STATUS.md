# tachles · STATUS

מסמך חי — מה מומש, מה בעבודה, מה חסר. התעדכן בקומיט הזה (2026-04-28).

נקרא כך:
- ✅ מומש ועובד
- 🟡 חלקי / placeholder / mock
- ⏳ מתוכנן בקומיט הבא או הקרוב
- ❌ עוד לא התחיל / out-of-scope לעכשיו
- 👤 ממתין למידע ממך

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
| גריד עם 16 אווטארים | 🟡 placeholders (randomuser.me) |
| **קטלוג מותאם של דמויות אמיתיות עם שמות/גילאים** | 👤 ממתין לרשימה ממך |
| פילטרים: מגדר, טווח גיל | ✅ |
| בחירה ושמירה | ✅ |
| העלאת אווטאר ידני (custom upload) | ❌ |
| HeyGen integration (קטלוג מקצועי) | ❌ |

### 5.3 שלב 3 · תסריט (`/projects/[id]/scripts`)

| נושא | סטטוס |
|------|--------|
| יצירת 6 תסריטים עם gpt-5.4-mini, structured outputs (strict JSON) | ✅ |
| 6 זוויות שיווקיות בסדר קבוע | ✅ |
| System prompt חזק עם דוגמאות hooks אמיתיים בעברית + עצירת קלישאות | ✅ |
| כללי TTS (מספרים במילים, ללא קיצורים אנגליים, ללא אימוג'ים) | ✅ |
| כללי רציפות בין סצנות (visual_prompt_english) | ✅ |
| בחירת תסריט (selectedScriptId על Project) | ✅ |
| **עריכה ידנית של hook / cta / טקסט סצנות / משך** | ✅ |
| Regenerate (1 קרדיט) | ✅ |
| Progress indicator בייצור | ✅ |
| כתיבה ידנית מאפס (במקום AI) | ❌ |

### 5.4 שלב 4 · תמונות סצנה (`/projects/[id]/scenes`)

| נושא | סטטוס |
|------|--------|
| gpt-image-2 medium @ 1024×1792 (true 9:16) | ✅ |
| Multi-image input: avatar + previous scene + product | ✅ |
| נעילת סצנה N עד שסצנה N-1 קיימת (אכיפת רציפות) | ✅ |
| כפתור "צור" לכל סצנה בנפרד | ✅ |
| עריכת `visual_prompt_english` ידנית לכל סצנה | ✅ |
| Regenerate (1 קרדיט לכל ניסיון) | ✅ |
| Progress overlay על אזור התמונה | ✅ |
| Streaming partial images (`partial_images` param) | ❌ (אופטימיזציה עתידית) |
| שמירת תמונות ב-cloud storage | ❌ (כרגע local fs בלבד — לא יעבוד ב-prod) |

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

- **ספק וידאו**: Kling 2.0 / Runway Gen-4 / Luma / Pika? — 👤 ממתין להחלטה
- **תוכניות חבילה**: לאשר טבלת קרדיטים ($0.50/credit, 18/video)? — 👤
- **אווטאר ידני**: לאפשר העלאה? או רק קטלוג סגור? — 👤
- **רגנרציה על תקלה**: האם להחזיר קרדיט אוטומטית או רק אחרי תמיכה? — 👤
- **משך וידאו ברירת מחדל**: 15s או 30s? — 👤

---

מסמך זה נכתב/יתעדכן בכל קומיט שמעביר נושא ממצב לאחר. אם נראה לך שמשהו חסר — תגיד.
