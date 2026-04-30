# HEBREW_SCRIPT_CREATIVE_RULES.md

> ENCODING NOTE: this document was provided to V14 PR1 with all Hebrew
> sections in mojibake form (UTF-8 bytes that were re-decoded as
> Latin-1 somewhere upstream — "תכל'ס" rendered as "××'×¡" etc.). It is
> saved here as-is to preserve the structure and the English-coded
> sections (genre matrix headings, prompt outline, the 8 scene preset
> IDs, the 12 quality axes, the schema reference). When a clean UTF-8
> copy of the original becomes available, replace this file verbatim.
> V14 PR1 does not depend on the Hebrew text in this file; PR5 will
> need a clean copy to do its work.

---

## 1. Hebrew register

> Hebrew section — see encoding note above.

The structural rule: written register is the spoken Israeli register
of an actual influencer talking to camera. Casual second-person
(`את` / `אתה`), informal connectors (`זה`, `אז`, `בוא`, `תכל'ס`,
`סבבה`, `אחותי`, `אחי`, `מותק`), simple past-tense verbs
(`לקחתי`, `ניסיתי`, `ראיתי`, `התחלתי`), self-aware throwaway openings
(`אז אני עכשיו עושה ככה...`, `אתם יודעים שכאילו אין קורה ש...`).

Numbers as digits when short ("שלוש דקות"), spelled in Hebrew when
narratively meaningful ("47 שקל", "127 ימים").

NEVER: literary register (`עבורי`, `הינני`, `בכדי ש...`), corporate
language (`תהליך`, `פתרון`, `יעיל`, `מסביב`), direct English-to-Hebrew
gender swaps, the cliché "החיים שלי השתנו" finish.

### Hooks — 8 archetypes

| Genre | Opening (5–8 words) |
|---|---|
| Problem-Agitation | "אני לא מאמינה שזה קרה לי שוב." |
| Pure curiosity hook | "תקשיבו רגע — זה משנה הכל." |
| Direct list/listicle | "שלושה דברים שלמדתי השבוע על הפנים." |
| Mock-confession | "אני מתוודשת קצת מאוחר את זה אבל..." |
| Comparison | "ניסיתי את זה מול שלוש מוצרים — ורק אחד עבד." |
| Tutorial-promise | "סבבה — איך להפסיק להתעסק עם זה." |
| Authority-flex | "אני עובדת בתחום עשור, ואני אומרת לכם." |
| Trend-jack | "ראיתי בטיקטוק שכולם נסחבים על זה, אז..." |

---

## 2. Six genres the script system must master

The script system gets a URL + product → audience profile (dossier) +
key insights. From those three inputs, the system outputs 6 scripts in
**6 distinct genres**:

### 1. Problem-Solution (PAS — Problem, Agitate, Solve)

The classic. Three beats: pain → agitate → product solves.

**When to use**: any product that solves a real, named, daily-friction
problem (cleaning, sleep, kid wrangling, beauty fix, missed routine).

**Recommended duration**: 30 seconds (15s only if the agitate is tight).

**Outline**:
1. Hook (0–3s) — name the pain in the first 3 seconds, action shows it
2. Agitate (3–10s) — what's worse: I tried, didn't work, why it sucks
3. Pain second beat (10–14s) — moment of frustration
4. Reveal product (14–20s) — name what it is, "and that's when I tried..."
5. Functional outcome (20–26s) — what specifically changed after using
6. CTA (26–30s) — soft prompt, not pushy

### 2. UGC Review / Mock-confession

The system frames a user telling about the product after personal review.

**When to use**: beauty products, food, cosmetics, fashion, gadgets.

**Recommended duration**: 15 or 30 seconds.

**Outline**:
1. Opening / honest hook (0–4) — "I'm a bit embarrassed to tell you that..."
2. Brief personal context (4–10) — what was hard before, why I tried
3. Discovery moment (10–14) — how I found the product (friend / TikTok / random)
4. First impressions (14–24) — what surprised me first, second, third
5. Conclusion (24–30) — "תכל'ס, I'm keeping this" / "wrote you the link"

### 3. Listicle ("3 things I learned...")

Numbered structure, repetitive number opening, beats stack into a punch.

**When to use**: products with three+ benefits / advantages / use-cases.

**Recommended duration**: 15s (split across 3 beats) or 30s (5 beats).

