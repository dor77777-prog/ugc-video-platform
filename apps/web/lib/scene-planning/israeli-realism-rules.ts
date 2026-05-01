// Israeli realism cue library — V14 PR1.
//
// Replaces the V13 PR2 single-block negative-only emitter with a
// category-organized, paired-positive-and-negative, context-keyed
// cue library. Same module path; the legacy buildIsraeliRealismBlock
// signature lives on as a thin shim so V13 PR2 callers keep working.
// Migrate consumers to chooseIsraeliCues() in PR2; remove the shim
// no later than PR7.
//
// Cue IDs are STABLE — they are the namespace V14 PR5's per-scene
// `israeli_setting_cue` field will reference. Don't rename without
// migrating every consumer + every saved Script.rawJson row.
//
// Deterministic: no LLM, no I/O, no Math.random, no Date.now.
// Same input → byte-identical output, asserted in
// apps/web/scripts/test-v14-pr1.ts.

// ── Public types ────────────────────────────────────────────────────────────

export type PersonaArchetype =
  | 'young_tel_aviv'
  | 'family_suburban'
  | 'mature_traditional'
  | 'aspirational_modern'
  | 'periphery_practical'
  | 'outdoorsy';

export type ReligiousRegister = 'secular' | 'traditional' | 'religious';

export type IsraeliCueCategory =
  | 'sockets_switches'
  | 'architecture'
  | 'streets'
  | 'public_space'
  | 'vehicles'
  | 'brands'
  | 'food'
  | 'influencer'
  | 'religious'
  | 'climate';

export interface IsraeliCue {
  id: string;
  category: IsraeliCueCategory;
  positive: string;
  negative: string;
}

export interface IsraeliScenePreset {
  id: string;
  cueIds: readonly string[];
  description: string;
}

export interface CueContext {
  environmentType?: string | null;
  /** When set + present in SCENE_PRESETS, the preset overrides env-type defaults. */
  scenePresetId?: string | null;
  personaArchetype: PersonaArchetype;
  religiousRegister: ReligiousRegister;
  vehicleInFrame: boolean;
  isExterior: boolean;
  isWindowVisible: boolean;
  productCategory?: string | null;
  /** Talking-head selfie scenes need the influencer-tells (iPhone, ring light). */
  isTalkingHead?: boolean;
}

export interface IsraeliCueSet {
  cues: IsraeliCue[];
  positiveLines: string[];
  /** Per-cue negatives + UNIVERSAL_NEGATIVES, in that order. */
  negativeLines: string[];
  composedInstruction: string;
  scenePresetId?: string;
}

// ── Determinism: fixed category order ───────────────────────────────────────

const CATEGORY_ORDER: readonly IsraeliCueCategory[] = [
  'sockets_switches',
  'architecture',
  'streets',
  'public_space',
  'vehicles',
  'brands',
  'food',
  'influencer',
  'religious',
  'climate',
];

// ── Cue library ─────────────────────────────────────────────────────────────
//
// Every cue ships BOTH positive (Israeli detail to include) and negative
// (paired US/EU default to exclude). The image model has a strong American
// suburban prior — naming both anchors is what shifts it.

