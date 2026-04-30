# ISRAELI_VISUAL_REALISM.md

Canonical visual reference for Israeli authenticity in tachles UGC ad
frames. Used by `apps/web/lib/scene-planning/israeli-realism-rules.ts`
and downstream prompt builders.

This file is the **source of truth for what "Israeli" looks like** in a
frame. When in doubt, the brief builder must (a) pick the most
context-appropriate cue from this file, (b) describe it explicitly in
the English image prompt, and (c) include the corresponding
"American/European default" item in `mustAvoid` / `negativeConstraints`.

The image model has a strong American suburban prior. Israeli context is
not the default — it has to be aggressively specified or the model will
silently fall back to a Pinterest US kitchen with a Tesla in the driveway.

> NOTE on encoding: this file was provided to the V14 PR1 author with
> some Hebrew terms in mojibake form (UTF-8 bytes that were re-decoded
> as Latin-1 somewhere upstream). The English content is authoritative.
> If you have a clean UTF-8 copy of the original, replace this file
> verbatim — the V14 cue library does not depend on the Hebrew terms
> here, only on the English structure.

---

## How this file is used

For every scene, the brief builder picks 0–N cues across the categories
below depending on the scene's setting (`environment_type` from the
script's V5 strategy), the product, and the persona.

- Pick **at least one** environment-anchoring cue per scene that has any
  visible interior/exterior wall or street.
- Pick a **persona-appropriate vehicle** ONLY if a vehicle is in frame.
- Default the **electrical sockets / switches** rule for any kitchen,
  bathroom, bedroom, or living room scene where they would naturally be
  in frame at the chosen camera angle.
- Add an **architecture cue** (tromba / shutters / Jerusalem stone /
  red-tile roof) if the scene is "outside the home" or a window is
  prominent.
- Skip the cues that don't fit (a ramen-bar scene doesn't need a
  mezuzah). The goal is plausibility, not maximalism.

For each picked cue, also write the matching American-default into
`mustAvoid` / negative prompt. **Specifying what NOT to include is as
important as what to include** — the model needs both the positive
anchor (the Israeli detail) and the negative anchor (the American
default it would otherwise auto-fill).

---

## 1. Electrical sockets, switches, plugs

The single most distinctive Israeli interior detail.

| Specify | Avoid (mustAvoid) |
|---|---|
| Israeli Type H electrical socket: white square wall plate, three angled rectangular slot pattern (two diagonal slots top + one bottom forming a triangle), sometimes with built-in switch on the right | NOT US/Type B (two parallel vertical slots + round ground), NOT EU/Type F Schuko (two round holes + side ground clips), NOT UK/Type G (three large rectangular pins), NOT Type C "Europlug" |
| Israeli wall light switch: white square plastic plate, single wide rocker, slight tactile click, often paired with a small status LED dot | NOT US toggle switches (small flick lever), NOT UK dolly switches |
| Power strips visible in frame should be the white-bodied Israeli style with Type H sockets, often with a red lit toggle switch on the end | — |

Camera angles where this matters: any waist-down or table-top shot
showing a wall outlet, any kitchen counter shot near the splashback,
any bedside-table shot.

---

## 2. Architecture & exterior cues

| Cue | When to specify |
|---|---|
| **Trombah / סורגים (window grills)** — black or white painted wrought iron security grills on apartment windows, geometric or simple grid pattern, very common on ground and 1st-floor flats | Any exterior shot of a residential building, any shot looking through a window from outside |
| **Trissim / תריסים (Israeli rolling shutters)** — exterior rolling shutters in white plastic or aluminum, horizontal slats, with a strap inside the apartment for raising/lowering. Half-rolled position is the most "Israeli" tell | Any window in a bedroom, living room, or balcony scene |
| **Solar water heater (דוד שמש)** — white or silver cylindrical horizontal tank + flat blue solar panel on the roof | Any rooftop shot, any shot of an Israeli apartment building exterior |
| **Mirpeset (מרפסת) — Israeli balcony** — narrow concrete balcony with metal railing, often with laundry on a folding rack, sometimes with a few potted plants and an air-con compressor unit | Any "outside in the apartment" or balcony scene |
| **Jerusalem stone facade** — pale cream/beige limestone block facade, very specific to Jerusalem and surrounding cities | Only when explicitly Jerusalem |
| **White stucco + red-tile roof** | Suburban single-family Israeli houses (kfar, moshav, yishuv) |
| **Tel Aviv Bauhaus / "White City"** — clean rounded white facades, ribbon windows, small balconies | Tel Aviv exterior establishing shots |
| **Mezuzah** — small decorative case (ceramic, metal, wood) mounted at an angle on the right doorpost at upper-third height | Any doorway shot in a Jewish home; obvious tell |