**Outline**:
1. Hook (0–4) — "Three things I learned this week before X started"
2. Beat 1 (4–10) — basic, not surprising
3. Beat 2 (10–18) — adds context
4. Beat 3 (18–26) — the punch, "this is what flipped it for me"
5. CTA (26–30)

### 4. Day-in-the-Life / "follow me through my day"

The product enters as a natural part of the day, not as the main star.

**When to use**: morning products, evening products, on-the-go items,
skincare that fits a routine.

**Recommended duration**: 30s.

**Outline**:
- 5–7 short alternating beats (morning, mid-day, evening, before bed)
- The product appears in 2 beats specifically, never jumps out — natural
- Minimal CTA, almost soft; "if you're like me — link below"

### 5. Comparison / "I tried X but only Y worked"

Three or four direct comparisons of products the user tried.

**When to use**: categories with many alternatives (cosmetics, supplements,
cleaning products, hair products).

**Recommended duration**: 30s.

**Outline**:
1. Pain hook (0–4)
2. List of what I tried before (4–14) — three alternatives, ~3s each
3. Reach to the right product (14–18)
4. Why this one (18–26) — specific functional answer, not list
5. CTA (26–30)

### 6. Tutorial / How-to

"How I do X in 3 simple steps."

**When to use**: products that imply a use sequence (makeup, supplements,
cleaning, gadgets, DIY).

**Recommended duration**: 15s for educational short, 30s for 4+ steps.

**Outline**:
1. Promise (0–4) — "How I do X in 30 seconds"
2. Step 1 → Step 2 → Step 3 — each 6–8s, product enters mid-step
3. Outcome (24–28)
4. Short summary (28–30)

### How the script system picks a genre

System should pick genre based on:
- **Product category** (has alternatives → Comparison)
- **Audience age** (younger → Tutorial; 35+ → PAS or Comparison)
- **Product type** (hard product → Comparison; soft product → UGC Review)
- **Story-of-product** (recent change → Mock-confession; older → Tutorial)

Selection logic encoded in `script-system-prompt.ts`.

---

## 3. Hooks — five options per script

Already exists (`hook_options` in V5) — but variety is weak. From the 6
scripts there should be 5 hooks each, each in a **different archetype**
(not 5 variants of the same idea).

The five archetypes:

1. **Direct factual hook** — "do you know what's actually happening in your hair?"
2. **Confession / contrarian** — "I'm embarrassed to tell you this but..."
3. **List / numbered hook** — "three things you didn't know about..."
4. **How-to / tutorial hook** — "how I solved X in 30 seconds"
5. **Sensory / story hook** — "imagine you walk into your living room and..."

The system picks the right hook based on script genre; the four
remaining alternatives go into `hook_alternatives` for future A/B testing.

---

## 4. CTA — subtle, in social-influencer register

The CTA in influencer Hebrew sounds like a personal recommendation, not
a sales pitch.

### Good
- "Link below, I'll write you all" — opens the gateway, "I'll do you a favor"
- "סוף התכל'ס, איפה לקנות?" — frame self-question
- "תגידו לי בתגובות אם אתם רוצות שאעשה גם וידאו על זה" — community engagement
- "זה לא עובד. תנסי, תכתבי לי, נדבר על זה" — honest, friend
- "אם הגעתם עד פה אתם בטח צריכים את זה" — bridge from end to product

### Bad
- "הזמינו עכשיו לפני שיגמר!"
- "מבצע מטורף — רק היום!"
- "השאירו פרטים בקישור למידע נוסף"

### Tone
CTA should be 4–6 seconds long, no more than two sentences. Not the
hardest part of the script.

### Placement
Last beat of the script. NEVER mid-flow. Never "by the way, if you want..."

---

## 5. Script structure — how scenes break

### 15 seconds
- 3 beats, each 5 seconds
- One narrative break — not three
- 3 sentences, each 12–15 words
- Genres: Listicle (3 beats), simple Tutorial, short UGC Review

### 30 seconds
- 5–7 beats, average 4–6 seconds
- 2–3 narrative breaks (which become creative stops — not all the same)
- 6–8 sentences
- Genres: PAS, Day-in-the-Life, Comparison, longer Tutorial

### Scene break (drives frame split)
- 15 seconds → 4–5 scenes (0–3, 3–7, 7–11, 11–15)
- 30 seconds → 6–8 scenes