export const CUES: Record<string, IsraeliCue> = {
  // sockets_switches ─────────────────────────────────────────────────────────
  // Strategy after V14 hotfix #2: gpt-image-2 cannot reliably render the
  // Israeli SI 32 / Type H pattern even when the prompt describes it
  // correctly — it auto-fills US / UK / EU shapes that look "close enough"
  // to the model but read as foreign to an Israeli viewer. Solution:
  // default to keeping sockets OUT of frame entirely. The default cue
  // `socket.minimize_visibility` instructs the model to crop sockets out
  // or hide them behind props. The detailed `socket.type_h` description is
  // kept available for opt-in scenes that genuinely need a visible socket
  // (e.g. plugging a device in), but it is no longer the env-type default.

  // DEFAULT for kitchen / bathroom / bedroom / living_room / family_home /
  // kids_room / office / neutral_indoor — fail closed by hiding the cue.
  'socket.minimize_visibility': {
    id: 'socket.minimize_visibility',
    category: 'sockets_switches',
    positive:
      'Do NOT show any electrical wall sockets or power outlets in this frame. If the camera angle would naturally include a socket (e.g. behind the kitchen counter, beside the bed, on the bathroom wall), keep it out of frame by tighter cropping, by placing props in front of it (a kettle, a plant, a towel), or by framing the shot to exclude that wall area. Sockets must NOT be visible.',
    negative:
      'NOT a visible wall socket of any standard (US Type B / UK Type G / EU Schuko / Israeli Type H) — the cleanest path is to keep the socket out of frame entirely.',
  },

  // OPT-IN — only fires when a scene specifically needs a socket visible
  // (e.g. plugging a device, charging shot, electrical-product demo).
  // Authoritative spec: real Israeli SI 32 / Type H sockets have THREE
  // ROUND holes (not rectangular slots) arranged in a triangular pattern —
  // two on the upper-left and upper-right, one centered below. Verified
  // against actual Israeli wall fixtures.
  'socket.type_h': {
    id: 'socket.type_h',
    category: 'sockets_switches',
    positive:
      'Israeli Type H wall socket (SI 32): white or ivory plastic faceplate, square or rectangular with rounded corners, slightly raised off the wall. THREE ROUND HOLES arranged in a triangular pattern — two round holes on the upper-left and upper-right, one round hole centered below them. The holes are perfectly circular, dark/black inside (recessed), NOT rectangular slots. The face inside the frame is round or slightly elliptical and recessed.',
    negative:
      'NOT US/Type B outlet (two parallel vertical RECTANGULAR slots + round ground hole), NOT EU/Type F Schuko (two round holes only + side ground clips), NOT UK/Type G (three LARGE RECTANGULAR slots in T-pattern), NOT industrial pin sockets, NOT USB-only outlets, NOT angled rectangular slot patterns of any kind — the Israeli holes are round circles, not slots.',
  },
  'socket.type_h_triple_gang': {
    id: 'socket.type_h_triple_gang',
    category: 'sockets_switches',
    positive:
      'Israeli triple-gang wall socket: three Type H modules side-by-side in a single wide rectangular white plastic faceplate. Each module shows the canonical Israeli pattern — three round holes in a triangle (two upper + one lower-centered). The outer faceplate is wide, white, smooth glossy plastic, with three sub-modules clearly divided. Common in modern Israeli kitchens, home offices, and renovated apartments.',
    negative:
      'NOT three separate single sockets aligned (must read as one wide three-gang faceplate), NOT US duplex outlets (two parallel slot pairs), NOT UK three-rectangular-pin row.',
  },
  // DEFAULT for env-type interior cues — same fail-closed strategy as
  // sockets. The model can't reliably nail the Israeli wall-switch look
  // either, so the default is to keep switches out of the focal area.
  'switch.minimize_visibility': {
    id: 'switch.minimize_visibility',
    category: 'sockets_switches',
    positive:
      'Do NOT show any wall-mounted light switches in the focal area of this frame. If a switch would naturally appear at the chosen camera angle, frame the shot so it is either out of frame, partially obscured by props, or far enough into the soft-focus background that no detail is readable.',
    negative:
      'NOT a sharply rendered foreign-style light switch (US toggle / UK dolly / black hotel rocker) — keep switches out of focal sharpness.',
  },

  // OPT-IN — opt in only for scenes that specifically need a switch visible.
  'switch.israeli_rocker': {
    id: 'switch.israeli_rocker',
    category: 'sockets_switches',
    positive:
      'Common Israeli household light switch: white plastic faceplate with rounded corners, slightly raised off the wall. One to three large rectangular-rocker buttons mounted side-by-side (single / double / triple gang); each button has a slightly convex glossy face and clicks on press. Plain, domestic, simple — the everyday Israeli apartment fixture, not a luxury hotel switch. Sometimes a tiny LED dot near the corner.',
    negative:
      'NOT US toggle flip switches (small lever), NOT British dolly switches, NOT black hotel-style luxury switches unless specifically requested, NOT round push-buttons.',
  },
  'switch.israeli_smart_metallic': {
    id: 'switch.israeli_smart_metallic',
    category: 'sockets_switches',
    positive:
      'Modern Israeli smart-home light switch: wide rectangular brushed-metal or silver faceplate, three narrow vertical rectangular rocker buttons mounted side-by-side in a row. Each button has fine decorative grooves. Sometimes a small Wi-Fi wave icon in the corner indicating wireless control. Reads as premium / smart-home / new Israeli build.',
    negative:
      'NOT a generic black control panel, NOT a single-button US-style toggle, NOT a touch-screen smart panel without physical rockers.',
  },
  'powerstrip.israeli_white': {
    id: 'powerstrip.israeli_white',
    category: 'sockets_switches',
    positive:
      'White-bodied Israeli power strip with Type H sockets along the top — each socket showing the canonical three round holes in a triangular pattern. A red illuminated rocker switch sits on the end. Plain plastic body, slightly glossy, common to every Israeli home.',
    negative:
      'NOT US-style power strip with parallel-slot outlets, NOT a UK-style strip with rectangular-pin outlets.',
  },

  // architecture ────────────────────────────────────────────────────────────
  'arch.trissim': {
    id: 'arch.trissim',
    category: 'architecture',
    positive:
      'Israeli rolling shutters (trissim) on the window: horizontal white plastic or aluminum slats with a strap inside the apartment for raising/lowering, often half-rolled',
    negative:
      'NOT American venetian blinds, NOT plantation shutters, NOT solid wooden shutters',
  },
  'arch.trombah': {
    id: 'arch.trombah',
    category: 'architecture',
    positive:
      'Black or white painted wrought iron Israeli window grills (trombah / סורגים), simple geometric or grid pattern, on the apartment exterior',
    negative:
      'NOT decorative French wrought iron balconies, NOT colonial wood shutters',
  },
  'arch.solar_water_heater': {
    id: 'arch.solar_water_heater',
    category: 'architecture',
    positive:
      'Israeli solar water heater (dud shemesh) on the rooftop: white or silver cylindrical horizontal tank + flat blue solar panel',
    negative:
      'NOT North American chimneys or HVAC roof units occupying the same composition',
  },
  'arch.mirpeset': {
    id: 'arch.mirpeset',
    category: 'architecture',
    positive:
      'Narrow Israeli concrete balcony (mirpeset) with a metal railing, often with laundry on a folding rack and a small air-con compressor unit',
    negative:
      'NOT a wraparound American porch with wooden railings, NOT a French Juliet balcony',
  },
  'arch.jerusalem_stone': {
    id: 'arch.jerusalem_stone',
    category: 'architecture',
    positive:
      'Pale cream or beige Jerusalem limestone block facade — only when the scene is explicitly Jerusalem',
    negative: 'NOT generic European stone, NOT brick',
  },
  'arch.tel_aviv_bauhaus': {
    id: 'arch.tel_aviv_bauhaus',
    category: 'architecture',
    positive:
      'Tel Aviv Bauhaus / White City facade: clean rounded white walls, ribbon windows, small balconies — only when the scene is explicitly Tel Aviv',
    negative: 'NOT brutalist concrete, NOT ornate European facades',
  },
  'arch.entrance_grille_lobby': {
    id: 'arch.entrance_grille_lobby',
    category: 'architecture',
    positive:
      'Steel-grille entrance door of an Israeli apartment building with a code keypad and a name-list panel; mailboxes inside the lobby',
    negative:
      'NOT American curbside post-mounted mailboxes, NOT an open suburban driveway',
  },

  // streets / signage ───────────────────────────────────────────────────────
  'street.hebrew_signage': {
    id: 'street.hebrew_signage',
    category: 'streets',
    positive:
      'Hebrew shop signs / street signs / aisle signage in right-to-left Hebrew typesetting; English (if any) smaller and underneath',
    negative:
      'NOT non-Hebrew shop signage in the foreground, NOT English-only US-style storefronts',
  },
  'street.yellow_plates': {
    id: 'street.yellow_plates',
    category: 'streets',
    positive:
      'Yellow rectangular Israeli license plates with a black border and 7-8 digit numbers in the format 12-345-67 or 123-45-678; both front and rear plates yellow',
    negative: 'NOT white US-style license plates, NOT EU blue strip plates',
  },
  'street.egged_dan_bus': {
    id: 'street.egged_dan_bus',
    category: 'streets',
    positive:
      'Israeli public bus in Egged green-and-white or Dan red-and-white livery on a modern Mercedes / MAN / Volvo chassis',
    negative: 'NOT a yellow American school bus, NOT a London double-decker',
  },
  'street.taxi_yellow_roof': {
    id: 'street.taxi_yellow_roof',
    category: 'streets',
    positive:
      'Israeli taxi: white sedan with a yellow rooftop sign reading "מונית", yellow Israeli plates',
    negative: 'NOT a yellow New York cab, NOT a London black cab',
  },
  'street.kikar_layout': {
    id: 'street.kikar_layout',
    category: 'streets',
    positive:
      'Israeli street layout: narrow street with parallel parking on both sides, occasional kikar (roundabout) instead of a 4-way stop, ficus / palm / jacaranda trees',
    negative:
      'NOT 4-way stop signs, NOT wide American avenues with strip malls',
  },
  'street.wheelie_bins': {
    id: 'street.wheelie_bins',
    category: 'streets',
    positive:
      'Green or brown wheeled trash bins clustered behind small concrete dividers on the Israeli street',
    negative:
      'NOT silver American sidewalk trash cans, NOT iconic NYC corner trash baskets',
  },

  // public_space ────────────────────────────────────────────────────────────
  'public_space.no_us_mailboxes': {
    id: 'public_space.no_us_mailboxes',
    category: 'public_space',
    positive:
      'Mail handled via the lobby mailbox panel inside the apartment building entrance — there are no curbside post-mounted boxes in Israel',
    negative:
      'NOT US-style curbside mailboxes on a wooden post, NOT red flag-up mailboxes',
  },
  'public_space.fire_hydrant_grey': {
    id: 'public_space.fire_hydrant_grey',
    category: 'public_space',
    positive:
      'Israeli fire hydrant: grey or pale yellow, smaller, often flush-mounted to the curb or wall',
    negative: 'NOT a red American fire hydrant',
  },

  // vehicles ────────────────────────────────────────────────────────────────
  'vehicle.tel_aviv_compact': {
    id: 'vehicle.tel_aviv_compact',
    category: 'vehicles',
    positive:
      'Small Israeli hatchback (Hyundai i10/i20, Kia Picanto, Toyota Yaris), white or silver, parked tightly on a narrow Tel Aviv street, yellow Israeli plate',
    negative:
      'NOT a pickup truck, NOT a full-size American SUV, NOT a muscle car',
  },
  'vehicle.suburban_crossover': {
    id: 'vehicle.suburban_crossover',
    category: 'vehicles',
    positive:
      'Compact Israeli family crossover (Hyundai Tucson, Kia Sportage, Mazda CX-5, Toyota RAV4), white or grey, yellow Israeli plate',
    negative: 'NOT a Chevy Suburban, NOT a Ford F-150, NOT a Cadillac',
  },
  'vehicle.aspirational_ev': {
    id: 'vehicle.aspirational_ev',
    category: 'vehicles',
    positive:
      'Aspirational Israeli EV (Tesla Model 3 / Y, Polestar 2, BYD Atto 3), white or red, yellow Israeli plate',
    negative: 'NOT a US-spec Rivian R1T, NOT a Hummer EV',
  },
  'vehicle.established_sedan': {
    id: 'vehicle.established_sedan',
    category: 'vehicles',
    positive:
      'Established Israeli family sedan or wagon (Toyota Corolla, Hyundai i35, Skoda Octavia), silver or grey, yellow Israeli plate',
    negative: 'NOT a Dodge Charger, NOT a full-size US sedan',
  },
  'vehicle.outdoorsy_4wd': {
    id: 'vehicle.outdoorsy_4wd',
    category: 'vehicles',
    positive:
      'Outdoorsy Israeli 4x4 (older Skoda Octavia, Mitsubishi Outlander, Land Rover Defender, Jeep variant), yellow Israeli plate',
    negative:
      'NOT a Jeep Wrangler with US flag livery, NOT a lifted American off-roader',
  },
  'vehicle.young_scooter': {
    id: 'vehicle.young_scooter',
    category: 'vehicles',
    positive:
      'Israeli urban scooter (electric scooter or Wolt-delivery scooter with a yellow thermal box on the back) parked or rolling on a Tel Aviv sidewalk',
    negative: 'NOT a Vespa, NOT a US Postal Service mail jeep',
  },
  'vehicle.shared_ebike': {
    id: 'vehicle.shared_ebike',
    category: 'vehicles',
    positive:
      'Israeli shared electric bike (avtobus-chashmali style rental ebike) parked at a Tel Aviv corner',
    negative: 'NOT a Citi Bike (NYC), NOT a London Boris Bike',
  },

  // brands ──────────────────────────────────────────────────────────────────
  'brand.shufersal_purple': {
    id: 'brand.shufersal_purple',
    category: 'brands',
    positive:
      'Shufersal supermarket aisle with purple/pink branded signage in Hebrew',
    negative: 'NOT Walmart, NOT Whole Foods, NOT Tesco',
  },
  'brand.rami_levy_red': {
    id: 'brand.rami_levy_red',
    category: 'brands',
    positive:
      'Rami Levy supermarket aisle with red branded signage and a no-frills warehouse feel, Hebrew aisle markers',
    negative: 'NOT Costco, NOT Sam\'s Club',
  },
  'brand.tnuva_dairy': {
    id: 'brand.tnuva_dairy',
    category: 'brands',
    positive:
      'Tnuva-branded dairy products on the kitchen counter or in the open fridge: white tubs and cartons with the Tnuva logo, often the iconic blue-and-white square cottage cheese tub',
    negative:
      'NOT generic American dairy brands (Kraft, Yoplait), NOT European yoghurt brands',
  },
  'brand.bamba_orange': {
    id: 'brand.bamba_orange',
    category: 'brands',
    positive:
      'An open or closed orange foil bag of Bamba (Osem) with the smiling baby illustration on the front',
    negative: 'NOT Cheetos, NOT Doritos',
  },
  'brand.bissli_foil': {
    id: 'brand.bissli_foil',
    category: 'brands',
    positive:
      'A foil bag of Bissli (Osem) — green, red, or purple — visible on the table or counter',
    negative: 'NOT US chip brands like Lay\'s as the foreground snack',
  },
  'brand.taster_choice_nescafe': {
    id: 'brand.taster_choice_nescafe',
    category: 'brands',
    positive:
      'Glass jar of Nescafé Taster\'s Choice (locally called "נס"), the dominant instant coffee in Israeli homes',
    negative: 'NOT Folgers, NOT a US drip-coffee Mr. Coffee setup',
  },

  // food ────────────────────────────────────────────────────────────────────
  'food.israeli_breakfast': {
    id: 'food.israeli_breakfast',
    category: 'food',
    positive:
      'Israeli breakfast plate: chopped tomato + cucumber salad, white cheese (גבינה לבנה) tub, olives, hard-boiled egg, pita or sliced bread, sometimes tahini',
    negative:
      'NOT pancakes with maple syrup, NOT bacon-and-eggs, NOT a stack of US diner waffles',
  },
  'food.pita_shawarma': {
    id: 'food.pita_shawarma',
    category: 'food',
    positive:
      'Shawarma served in a pita pocket or laffa wrap with chips inside the wrap, Israeli salad and tahini visible',
    negative: 'NOT a Chipotle burrito, NOT a kebab on a stick',
  },
  'food.hummus_plate': {
    id: 'food.hummus_plate',
    category: 'food',
    positive:
      'Plate-style hummus presentation: flat ceramic plate, hummus spread thin with a divot in the middle for tahini, olive oil, paprika, parsley',
    negative:
      'NOT a US grocery-store deli tub of hummus presented as the centerpiece',
  },
  'food.cafe_hafuch_glass': {
    id: 'food.cafe_hafuch_glass',
    category: 'food',
    positive:
      'Cafe hafuch (קפה הפוך) in a tier-elevated mug at a sit-down Israeli cafe',
    negative:
      'NOT a Starbucks paper cup, NOT a US drip-coffee mug labelled "World\'s Best Dad"',
  },
  'food.goldstar_amber': {
    id: 'food.goldstar_amber',
    category: 'food',
    positive:
      'Bottle or pint of Goldstar (the dark amber default Israeli beer) on the table; Maccabee or Tuborg also acceptable',
    negative: 'NOT Bud Light, NOT Coors, NOT Miller, NOT a craft IPA',
  },

  // influencer register ─────────────────────────────────────────────────────
  'influencer.iphone_magsafe': {
    id: 'influencer.iphone_magsafe',
    category: 'influencer',
    positive:
      'Vertical iPhone in the subject\'s hand or implied just out of frame, often with a Magsafe ring grip or popsocket and a plain pastel/clear case',
    negative:
      'NOT an Android with on-screen Lorem ipsum text, NOT a comically oversized prop phone',
  },
  'influencer.ring_light_setup': {
    id: 'influencer.ring_light_setup',
    category: 'influencer',
    positive:
      'Hand-held / unstabilized look with daylight from a window + a soft warm fill suggesting a ring light catching the eyes — the canonical indoor Israeli influencer lighting',
    negative:
      'NOT dramatic three-point cinema lighting, NOT a single hard studio strobe',
  },
  'influencer.casual_outfit_tlv': {
    id: 'influencer.casual_outfit_tlv',
    category: 'influencer',
    positive:
      'Casual Israeli influencer outfit: oversized tee + bike shorts + scrunchie + chunky sneakers (early-20s Tel Aviv coded), or sweatshirt + leggings + Crocs (mom-coded), or polo + chinos + slim sneakers (men, suburban-coded)',
    negative:
      'NOT a generic Pinterest "model" look, NOT runway styling, NOT US streetwear with American sports team logos',
  },
  'influencer.mediterranean_phenotype': {
    id: 'influencer.mediterranean_phenotype',
    category: 'influencer',
    positive:
      'Mediterranean Israeli phenotype mix: brunette / dark eyes / mid-tone skin most common, with Ashkenazi (lighter), Mizrachi (olive-darker), Ethiopian-Israeli, and Russian-Israeli (very fair, blonde) variation across avatars',
    negative:
      'NOT generic Korean glass-skin beauty filter, NOT a US "white American blonde" defaulted face',
  },

  // religious — strictly gated on ctx.religiousRegister ─────────────────────
  'religious.mezuzah_doorpost': {
    id: 'religious.mezuzah_doorpost',
    category: 'religious',
    positive:
      'Small decorative mezuzah case (ceramic, metal, or wood) mounted at an angle on the right doorpost at upper-third height',
    negative: 'NOT a generic decorative wall plaque next to the door',
  },
  'religious.shabbat_table': {
    id: 'religious.shabbat_table',
    category: 'religious',
    positive:
      'Shabbat candles, challah cover, and kiddush cup arranged on the dining table — Friday-night-dinner specific',
    negative: 'NOT a generic Pinterest-perfect dinner table',
  },
  'religious.kippa_man': {
    id: 'religious.kippa_man',
    category: 'religious',
    positive:
      'Religious or traditional Israeli man wearing a kippa (modern-Orthodox knit, haredi black velvet, or Bukharan colorful round)',
    negative:
      'NOT a generic baseball cap, NOT a yarmulke styled as a costume prop',
  },
  'religious.tichel_woman': {
    id: 'religious.tichel_woman',
    category: 'religious',
    positive:
      'Religious married Israeli woman wearing a tichel / mitpachat (head scarf) tied in an Israeli style',
    negative:
      'NOT a hijab styled as a different cultural register, NOT a generic head wrap',
  },
  'religious.sheitel_haredi': {
    id: 'religious.sheitel_haredi',
    category: 'religious',
    positive:
      'Haredi Ashkenazi married woman wearing a sheitel (wig), neat and modest styling',
    negative: 'NOT a flamboyant fashion wig',
  },

  // climate / light ─────────────────────────────────────────────────────────
  'climate.warm_outdoor_sun': {
    id: 'climate.warm_outdoor_sun',
    category: 'climate',
    positive:
      'Bright Israeli outdoor sun at 20-28°C, sharp shadows, blue sky, warm yellow tones on skin',
    negative:
      'NOT misty mornings, NOT autumn leaves on the ground, NOT heavy snow, NOT dramatic stormy skies (those read American or European)',
  },
  'climate.warm_daylight_indoor': {
    id: 'climate.warm_daylight_indoor',
    category: 'climate',
    positive:
      'Warm daylight from a window with soft bounce inside an Israeli apartment, magic-hour 17:00-18:30 quality',
    negative:
      'NOT cool blue indoor light, NOT fluorescent overhead office light spillover',
  },
  'climate.coastal_promenade': {
    id: 'climate.coastal_promenade',
    category: 'climate',
    positive:
      'Mediterranean coastal scene: fine pale sand, palm trees, blue water, stone-paved promenade with a low railing, kiosks selling icicles and corn on the cob',
    negative: 'NOT a Caribbean beach, NOT a US East Coast boardwalk',
  },
  'climate.desert_negev': {
    id: 'climate.desert_negev',
    category: 'climate',
    positive:
      'Negev / Mitzpe Ramon / Eilat desert: orange-pink rock, sparse acacia trees, harsh midday light, occasional yellow road sign with a camel symbol',
    negative:
      'NOT US Southwest red-rock canyons styled like Sedona, NOT a Sahara dune photo',
  },
};

