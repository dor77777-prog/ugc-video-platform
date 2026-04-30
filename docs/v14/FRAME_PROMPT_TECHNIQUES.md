# FRAME_PROMPT_TECHNIQUES.md

Distilled techniques for problematic frame types in tachles UGC ad
generation. Drawn from the awesome-gpt-image-2 community prompt guide
(`general_prompt_guide.md`) and from production failure cases observed
during V11–V13.

These are reusable building blocks the Image Brief Builder
(`apps/web/lib/image-briefs/image-brief-builder.ts`) and the prompt
wrapper (`packages/prompts/src/scene-image-prompts.ts`) can compose
into the final English image prompt depending on the scene's `cameraFocus`,
`primarySubject`, `mustShowProduct`, and any of the PR2 risk flags
(`mirrorRisk`, `handsPhysicsRequired`, `contactProofRequired`).

Each section below answers: **what is the failure mode**, **what
technique fixes it**, and **what the snippet looks like** as a copy-able
fragment.

---

## 1. Mirror selfie / "the avatar holds the phone in front of a mirror"

### Failure modes observed

1. The model produces a person facing the camera holding a phone, with
   no mirror present at all — it ignores the mirror.
2. The model produces a mirror but the reflection is geometrically
   wrong (left-right flipped phone, two people, ghosting).
3. The model puts the avatar's face in full view AND a phone in their
   hands AND a "mirror" — but the face is rendered from a non-mirror
   angle, giving a Magritte-like impossible scene.
4. The phone screen shows "the same shot we are taking" recursively.

### Technique that works (from the gym mirror selfie reference)

The rendering principle: **the phone should cover most of the face**.
This single constraint resolves most failure modes — the model doesn't
have to render a coherent face-from-the-mirror perspective if the face
is partially hidden by the phone.