The script can pick how many scenes it wants, but they must vary.
A scene is a 1-frame piece on a wall, sofa, action — not the same room
(strict request, frame on the same person). Fewer scenes → cleaner edit;
more scenes → tighter cut.

Default starting points:
- 15s → 5 scenes
- 30s → 7 scenes

---

## 6. Israeli realism — how the script binds to the frame

The script is the place where Israeli authenticity happens. If the
script-writer doesn't decide on settings — image generation defaults
to "all of Israel" generic.

### New required field per Scene: `israeli_setting_cue`

Example (nests under `scene.environment_metadata`):

```json
{
  "israeli_setting_cue": "kitchen_with_morning_light",
  "props_in_frame": ["kettle", "tnuva_cottage_cheese_tub", "ceramic_mug"],
  "outside_window_visible": true,
  "outside_window_content": "tel_aviv_apartment_balconies"
}
```

The system should pick the cue that matches the specific beat in the
script — not "all of Israel" for each scene.

### Eight-cue starter library (system-prompt curated subset)

1. `kitchen_with_morning_light` — kitchen, morning daylight, simple
   countertop (not minimalist), ceramic mug, fridge with magnets,
   poster/list on the wall
2. `bathroom_morning_routine` — small mirror, cabinet inside,
   chrome fixtures, towel hanging on the rail, modest lighting
3. `bedroom_evening` — unmade bed, half-rolled trissim, bedside warm
   lamp, soft after-light, open shutter
4. `living_room_couch` — fabric couch, low coffee table, TV on the
   wall, magazines on the floor, plant in the corner
5. `tel_aviv_street_evening` — narrow street, parked compact cars,
   Hebrew shop signs, building entrance behind with code keypad
6. `supermarket_aisle` — Shufersal aisle, Hebrew shelf headers, Tnuva
   products on shelf
7. `gym_modern` — natural light through LED strips, black rubber
   floor, mirrors on one wall, water bottles in background
8. `outdoor_park_afternoon` — grass, palm trees, simple bench, ficus
   in background, warm afternoon-golden-hour light

The system can mix cues across the script (kitchen scene, bathroom
scene, living-room scene) — this is the structural way for
Day-in-the-Life. The eight cues are the curated subset that PR1's atomic
cue namespace (in `israeli-realism-rules.ts`) resolves to via SCENE_PRESETS.

### How the system decides which to pick

Inputs: `productCategory`, `targetAudience`, `genre` (one of 6), and
the specific scene-beat (opening / middle / closing).

Heuristics (in the system prompt):
- `genre=Tutorial` + `category=skincare` → opens with `bathroom_morning_routine`
- `genre=Day-in-the-Life` → mix across 3–4 cues
- `genre=PAS` → pain/problem opening scene, simple solution scene (the
  goal isn't to suggest "solution" — that's the implicit creative)

---

## 7. Voice & persona — how the system picks voice

The system already chooses from 30 voices in `apps/web/lib/voice/voice-presets.ts`.
Currently it picks one voice (default position 3) but the variety is weak. Suggestion:

### Voice choice should be determined by:
1. **Script age** (20–28 → young, 28–40 → mid, 40+ → mature)
2. **Script gender** (male / female — based on grammatical gender)
3. **Script tone** (energetic / soft / serious / curious)
4. **Genre** (PAS → curious-pain; UGC Review → casual-warm; Tutorial →
   clear-mature; Day-in-the-Life → soft)

The system should select a voiceProfile from these 8 archetypes:
- `young_female_warm`, `young_female_energetic`
- `young_male_warm`, `young_male_energetic`
- `mature_female_authoritative`, `mature_female_intimate`
- `mature_male_authoritative`, `mature_male_intimate`

The current code (`lib/voice/voice-presets.ts`) maps each of the 3 chosen
ElevenLabs voices to one of the 30. The system uses the mapping table.

---

## 8. Quality score — 12 axes the system must score

The quality_score now in V5 (12 axes) exists but isn't structurally
relating to actual decisions. Suggestion for V6:

### Working axes (range 0.0–1.0)