// ── Universal negatives — always appended regardless of context ─────────────
//
// Source: ISRAELI_VISUAL_REALISM.md §10. The brief shouldn't rely on per-cue
// negatives alone — this list catches the American-suburban defaults the
// model auto-fills when not pushed elsewhere.
export const UNIVERSAL_NEGATIVES: readonly string[] = [
  'NOT American suburban context',
  'NOT US wall outlets (NEMA 5-15) with two parallel vertical rectangular slots',
  'NOT UK three-rectangular-pin outlets',
  'NOT EU Schuko outlets with only two round holes',
  'NOT any wall outlet with rectangular slots — Israeli outlets always have THREE ROUND holes in a triangular pattern',
  'NOT US street signs',
  'NOT US license plates',
  'NOT yellow school bus',
  'NOT shingled roof',
  'NOT brick suburban facade',
  'NOT white picket fence',
  'NOT red US fire hydrant',
  'NOT US-style curbside mailbox on a post',
  'NOT American football',
  'NOT pickup truck',
  'NOT full-size American SUV',
  'NOT muscle car',
  'NOT generic international hotel lobby',
  'NOT generic Pinterest kitchen',
  'NOT generic Korean glass-skin beauty filter',
  'NOT British dolly switch',
  'NOT EU Schuko socket',
  'NOT UK Type-G socket',
  'NOT non-Hebrew shop signage in the foreground',
];

