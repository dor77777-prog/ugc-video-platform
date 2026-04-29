# tachles · STATUS

מסמך חי — מה מומש, מה בעבודה, מה חסר. **עדכון אחרון: 2026-04-29** (V6 — script streaming + avatar-gender lock + Israeli realism boilerplate + 12-dim quality_score + 5 hooks + 30 voices + duration mode 15s/30s + product-first metadata).

## 🆕 מה חדש מ-V4 ואילך (סיכום מצטבר)

| ציון | תאריך | מה זה |
|------|-------|--------|
| **V6** | 2026-04-29 | **Script streaming**: 6 calls מקבילים בנפרד, כל תסריט נשמר ל-DB ברגע שהוא מוכן, ה-UI מתעדכן לייב דרך `router.refresh()` כל 2.5s. **Avatar gender lock**: כל ה-spoken_text + on_screen_caption בלשון התואמת (זכר/נקבה) למגדר האווטאר. **30 קולות** ב-VoicePicker. |
| **V5** | 2026-04-29 | **Israeli realism**: per-scene `environment_type`+`environment_style`+`israeli_environment_required`+`local_realism_notes`+`why_this_scene_exists`. Image-prompt boilerplate שדוחף את gpt-image-2 ל-outlets/switches ישראליים, מידות דירה, trissim, טקסט עברי/נייטרלי. **Creative_strategy** הורחב ב-5 שדות (`big_idea`, `specific_situation`, `product_role`, `proof_moment`, `why_this_is_different_from_other_scripts`). **Quality_score** 12 צירים. **5 hook_options** מ-archetype-ים שונים. |
| **V4** | 2026-04-28 | **Duration mode (15s/30s)** end-to-end: helper `lib/video-mode.ts`, system-prompt branches, lipsync cap מותאם (1 vs 2). **Product-first scene metadata**: `primarySubject`, `mustShowProduct`, `productVisibilityPriority`, `cameraFocus`, `showFace`, `secondarySubject` ב-Scene + structured-output נדרש. Image-prompt builder עובר ל-product-led opener כש-primary_subject != avatar. |
| V3.6 | 2026-04-28 | TalkingSceneProvider abstraction (Kling Avatar v2 / advanced-lipsync / lipsync-v1). Kling Omni: `negative_prompt` + multi-image `image_list` + lipsync cap. Anti-drift NON_TALKING guard + negatives. |
| V3.5 | 2026-04-28 | Vision-grounded motion analysis (gpt-4o-mini), in-flight tracking על Scene, scene-routing veto patterns, חישוב duration שמכבד את script. |

## 🚨 תמונת מצב מהירה למפתחים שמצטרפים עכשיו

**הצינור עובד end-to-end** (אפריל 2026 V6):
1. **Step 1-2** — מוצר (סקרייפ + טופס) → אווטאר (25 קטלוג, מגדר ידוע)
2. **Step 3** — תסריט V6: 6 frameworks במקביל, **streaming live** (כל תסריט נכנס ל-DB ברגע שהוא מוכן). Per-mode constraints (15s vs 30s). Hard gender lock לפי האווטאר.
3. **Step 4** — תמונת סצנה (gpt-image-2 + Israeli realism boilerplate + product-led opener כשצריך + safety auto-retry).
4. **Step 5** — voice (ElevenLabs Multilingual v2, **30 קולות**) + clip (Kling Omni v3 i2v עם `negative_prompt` + multi-ref + per-mode lipsync cap). TalkingSceneProvider switchable.
5. **Step 6** — ffmpeg local: concat per-scene clips (כל אחד עם voice mux פנימי) + captions OFF קשיח + music OFF קשיח.

## ✅ מה עובד (מומש) | 🟡 מוקאפ / חלקי | ❌ חסר

**✅ Script generation (V6)**
- 6 frameworks במקביל, single-script schema לכל אחד
- `onScriptReady` → persist + `revalidatePath` per script (streaming UI)
- Avatar gender → grammatical lock ב-system prompt + user prompt
- Per-mode constraints (15s: 4 scenes, 50 words, 1 lipsync; 30s: 5 scenes, 110 words, 2 lipsync)
- 12-dim quality_score, 5 hook_options, diversity_notes
- `creative_strategy` עם 17 שדות

**✅ Scene image generation**
- gpt-image-2 עם זיהוי avatar + product reference
- Israeli realism boilerplate ב-prompt (Israeli outlets/switches, apartment proportions, trissim, Hebrew/neutral text)
- Product-led opener כש-`primary_subject ≠ avatar`
- Silent-talking-plate ל-lipsync scenes
- Safety auto-retry עם הסלמה

**✅ Clip generation**
- Kling Omni v3 (`/v1/videos/omni-video`) עם `negative_prompt` + `image_list` של scene+product
- Anti-drift NON_TALKING guards (positive + negative)
- Per-mode lipsync cap (אוטומטי: scene 0 ל-15s, 0+1 ל-30s) — user toggle עוקף
- Vision-grounded motion analysis (gpt-4o-mini) → motion prompt גרונדי
- TalkingSceneProvider switchable (`KLING_TALKING_SCENE_PROVIDER`: `lipsync_v1` / `ai_avatar_v2_pro` / etc.)
- In-flight tracking על Scene (`imageInFlightAt`/`voiceInFlightAt`/`clipInFlightAt`) שורד refresh

**✅ Voice picker**
- 30 קולות hand-picked מ-ElevenLabs Voice Library
- 18 נשים (UGC creator / influencer / mature / social-media-tuned)
- 12 גברים (UGC reviewer / ad voice / authoritative / social-media)
- Pre-generated Hebrew samples ב-`apps/web/public/voice-samples/` (האזנה מיידית)

**✅ Composition**
- ffmpeg concat-demuxer scene-by-scene
- כל clip self-contained (voice muxed פנימית ב-clip-impl, NOT one global track)
- Captions OFF קשיח ברנדרר (`enableCaptions = false`)
- Music OFF קשיח (`musicUrl = null`)

**✅ Admin dashboard**
- Live in-flight tracking ב-/admin/costs (5s polling)
- Cancel button per call + bulk cancel stale (15 דק׳)
- Cost forensics: כל ApiCall עם status / model / tokens / cost / duration