1. **hebrew_register_authenticity** — does the Hebrew sound authentic-influencer?
2. **hook_strength** — do the first 3 seconds stop a scrolling feed?
3. **genre_clarity** — is the genre clear (or a mix between)?
4. **persona_voice_match** — does the voice match the script?
5. **cta_subtlety** — does the CTA not sound like an ad?
6. **product_integration** — is the product woven, not bolted?
7. **scene_variation** — are the scenes varied enough (not 5x same)?
8. **israeli_authenticity** — does the realism wrap the Israeli context tightly?
9. **emotional_arc** — is there a real arc (not just info dump)?
10. **pacing_30s_or_15s** — is the rhythm right for the duration?
11. **scroll_stopping_moment** — is there at least one stand-out moment?
12. **production_feasibility** — is it possible to produce on the
    image-pipeline of today (not requiring something that's hard to add)?

A mean below 7.5/10 — desire automatic regen of the 2 weakest axes
(if there's still selective regen in scope).

---

## 9. Layout of the new script-system-prompt

The file `packages/prompts/src/script-system-prompt.ts` should hold the
structure (V6):

```
1. Identity & mandate
   "You are a senior Israeli creative director and social-first
    copywriter. You write Hebrew UGC ads for Israeli social platforms
    (Instagram Reels, TikTok, YouTube Shorts). You write like a
    real Israeli influencer talks — casual, intimate, direct."

2. Hard constraints
   - Hebrew only in narration / captions
   - English only in image_prompt fields
   - Aspect ratio 9:16 vertical
   - Duration 15s OR 30s, exactly
   - Per-scene metadata required (cameraFocus, primarySubject,
     mustShowProduct, israeli_setting_cue, etc.)

3. Genre matrix (the 6 genres above + when to use each)

4. Hebrew register guide (DO/DON'T)

5. Hook generation rules (5 distinct hooks per script)

6. CTA rules (subtle, not pushy, 4–6s)

7. Pacing rules (15s vs 30s structure)

8. Israeli setting cues (the 8 cues above)

9. Voice profile selection logic

10. Quality score axes (the 12 above)

11. Output schema reference
    (link to script-json-schema.ts)
```

---

## 10. Sample script (good — high-bar)

A demonstration of what the system should output for an example product:

```
Genre: Mock-confession + UGC Review
Duration: 30s
Persona: Female, 28, Tel Aviv, works in marketing
Product: A facial cleansing oil
Voice profile: young_female_warm

Scene 1 (0-4s):
  setting: bathroom_morning_routine
  cameraFocus: closeup_face
  hebrew: "אני עכשיו ממש בושה, אני קצת מתוודה שכל..."

Scene 2 (4-9s):
  setting: bathroom_morning_routine (same room, different angle)
  cameraFocus: closeup_face
  hebrew: "ניסיתי כל קלינס-משהו שקיים בכאילו ביקום. שום דבר עבד לי."

Scene 3 (9-13s):
  setting: bathroom_morning_routine (cabinet open, products)
  cameraFocus: hands_only
  hebrew: "סבון יקר, מסכי טין, תרסיס שבירה ביבש לי..."

Scene 4 (13-19s):
  setting: bathroom_morning_routine (mirror selfie)
  cameraFocus: selfie_in_mirror
  hebrew: "ואז ניסיתי את ה-DDD הזה, האקסי, אני לא מאמינה כמה פשט לי"

Scene 5 (19-24s):
  setting: bathroom_morning_routine (rinsing)
  cameraFocus: hands_only + product_demo
  hebrew: "אני שם הומר, מורידה מים — נשאר שמן השני נכשל מהמראה"

Scene 6 (24-28s):
  setting: bedroom_evening (different time, after-effect)
  cameraFocus: closeup_face
  hebrew: "מאז קלין, שמן נקי, נקיה שלי"

Scene 7 (28-30s):
  setting: bedroom_evening
  cameraFocus: medium_shot
  hebrew: "לינק למטה, תיכנסי תספרי לי."

Quality score:
  hebrew_register_authenticity: 0.92
  hook_strength: 0.88
  genre_clarity: 0.95
  persona_voice_match: 0.90
  cta_subtlety: 0.85
  product_integration: 0.90
  scene_variation: 0.78  → so-so, more scene variation needed
  israeli_authenticity: 0.88
  emotional_arc: 0.92
  pacing_30s: 0.90
  scroll_stopping_moment: 0.82
  production_feasibility: 0.95
  --- average: 0.89 ---
```

This is high-bar. Any script crossing 0.85 average — production-ready.