// ── Default cue sets per environment_type ───────────────────────────────────
//
// Maps the script JSON schema's environment_type enum (kitchen / bathroom /
// bedroom / living_room / balcony / office / car / street / store /
// family_home / kids_room / neutral_indoor) to a deterministic baseline of
// cue IDs. Scene presets (when set) override these.

const CUES_BY_ENV_TYPE: Record<string, readonly string[]> = {
  // V14 hotfix #2 — the indoor env types default to the *minimize* cues
  // (hide sockets + switches from frame) instead of the descriptive cues
  // (try to render Type H correctly). Reasoning: gpt-image-2 still drifts
  // to UK/US shapes despite the round-hole + triangular-pattern wording.
  // Better to keep them out of frame than to render them wrong.
  kitchen: [
    'socket.minimize_visibility',
    'switch.minimize_visibility',
    'brand.tnuva_dairy',
    'climate.warm_daylight_indoor',
  ],
  bathroom: [
    'socket.minimize_visibility',
    'switch.minimize_visibility',
    'climate.warm_daylight_indoor',
  ],
  bedroom: [
    'socket.minimize_visibility',
    'switch.minimize_visibility',
    'arch.trissim',
    'climate.warm_daylight_indoor',
  ],
  living_room: [
    'socket.minimize_visibility',
    'switch.minimize_visibility',
    'arch.mirpeset',
    'arch.trissim',
    'climate.warm_daylight_indoor',
  ],
  balcony: [
    'arch.mirpeset',
    'arch.trissim',
    'climate.warm_outdoor_sun',
    'street.hebrew_signage',
  ],
  office: ['socket.minimize_visibility', 'switch.minimize_visibility'],
  car: ['street.yellow_plates', 'street.kikar_layout'],
  street: [
    'street.hebrew_signage',
    'street.yellow_plates',
    'street.kikar_layout',
    'arch.entrance_grille_lobby',
    'street.wheelie_bins',
  ],
  store: ['street.hebrew_signage', 'brand.shufersal_purple'],
  family_home: [
    'socket.minimize_visibility',
    'switch.minimize_visibility',
    'arch.trissim',
    'climate.warm_daylight_indoor',
  ],
  kids_room: [
    'socket.minimize_visibility',
    'switch.minimize_visibility',
    'arch.trissim',
  ],
  neutral_indoor: [
    'socket.minimize_visibility',
    'switch.minimize_visibility',
    'climate.warm_daylight_indoor',
  ],
};

