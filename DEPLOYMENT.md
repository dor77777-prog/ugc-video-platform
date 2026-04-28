# tachles · Deployment Guide

מדריך להעלאת המערכת לפרודקשן ולבדוק אותה כמו משתמש אמיתי (לא localhost).

## ארכיטקטורה לפרודקשן

```
                                    ┌──────────────────────────┐
   user browser                     │  Next.js (apps/web)      │
        │                           │  - UI + API routes       │
        ▼                           │  - serves /uploads/*     │
   ┌──────────────┐  ───────────►   │                          │
   │ web app URL  │                 └────────┬─────────────────┘
   │ (Vercel/Fly) │                          │
   └──────────────┘                          ▼
                                    ┌──────────────────────────┐
                                    │  Postgres (Supabase/Neon)│
                                    └──────────────────────────┘
                                              ▲
                                              │
                                    ┌──────────────────────────┐
                                    │  Redis (Upstash)         │ ◄─── BullMQ jobs
                                    └──────────────────────────┘
                                              ▲
                                              │
                                    ┌──────────────────────────┐
                                    │  Worker (apps/worker)    │
                                    │  - render queue          │
                                    │  - kling-sweep cron      │
                                    │  - ffmpeg local          │
                                    └──────────────────────────┘
```

הצורך בכל רכיב:

- **Web app** — Next.js 15 App Router, מציג UI ומחזיק את ה-API routes (כולל `/api/scenes/[id]/clip`, `/api/render/start`).
- **Worker** — תהליך Node נפרד, מאזין ל-`render` queue + מריץ את `kling-sweep` כל שעה. **חייב גישה ל-`ffmpeg`** ב-PATH.
- **Postgres** — DB. ה-schema כבר מסונכרן (6 migrations ב-`prisma/migrations/`).
- **Redis** — ל-BullMQ jobs. כל ספק managed Redis עובד.
- **Public storage** — חיוני! כי Kling LipSync / Sync.so / Avatar v2 צריכים לקרוא את ה-MP3 וה-MP4 מ-URL ציבורי.

## דרישות מקדימות

