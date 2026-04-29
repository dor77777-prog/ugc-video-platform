# tachles · Business Model Proposal (v1)

**עדכון אחרון:** 2026-04-29.
**סטטוס:** הצעה לאישור. לא מומש בקוד.
**מטרה:** מודל כלכלי שמרוויח, מתומחר לפי ספקים אמיתיים, ולא מסבסד את עצמו.

---

## 1. למה צריך לשנות — הבעיה היום

הקוד הקיים גובה **קרדיט אחד** לכל אופרציה, ללא קשר לעלות בפועל:

| אופרציה | עלות אמיתית ($) | קרדיטים נגבים | ב-$0.50/credit |
|---|---|---|---|
| יצירת תסריט (6 גרסאות) | $0.02 | 1 | $0.50 |
| תמונת סצנה (gpt-image-2) | $0.04 | 1 | $0.50 |
| voice (ElevenLabs) | $0.015 | 1 | $0.50 |
| **clip (Kling i2v)** | **$0.79** | **1** | **$0.50** |
| **clip + lipsync** | **$1.34** | **1** | **$0.50** |
| Final render (ffmpeg local) | $0 | 1 | $0.50 |

🔴 **ה-clip של Kling עולה לנו $0.79, אבל אנחנו גובים $0.50 על זה.** הפסד של $0.29 לכל קליפ. סצנה של talking-head עם lipsync = $1.34 עלות → $0.50 הכנסה → **$0.84 הפסד לכל סצנה**.

לכן הסרטון השלם מסבסד את עצמו על תמחור הסצנה, וחלק מהתוכניות מאבדות כסף ככל שמשתמשים מייצרים יותר.

**מה לא לעשות:** להעלות "1 credit = $0.50" ל-"$1.50". זה מקפיץ את המחיר לתמונה רגנית מ-$0.50 ל-$1.50 = יחס מחיר/ערך גרוע על אופרציות זולות. צריך **תמחור מדורג לפי אופרציה**.

---

## 2. עלויות אמיתיות לסרטון שלם

מבוסס על מחירי Kling ב-token-rate שאומתו בחשבון: $160 / 293 tokens = **$0.546 / token**, ממוצע ריאלי **1.44 tokens/clip = $0.79/clip**, lipsync = +1 token = **+$0.55**.

### סרטון 15s (4 סצנות, 1 lipsync)

| Item | Unit cost | Count | Total |
|---|---|---|---|
| Script (gpt) | $0.02 | 1 | $0.02 |
| Scene image (gpt-image-2) | $0.04 | 4 | $0.16 |
| Voice (ElevenLabs) | $0.015 | 4 | $0.06 |
| Vision motion analysis | $0.005 | 4 | $0.02 |
| **Kling i2v** | **$0.79** | **4** | **$3.16** |
| **Kling Lip-Sync** | **$0.55** | **1** | **$0.55** |
| ffmpeg composition | $0 | 1 | $0 |
| **Total cost (15s)** | | | **≈ $3.97** |

### סרטון 30s (5 סצנות, 2 lipsync)

| Item | Unit cost | Count | Total |
|---|---|---|---|
| Script | $0.02 | 1 | $0.02 |
| Images | $0.04 | 5 | $0.20 |
| Voices | $0.015 | 5 | $0.075 |
| Motion analysis | $0.005 | 5 | $0.025 |
| **Kling i2v** | **$0.79** | **5** | **$3.95** |
| **Kling Lip-Sync** | **$0.55** | **2** | **$1.10** |
| ffmpeg | $0 | 1 | $0 |
| **Total cost (30s)** | | | **≈ $5.37** |

### Regen-יחיד (החלפת סצנה אחת)

| מה הוחלף | Total cost |
|---|---|
| תסריט בלבד | $0.02 |
| תמונת סצנה בלבד | $0.04 |
| voice בלבד | $0.02 |
| clip (b-roll, ללא lipsync) | ≈ $0.86 |
| clip + lipsync (talking) | ≈ $1.41 |

---

## 3. עיקרון המודל המוצע

**1 credit = $0.10** (לא $0.50).

הסיבה: אופרציות זולות ($0.02-$0.04) זקוקות לתמחור עם granularity של ¢. ב-$0.50/credit לא ניתן לתמחר תמונה רגנית בלי לחייב 5x את העלות שלה.

**העיקרון:** כל אופרציה מתומחרת לפי עלותה האמיתית × 2-3x markup. ה-margin הריאלי מגיע מה-clip (האופרציה היקרה ביותר), והאופרציות הזולות (תמונה / voice / regen תסריט) הן "fillers" עם margin גבוה אבל מספרים קטנים.

### Credit costs per operation (proposed)