// ── Vehicle cue selection by persona ────────────────────────────────────────
//
// Only consulted when ctx.vehicleInFrame === true. Keep the mapping 1-to-1;
// over-specifying beats under-specifying — the model already drifts toward
// "Tesla Model 3 in a US driveway" by default.
const VEHICLE_BY_PERSONA: Record<PersonaArchetype, string> = {
  young_tel_aviv: 'vehicle.tel_aviv_compact',
  family_suburban: 'vehicle.suburban_crossover',
  mature_traditional: 'vehicle.established_sedan',
  aspirational_modern: 'vehicle.aspirational_ev',
  periphery_practical: 'vehicle.established_sedan',
  outdoorsy: 'vehicle.outdoorsy_4wd',
};

// ── Religious cue selection ─────────────────────────────────────────────────
//
// Strictly gated on ctx.religiousRegister. 'secular' default emits NOTHING
// from this category — religious cues narrow audience inappropriately and
// the tachles audience is majority secular-coded.
const RELIGIOUS_CUES_BY_REGISTER: Record<ReligiousRegister, readonly string[]> = {
  secular: [],
  traditional: ['religious.mezuzah_doorpost'],
  religious: ['religious.mezuzah_doorpost'],
};

// ── Scene presets — curated cue bundles ─────────────────────────────────────
//
// These IDs are the namespace V14 PR5's per-scene `israeli_setting_cue` field
// will accept. A preset is a coherent "this is the room" bundle: cue IDs +
// scene-level English description that lands as a single line in the prompt.
// The 8 presets here mirror the 8-cue list in HEBREW_SCRIPT_CREATIVE_RULES.md.