**🟡 חלקי**
- **Captions library** — קוד ASS RTL מוכן ב-ffmpeg.ts אבל force-disabled עד שהעיצוב טוב. דורש: word-by-word sync via ElevenLabs character timestamps + better RTL bidi + outline + fade-in/out.
- **Music library** — ה-toggle נשמר ב-`productData.backgroundMusic` אבל renderer מתעלם. דורש: 5-10 רצועות royalty-free מ-Pixabay/Mixkit ב-`apps/web/public/music/` + picker ב-Step 1.
- **Pre-lipsync vision quality gate** — לא קיים. ה-Kling lipsync יקרא על clipsים גרועים ויבזבז קרדיטים. דורש: קריאת gpt-4o-mini על first frame לפני lipsync, regen אם face_zoom > 0.6 או mouth occluded.

**❌ חסר**
- **Final-render duration validation** — סוכם משך הסצנות → אם מחוץ ל-`[14.5, 16.5]s` או `[28.5, 31.5]s` → לחסום render. דורש: גזרה במקרה overflow + extension במקרה underflow.
- **Admin debug timeline table** — טבלה לכל סצנה: scene_order / type / primary_subject / target_duration / measured audio/video durations / final / timeline_start.
- **BullMQ queue for scripts** — היום fire-via-action בלבד. בproduction serverless ה-action timeout (60s כברירת מחדל ב-Next.js) עלול לחתוך את הgeneration השלישי או הרביעי. דורש: `scripts` queue + worker side processing.
- **Tests** — אין לnit/integration. הצינור נבדק בכל commit ע"י TS check + dry-run. דורש: snapshot tests על JSON-schema parseability + scene-routing edge cases.
- **README/STATUS auto-update** — ידני היום. דורש: hook ב-CI שמוודא שה-status מצוטט ב-PR description.