| Operation | Cost USD | Credits | User pays | Margin |
|---|---|---|---|---|
| Generate 6 scripts batch | $0.02 | **2** | $0.20 | 90% |
| Regenerate 1 script | $0.005 | **1** | $0.10 | 95% (effectively free) |
| Generate scene image | $0.04 | **2** | $0.20 | 80% |
| Regenerate scene image | $0.04 | **2** | $0.20 | 80% (1st regen still free) |
| Generate scene voice | $0.02 | **1** | $0.10 | 80% |
| Regenerate scene voice | $0.02 | **1** | $0.10 | 80% (1st regen still free) |
| **Generate b-roll clip (no lipsync)** | **$0.86** | **15** | **$1.50** | **43%** |
| **Generate talking clip (with lipsync)** | **$1.41** | **22** | **$2.20** | **36%** |
| Final render (ffmpeg) | $0 | **1** | $0.10 | 100% |

### Per-finished-video credit cost (without any regens)

**15s mode (4 scenes, 1 talking + 3 b-roll):**
- Script batch: 2
- 4 images: 8
- 4 voices: 4
- 1 talking clip + lipsync: 22
- 3 b-roll clips: 45
- Final render: 1
- **Total: 82 credits = $8.20** (cost $3.97 → margin **52%**)

**30s mode (5 scenes, 2 talking + 3 b-roll):**
- Script batch: 2
- 5 images: 10
- 5 voices: 5
- 2 talking clips + lipsync: 44
- 3 b-roll clips: 45
- Final render: 1
- **Total: 107 credits = $10.70** (cost $5.37 → margin **50%**)

50% margin per video is healthy and matches AI-video competitor pricing (Synthesia, HeyGen charge $20-30/video at the consumer tier).

---

## 4. תוכניות מנויים (proposed)

הכל בעיני "credits-included" + אפשרות לרכוש packs נוספים. הכל **חודשי**, לא מתחדש על credits שלא נוצלו (use-it-or-lose-it כדי להניע שימוש קבוע).

### Free Trial (acquisition)

- **$0 / חודש**
- **30 credits** חד-פעמי (לא מתחדש)
- מספיק ל-**1 סרטון 15s + 1-2 regens**
- עלות לנו: ~$4 לכל משתמש שמסיים את ה-trial. **acquisition cost מקובל לקטגוריה.**
- ⚠️ מגבלות: 1 trial לכל מספר טלפון + email + IP (מניעת abuse). אין יצוא 4K, watermark על הסרטון.

### Creator — $49 / חודש

- **600 credits / חודש**
- מספיק ל-**~6 סרטונים 15s** או **~5 סרטונים 30s**, כולל מקום ל-regens
- עלות אמיתית: ~$24-30 לחודש מלא
- **margin: 51-58%**
- קהל: יוצר קונטנט יחיד / Shopify קטן / SMB

### Brand — $149 / חודש

- **2,200 credits / חודש**
- מספיק ל-**~22 סרטונים 15s** או **~18 סרטונים 30s** + הרבה regens
- עלות אמיתית: ~$80-100 לחודש
- **margin: 46-54%**
- קהל: brand בינוני / e-commerce / agency קטנה

### Agency — $499 / חודש

- **8,000 credits / חודש**
- מספיק ל-**~80 סרטונים 15s** או **~65 סרטונים 30s**
- עלות אמיתית: ~$280-340 לחודש
- **margin: 32-44%** ← ברירת מחדל. עם volume discount של Kling (זמין מ-$5K/mo) → margin עולה ל-55-65%.
- קהל: agencies, multi-brand operators
- כולל: priority generation queue, brand-style locking, multi-seat (עד 5 משתמשים)

### Top-up packs (תמחור one-time)

| Pack | מחיר | Credits | $/credit |
|---|---|---|---|
| Small | $19 | 200 | $0.095 |
| Medium | $49 | 550 | $0.089 |
| Large | $99 | 1,200 | $0.083 |

ה-pack-ים מוזלים מתמחור "1 credit = $0.10" כדי לעודד רכישה בולק. עדיין רווחיים (כל credit עולה לנו ~$0.05).

---

## 5. החלטות אסטרטגיות שצריך לסגור

### 5.1 מה קורה כשרגן נכשל

**Recommendation:** החזר credits אוטומטי על failure שמעוגן לספק (Kling timeout, OpenAI 500). **לא** מחזירים על failure-by-content (e.g., safety violations) — כי מבחינת תשלום זה כן חיוב מצד הספק.

הקוד היום כבר עושה refund על rate-limit ו-spend cap. צריך להרחיב גם ל-Kling timeout / 5xx.

### 5.2 First-regen-free

הקוד היום מציע **regen ראשון בחינם** לכל אופרציה. ההצעה:
- שמירה על "first regen free" ל-image + voice (זול, חוויית משתמש קריטית)
- **ביטול** "first regen free" ל-clip — clip עולה $0.79+ לנו, regen חינם = הפסד מובהק. ההסבר למשתמש: "תמונה ו-voice הם חינם לרגן ראשון, clip יעלה X credits בכל פעם".