export const SCENE_PRESETS: Record<string, IsraeliScenePreset> = {
  kitchen_with_morning_light: {
    id: 'kitchen_with_morning_light',
    cueIds: [
      'socket.minimize_visibility',
      'switch.minimize_visibility',
      'brand.tnuva_dairy',
      'brand.taster_choice_nescafe',
      'climate.warm_daylight_indoor',
    ],
    description:
      'Modern Israeli apartment kitchen with morning daylight from the window, kettle on the counter, ceramic mug, fridge magnets including a few school papers',
  },
  bathroom_morning_routine: {
    id: 'bathroom_morning_routine',
    cueIds: [
      'socket.minimize_visibility',
      'switch.minimize_visibility',
      'climate.warm_daylight_indoor',
    ],
    description:
      'Modest Israeli bathroom: white tiles, small mirror with built-in cabinet, simple chrome fixtures, soft daylight bouncing off the wall, hand towel on the rail',
  },
  bedroom_evening: {
    id: 'bedroom_evening',
    cueIds: [
      'socket.minimize_visibility',
      'switch.minimize_visibility',
      'arch.trissim',
      'climate.warm_daylight_indoor',
    ],
    description:
      'Israeli bedroom in the evening: unmade double bed, half-rolled trissim on the window, soft warm bedside lamp, slightly lived-in',
  },
  living_room_couch: {
    id: 'living_room_couch',
    cueIds: [
      'socket.minimize_visibility',
      'switch.minimize_visibility',
      'arch.mirpeset',
      'arch.trissim',
      'climate.warm_daylight_indoor',
    ],
    description:
      'Israeli living room: fabric couch, low coffee table, TV on the wall, tier-elevated door onto the mirpeset visible at the edge of the frame',
  },
  tel_aviv_street_evening: {
    id: 'tel_aviv_street_evening',
    cueIds: [
      'street.hebrew_signage',
      'street.yellow_plates',
      'street.kikar_layout',
      'arch.entrance_grille_lobby',
      'climate.warm_daylight_indoor',
    ],
    description:
      'Tel Aviv narrow street at golden hour: parked compact cars with yellow plates, Hebrew shop signs glowing, building entrance with code keypad behind',
  },
  supermarket_aisle: {
    id: 'supermarket_aisle',
    cueIds: [
      'street.hebrew_signage',
      'brand.shufersal_purple',
      'brand.tnuva_dairy',
      'brand.bamba_orange',
    ],
    description:
      'Israeli supermarket aisle: Hebrew aisle headers, shelves with Tnuva products and orange Bamba bags, chrome wire cart with attached child seat',
  },
  gym_modern: {
    id: 'gym_modern',
    cueIds: ['climate.warm_daylight_indoor', 'influencer.casual_outfit_tlv'],
    description:
      'Modern Israeli gym interior: black rubber flooring, mirrors lining one wall, LED strip lighting, occasional Hebrew gym branding sticker',
  },
  outdoor_park_afternoon: {
    id: 'outdoor_park_afternoon',
    cueIds: ['climate.warm_outdoor_sun', 'street.hebrew_signage'],
    description:
      'Israeli urban park in the afternoon: dry grass, ficus trees, simple wooden benches, distant Hebrew sign on a kiosk',
  },
};