**תשתית ספקים (gen-3 architecture):**
- **VideoGenerationProvider** ([types.ts](apps/web/lib/animation/types.ts)) — i2v + lipsync abstraction
- **LipSyncProvider** ([lipsync/types.ts](apps/web/lib/animation/lipsync/types.ts)) — Kling/Sync.so/ElevenLabs/Mock, switchable via `LIPSYNC_PROVIDER` env
- **TalkingSceneProvider** ([talking-scene/types.ts](apps/web/lib/animation/talking-scene/types.ts)) — image+audio → talking video in ONE call. 4 implementations: Avatar v2 Pro / Avatar v2 Standard / Advanced LipSync (face_identify + advanced_lipsync chain) / lipsync_v1 adapter. Switchable via `KLING_TALKING_SCENE_PROVIDER`. **NEW IN V3.6** — replaces the old i2v→lipsync chain for talking_head scenes; b-roll still uses i2v.
- **VoiceGenerationProvider** — ElevenLabs (eleven_v3 only — v2 doesn't support Hebrew)
- **MotionAnalysisProvider** — gpt-4o-mini vision per scene → grounded Kling motion prompt

**Live infra:**
- Dev: `localhost:3000`, log → `/tmp/ugc-web.log`
- Tunnel: cloudflared → `PUBLIC_BASE_URL` (regenerated when it drops)
- Worker: BullMQ (`render` + `maintenance` queues; hourly Kling stuck-task sweep)

**Cost per finished video — empirical (Apr 2026 user-account console):**

Kling token economics: `$160 / 293 tokens = $0.546 / token`. Observed average **1.44 tokens / clip** across real generations → **$0.79 per i2v clip** (was previously modeled as $0.82 → updated). Lip-Sync charges +1 token per call = **+$0.55 per lipsync scene**.

For a 5-scene video with 1 lipsync (15s mode) or 2 lipsync (30s mode):

| Item | 15s (4 scenes, 1 lipsync) | 30s (5 scenes, 2 lipsync) |
|------|---------------------------|---------------------------|
| Script (gpt) | $0.02 | $0.02 |
| Images (gpt-image-2) | $0.16 (4 × $0.04) | $0.20 (5 × $0.04) |
| Voices (ElevenLabs) | $0.04 | $0.05 |
| Vision motion analysis | $0.005 | $0.005 |
| **i2v (Kling)** | **$3.16** (4 × $0.79) | **$3.95** (5 × $0.79) |
| **LipSync (Kling)** | **$0.55** (1 × $0.55) | **$1.09** (2 × $0.55) |
| Composition (ffmpeg local) | $0 | $0 |
| **Total** | **≈ $3.94** | **≈ $5.32** |

Charged to user: 12 credits × $0.50 = $6 → **margin ≈ 35% on 15s, ≈ 11% on 30s**. Margin compression on 30s is real — bump pricing or cap lipsync to 1 scene for the lower tier.

**Open issues:**
- Music: **DISABLED** by default — auto-default track sounded bad and a curated free-music library hasn't been picked. Toggle in Step 1 still saved (`productData.backgroundMusic`) but the composer no-ops it. To re-enable: drop royalty-free tracks (Pixabay/Mixkit/YouTube Audio Library) into `apps/web/public/music/`, build a picker in Step 1, then unhide the `musicUrl` line in [render-processor.ts](apps/worker/src/processors/render-processor.ts).
- Captions: **DISABLED** by default — burned ASS overlay didn't look good. Toggle in Step 1 (`productData.captions`) preserved; if user explicitly turns it on, captions render with voice-bounded timing + 5-word chunking. Default is OFF.
- Final length: fixed (`pickClipDuration` honors script's `duration_seconds`).
- Auto-redirect to `/library`: implemented in [RenderFinalButton](apps/web/app/(dashboard)/projects/[id]/videos/client-bits.tsx) — polls `/api/render/[jobId]/status`, navigates on `completed` with `#job-<id>` anchor.
- Edit-back from library: each card has an "✎ ערוך פרויקט" link to `/projects/[id]/videos`.
- Delete project: dashboard cards have a "🗑 מחק" button with inline confirm. [DeleteProjectButton](apps/web/app/(dashboard)/dashboard/delete-button.tsx) → [deleteProjectAction](apps/web/app/(dashboard)/dashboard/actions.ts) cascades through Prisma (`onDelete: Cascade`) to scripts/scenes/render-jobs/assets.

נקרא כך:
- ✅ מומש ועובד
- 🟡 חלקי / placeholder / mock
- ⏳ מתוכנן בקומיט הבא או הקרוב
- ❌ עוד לא התחיל / out-of-scope לעכשיו
- 👤 ממתין למידע ממך

> **תמונת מצב גבוהה (אפריל 2026):** **כל 6 שלבי ה-Wizard חיים end-to-end** — מוצר → אווטאר → תסריט V2 → תמונות סצנה → סצנות מונפשות (voice + animated clip) → הרכבה סופית. כל הספקים האמיתיים מחוברים: OpenAI (gpt-5.4-mini + gpt-image-2), ElevenLabs Multilingual v2 (Hebrew TTS), Kling AI two-stage (Image-to-Video + Lip Sync), ffmpeg local (composition + RTL captions). אפס מוקים בצינור הראשי. עלות ראלית לוידאו ~$1 (כ-12 credits → $6 למשתמש, ~80% מרג'ין).

---

## 📐 Architecture Overview (מבנה המערכת)

### Monorepo

```
ugc-video-platform/
├── apps/
│   ├── web/                     # Next.js 15 App Router (UI + API)
│   │   ├── app/
│   │   │   ├── (auth)/          # login / register / callback
│   │   │   ├── (dashboard)/     # main app (RTL Hebrew)
│   │   │   │   ├── projects/[id]/
│   │   │   │   │   ├── new/        # Step 1 — product extraction + form
│   │   │   │   │   ├── avatar/     # Step 2 — pick from 25-avatar catalog
│   │   │   │   │   ├── scripts/    # Step 3 — V2 script engine
│   │   │   │   │   └── scenes/     # Step 4 — gpt-image-2 scenes
│   │   │   │   ├── library/        # Past renders
│   │   │   │   ├── settings/       # Account settings
│   │   │   │   └── dev/demo/       # Mock pipeline trigger
│   │   │   ├── admin/              # Admin dashboard
│   │   │   └── api/                # Route Handlers
│   │   ├── lib/
│   │   │   ├── llm/                # OpenAI integrations
│   │   │   │   ├── scripts.ts      # V2 script engine + parallel regen
│   │   │   │   └── scene-images.ts # gpt-image-2 + safety + auto-retry
│   │   │   ├── scenes/
│   │   │   │   └── generate-impl.ts # Shared scene-gen logic (action + route handler)
│   │   │   ├── scraper/            # Product URL extractor
│   │   │   ├── avatars/            # 25-avatar catalog
│   │   │   ├── categories/         # 15 product categories + heuristic guess
│   │   │   ├── storage/            # File storage abstraction (LocalStorage today)
│   │   │   └── usage/              # Cost tracking + ApiCall logger
│   │   ├── public/
│   │   │   ├── avatars/            # 25 PNG portraits (1024×1536)
│   │   │   └── uploads/            # Generated scene images (gitignored)
│   │   └── scripts/                # One-off: avatar-portrait gen, V2 fixtures
│   └── worker/                  # BullMQ worker (mock pipeline)
├── packages/
│   ├── shared/                  # Zod schemas + TypeScript types
│   │   └── src/
│   │       ├── types/script.ts     # V2 script types (camelCase)
│   │       └── schemas/script.ts   # Zod schemas (validation post-LLM)
│   └── prompts/                 # All LLM prompts + JSON schemas
│       └── src/
│           ├── script-system-prompt.ts   # 470-line V2 system prompt
│           ├── script-json-schema.ts     # OpenAI structured-output schema
│           ├── scene-image-prompts.ts    # gpt-image-2 prompt builder
│           └── scene-safety.ts           # Term rewrites + category modesty tokens
└── prisma/
    └── schema.prisma            # User, Project, Script, Scene, RenderJob, Asset, ApiCall
```

### Data flow per wizard step

```
Step 1 — Product
  ┌─────────────┐                    ┌──────────────────┐
  │ Product URL │ ──── POST ────►    │ /api/products/   │ ── shopify/JSON-LD/OG/cheerio ──┐
  └─────────────┘   /extract         │ extract          │                                 │
                                     └──────────────────┘                                 ▼
                                                                              ┌──────────────────┐
                                                                              │ Project.productData │
                                                                              │   (JSON)            │
                                                                              └──────────────────┘
Step 2 — Avatar
  Pick from /lib/avatars/catalog.ts (25 entries) → store id in productData.selectedAvatarId

Step 3 — Scripts (V2)
  ┌──────────────────┐    server action     ┌─────────────────────┐
  │ ✨ Generate 6    │──── generateScripts ─►│ apps/web/lib/llm/   │
  │ Scripts          │      Action            │ scripts.ts          │
  └──────────────────┘                        │  ↓                  │
                                              │  buildUserPrompt    │
                                              │  → OpenAI (gpt-4o-  │
                                              │    mini) w/ V2      │
                                              │    JSON schema      │
                                              │  ↓                  │
                                              │  Parse + score      │
                                              │  ↓                  │
                                              │  PARALLEL regen of  │ ── if any score < 8 ──┐
                                              │  weak scripts       │                       │
                                              │  (Promise.all)      │                       │
                                              │  ↓                  │                       │
                                              │  Map V2 → legacy    │                       │
                                              │  enum + persist     │ ◄─────────────────────┘
                                              └─────────────────────┘

Step 4 — Scenes
  Per-scene "Create" button   →  server action (single, serialized) ──┐
                                                                      ▼
  "Generate all" loop         →  fetch POST /api/scenes/[id]/generate │
                                  parallelism=2 (Promise.all chunks)  │
                                                                      ▼
                                                       ┌──────────────────────┐
                                                       │ /lib/scenes/         │
                                                       │  generate-impl.ts    │ ── shared logic
                                                       │  ↓                   │
                                                       │  Sanitize visual     │
                                                       │  brief (term rewrite)│
                                                       │  ↓                   │
                                                       │  buildScenePrompt    │
                                                       │  + REALISM_CHECK     │
                                                       │  + safety tokens     │
                                                       │  ↓                   │
                                                       │  OpenAI gpt-image-2  │
                                                       │  (180s timeout,      │
                                                       │   AbortController)   │
                                                       │  ↓ on safety reject  │
                                                       │  Retry w/o product   │
                                                       │  image + aggressive  │
                                                       │  modesty tokens      │
                                                       │  ↓                   │
                                                       │  Save base64 → disk  │
                                                       │  → /uploads/scenes_X │
                                                       │  ↓                   │
                                                       │  prisma.scene.update │
                                                       └──────────────────────┘
                                                                      │
   Live UI:  SceneCard polls   ◄─── GET /api/scenes/[id]              │
            every 2.5s when               (returns imageUrl)          │
            batch is running         ◄────────────────────────────────┘
            OR after single
            action completes

---

## 🔌 API Surface (מלא)

### Authentication & Health

| Method | Path                          | Auth | Description |
|--------|-------------------------------|------|-------------|
| GET    | `/api/health`                 | —    | DB + Redis liveness. Returns 200 with `{ ok, checks: {...} }` or 503 + error |
| GET/POST | `/auth/callback`            | —    | Supabase auth callback (email confirm) |

### Product extraction

| Method | Path                          | Auth | Description |
|--------|-------------------------------|------|-------------|
| POST   | `/api/products/extract`       | ✓    | Body: `{ url }`. Returns `ScrapeResponse` with `data` (productName, description, price, brand, images[], heroImageUrl, sourcePlatform), `confidence`, `signals[]`, `warnings[]`. SSRF-protected (blocks localhost + private IPs). |

### Scenes

| Method | Path                          | Auth | Description |
|--------|-------------------------------|------|-------------|
| GET    | `/api/scenes/[id]`            | ✓    | Returns `{ imageUrl, imageGenerationCount, imageGeneratedAt }`. Used by SceneCard live polling — bypasses `router.refresh()`'s tendency to coalesce when fired rapidly during batch generation. |
| POST   | `/api/scenes/[id]/generate`   | ✓    | Generates an image for the scene (gpt-image-2 + safety pipeline + auto-retry). Returns `{ success, imageUrl?, error?, needsCredits?, safetyBlocked?, timedOut?, safetyRetryApplied? }`. **Used by the "Generate all" loop in parallel** — Server Actions are serialized per-route by Next.js, so `Promise.all` over them runs sequentially; this Route Handler doesn't have that limitation. |

### Render queue (mock today)

| Method | Path                          | Auth | Description |
|--------|-------------------------------|------|-------------|
| POST   | `/api/render/start`           | ✓    | Create a RenderJob and enqueue it on BullMQ "render" queue |
| GET    | `/api/render/:jobId/status`   | ✓    | Poll job status / progress / final URL |

### Server Actions (used directly by forms)

| File                                                           | Action                          | What it does |
|----------------------------------------------------------------|---------------------------------|--------------|
| `app/(dashboard)/projects/new/actions.ts`                      | `createProjectAction`           | Persists step-1 form to `Project.productData` (JSON), redirects to step 2 |
| `app/(dashboard)/projects/[id]/avatar/actions.ts`              | `selectAvatarAction`            | Updates `productData.selectedAvatarId` |
| `app/(dashboard)/projects/[id]/avatar/actions.ts`              | `continueFromAvatarAction`      | Validates selection → redirects to step 3 |
| `app/(dashboard)/projects/[id]/scripts/actions.ts`             | `generateScriptsAction`         | Runs the V2 Script Engine (LLM call + parallel regen + persist 6 scripts) |
| `app/(dashboard)/projects/[id]/scripts/actions.ts`             | `selectScriptAction`            | Sets `Project.selectedScriptId` |
| `app/(dashboard)/projects/[id]/scripts/actions.ts`             | `updateScriptAction`            | Saves edits to `hook` / `cta` / scene `textHebrew` / `durationSeconds` |
| `app/(dashboard)/projects/[id]/scripts/actions.ts`             | `continueAfterSelectAction`     | Redirects to step 4 |
| `app/(dashboard)/projects/[id]/scenes/actions.ts`              | `generateSceneImageAction`      | **Single-scene "Create" button** (delegates to shared impl; serialized by Next.js so use the Route Handler for parallel batch) |
| `app/(dashboard)/projects/[id]/scenes/actions.ts`              | `updateScenePromptAction`       | Saves edits to a scene's `visualPromptEnglish` |
| `app/(dashboard)/admin/.../actions.ts`                         | (admin)                         | Add credits, ban user, retry/cancel render, queue maintenance |

---

## 🧠 Script Engine V2 — How it Works

### Why V2 exists
V1 produced "6 UGC scripts in 6 angles" but felt template-driven, with weak hooks and generic copy. V2 forces the LLM to **commit to a strong advertising idea before writing any spoken text**. Each script is built on a 12-field `creative_strategy` block, validated against an anti-cliché blacklist, scored on 8 axes, and any script under threshold 8 is automatically regenerated.

### V2 Pipeline

1. **Single LLM call** to gpt-4o-mini with strict JSON schema returns 6 scripts
2. **Each script must include**:
   - `framework` — one of 6 ad frameworks (problem_agitation_solution / skeptical_testimonial / demonstration_proof / price_alternative_anchor / relatable_israeli_moment / fast_direct_response)
   - `creative_strategy` — 12 mandatory fields:
     - `core_insight` — the sharp advertising idea this ad is built on
     - `audience_pain` — concrete daily frustration (specific, not generic)
     - `emotional_trigger` — the dominant emotion to pull
     - `product_mechanism` — how the product solves the pain (or "assumption: ...")
     - `main_objection` — the biggest "yeah but…" the viewer thinks
     - `persuasion_angle` — skeptic-converts / price-anchor / authority / social-proof / quick-win / loss-aversion
     - `why_this_would_stop_scroll` — what about the first 1.5s stops the thumb
     - `ugc_situation` — very specific Israeli everyday situation
     - `hook_type` — confession / frustration / mistake / curiosity / price_shock / before_after / wish_i_knew / i_stopped_doing / nobody_tells_you
     - `script_promise` — implicit promise to the viewer
     - `conversion_goal` — click_to_pdp / add_to_cart / save_post / share / comment
     - `assumptions` — list of guesses made when product data was missing
   - `hook_options` — 3 distinct opening lines (≤12 words each)
   - `selected_hook` — the strongest one (verbatim from hook_options)
   - `hook_reason` — 1 short Hebrew sentence explaining why
   - `scenes` — 4–5 (or 3 for fast_direct_response) with: `scene_goal` (stop_scroll/establish_pain/introduce_product/prove_it_works/decision_push), `spoken_text_hebrew`, `on_screen_caption_hebrew`, `visual_prompt_english`, `camera_direction`, `performance_note`, `duration_seconds`
   - `quality_score` — self-rating on 8 axes (hook_strength, specificity, israeli_authenticity, emotional_pull, visual_clarity, conversion_potential, tts_naturalness, no_generic_cliches) + `overall` + `weakness_note`

3. **Selective regeneration (parallel):** any script with `quality_score.overall < 8` triggers a regeneration call to OpenAI with the original strategy + the weakness_note as a critique. **All low-scoring regens fire in parallel via `Promise.all`** (capped at 3 concurrent calls per generation request to bound cost). New script replaces original only if it scores higher.

4. **Persistence** — V2 fields stored both in normalized DB columns (`framework`, `selectedHookReason`, `qualityScoreOverall`, `sceneGoal`, `onScreenCaptionHebrew`, `cameraDirection`, `performanceNote`) and the rich JSON in `Script.rawJson` (creative_strategy + hook_options + full quality breakdown).

5. **Backward compatibility** — legacy `Script.angle` (Postgres enum) and `Scene.sceneType` (enum) get populated with mapped values via `FRAMEWORK_TO_LEGACY_ANGLE` and `SCENE_GOAL_TO_LEGACY_TYPE`. The worker, admin views, and any other consumer reading legacy fields keep working.

### V2 Anti-cliché blacklist
12 banned phrases enforced by the system prompt (e.g., "שינה לי את החיים", "חייבים לנסות", "פשוט וואו"). The LLM is instructed: if it uses one without strong context, it must self-rate `no_generic_cliches: 1` which drops `overall` below 8 and triggers regeneration.

### Phase-based progress UX
The 60-90s wait is annotated client-side with 7 phases (analyze product → strategy → hooks → scenes → quality scoring → regen → save). Pure cosmetic, but turns "spinner of doom" into "I see what's happening".

### Test coverage
`apps/web/scripts/test-script-engine-v2.ts` — runs 3 fixtures (skincare / kitchen / tech) against real OpenAI and asserts 148 properties per fixture (framework coverage, scene completeness, no forbidden cliché phrases, overall ≥ 8). First run: 444/444 passing, scores 8.6–8.9, zero regen calls needed.

---

## 🖼 Scene Image Pipeline — How it Works

### Pipeline stages (per scene)

```
1. Pre-load reference images (avatar PNG from disk, product hero from URL)
2. Sanitize visual brief — replace risky terms (bodysuit→fitted base layer, etc.)
3. Build prompt:
   - ASPECT_OPENER (lens specs: 35mm, f/4, authentic phone-camera grain)
   - Scene visual brief (LLM-written setting + action)
   - Framing hint (mirror selfie / selfie / POV / over-shoulder physics)
   - IDENTITY LOCK (preserve all facial features from avatar)
   - Bio-fidelity skin tokens (pores, vellus hair, no airbrush)
   - REALISM CHECK (anatomy, light direction, surface contact, anti-AI tells)
   - Style (candid UGC phone-camera aesthetic)
   - Safety tokens (per-category modesty appendage if sensitive)
4. OpenAI call (gpt-image-2 medium 1024×1536) wrapped in 180s AbortController
5. On success → save PNG to /public/uploads/scenes_<projectId>/<file>.png
6. Update Scene.imageUrl in DB + decrement credits + log ApiCall
```

### Safety pipeline (3 layers)

**Layer 1 — Term sanitization** ([packages/prompts/src/scene-safety.ts](packages/prompts/src/scene-safety.ts)):
Always-on. 23 risky→safe rewrites: `bodysuit`→`fitted base layer top`, `shapewear`→`smoothing comfort layer`, `lingerie`→`outfit`, `sexy`→`stylish`, `revealing`→`well-fitted`, `intimate`→`personal`, `boudoir`→`bedroom morning routine`, etc. Returns the cleaned brief plus a list of which rules fired (for audit).

**Layer 2 — Per-category modesty tokens:**
For sensitive categories (`fashion`, `beauty`, `fitness`, `wellness_sleep`), an explicit modesty appendage is added to the prompt: *"fully clothed in everyday outerwear, modest framing, no lingerie or underwear visible, conservative casual context, retail commerce style"*. Skipped for non-sensitive categories (skincare, kitchen, tech) so the prompt stays focused.

**Layer 3 — Auto-retry on safety_violations:**
If gpt-image-2 returns `safety_violations=[sexual]` (or similar), the wrapper detects it and retries ONCE: drops the product image (the most common trigger) and switches to `AGGRESSIVE_RETRY_TOKENS` ("CRITICAL: Subject is fully dressed... NO lingerie, NO underwear, NO swimwear, NO bare torso, NO suggestive posing..."). If the retry also fails, throws `SceneImageSafetyError` which the caller turns into a clean Hebrew error.

### REALISM CHECK block

To bridge the gap between AI generations and authentic UGC, every scene prompt now includes ([scene-image-prompts.ts:67](packages/prompts/src/scene-image-prompts.ts#L67)):

- **Anatomy**: 5 fingers per hand, natural wrist/elbow articulation, no extra/missing limbs, no fused fingers, ears mirror-symmetric, eyes correctly aligned with matching catch-light
- **Hand-object contact**: visible knuckles, finger curvature follows object shape, no objects floating between fingers
- **Light direction**: ONE primary light source. All shadows fall the same way. No contradictory shadows.
- **Surface contact**: every object rests on a surface (with shadow underneath) or is gripped visibly. Nothing floats.
- **Scale**: products at human-hand size
- **Architecture**: walls meet at 90°, doors are rectangular, mirrors flat
- **No AI tells**: no plastic skin, no doll-eyes, no garbled text on signs

### Mirror-selfie physics

The classic AI tell. Custom framing hint when the brief mentions "mirror selfie":
- Phone in mirror shows its **BACK** (lens facing the mirror, NOT the screen)
- Eyes look at the mirror (so reflection looks at camera)
- Real optics — same shadows on subject and reflection
- Phone partially occludes face/chest in the reflection where physically expected

### True parallel batch generation

**The bug we fixed:** Next.js App Router serializes Server Actions per-route. `Promise.all` over server actions doesn't actually run them in parallel — the runtime queues them and processes one at a time. This is why "5 scenes in 5 minutes" stayed sequential even with `parallelism=2` in the client loop.

**The fix:** introduced `POST /api/scenes/[id]/generate` (Route Handler, not Server Action). Route Handlers don't have the per-route serialization. The "Generate all" loop now uses `fetch()` to this endpoint, allowing genuine parallelism. Both the Route Handler and the per-scene Server Action call into a shared `generateSceneImageImpl()` so logic stays DRY.

### Live UI updates (no manual refresh)

Three independent fallback paths so the user always sees scenes appear as they finish:

1. **Window-level events** — `GenerateAllButton` dispatches `scenes:batch-start` / `scenes:batch-done`. Each `SceneCard` listens and starts polling `GET /api/scenes/[id]` every 2.5s until it receives an `imageUrl` or the batch ends.
2. **Per-scene "Create" button** — when its `useActionState` pending flag goes true→false and `props.imageUrl` is still null, runs a polling burst (6 polls × 2.5s = 15s budget).
3. **`router.refresh()` after each chunk** — fallback for the credits counter, footer button, and other tree state that needs server data.

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
| **REALISM CHECK block** — anatomy, light direction, surface contact, anti-AI tells | ✅ |
| **Mirror-selfie physics** — phone shows BACK in reflection, real optics | ✅ |
| **Safety pipeline 3-layer** — term sanitization + per-category modesty tokens + auto-retry without product image | ✅ |
| **Timeout protection** — 180s AbortController סביב כל קריאת gpt-image-2; 200s client-side timeout | ✅ |
| **True parallel batch generation** — Route Handler `POST /api/scenes/[id]/generate` (Server Actions מסריילים בכפיה ע"י Next.js, אז ה-batch loop עובר דרך fetch) | ✅ |
| Parallelism=2 ב-`GenerateAllButton` (5 סצנות = ~2.5 דק' במקום 5 דק') | ✅ |
| **Live polling** — `GET /api/scenes/[id]` כל 2.5s במהלך batch / burst של 6 polls אחרי action בודד; אין צורך ברענון ידני | ✅ |
| כפתור "צור" לכל סצנה בנפרד (server action, `useActionState`) | ✅ |
| **One-click "Generate all scenes"** עם parallelism + live updates | ✅ |
| עריכת `visual_prompt_english` ידנית לכל סצנה | ✅ |
| Regenerate (1 קרדיט לכל ניסיון) | ✅ |
| Progress overlay על אזור התמונה (כולל overlay בזמן batch polling) | ✅ |
| הצגת שגיאות מסווגות ב-UI: safety / timeout / credits / generic — לא יותר fail בשקט | ✅ |
| Streaming partial images (`partial_images` param) | ❌ (אופטימיזציה עתידית) |
| שמירת תמונות ב-cloud storage | ❌ (כרגע `apps/web/public/uploads/` — לא יעבוד ב-prod) |

### 5.5 שלב 5 · סצנות מונפשות (Voice + Animated Clip per scene) ✨

> **V3 video provider architecture (2026-04-28):**
> Kling הופך לספק יחיד שמטפל גם ב-image-to-video וגם ב-LipSync, עם routing per-scene:
> - **Talking head / selfie / mirror selfie** → `i2v (silent)` → `LipSync (video_url + audio_url)` → קליפ מסונכרן שפתיים
> - **B-roll / product / hands-only / closeup / before-after** → `i2v (silent)` → ffmpeg ממסך אודיו בקומפוזיציה
>
> ה-routing נגזר אוטומטית מ-`cameraDirection` + `sceneGoal` ([scene-routing.ts](apps/web/lib/animation/scene-routing.ts)) או נשלף מ-3 עמודות חדשות ב-DB (`sceneGenerationType` / `requiresLipSync` / `faceVisibility`) כשה-LLM ממלא אותן ישירות.
>
> **קבצים חדשים:**
> - [types.ts](apps/web/lib/animation/types.ts) — `VideoGenerationProvider` interface (provider-agnostic)
> - [kling.ts](apps/web/lib/animation/kling.ts) — KlingProvider (real i2v + real lipsync + mock fallback via `KLING_LIPSYNC_MOCK=1`)
> - [scene-routing.ts](apps/web/lib/animation/scene-routing.ts) — `deriveSceneRouting(cameraDirection, sceneGoal)`
> - [public-url.ts](apps/web/lib/animation/public-url.ts) — `toPublicUrl(/uploads/...)` עם `PUBLIC_BASE_URL` (ngrok/cloudflared/deploy)
> - [clip-impl.ts](apps/web/lib/scenes/clip-impl.ts) — שיכתוב מלא ל-routing הדו-pipeline
>
> **Schema additions** (`prisma migrate v3_scene_routing`):
> - `Scene.sceneGenerationType` (String?)
> - `Scene.faceVisibility` (String?)
> - `Scene.requiresLipSync` (Boolean?)
>
> **ENV חדשים** (`.env`):
> ```
> KLING_API_BASE_URL=https://api-singapore.klingai.com
> KLING_IMAGE_TO_VIDEO_ENDPOINT=/v1/videos/image2video
> KLING_LIPSYNC_ENDPOINT=/v1/videos/lip-sync
> KLING_IMAGE_TO_VIDEO_MODEL=kling-v3-omni
> KLING_LIPSYNC_MODEL=kling-lip-sync-v1
> KLING_API_KEY=                  # (optional) wrapper providers
> KLING_ACCESS_KEY + KLING_SECRET_KEY  # official Kling JWT
> KLING_LIPSYNC_MOCK=1            # while PUBLIC_BASE_URL not wired
> PUBLIC_BASE_URL=                # ngrok/cloudflared/prod URL for lipsync
> ```
>
> **חסום בכוונה:** Kling lipsync רץ במצב MOCK (מחזיר את ה-silent video כמות שהוא) עד שיש PUBLIC_BASE_URL נגיש מ-Kling. ברגע שתשמש tunnel או deploy → להגדיר `PUBLIC_BASE_URL` ולכבות `KLING_LIPSYNC_MOCK`. הצינור ימשיך לעבוד בלי לשבור פרויקטים קיימים.


| נושא | סטטוס |
|------|--------|
| **ElevenLabs Multilingual v2** — Hebrew TTS REST integration ([lib/voice/elevenlabs.ts](apps/web/lib/voice/elevenlabs.ts)) | ✅ |
| **Per-scene voice button** + audio waveform preview ([components/ui/audio-preview.tsx](apps/web/components/ui/audio-preview.tsx)) | ✅ |
| **קטלוג 12 קולות ישראליים** (gender + age + energy filters) ([lib/voice/voice-presets.ts](apps/web/lib/voice/voice-presets.ts)) | ✅ |
| **VoicePicker** UI עם sample preview (modeled after AvatarPicker) ([videos/voice-picker.tsx](apps/web/app/(dashboard)/projects/[id]/videos/voice-picker.tsx)) | ✅ |
| **Project-level voice consistency** — `Project.productData.voiceId` נשמר, כל הסצנות משתמשות באותו קול | ✅ |
| **Performance-driven voice settings** — performance_note → ElevenLabs `style`/`stability` (לוחש=0.15/0.85, פאנץ'=0.65/0.45 וכו') | ✅ |
| Hebrew TTS rules בסקריפט-פרומפט (מספרים במילים, ללא סימנים, פיסוק לנשימה) | ✅ |
| **Kling AI two-stage** — Image-to-Video (V2-Master) + Lip Sync ([lib/animation/kling.ts](apps/web/lib/animation/kling.ts)) | ✅ |
| JWT-signed auth (HS256 על AccessKey + SecretKey, 30-min token) | ✅ |
| **Per-scene clip button** + 9:16 video preview עם play-on-click ([components/ui/video-preview.tsx](apps/web/components/ui/video-preview.tsx)) | ✅ |
| **Motion prompt builder** — מילון Kling Camera Movement (Master Shot / Pan / Tilt / Zoom / Mirror Selfie) ממופה מ-cameraDirection + performanceNote | ✅ |
| **True parallel batch** (parallelism=2) דרך Route Handlers — `POST /api/scenes/[id]/voice` + `/clip` | ✅ |
| **Live polling** — חידוש דפוס מ-Step 4: events `voices:batch-start/done` + `clips:batch-start/done` + burst polling אחרי action בודד | ✅ |
| **Per-stage error classification** — config / safety / timeout / failedStage('motion'\|'lipsync') מוצגים בעברית ב-UI | ✅ |
| **Cost tracking** — `recordApiCall` ב-3 קריאות נפרדות ל-admin/costs: `elevenlabs:tts`, `kling:i2v`, `kling:lipsync` | ✅ |
| **Credit pricing** — voice=1 credit, clip=1 credit (משולב i2v + lipsync), final=1 credit. סה"כ ~12 credits = $6 לסרטון 5 סצנות | ✅ |
| Schema migration `v3_voice_clip` — 10 עמודות חדשות ב-Scene (5 voice + 5 clip) | ✅ |
| **שלב 5 = סצנות מונפשות, שלב 6 = הרכבה סופית** ב-Stepper | ✅ |

### 5.6 שלב 6 · הרכבה סופית (Final Composition via ffmpeg) ✨

| נושא | סטטוס |
|------|--------|
| **ffmpeg-local provider** ([apps/worker/src/providers/composition/ffmpeg.ts](apps/worker/src/providers/composition/ffmpeg.ts)) — חינם, ללא API key | ✅ |
| Concat-demuxer של 5 קליפים → MP4 יחיד | ✅ |
| **Burned RTL Hebrew captions** — ASS subtitles (libass), פונט Heebo, UTF-8 native | ✅ |
| **Voice-bounded caption window** — caption מופיעה רק במשך הדיבור (`voiceDurationSeconds`), לא לאורך כל הקליפ | ✅ |
| **Caption chunking** — אם הtext ארוך (>6 מילים), מתחלק אוטומטית ל-5 מילים בכל chunk עם timing פרופורציונלי | ✅ |
| Re-encoding ל-x264 fast preset, CRF 20, AAC 192k, faststart MOV atom | ✅ |
| **Background music mixing** (-18 dB ducking) דרך `amix` filter, נטען מ-`/music/default.mp3` כשהמשתמש בחר Music ב-Step 1 | 🟡 קוד מוכן — דורש קובץ `apps/web/public/music/default.mp3` (לא בundled) |
| Per-scene audio embedded BEFORE composer (clip-impl ffmpeg mux) — composer רק concat + captions, לא נוגע באודיו פר-סצנה | ✅ |
| **POST /api/projects/[id]/render** — מאמת את כל הקליפים, יוצר RenderJob, מקטין credits, enqueue ל-BullMQ | ✅ |
| BullMQ progress events + `/admin/queue` + `/api/render/[jobId]/status` נשמרים | ✅ |
| Final MP4 נשמר ב-`/uploads/finals/<timestamp>.mp4` | ✅ |
| Asset(final_video) + RenderJob.finalVideoUrl מתעדכנים | ✅ |
| **ספריית `/library`** — נגן 9:16 inline + כפתורי "פתח במסך מלא" + "הורד" + תיוג mock לרינדורים ישנים | ✅ |
| **Cloud storage לפלט הסופי** — Supabase Storage / S3 | ❌ (כרגע local fs) |
| **Word-by-word caption sync** דרך ElevenLabs character timestamps | ❌ (chunking של 5 מילים מספיק לרוב המקרים) |

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

## 6.6 V3.6 — TalkingSceneProvider (אפריל 2026)

| נושא | סטטוס | פירוט |
|------|--------|--------|
| **TalkingSceneProvider abstraction** | ✅ | חדש: ספק שמקבל **image + audio** ומחזיר **video עם מוצא דיבור** ב-call יחיד. שונה מ-LipSyncProvider שמקבל video + audio. |
| **Kling AI Avatar v2 Pro** | ✅ | ברירת מחדל ל-`KLING_TALKING_SCENE_PROVIDER`. אמור לתת איכות עליונה ל-talking head בלי i2v→lipsync chain. |
| **Kling AI Avatar v2 Standard** | ✅ | אותו provider עם model id זול יותר. |
| **Kling Advanced LipSync** | ✅ | 2-step chain: `face_identify(image) → face_id`, ואז `advanced_lipsync(face_id + audio)`. דורש שהreseller יחשוף את `face_identify_endpoint`. |
| **lipsync_v1 adapter** | ✅ | עוטף את ה-flow הישן (kling-v3-omni i2v + kling-lip-sync-v1) כ-TalkingSceneProvider — מאפשר A/B מאותם inputs. |
| **POST /api/dev/kling-talking-bakeoff** (admin) | ✅ | מריץ את כל 4 השיטות במקביל על אותם image+audio, שומר MP4 לכל אחת תחת `bakeoff/talking/`, מחזיר URL לכל תוצאה. |
| **clip-impl fast path לסצנות talking** | ✅ | אם `routing.requiresLipSync && KLING_TALKING_SCENE_PROVIDER ≠ lipsync_v1` → דילוג מלא על i2v. השלב היחיד הוא image+audio→video של provider. נופל בחזרה ל-i2v אם PUBLIC_BASE_URL חסר או ה-provider נכשל. |
| **B-roll נשאר על kling-v3-omni** | ✅ | סצנות שלא דורשות lipsync (product_demo / hands_only / closeup_product / before_after / lifestyle / broll) ממשיכות בנתיב i2v המסורתי. |
| **ENV** | ✅ | `KLING_TALKING_SCENE_PROVIDER` + `KLING_AVATAR_V2_{STANDARD,PRO}_{ENDPOINT,MODEL}` + `KLING_FACE_IDENTIFY_ENDPOINT` + `KLING_ADVANCED_LIPSYNC_{ENDPOINT,MODEL}`. כל ה-paths/models override-able כדי לתמוך ב-302/PiAPI/KIE wrappers. |

## 6.5 בקרת איכות + ביצועים (V3.5 — אפריל 2026)

| נושא | סטטוס | פירוט |
|------|--------|--------|
| **Vision-grounded motion analysis** | ✅ | gpt-4o-mini מנתח כל תמונת סצנה לפני Kling i2v ובונה motion prompt **גרונד**: "right hand tilts the bottle, water flows into glass". $0.005/סצנה. ללא זה — Kling היה מקבל motion prompt גנרי וממצמץ במקום להנפיש את הפעולה. |
| **Scene routing veto fix** | ✅ | "selfie POV של ידיים שופכות" כבר לא מסווג כ-talking_head. PRODUCT_DEMO_VETO_PATTERNS ([scene-routing.ts](apps/web/lib/animation/scene-routing.ts)) חוסם 22 מילים (hand/holding/pouring/applying/closeup/counter/bottle/...). |
| **Per-scene-type motion vocabulary** | ✅ | `pickMotionToken()` ב-[kling.ts](apps/web/lib/animation/kling.ts) — `product_demo` → "hands rotate the product, label catches light"; `hands_only` → "hands perform the action smoothly"; `closeup_product` → "very slow drift, surface highlights". במקום motion גנרי לכולם. |
| **Silent talking plate** (image gen + Kling) | ✅ | רק לסצנות `requiresLipSync=true`. משפיע על **expression+liveness** (mouth open mid-sentence, eyebrow micro-raise, eyes alive) — **לא על framing**. הוראה מפורשת לשמר את ה-brief המקורי (product/hands/setting). |
| **Pre-lipsync negatives** | ✅ | "frozen face, plastic skin, dramatic mouth, side profile, mouth covered" מצורפים אוטומטית ל-Kling motion prompt לסצנות lipsync. |
| **clip duration honors script** | ✅ | `pickClipDuration(voice, scripted, lipsync)` — אם המשתמש בחר 15s ל-5 סצנות, כל סצנה מקבלת ~3s ולא נמתחת ל-5s. תוקן ב-V3.5. |
| **Two-phase API logging** | ✅ | `recordApiCallStart()` יוצר row עם status="in_progress" + `recordApiCallComplete()` מעדכן ל-success/failed. כל קריאה (script/image/voice/i2v/lipsync/motion_analysis) רשומה כך — מופיעה ב-`/admin/costs` עם elapsed timer חי. |
| **Admin live in-flight section** | ✅ | `/admin/costs` עם רכיב client-side ([in-flight.tsx](apps/web/app/(admin)/admin/costs/in-flight.tsx)) שמתרענן כל שנייה. badge אדום אחרי 5 דק׳ (stuck task). auto-refresh כל 5 שניות. |
| **In-flight tracking per scene** | ✅ | 3 עמודות חדשות (`imageInFlightAt`, `voiceInFlightAt`, `clipInFlightAt`). כשהמשתמש מרענן באמצע גנרציה — הספינר נשאר על המסך כי ה-server יודע שהפעולה רצה. גם מונע double-click שמבזבז $0.82. |
| **Increased parallelism (2 → 5)** | ✅ | כל הbatch buttons (image/voice/clip) כעת רצים את כל 5 הסצנות במקביל. wall-time מ-9 דק׳ ל-3 דק׳ ל-batch של 5. |
| **Rate-limit caps** | ✅ | i2v/lipsync 20/5min; tts 30/min; image 20/min; motion_analysis 30/min — מתאימים ל-parallelism=5 + retry. |

## 7. תמחור וקרדיטים

| נושא | סטטוס |
|------|--------|
| `User.creditsBalance` (Prisma) | ✅ |
| Free signup → 5 קרדיטים | ✅ |
| חיוב 1 קרדיט/ייצור תסריט | ✅ |
| חיוב 1 קרדיט/תמונת סצנה | ✅ |
| **קרדיטים לא יורדים על כשלון API** (transaction מסוף הפונקציה — תקף לכל 4 הפעולות) | ✅ |
| **CreditTransaction audit log** — כל שינוי בקרדיטים נרשם עם reason + ref + adminId | ✅ |
| **First-regen-free** — הרגנרציה הראשונה אחרי גן מוצלח חינמית (voice / clip / image) | ✅ |
| **Per-user daily spend cap** — ברירת מחדל $10/יום, override פר-משתמש דרך `User.spendCapUsd` | ✅ |
| **Per-user rate limit** — Kling i2v: 12/5min, TTS: 30/min, image: 15/min, script: 6/10min | ✅ |
| **Admin refund tool** — `/admin/users` → כפתור ↺ עם כמות + הערה (נכתב ל-CreditTransaction) | ✅ |
| **Admin spend-cap override** — input על `/admin/users` (ריק = default) | ✅ |
| **Stuck Kling task sweep** — BullMQ recurring job כל שעה, מסמן Stage A שתקועים מעל 15 דק׳ | ✅ |
| **Kling motion task_id cache** — Stage A מוצלח לא משולם פעמיים (אם imageUrl לא השתנה) | ✅ |
| תוכניות סובסקריפשן (Free/Starter/Pro/Agency) | ❌ |
| Stripe / payment integration | ❌ |
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