The other key: describe the scene from the **first-person camera
perspective** ("a smartphone gym mirror selfie of a fit young
woman..."), not as an external observer. This anchors the model in
the right rendering register.

### Reusable snippet — `mirror_selfie_snippet`

```
A hyper-realistic smartphone mirror selfie. The {SUBJECT_DESCRIPTION}
stands {DISTANCE_FROM_MIRROR} from a large {MIRROR_DESCRIPTION},
holding a vertical smartphone with both hands at chest height. The
phone is the photo source — its back faces the mirror and the camera
lens is visible. The phone covers the lower half of the {SUBJECT}'s
face from nose down. Only the eyes, forehead, and hair are visible
above the phone. The mirror shows a slightly imperfect reflection with
realistic smudges and fingerprints. The {SUBJECT}'s reflection is what
we see in the frame — there is no second person, no ghosted second
reflection, no recursive screen content.
```

Variables:
- `{SUBJECT_DESCRIPTION}` — populated from avatar metadata
- `{DISTANCE_FROM_MIRROR}` — "1 meter", "an arm's length", etc.
- `{MIRROR_DESCRIPTION}` — "wall-mounted bathroom mirror", "full-length
  bedroom mirror leaning against a wall", "elevator mirror", etc.

### Negative-prompt additions for mirror scenes

```
NOT two people, NOT recursive reflection (the phone screen showing the
same scene), NOT a fully-visible face above an arm holding a phone in
the air, NOT broken mirror geometry, NOT ghosted secondary reflection,
NOT mismatched outfit between subject and reflection, NOT phone
floating without hands holding it.
```

### Trigger condition

Activate `mirror_selfie_snippet` when ANY of:
- `cameraFocus === "selfie_in_mirror"` (new enum value to add)
- `scene.environment` mentions "mirror" or "מראה"
- `scene_brief.props` includes "mirror"
- The script mentions a beat where the avatar checks themselves in a
  mirror (gym, bathroom, getting-ready scene)

---

## 2. Selfie (no mirror) — front-facing phone shot

### Failure modes observed

1. The "selfie" comes out as a third-person portrait — wrong
   perspective, looks like someone else is taking the photo.
2. The arm holding the phone is oddly shaped, broken, three-fingered,
   or detached.
3. The phone itself is oversized, weirdly-proportioned, or doesn't
   look like a smartphone.

### Technique that works

Three explicit constraints:
1. State the **camera-on-phone** perspective: "shot on a smartphone
   front-facing camera held at arm's length."
2. State the **arm visibility**: "her right arm is partially visible at
   the bottom-right of the frame, holding a vertical smartphone."
3. State the **slight wide-angle distortion**: "subtle wide-angle
   selfie-camera lens distortion — the nose appears slightly larger,
   the background slightly stretched at the edges."

### Reusable snippet — `selfie_handheld_snippet`

```
A {SUBJECT_DESCRIPTION} taking a vertical selfie with their smartphone,
shot on the phone's front-facing camera held at approximately
arm's length and slightly above eye level. The {GENDER}'s {HAND}
holding the phone is partially visible at the bottom-{LEFT_OR_RIGHT}
of the frame, with five clearly defined fingers gripping the side of
the phone. The phone is a modern vertical smartphone with a thin black
bezel. Subtle selfie-camera wide-angle distortion: the nose is slightly
larger, the background subtly stretched. Natural daylight from one side,
soft warm bounce on the face. {SUBJECT_DESCRIPTION}'s face fills the
upper-center of the frame, expression: {EXPRESSION}.
```

### Negative-prompt additions

```
NOT a third-person portrait, NOT a fully-detached arm, NOT a six-fingered
or three-fingered hand, NOT a comically oversized phone, NOT a
professional studio look (this is a casual selfie).
```

---

## 3. Holding a product in the hand

### Failure modes observed (this is the biggest category)

1. **Wrong number of fingers** — six fingers, three fingers, fingers
   merged.
2. **Product floating** — the hand is open, the product is hovering, no
   contact point.
3. **Hand passing through product** — fingers visibly pass through the
   side of the product as if both are ghostly.
4. **Product label warped** — important brand text on the label is
   garbled / misspelled / has melted glyphs.
5. **Wrong scale** — product is oversized vs. the hand (bottle the size
   of a small cat) or undersized.
6. **Product visually merged with another object** — the bottle blends
   with the table edge or the wall behind.
7. **Two-hand awkwardness** — when the script implies one hand should
   hold the product, the model adds a second hand for "safety", giving
   a clutched-with-two-hands look that reads as anxious / promotional.

### Technique that works (combination)

a. **Anatomical fingers spec** — "five clearly defined fingers wrapped
around the {PRODUCT}, thumb on the front-facing label side, four
fingers behind, slight downward grip — the natural way a person picks
up a {PRODUCT_CATEGORY}."

b. **Contact points spec** — "the thumb and forefinger pads visibly
indent slightly against the {SURFACE_MATERIAL} of the product. The
remaining three fingers wrap around the back of the product."

c. **Scale spec** — "the {PRODUCT} is approximately {DIMENSION} tall,
fitting in the hand from the base of the palm to roughly mid-finger."
Use real product dimensions from `product-intelligence` dossier.

d. **Label fidelity is OFF-LIMITED** — accept that the model cannot
faithfully render small product label text. Prefer angles where the
label is **partially turned away** or **the camera focus is on the
hand and product silhouette, not on the label glyphs**. This is
critical: **the brief should NEVER ask the model to render specific
brand text on the label**. The PRODUCT REFERENCE LOCK paragraph already
does the right thing — it asks for "same shape, same color, same
proportions, same applicator design, same label PLACEMENT" without
demanding the actual readable brand text.

e. **One-hand vs two-hand explicit** — always specify exactly one of:
  - "held in the right hand only"
  - "held in the left hand only"
  - "held with both hands, fingers interlaced around the bottle"
  - "the right hand holds the product; the left hand is out of frame"

### Reusable snippet — `product_hand_hold_snippet`

```
{SUBJECT}'s {DOMINANT_HAND} hand holds the {PRODUCT_NAME}, a
{PRODUCT_HEIGHT_CM} cm {PRODUCT_FORM} ({PRODUCT_COLOR},
{PRODUCT_MATERIAL_FINISH}). Five clearly defined fingers grip the
product: thumb on the {LABEL_SIDE}-facing surface, four fingers
wrapped around the back. Visible contact between fingertips and
product surface, with the thumb pad slightly compressed against the
label area. The product is approximately the size of a {SCALE_REFERENCE}
in the hand. The label is {LABEL_PLACEMENT_SPEC}, but no specific brand
text is required to be readable in this frame. {SECOND_HAND_DISPOSITION}.
```

Variables, populated from `productIntelligence.dossier`:
- `{PRODUCT_HEIGHT_CM}` — the actual product height
- `{PRODUCT_FORM}` — bottle, tube, jar, sachet, box, can, etc.
- `{PRODUCT_COLOR}`, `{PRODUCT_MATERIAL_FINISH}` — from visual analysis
- `{LABEL_SIDE}` — "front", "left side"
- `{SCALE_REFERENCE}` — "smartphone", "deck of cards", "small bottle of
  water"
- `{SECOND_HAND_DISPOSITION}` — "the other hand is out of frame", "the
  other hand rests on the kitchen counter beside it", etc.

### Negative-prompt additions

```
NOT six fingers, NOT three fingers, NOT melted/merged fingers, NOT
floating product without visible hand contact, NOT product label with
garbled text, NOT brand-misspelled label, NOT oversized hand or
oversized product, NOT a phantom second hand.
```

### Trigger condition

Activate `product_hand_hold_snippet` when:
- `mustShowProduct === true` AND
- `cameraFocus` IS in `["hands_only", "closeup_product", "product_demo"]`

This subsumes most of `buildContactProofRule`'s territory but is more
focused — `buildContactProofRule` answers the activation/usage
questions; this snippet answers the hand-mechanics questions.

---

## 4. Reflections (windows, glass surfaces, screens)

### Failure modes observed

1. The reflection in a window or screen shows something that does not
   match the inferred environment ("a window in a Tel Aviv apartment
   reflecting the Manhattan skyline").
2. The reflection is geometrically incorrect (subject is on the right
   but reflection appears on the left edge of the window).
3. Phone screens show generic "Lorem ipsum" or warped UI text.

### Technique that works

For most ad scenes, the simpler answer is **don't ask for a reflection
unless it serves the story**. If a window is in frame, the brief should
specify "soft daylight through the window, reflection on the glass is
indistinct and bright" rather than describing what's reflected.

For phone screens specifically: ask for "a generic vertical chat or
home-screen UI with abstract widget shapes, no readable text" rather
than trying to control the on-screen content. The model can't reliably
render Hebrew UI text in 2026, and even abstract content reads better
than failed Hebrew letterforms.

### Reusable snippet — `safe_reflection_snippet`

```
{REFLECTIVE_SURFACE} in the {LOCATION} of the frame: the reflection is
intentionally indistinct — soft warm daylight bouncing off the surface,
no recognizable second scene rendered. Phone screen visible in the
frame is dim and shows abstract pastel UI shapes with no readable text.
```

### Negative-prompt additions

```
NOT a recognizable reflected scene that contradicts the setting, NOT
on-screen text in any language, NOT readable Hebrew or English on
screens, NOT mismatched reflection geometry.
```

---

## 5. Avatar consistency — keeping the same face across frames

### Why this matters

A 30-second tachles ad has 5–7 scenes. If the avatar's face drifts
across frames, the ad feels like a slideshow of different people and
the brand recall collapses. This is the single most important quality
metric for a coherent UGC ad — viewers tolerate uneven lighting and
imperfect product shots, but they will NOT tolerate a face that
changes mid-ad.

### What we have today

The current pipeline picks ONE avatar from the 25-portrait catalog
(`apps/web/lib/avatars/catalog.ts`) and references its description in
each scene prompt. Image generation does NOT pass the avatar PNG to
gpt-image-2 as a reference image — it passes a textual description.

### Why textual descriptions drift

The "same description" rendered across 5 different scene contexts
generates 5 subtly different faces. The model interprets "young
brunette woman, mid-20s, Mediterranean features, warm smile" slightly
differently depending on the scene's lighting, camera angle, and
surrounding context. Across 5 frames the cumulative drift is
significant.

### Proven techniques (in order of effectiveness)

#### (a) Lock the same vocabulary EXACTLY across all frames

The avatar description block in every scene prompt should be **byte-
identical**. If scene 1 says "natural-looking 27-year-old woman with
shoulder-length wavy dark brown hair, light olive skin, warm brown eyes,
small silver hoop earrings, no makeup", every other scene MUST use that
exact phrase. No substitutions. No "shoulder-length" becoming "mid-length"
in scene 3.

The Image Brief Builder should pull the avatar description from a single
source (the catalog) and embed it verbatim. The prompt wrapper
already does this; verify there is zero per-scene mutation.

#### (b) Anchor with a "consistent across frames" instruction

Add to every scene prompt: "The subject is the same person across all
frames in this ad series — preserve identical facial features (eye
shape, nose shape, jawline, eyebrow shape), identical hair length and
color, identical skin tone, identical earrings/jewelry. Treat the
avatar reference as a strict anchor."

#### (c) Where possible, reuse the actual catalog PNG as a reference

If `gpt-image-2` accepts an `image[]` reference parameter (it does, via
the responses-with-image API), the brief builder should pass the
avatar's portrait PNG as a reference image in addition to the textual
description. Verify whether the current code does this; if not, this
is the single highest-ROI consistency upgrade available.

#### (d) Limit the avatar's pose variation per ad

A 5-scene ad with 5 wildly different poses (full-body in scene 1,
extreme close-up in scene 2, side profile in scene 3, etc.) gives the
model 5 chances to drift. A 5-scene ad with 4 medium-shot poses + 1
close-up keeps the face anchored.

The Animation Plan + Scene Plan should bias toward consistency by
selecting compatible camera-focus values across scenes.

#### (e) Outfit consistency

The avatar's outfit should be the same across all frames within a
single ad. The Image Brief Builder should pick the outfit ONCE per
project and lock it across scenes — same shirt, same pants/skirt,
same shoes, same jewelry. Drifting outfits are a distraction even
when the face is consistent.

Add a project-level field or compute on first scene generation:
`Project.productData.lockedOutfit` = the chosen outfit description.

### Reusable snippet — `consistency_anchor_snippet`

```
This frame is part of a {N}-scene UGC ad series. The subject is the
SAME PERSON across all frames in this series. Preserve identical
features: {AVATAR_DESCRIPTION_LOCKED}. The subject is wearing
{OUTFIT_DESCRIPTION_LOCKED} (identical across all scenes in this ad).
Hair, jewelry, and skin tone must match the avatar reference exactly.
```

### Negative-prompt additions

```
NOT a different person from the previous scene, NOT a different
hairstyle, NOT a different age, NOT a different ethnicity from the
avatar reference, NOT mismatched eye color, NOT mismatched outfit.
```

---

## 6. Creativity vs. consistency: how to break out of generic frames

### The failure mode

Even when frames are technically clean, the ad as a whole can read as
"generic AI Pinterest". Six scenes all in the same kitchen, all at the
same camera distance, all in the same warm-Pinterest light — viewers'
eyes glaze over.

### What "creative" means in this context

Creative does NOT mean surreal, abstract, or stylized. For UGC ads,
creative means **varied within the believability envelope**. The
viewer should never doubt that this is a real moment from a real
person's day — but each scene should feel like a different real moment.

### Concrete creativity levers (in order of safety)

1. **Vary camera framing across scenes** — extreme close-up,
   medium-shot, over-the-shoulder, low-angle from waist height, hand-only
   product close-up. The Animation Plan already supports this.
2. **Vary location within the same persona's life** — kitchen, bathroom,
   bedroom, living-room couch, car, supermarket aisle, gym, outside the
   building entrance, balcony, café. Pick 5–7 locations from the
   persona's plausible day for a 30-sec ad.
3. **Vary time of day** — morning daylight, midday harsh, golden hour,
   evening warm interior light. Three different times of day across an
   ad implies a "day-in-the-life" structure even if the script doesn't
   spell it out.
4. **Vary the subject's emotional register** — frustrated → curious →
   engaged → satisfied → confident. Map to the script's narrative arc.
5. **Vary the supporting cast** — solo, with a friend, with a partner,
   with a kid, on a video call. A solo-only ad reads more lonely than
   a brand wants.
6. **Insert ONE "scroll-stopping" frame** per ad — an unusual angle, an
   unexpected location, a striking color contrast. Not every frame, just
   one. This gives the ad a memorable beat.

### How the brief builder should choose

The script's V5 strategy already encodes pacing and emotional arc. The
brief builder should:
- Enforce variation by tracking what was used in previous scenes (camera
  focus, environment_type, time_of_day) and biasing toward unused values.
- Promote ONE scene to "scroll-stopper" status based on script metadata
  (typically the hook scene at index 0 or the punchline near the end).

This is implementable as a `SceneVariationLedger` per project that the
Image Brief Builder consults before locking each scene's brief.

---

## 7. Combining these snippets — composition order

The English image prompt for a scene is assembled in this order (the
existing builder already establishes this; this section just makes the
slot order explicit):

```
1. Shot type / camera perspective
   (e.g. "A vertical 9:16 photoreal smartphone snapshot...")
2. Subject — avatar description (LOCKED across frames)
   (consistency_anchor_snippet)
3. Outfit — outfit description (LOCKED across frames)
4. Action / pose
   (per-scene, from script + Animation Plan)
5. Product (if mustShowProduct)
   (product_hand_hold_snippet OR product reference lock)
   (PRODUCT REFERENCE LOCK paragraph from PR2.3)
6. Camera / lens / framing details
   (selfie_handheld_snippet OR mirror_selfie_snippet OR none)
7. Environment + Israeli realism cues
   (from ISRAELI_VISUAL_REALISM.md, picked per-scene)
8. Lighting + time of day
9. Style / register
   (e.g. "casual UGC TikTok aesthetic, hand-held look, natural realism")
10. Negative constraints (combined from all above)
```

The composition is deterministic — same inputs → same prompt. No LLM
in this path. This is what V13 PR2 set up; the new techniques in this
file extend it.

---

## 8. Rules of thumb — what to ALWAYS, NEVER, OFTEN

### ALWAYS

- Specify exact integer counts for in-frame items ("exactly 3 background
  diners", "exactly 1 mug on the counter")
- Lock the avatar description and outfit byte-identical across scenes
- Include both positive (Israeli detail) and negative (US default)
  anchors for environment cues
- Pin one or two distinctive details per scene (a specific cup, a
  specific shoe, a specific window detail) so the eye has somewhere to
  rest
- For 9:16 vertical, state the aspect ratio in the prompt explicitly

### NEVER

- Ask the model to render specific Hebrew text in the image (we burn
  captions later)
- Ask the model to render readable brand text on a product label
- Ask for a recursive reflection (mirror-in-mirror, screen-showing-the-
  same-shot)
- Compose a scene that requires the model to invent a coherent face
  through-the-mirror geometry — use the "phone covers most of the face"
  technique instead
- Use the word "perfect" — gpt-image-2 over-corrects toward generic
  beauty-ad gloss when "perfect" appears in the prompt

### OFTEN (i.e. defaults that work but can be relaxed if the script
demands)

- Natural daylight from a window
- Casual home interior at slightly-below-eye level
- Mid-shot framing (waist-up)
- Subject looking at the camera or at the product, not at infinity
- Single subject, no supporting cast in the same frame, unless the
  script specifically pulls in a partner / friend / child