// ── chooseIsraeliCues — the V14 selection function ──────────────────────────

export function chooseIsraeliCues(ctx: CueContext): IsraeliCueSet {
  const selected = new Set<string>();
  let preset: IsraeliScenePreset | undefined;

  // 1. Scene preset (highest priority — overrides env-type defaults)
  if (ctx.scenePresetId) {
    const found = SCENE_PRESETS[ctx.scenePresetId];
    if (found) {
      preset = found;
      for (const id of found.cueIds) selected.add(id);
    }
  }

  // 2. Environment-type baseline (only when no preset is set)
  if (!preset && ctx.environmentType) {
    const envCues = CUES_BY_ENV_TYPE[ctx.environmentType] ?? [];
    for (const id of envCues) selected.add(id);
  }

  // 3. Vehicle in frame
  if (ctx.vehicleInFrame) {
    const vehicleCueId = VEHICLE_BY_PERSONA[ctx.personaArchetype];
    if (vehicleCueId) selected.add(vehicleCueId);
    // Yellow plate is the single most reliable "this car is in Israel" tell.
    selected.add('street.yellow_plates');
  }

  // 4. Religious register (secular default emits nothing here)
  for (const id of RELIGIOUS_CUES_BY_REGISTER[ctx.religiousRegister] ?? []) {
    selected.add(id);
  }

  // 5. Exterior implies Hebrew signage; an in-frame window implies trissim.
  if (ctx.isExterior) {
    selected.add('street.hebrew_signage');
  }
  if (ctx.isWindowVisible && !ctx.isExterior) {
    selected.add('arch.trissim');
  }

  // 6. Beauty / skincare / fashion / wellness products trigger the influencer
  // outfit + phenotype register so the model doesn't default to a runway look.
  if (
    ctx.productCategory &&
    /beauty|skincare|fashion|lifestyle|wellness/i.test(ctx.productCategory)
  ) {
    selected.add('influencer.casual_outfit_tlv');
    selected.add('influencer.mediterranean_phenotype');
  }

  // 7. Talking-head selfie scenes get the influencer iPhone + ring-light tells.
  if (ctx.isTalkingHead) {
    selected.add('influencer.iphone_magsafe');
    selected.add('influencer.ring_light_setup');
  }

  // Order: by category position, then alpha within category. Stable.
  const ordered = [...selected]
    .map((id) => CUES[id])
    .filter((c): c is IsraeliCue => Boolean(c))
    .sort((a, b) => {
      const ca = CATEGORY_ORDER.indexOf(a.category);
      const cb = CATEGORY_ORDER.indexOf(b.category);
      if (ca !== cb) return ca - cb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const positiveLines = ordered.map((c) => c.positive);
  const negativeLines = [
    ...ordered.map((c) => c.negative),
    ...UNIVERSAL_NEGATIVES,
  ];
  const composedInstruction = composeInstruction(ordered, preset);

  return {
    cues: ordered,
    positiveLines,
    negativeLines,
    composedInstruction,
    scenePresetId: preset?.id,
  };
}

function composeInstruction(
  cues: IsraeliCue[],
  preset: IsraeliScenePreset | undefined,
): string {
  const parts: string[] = [];
  parts.push(
    'every visible interior must feel like a believable Israeli home (modern apartment is fine, foreign suburban is NOT)',
  );
  if (preset) {
    parts.push(`scene preset (${preset.id}): ${preset.description}`);
  }
  for (const c of cues) {
    parts.push(c.positive);
  }
  parts.push(
    'apartment proportions must be realistic Israeli scale, not oversized US kitchens',
  );
  return parts.join('; ');
}

// ── Legacy shim — V13 PR2 contract preserved ────────────────────────────────
//
// V13 PR2 callers expect { mustShow, mustAvoid, promptText }. The shim
// internally calls chooseIsraeliCues with a sensible default context and
// reshapes the output so existing tests + the brief builder keep working
// without changes.
//
// SUNSET: PR2 migrates the brief builder to call chooseIsraeliCues directly
// with avatar-derived persona + religiousRegister + per-scene flags.
// Remove this shim no later than PR7.

export interface IsraeliRealismBlock {
  mustShow: string[];
  mustAvoid: string[];
  promptText: string;
}

export interface BuildIsraeliRealismOptions {
  isTalking?: boolean;
  isProblem?: boolean;
}

const STUDIO_PORTRAIT_GUARD =
  'studio portrait look on selfie/talking-head scenes';

export function buildIsraeliRealismBlock(
  opts: BuildIsraeliRealismOptions = {},
): IsraeliRealismBlock {
  const cueSet = chooseIsraeliCues({
    environmentType: 'neutral_indoor',
    personaArchetype: 'young_tel_aviv',
    religiousRegister: 'secular',
    vehicleInFrame: false,
    isExterior: false,
    isWindowVisible: false,
    isTalkingHead: opts.isTalking !== false,
  });

  const mustShow = [...cueSet.positiveLines];
  const mustAvoid = [...cueSet.negativeLines];

  // The studio-portrait guard is a styling concern, not an Israeli-realism
  // cue. Keep it in the shim to preserve V13 PR2 invariants until PR2
  // migrates consumers off the shim.
  if (opts.isTalking !== false) {
    mustAvoid.push(STUDIO_PORTRAIT_GUARD);
  }

  return {
    mustShow,
    mustAvoid,
    promptText: cueSet.composedInstruction,
  };
}