חשבונות מוכנים:
- [Vercel](https://vercel.com) (לweb) **או** [Fly.io](https://fly.io) (לweb + worker באותו מקום)
- [Supabase](https://supabase.com) (Postgres + Storage + Auth) — *מומלץ, חוסך 3 ספקים*
- [Upstash Redis](https://upstash.com/redis) (חינם עד 10K commands/day)
- [GitHub](https://github.com) (כבר יש — הקוד דחוף)
- חשבון תשלום אצל **OpenAI**, **ElevenLabs**, **Kling** (כבר מוגדרים ב-`.env` המקומי)

---

## דרך A: Vercel (Web) + Fly.io (Worker) — פרודקשן מלא

### A1. הקמת Postgres (Supabase)

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New Project**
2. בחר region קרוב (eu-central-1 / il לפי איפה רוב המשתמשים)
3. אחרי שה-project נוצר → **Project Settings → Database → Connection string** — העתק את ה-`postgresql://...` עם ה-pooler (יציב יותר עם serverless)
4. ב-terminal מקומי: ייצא את ה-DB החדש לסכמה שלנו:
   ```bash
   export DATABASE_URL="<supabase-url>"
   npx prisma migrate deploy
   ```
   זה יריץ את כל 6 ה-migrations שדחפנו לריפו.

### A2. הקמת Redis (Upstash)

1. [Upstash console](https://console.upstash.com) → **Create database** → Redis
2. בחר region זהה ל-Supabase
3. העתק את `REDIS_URL` (`rediss://...`) — שים לב לשני ה-`s` ב-`rediss` (TLS)

### A3. הקמת Storage ציבורי (Supabase Storage)

> **שינוי קוד קטן יידרש** — היום ה-storage המקומי כותב ל-`apps/web/public/uploads/`. ב-Vercel זה לא יישאר בין deployments. צריך להחליף ל-Supabase Storage.

1. Supabase → **Storage → New bucket** → name: `tachles-uploads`, **Public**: ON
2. **Settings → API** → העתק את `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
3. בקוד: עדכן את `apps/web/lib/storage/index.ts` להשתמש ב-Supabase במקום `LocalStorage` (זוהי מטלה — נשאיר ל-PR נפרד; בינתיים אפשר לדלג ולהשאיר Local רק לקליפים, אבל ה-LipSync **לא יעבוד** בלי URL ציבורי לקבצי mp3/mp4).
4. **כדרך ביניים מהירה:** השאר Local storage + הפעל `cloudflared` deployed על ה-worker host (זה כבר עובד מקומית — צריך פשוט להריץ אותו ב-prod).

### A4. הגדרת Vercel (Web)

1. [Vercel Dashboard](https://vercel.com/dashboard) → **Add New → Project** → import `dor77777-prog/ugc-video-platform`
2. **Root Directory**: `apps/web`
3. **Framework Preset**: Next.js (auto-detected)
4. **Build Command**: `npm install --workspaces && npx prisma generate && npm run build`
5. **Install Command**: השאר default
6. **Environment Variables** (העתק מ-`.env` המקומי, כל ה-keys מתחת):
   ```
   DATABASE_URL=<supabase-pooler-url>
   REDIS_URL=<upstash-url>

   NEXT_PUBLIC_SUPABASE_URL=<supabase-url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon>
   SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role>

   OPENAI_API_KEY=<sk-...>
   OPENAI_SCRIPT_MODEL=gpt-5.4-mini
   OPENAI_IMAGE_MODEL=gpt-image-2
   OPENAI_MOTION_VISION_MODEL=gpt-4o-mini

   ELEVENLABS_API_KEY=<sk_...>
   ELEVENLABS_MODEL_ID=eleven_v3

   KLING_ACCESS_KEY=<...>
   KLING_SECRET_KEY=<...>
   KLING_API_BASE_URL=https://api-singapore.klingai.com
   KLING_IMAGE_TO_VIDEO_ENDPOINT=/v1/videos/omni-video
   KLING_IMAGE_TO_VIDEO_MODEL=kling-v3-omni
   KLING_LIPSYNC_ENDPOINT=/v1/videos/lip-sync
   KLING_LIPSYNC_MODEL=kling-lip-sync-v1

   LIPSYNC_PROVIDER=kling
   KLING_TALKING_SCENE_PROVIDER=ai_avatar_v2_pro
   KLING_AVATAR_V2_PRO_ENDPOINT=/v1/videos/avatar
   KLING_AVATAR_V2_PRO_MODEL=kling-avatar-v2-master-pro
   KLING_AVATAR_V2_STANDARD_ENDPOINT=/v1/videos/avatar
   KLING_AVATAR_V2_STANDARD_MODEL=kling-avatar-v2-master
   KLING_FACE_IDENTIFY_ENDPOINT=/v1/face/identify
   KLING_ADVANCED_LIPSYNC_ENDPOINT=/v1/videos/advanced-lipsync
   KLING_ADVANCED_LIPSYNC_MODEL=kling-advanced-lipsync-v1

   PUBLIC_BASE_URL=https://<your-vercel-domain>.vercel.app
   ADMIN_EMAILS=<your-admin-email>
   ```
7. **Deploy** — Vercel ירוץ build, prisma generate, deploy. אחרי 2-3 דקות תקבל URL של `<project>.vercel.app`.
8. **חזור ל-`PUBLIC_BASE_URL`** והעדכן אותו ל-URL האמיתי של Vercel (זה איך ש-Kling יקרא את הקבצים).

### A5. Worker על Fly.io

הworker צריך:
- Node 20+
- ffmpeg זמין ב-PATH
- חיבור ל-DB + Redis

1. התקן `flyctl`: `brew install flyctl`
2. ב-root של הריפו:
   ```bash
   fly launch --no-deploy --name tachles-worker
   ```
3. כשהוא שואל "Would you like to setup a Postgresql database?" → **No** (כבר יש Supabase)
4. ערוך את `fly.toml` שנוצר:
   ```toml
   app = "tachles-worker"
   primary_region = "fra"  # או cdg/lhr/iad — קרוב ל-DB

   [build]
     dockerfile = "apps/worker/Dockerfile"

   [processes]
     worker = "node /app/apps/worker/dist/index.js"

   [[services]]
     # אין HTTP service — Worker לא נחשף החוצה
     internal_port = 8080
     auto_stop_machines = false
     min_machines_running = 1
   ```
5. צור `apps/worker/Dockerfile`:
   ```dockerfile
   FROM node:20-bookworm-slim
   RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
   WORKDIR /app
   COPY package*.json ./
   COPY apps/worker/package*.json apps/worker/
   COPY apps/web/package*.json apps/web/
   COPY packages ./packages
   RUN npm install --workspaces
   COPY . .
   RUN cd apps/worker && npm run build
   CMD ["node", "apps/worker/dist/index.js"]
   ```
6. הגדר env vars לworker (אותם משתנים כמו Vercel):
   ```bash
   fly secrets set DATABASE_URL="..." REDIS_URL="..." \
     OPENAI_API_KEY="..." ELEVENLABS_API_KEY="..." \
     KLING_ACCESS_KEY="..." KLING_SECRET_KEY="..." \
     PUBLIC_BASE_URL="https://<vercel-domain>.vercel.app"
   ```
7. Deploy:
   ```bash
   fly deploy
   ```
8. וודא שהworker רץ:
   ```bash
   fly logs --app tachles-worker
   ```
   אמור לראות: `[worker] ready, listening on queue "render"`.

### A6. בדיקות end-to-end בפרודקשן

1. פתח `https://<vercel-domain>.vercel.app` בדפדפן
2. הירשם / התחבר
3. צור פרויקט חדש (Step 1 — מוצר)
4. עבור את כל 6 השלבים
5. בדוק `/admin/costs` — אמור לראות `in_progress` קריאות בזמן אמת
6. אחרי שהרינדור הסופי מסתיים → אוטומטית מועבר ל-`/library`
7. נגן את הסרטון inline ב-library

---

## דרך B: Railway (הכל במקום אחד — מהיר וקל לטסט)

לא רוצה להפריד? Railway יכול להריץ את הכל:

1. [Railway](https://railway.app) → **New Project → Deploy from GitHub** → בחר את הריפו
2. Railway יזהה אוטומטית את ה-monorepo. צור 2 services:
   - **web**: build = `npm install && cd apps/web && npx prisma generate && npm run build`, start = `cd apps/web && npm run start`
   - **worker**: build = `npm install && cd apps/worker && npm run build`, start = `cd apps/worker && node dist/index.js`
3. הוסף **Postgres plugin** + **Redis plugin** מה-marketplace של Railway
4. הם ימלאו אוטומטית את `DATABASE_URL` + `REDIS_URL` ב-services
5. הוסף את שאר ה-env vars (OpenAI / ElevenLabs / Kling) ב-Railway dashboard
6. Railway ייתן URL public לservice ה-web (`<project>.up.railway.app`)
7. עדכן `PUBLIC_BASE_URL` לאותו URL
8. Deploy → 5 דקות → המערכת חיה

יתרונות: הכל ב-vendor אחד, billing אחיד, easy scaling.
חסרונות: יקר יותר מ-Vercel free tier אם יש traffic נמוך.

---

## דרך C: שמירה על dev מקומי + cloudflared tunnel (ל-staging מהיר)

אם רק רוצים לבדוק חיצונית בלי deploy מלא:

1. הdev server שלך כבר רץ על localhost:3000
2. cloudflared tunnel פעיל → `https://<random>.trycloudflare.com`
3. הזמן משתמש לתת לו את ה-URL הזה. הוא יוכל להירשם ולהשתמש כרגיל.

הגבלות:
- ה-URL נופל אם המחשב נכבה / cloudflared מתרסק
- ביצועי DB מוגבלים (Postgres מקומי)
- אין SSL certificate משלך — תלוי ב-cloudflared

מתאים ל: 1-2 משתמשי טסט, אבל לא ל-public.

---

## איך להחליף את ה-storage המקומי לפרודקשן

**זו המטלה היחידה שעדיין דורשת PR.** היום `apps/web/lib/storage/index.ts` משתמש ב-`LocalStorage` שכותב לdisk. בפרודקשן:

1. צור `apps/web/lib/storage/supabase-storage.ts`:
   ```ts
   import { createClient } from '@supabase/supabase-js';
   const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
   export const supabaseStorage = {
     async putBytes({ folder, filename, data, contentType }) {
       const path = `${folder}/${filename}`;
       const { error } = await sb.storage.from('tachles-uploads').upload(path, data, { contentType });
       if (error) throw error;
       return { url: sb.storage.from('tachles-uploads').getPublicUrl(path).data.publicUrl };
     },
   };
   ```
2. ב-`storage/index.ts`: switch לפי `process.env.STORAGE_PROVIDER`:
   ```ts
   export async function getStorage() {
     return process.env.STORAGE_PROVIDER === 'supabase'
       ? supabaseStorage
       : localStorage;
   }
   ```
3. הוסף `STORAGE_PROVIDER=supabase` ל-Vercel env vars.

זה ייתן URLs ציבוריים אמיתיים לכל `voiceUrl` / `clipUrl` / `imageUrl` — Kling יוכל לקרוא אותם **ללא** cloudflared.

---

## חשבונות בילינג שצריך לוודא לפני pubilc launch

| ספק | תוכנית מינימלית מומלצת | למה |
|------|------------------------|------|
| **OpenAI** | tier 1 ($5+ paid) | image gen + script + vision motion analysis |
| **ElevenLabs** | Starter ($6/mo) | library voices, eleven_v3, 30K chars/mo |
| **Kling** | Resource pack 100 units ($13) למינימום, 1000 units ($126) לטסט רציני | i2v + lipsync + avatar v2 |
| **Supabase** | free tier מספיק לטסט | 500MB DB + 1GB storage |
| **Upstash Redis** | free tier (10K cmds/day) | BullMQ של 50 רינדורים/יום עובר טוב |
| **Vercel** | Hobby (free) או Pro ($20/mo) | edge requests + serverless |

**עלות אמיתית לוידאו** (אחרי כל המטריצה):
- 5 סצנות × ($0.04 image + $0.01 voice + $0.005 vision + $0.82 i2v או Avatar v2 Pro) = ~$4.40
- + LipSync ל-2 talking scenes (אם משתמשים ב-lipsync_v1): $0.04
- + script gen: $0.02
- + ffmpeg composition: $0
- **Total ≈ $4.40-4.50** לסרטון של 5 סצנות
- חיוב למשתמש: 12 credits × $0.50 = $6 → **margin ~27%**

---

## בדיקות חובה לפני שמשחררים ל-public

- [ ] הרשמה + התחברות עובדת
- [ ] יצירת פרויקט מ-URL מוצר (סקרייפר עובד)
- [ ] יצירת תסריטים (gpt-5.4-mini זמין ב-tier הנוכחי)
- [ ] יצירת תמונת סצנה (gpt-image-2 לא נחסם safety)
- [ ] יצירת voice-over (ElevenLabs key תקף + tier מספיק)
- [ ] יצירת clip עם talking-head (PUBLIC_BASE_URL נגיש מ-Kling)
- [ ] רינדור סופי → ספרייה (ffmpeg זמין ב-worker)
- [ ] `/admin/costs` מציג קריאות פעילות (BullMQ מחובר ל-Redis)
- [ ] **maintenance queue רץ** (kling-sweep) — בדוק `/admin/queue` או worker logs
- [ ] cap יומי + rate-limit פועלים (משתמש שלוחץ 30 פעמים מקבל 429)
- [ ] מחיקת פרויקט עובדת cascade

## מצב כרגע (אפריל 2026)

- ✅ **קוד דחוף ל-`origin/main`** ב-`https://github.com/dor77777-prog/ugc-video-platform`
- ✅ **6 prisma migrations** מוכנות, רץ `prisma migrate deploy` ב-prod ימשוך אותן
- 🟡 **Storage** — local fs. PR קטן צריך כדי לעבור ל-Supabase Storage / S3.
- 🟡 **Cloudflared** — טוב ל-staging, לא יציב ל-prod. או deploy מלא או tunnel persistent (named tunnel ב-Cloudflare Zero Trust)
- ✅ **כל ה-secrets ב-`.env`** וב-`.gitignore` — לא דלף לריפו