### 5.3 Cap על lipsync ב-30s

ב-30s mode, 2 סצנות lipsync עולות $1.10. הצעה: לאפשר רק 1 lipsync ב-Creator plan (חוסך $0.55 = משמעותי על plan של $49).

### 5.4 Annual discount

10-15% הנחה על תשלום שנתי מראש. עוזר ל-LTV ו-cash flow. Margin נשמר כי volume.

### 5.5 4K export

תוספת של $5-10 לכל סרטון 4K (ה-API של Kling 4K עולה ~3x יותר). תכונה נפרדת — לא חלק מה-plan הבסיסי.

### 5.6 Volume rebates ב-Kling

מ-$5K/חודש Kling מציעים hand-shake deal עם 30-50% הנחה. הצעה:
- ב-stage נוכחי (early): לתמחר ב-margin 50% גם בלי הנחה
- ברגע שעוברים $5K/mo → לסגור מו"מ → margin קופץ ל-65-70%
- לא להעביר את ההנחה למשתמשים (זה "earned margin")

### 5.7 Free trial fraud

30 credits = $4 cost. ב-100 fraudster trials = $400 הפסד. הגנות:
- Phone verification (cheaper than CC)
- Email + IP rate limit (1 trial לכל IP/24h)
- Trial includes 15s only (לא 30s) — מקטין loss per trial

### 5.8 Edge case: סרטון שמכשיל לפני final render

משתמש מבזבז 80 credits על generations ואז Kling נופל ב-clip האחרון. **ההצעה:** רגן clip יחיד (15-22 credits) בלי לבזבז את שאר ה-pipeline. הקוד כבר תומך בזה דרך per-scene clip regeneration. המסר למשתמש: "you don't need to start over."

---

## 6. אזהרות / סיכונים

### Kling pricing volatility
Kling שינו את המחירים פעמיים בשנה האחרונה. אנחנו צמודים אליהם. צריך alert ב-`/admin/costs` שמתריע אם מחיר ה-token עלה מעל סף מסוים, ואז נסגור valuation מחדש.

### LipSync v1 truncation
תוקן בקומיט קודם ([`03d8ccb`](https://github.com/dor77777-prog/ugc-video-platform/commit/03d8ccb)) — voice duration נמדד עם ffprobe במקום ההערכה השגויה. אבל אם Kling יחזיר משהו תמוה צריך לעקוב.

### Concurrency abuse
משתמש pro יכול לפתוח 10 פרויקטים ו-batch generate. אם 50 clips רצים במקביל = $40 פתאומיים. הקוד כבר עושה rate-limit per-user (חמור ל-clips), אבל בoptional plan עם 8K credits, ה-rate-limit צריך להיות נדיב יותר. הצעה: rate-limit לפי plan (Creator: 4 clips concurrent, Brand: 8, Agency: 20).

### Credit balance drift
Bug שגרם ל-creditsBalance להיות שלילי (overdraft). ה-spend-cap+rate-limit מונעים את רוב המקרים, אבל עדיף constraint ב-DB:

```sql
ALTER TABLE "User" ADD CONSTRAINT credits_non_negative CHECK ("creditsBalance" >= 0);
```

לא בקוד עכשיו, רק רעיון לטווח קצר.

---

## 7. סיכום של מה שצריך החלטה ממך

לפני שאני מממש, צריך תשובה ל-7 השאלות:

1. **1 credit = $0.10?** או רוצה ערך אחר (e.g., $0.20 כדי להיות פחות "fragmented" — נראה יותר יוקרתי, אבל פחות גמיש)?

2. **המחירים ב-$49 / $149 / $499?** או רוצה שכבות שונות (e.g., יותר זול ל-Creator כדי לתפוס שוק)?

3. **Free trial 30 credits או יותר/פחות?** 30 = ניסיון של 1-2 פרויקטים בלי הרבה regens.

4. **First-regen-free נשאר ל-image + voice, מתבטל ל-clip?**

5. **30s mode: cap ל-1 lipsync ב-Creator, 2 ב-Brand+?** (חוסך $0.55 על-כל סרטון של Creator).

6. **Annual discount: 10% / 15% / 20%?** (משפיע על cash flow, פחות על margin הכולל).

7. **4K export: כתוספת ($5-10 על סרטון), כתכונה ב-Brand+, או לא בכלל בשלב הזה?**

ברגע שתחזיר תשובות — אני יכול לכתוב את המודל לקוד (Plan enum, plan_credits map, per-operation differentiated charge logic, ו-`/admin/users` view שמראה שיוך ל-plan). עדיין לא סליקה — רק את ה-economics layer.