Avoid: American shingled roofs, brick exterior walls, white picket
fences, two-car garages, attached basement windows.

---

## 3. Streets, signage, public space

| Cue | Notes |
|---|---|
| **Hebrew signage** | Shop signs, street signs, supermarket aisle signs, billboards — always in Hebrew. If English appears, it's underneath, smaller, secondary. Right-to-left Hebrew typesetting is the tell. |
| **Israeli license plates** | Yellow rectangular plate, black border, 7-8 digit number with hyphens. Format `12-345-67` or `123-45-678`. Both front and rear plates yellow. |
| **Public bus** | Egged green-and-white or Dan red-and-white livery. Modern Mercedes / MAN / Volvo bus chassis. |
| **Taxi** | White sedan with a yellow roof sign reading "מונית" (TAXI), Israeli yellow plates. |
| **Street layout** | Narrow streets with parallel parking on both sides, frequent pedestrian crossings, kikar (roundabout) instead of 4-way stop. Trees: ficus, palm, jacaranda. |
| **Apartment building entrance** | Steel grille door with code keypad, name list panel, mailboxes inside the lobby (not curbside US-style mailboxes — those don't exist here). |
| **Trash bins on the street** | Green or brown wheelie bins (not the silver ones from the US), often clustered behind small concrete dividers. |

Avoid: yellow school buses, US-style mailboxes on a post, fire hydrants
in red (Israeli ones are usually grey or pale yellow, smaller, often
flush-mounted), American stop signs (Israel uses an inverted triangle
"give way" sign at most intersections + roundabouts), American 911
signage.

---

## 4. Vehicles by Israeli persona

The image model defaults to "Tesla Model 3 in a suburban driveway" if
unspecified. Override aggressively.

| Persona | Likely car (specify by class, not always brand) |
|---|---|
| Young single in Tel Aviv | Hyundai i10/i20, Kia Picanto, Toyota Yaris — small hatchback, often white or silver, parked tightly on a narrow street |
| Young family, suburban | Hyundai Tucson, Kia Sportage, Mazda CX-5, Toyota RAV4 — compact crossover, white or grey |
| Brand-new family / aspirational | Tesla Model 3 / Y, Polestar 2, BYD Atto 3 (EVs are surging in Israel), white or red |
| Established family / chag travel | Toyota Corolla, Hyundai i35, Skoda Octavia — sedan or wagon, silver/grey |
| Older / national-religious / settler | Older Skoda Octavia, Mitsubishi Outlander, sometimes a Land Rover Defender / Jeep variant if the persona is more outdoorsy |
| Younger / hipster / Tel Aviv | More likely on a Mobike-style rented electric bike, an electric scooter (קורקינט), or even a Wolt delivery scooter (yellow/black box on the back) |
| Delivery worker | Yellow Wolt thermal box on the back of a small scooter; Cibus blue-and-white not common |

Avoid: pickup trucks (rare in Israel outside agricultural use), full-size
American SUVs (Suburban, Tahoe, Expedition — practically nonexistent),
muscle cars, Dodge/Chrysler/Buick/Cadillac of any kind.

License plates ALWAYS yellow, in the rectangular Israeli format. This
is the single most reliable "is this car in Israel" tell. If a car is
visible at all, the plate must be yellow.

---

## 5. Supermarkets, convenience stores, grocery brands

| Cue | Notes |
|---|---|
| **Supermarket chain** | Shufersal (purple/pink branding), Rami Levy (red branding, no-frills "warehouse" feel), Yochananof (orange/green, mid-tier), Victory (blue), Tiv Taam (yellow, sells pork — secular only), Osher Ad (haredi-coded) |
| **Aisle signage** | Hebrew with arrows, often with the kosher certification (כשרות) symbol from the local Rabbinate. |
| **Carts** | Standard chrome wire carts, often with an attached child seat. NOT the giant US plastic carts. |
| **Local brands on shelves** | Tnuva (dairy — most ubiquitous brand in any kitchen scene), Tara (dairy), Strauss (chocolate, ice cream), Osem (instant noodles, soups, snacks — Bamba is the flagship), Elite (Egozi chocolate), Telma (cereals, mayo), Wissotzky (tea), Nescafé Taster's Choice (the dominant instant coffee here, known as "נס") |
| **Bamba** | Orange foil bag with a smiling baby. Practically a national symbol. Goes in any "snacks at home" scene. |
| **Cottage cheese tub** | The square white-and-blue Tnuva tub is iconic. Goes in any breakfast scene. |
| **Bissli** | Green, red, or purple foil bag, varied flavors. Snack pairing with Bamba. |
| **Israeli salad bar at a sandwich shop** | Plastic containers of chopped tomato-cucumber-onion-parsley, hummus, tahini, pickles |

For convenience-store / corner store scenes, AM:PM (Tel Aviv 24h chain,
red branding) and Tiv Ta'am are common; in periphery towns smaller
"מכולת" / "צרכנייה" with handwritten Hebrew signs are more authentic.

---

## 6. Food & drink visual cues

| Cue | Notes |
|---|---|
| **Israeli breakfast** | Sliced cucumber + tomato, white cheese (גבינה לבנה) tub, olives, hard-boiled egg, bread or pita, sometimes tahini. NOT pancakes/bacon/syrup. |
| **Pita** | Round, pocket-style flatbread. Goes with falafel, shawarma, sabich. |
| **Hummus** | Plate-style serving — flat ceramic plate, hummus spread thin, divot in the middle filled with tahini, olive oil, paprika, parsley, sometimes ful or whole chickpeas. NOT the American grocery-store deli tub presentation. |
| **Shawarma** | In a laffa wrap (large thin flatbread) or a pita, with chips inside (yes, fries inside the wrap). |
| **Sabich** | Pita stuffed with fried eggplant, hard-boiled egg, hummus, Israeli salad, tahini, mango sauce (amba). |
| **Coffee** | Two dominant modes. (1) Cafe hafuch (קפה הפוך) — Israeli flat-white-ish in a glass mug at a sit-down cafe. (2) Nescafé instant ("נס") at home in a regular ceramic mug, often with a saucer, often on a small kitchen table or ledge. |
| **Soft drinks** | Coca-Cola in 1.5L plastic bottles is universal. Local: Spring water, RC Cola, Tempo brand drinks, Crystal Light flavored water powders. |
| **Beer** | Goldstar (dark amber, the "default" Israeli beer), Maccabee, Tuborg (Israeli-brewed under license). NOT Bud Light, Coors, Miller, etc. |
| **Wine** | Local — Carmel, Barkan, Recanati. Common at Friday-night dinners. |

---

## 7. Influencer-style frames specifically

This is the production register the system is targeting. Reference
points: Israeli TikTok/Instagram personalities like @noyamarciano,
@nataliyak, @ronisaslove, @yardenbarsade, @yotam_zvian — and the
broader Tel Aviv / Sharon / Jerusalem / periphery influencer cohorts.

Common tells of an Israeli influencer frame, regardless of genre:

- **Phone always visible or implied** — vertical iPhone, often a Magsafe ring grip, sometimes a popsocket, often a clear case with a plain white or pastel back showing through
- **Vertical 9:16 framing** — assumed; the script system already locks aspect ratio
- **Hand-held / unstabilized look** OR locked-off ring-light + tripod look — pick one register per scene
- **Daylight from a window + warm fill from a ring light** — the canonical "indoor influencer" lighting
- **Text overlay typography in Hebrew** is rare in the still frames themselves (we burn captions later); avoid baking Hebrew text INTO the still
- **Outfit register**: oversized tee + bike shorts + scrunchie + chunky sneakers (early-20s Tel Aviv coded), or sweatshirt + leggings + Crocs (mom-coded), or polo + chinos + slim sneakers (men, suburban-coded). Avoid generic "model" looks — Israeli influencers code casual.
- **Skin & beauty register**: natural makeup, Mediterranean tan, often curly or wavy hair, sometimes laser-treated hair-style smoothness. Avoid the "Instagram filter glass-skin" Korean register that the model loves to default to.
- **Mediterranean phenotype mix**: brunette, dark eyes, mid-tone skin is the most common — but include Ashkenazi (lighter), Mizrachi (olive-darker), Ethiopian-Israeli, and Russian-Israeli (very fair, blonde) variation across the catalog. The avatar catalog already has this; just don't override into "white American blonde" by accident.

For scenes where the frame is meant to look like a TikTok talking-head,
specify: "shot from the influencer's hand or a ring-light tripod at
slightly-below-eye-level, vertical 9:16, daylight from one side, ring
light catching the eyes, casual home interior background slightly out
of focus."

---

## 8. Religious / cultural cues, used carefully

These are STRONG signals — don't add them unless the persona/script
implies them, or they'll narrow the audience inappropriately.

| Cue | When to use |
|---|---|
| Mezuzah on the doorpost | Any home interior is a safe inclusion |
| Shabbat candles, challah cover, kiddush cup on the table | Friday-night-dinner / Shabbat-themed scenes only |
| Hanukkiah | Hanukkah-themed scenes |
| Kippa on the man's head | Religious or traditional persona only — modern-Orthodox knit kippa, haredi black velvet, or Bukharan colorful round |
| Tichel / mitpachat | Religious married woman headscarf |
| Sheitel | Haredi Ashkenazi religious married woman wig |

Default scenes are SECULAR (חילוני) coded — that's the majority register
for tachles ad audience and the safest baseline. Don't add religious
cues unless asked. Conversely, don't add overt secular cues that would
alienate religious viewers (e.g. women in revealing clothing in scenes
that don't need it — `scene-safety.ts` already handles this).

---

## 9. Climate, light, season

Default Israeli "ad shooting weather" is bright sun, warm (20–28°C),
low cloud cover, blue sky. This drives a specific look:

- High-contrast outdoor shots, sharp shadows
- Skin tone catches warm yellow tones, never cool blue
- Indoor shots: warm daylight from a window + bounce; magic hour 17:00–18:30
- Avoid: misty mornings, autumn leaves on the ground, heavy snow, dramatic stormy skies — these read distinctly American/European

Coastal scenes (Tel Aviv promenade, Bat Yam, Ashdod, Haifa beach):
fine pale sand, palm trees, Mediterranean blue water, stone-paved
promenade with a low railing, kiosks selling icicles and corn on the cob.

Desert scenes (south, Negev, Mitzpe Ramon, Eilat): orange-pink rock,
sparse acacia trees, very harsh midday light, sometimes a yellow road
sign with a camel symbol.

---

## 10. Negative-prompt master list

When in doubt, EVERY frame should append these to its negative prompt:

```
NOT American suburban, NOT US wall outlets (NEMA 5-15), NOT US street
signs, NOT US license plates, NOT yellow school bus, NOT shingled roof,
NOT brick suburban facade, NOT white picket fence, NOT red US fire
hydrant, NOT US-style curbside mailbox on a post, NOT American football,
NOT pickup truck, NOT full-size SUV, NOT muscle car, NOT generic
international hotel lobby, NOT generic Pinterest kitchen, NOT generic
Korean glass-skin beauty filter, NOT British dolly switch, NOT EU
Schuko socket, NOT UK Type-G socket, NOT non-Hebrew shop signage in the
foreground.
```

The brief builder should trim this list down to the categories actually
relevant to the scene (don't list "NOT yellow school bus" in a kitchen
scene), but err on inclusion.
