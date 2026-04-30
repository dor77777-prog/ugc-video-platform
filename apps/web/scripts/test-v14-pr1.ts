// V14 PR1 verification — Israeli realism cue library.
//
// Same tsx-script pattern as test-v13-pr*.ts. Asserts:
//   1. Determinism — 100 runs of representative contexts → byte-identical
//   2. Pairing — every cue ships positive AND negative
//   3. Universal negatives — always present in negativeLines
//   4. Religious gating — secular default emits no religious cues
//   5. Scene preset priority — preset cues override env-type defaults
//   6. Env-type baselines — kitchen / bathroom / bedroom / etc. resolve right
//   7. Vehicle by persona — vehicleInFrame triggers correct vehicle cue
//   8. Avatar metadata — every entry in AVATAR_CATALOG has explicit
//      archetype + religiousRegister (no nulls, all valid enum values)
//   9. Backward-compat shim — buildIsraeliRealismBlock invariants hold
//  10. End-to-end landing — buildImageBrief.finalImagePrompt contains
//      specific cue text verbatim
//  11. Cue ID stability — specific IDs exist (renames break tests, by design)
//  12. Order determinism — cues[] sorts by category-then-alpha, identically

import {
  CUES,
  SCENE_PRESETS,
  UNIVERSAL_NEGATIVES,
  buildIsraeliRealismBlock,
  chooseIsraeliCues,
  type CueContext,
  type IsraeliCueSet,
  type PersonaArchetype,
  type ReligiousRegister,
} from '../lib/scene-planning/israeli-realism-rules';
import { AVATAR_CATALOG } from '../lib/avatars/catalog';
import { buildImageBrief } from '../lib/image-briefs/image-brief-builder';

let failures = 0;
function ok(name: string) {
  console.log(`✓ ${name}`);
}
function fail(name: string, detail: string) {
  failures++;
  console.error(`✗ ${name}\n   ${detail}`);
}
function assert(cond: boolean, name: string, detail = '') {
  if (cond) ok(name);
  else fail(name, detail);
}

const VALID_ARCHETYPES: ReadonlySet<PersonaArchetype> = new Set([
  'young_tel_aviv',
  'family_suburban',
  'mature_traditional',
  'aspirational_modern',
  'periphery_practical',
  'outdoorsy',
]);
const VALID_REGISTERS: ReadonlySet<ReligiousRegister> = new Set([
  'secular',
  'traditional',
  'religious',
]);

// ── 1. Determinism — same input → byte-identical output ─────────────────────
{
  const contexts: CueContext[] = [
    {
      environmentType: 'kitchen',
      personaArchetype: 'young_tel_aviv',
      religiousRegister: 'secular',
      vehicleInFrame: false,
      isExterior: false,
      isWindowVisible: false,
    },
    {
      environmentType: 'bathroom',
      personaArchetype: 'aspirational_modern',
      religiousRegister: 'secular',
      vehicleInFrame: false,
      isExterior: false,
      isWindowVisible: false,
      productCategory: 'skincare',
    },
    {
      environmentType: 'street',
      personaArchetype: 'young_tel_aviv',
      religiousRegister: 'secular',
      vehicleInFrame: true,
      isExterior: true,
      isWindowVisible: false,
    },
    {
      scenePresetId: 'kitchen_with_morning_light',
      personaArchetype: 'family_suburban',
      religiousRegister: 'traditional',
      vehicleInFrame: false,
      isExterior: false,
      isWindowVisible: true,
    },
    {
      environmentType: 'living_room',
      personaArchetype: 'mature_traditional',
      religiousRegister: 'religious',
      vehicleInFrame: false,
      isExterior: false,
      isWindowVisible: true,
      isTalkingHead: true,
    },
  ];

  for (const ctx of contexts) {
    const first = JSON.stringify(chooseIsraeliCues(ctx));
    let mismatch = 0;
    for (let i = 0; i < 100; i++) {
      const next = JSON.stringify(chooseIsraeliCues(ctx));
      if (next !== first) mismatch++;
    }
    assert(
      mismatch === 0,
      `[V14 PR1.1] determinism: 100 runs identical for ctx="${ctx.scenePresetId ?? ctx.environmentType ?? 'unspec'}/${ctx.personaArchetype}"`,
      mismatch ? `${mismatch} drifted runs` : '',
    );
  }
}

// ── 2. Pairing — every cue ships non-empty positive + negative ──────────────
{
  let unpaired = 0;
  let emptyPositive = 0;
  let emptyNegative = 0;
  for (const id of Object.keys(CUES)) {
    const c = CUES[id];
    if (!c) continue;
    if (!c.positive || !c.positive.trim()) emptyPositive++;
    if (!c.negative || !c.negative.trim()) emptyNegative++;
    if (!c.positive.trim() || !c.negative.trim()) unpaired++;
  }
  assert(
    emptyPositive === 0,
    `[V14 PR1.2] every cue has non-empty positive (${Object.keys(CUES).length} cues checked)`,
    emptyPositive ? `${emptyPositive} cues had empty positive` : '',
  );
  assert(
    emptyNegative === 0,
    `[V14 PR1.2] every cue has non-empty negative`,
    emptyNegative ? `${emptyNegative} cues had empty negative` : '',
  );
  assert(unpaired === 0, '[V14 PR1.2] every cue is fully paired');
}

// ── 3. Universal negatives — always appended ────────────────────────────────
{
  const set = chooseIsraeliCues({
    environmentType: 'kitchen',
    personaArchetype: 'young_tel_aviv',
    religiousRegister: 'secular',
    vehicleInFrame: false,
    isExterior: false,
    isWindowVisible: false,
  });
  for (const universal of UNIVERSAL_NEGATIVES) {
    assert(
      set.negativeLines.includes(universal),
      `[V14 PR1.3] universal negative present: "${universal.slice(0, 40)}..."`,
    );
  }

  // Specific anchors required by the master list (§10).
  const required = [
    'NOT yellow school bus',
    'NOT white picket fence',
    'NOT US license plates',
    'NOT pickup truck',
    'NOT EU Schuko socket',
  ];
  for (const r of required) {
    assert(
      set.negativeLines.includes(r),
      `[V14 PR1.3] §10 master-list anchor present: "${r}"`,
    );
  }
}

// ── 4. Religious gating — secular default emits zero religious cues ─────────
{
  const secular = chooseIsraeliCues({
    environmentType: 'family_home',
    personaArchetype: 'family_suburban',
    religiousRegister: 'secular',
    vehicleInFrame: false,
    isExterior: false,
    isWindowVisible: false,
  });
  const secularReligiousCues = secular.cues.filter(
    (c) => c.category === 'religious',
  );
  assert(
    secularReligiousCues.length === 0,
    '[V14 PR1.4] secular default emits ZERO religious cues',
    secularReligiousCues.length
      ? `leaked: ${secularReligiousCues.map((c) => c.id).join(', ')}`
      : '',
  );

  const traditional = chooseIsraeliCues({
    environmentType: 'family_home',
    personaArchetype: 'family_suburban',
    religiousRegister: 'traditional',
    vehicleInFrame: false,
    isExterior: false,
    isWindowVisible: false,
  });
  assert(
    traditional.cues.some((c) => c.id === 'religious.mezuzah_doorpost'),
    '[V14 PR1.4] traditional register includes mezuzah on the doorpost',
  );

  const religious = chooseIsraeliCues({
    environmentType: 'family_home',
    personaArchetype: 'mature_traditional',
    religiousRegister: 'religious',
    vehicleInFrame: false,
    isExterior: false,
    isWindowVisible: false,
  });
  assert(
    religious.cues.some((c) => c.id === 'religious.mezuzah_doorpost'),
    '[V14 PR1.4] religious register includes mezuzah on the doorpost',
  );
}

// ── 5. Scene preset priority — preset cues override env-type defaults ───────
{
  const set = chooseIsraeliCues({
    environmentType: 'street', // would normally pull street.* cues
    scenePresetId: 'kitchen_with_morning_light',
    personaArchetype: 'young_tel_aviv',
    religiousRegister: 'secular',
    vehicleInFrame: false,
    isExterior: false,
    isWindowVisible: false,
  });
  assert(
    set.scenePresetId === 'kitchen_with_morning_light',
    '[V14 PR1.5] preset takes precedence and is reflected in scenePresetId',
  );
  // The preset's cue IDs land; env-type "street" defaults must NOT.
  assert(
    set.cues.some((c) => c.id === 'brand.tnuva_dairy'),
    '[V14 PR1.5] preset cue (brand.tnuva_dairy) is present',
  );
  assert(
    !set.cues.some((c) => c.id === 'street.kikar_layout'),
    '[V14 PR1.5] env-type "street" cue is suppressed when preset is set',
  );
  assert(
    set.composedInstruction.includes('kitchen_with_morning_light'),
    '[V14 PR1.5] composed instruction names the active preset',
  );

  // All 8 presets resolve and expand to >=2 cue IDs each.
  const expected = [
    'kitchen_with_morning_light',
    'bathroom_morning_routine',
    'bedroom_evening',
    'living_room_couch',
    'tel_aviv_street_evening',
    'supermarket_aisle',
    'gym_modern',
    'outdoor_park_afternoon',
  ];
  for (const id of expected) {
    const preset = SCENE_PRESETS[id];
    assert(
      preset !== undefined && preset.cueIds.length >= 2,
      `[V14 PR1.5] preset "${id}" exists and bundles ≥2 cue IDs`,
    );
  }
}

// ── 6. Env-type baselines — kitchen / bathroom / bedroom resolve correctly ──
{
  const kitchen = chooseIsraeliCues({
    environmentType: 'kitchen',
    personaArchetype: 'young_tel_aviv',
    religiousRegister: 'secular',
    vehicleInFrame: false,
    isExterior: false,
    isWindowVisible: false,
  });
  assert(
    kitchen.cues.some((c) => c.id === 'socket.type_h'),
    '[V14 PR1.6] kitchen baseline includes socket.type_h',
  );
  assert(
    kitchen.cues.some((c) => c.id === 'brand.tnuva_dairy'),
    '[V14 PR1.6] kitchen baseline includes brand.tnuva_dairy',
  );

  const street = chooseIsraeliCues({
    environmentType: 'street',
    personaArchetype: 'young_tel_aviv',
    religiousRegister: 'secular',
    vehicleInFrame: false,
    isExterior: true,
    isWindowVisible: false,
  });
  assert(
    street.cues.some((c) => c.id === 'street.hebrew_signage'),
    '[V14 PR1.6] street baseline includes street.hebrew_signage',
  );
  assert(
    street.cues.some((c) => c.id === 'street.yellow_plates'),
    '[V14 PR1.6] street baseline includes street.yellow_plates',
  );

  const balcony = chooseIsraeliCues({
    environmentType: 'balcony',
    personaArchetype: 'young_tel_aviv',
    religiousRegister: 'secular',
    vehicleInFrame: false,
    isExterior: false,
    isWindowVisible: false,
  });
  assert(
    balcony.cues.some((c) => c.id === 'arch.mirpeset'),
    '[V14 PR1.6] balcony baseline includes arch.mirpeset',
  );
}

// ── 7. Vehicle by persona — vehicleInFrame plumbs the right cue ─────────────
{
  const cases: Array<[PersonaArchetype, string]> = [
    ['young_tel_aviv', 'vehicle.tel_aviv_compact'],
    ['family_suburban', 'vehicle.suburban_crossover'],
    ['aspirational_modern', 'vehicle.aspirational_ev'],
    ['mature_traditional', 'vehicle.established_sedan'],
    ['periphery_practical', 'vehicle.established_sedan'],
    ['outdoorsy', 'vehicle.outdoorsy_4wd'],
  ];
  for (const [persona, expectedCueId] of cases) {
    const set = chooseIsraeliCues({
      environmentType: 'street',
      personaArchetype: persona,
      religiousRegister: 'secular',
      vehicleInFrame: true,
      isExterior: true,
      isWindowVisible: false,
    });
    assert(
      set.cues.some((c) => c.id === expectedCueId),
      `[V14 PR1.7] persona="${persona}" + vehicle in frame → "${expectedCueId}"`,
    );
    // Yellow plates ALWAYS attach when a vehicle is in frame.
    assert(
      set.cues.some((c) => c.id === 'street.yellow_plates'),
      `[V14 PR1.7] persona="${persona}" + vehicle in frame → yellow plates`,
    );
  }

  // No vehicle → no vehicle cue, even if persona has one assigned.
  const noVehicle = chooseIsraeliCues({
    environmentType: 'kitchen',
    personaArchetype: 'aspirational_modern',
    religiousRegister: 'secular',
    vehicleInFrame: false,
    isExterior: false,
    isWindowVisible: false,
  });
  assert(
    !noVehicle.cues.some((c) => c.category === 'vehicles'),
    '[V14 PR1.7] vehicleInFrame=false emits no vehicle category cues',
  );
}

// ── 8. Avatar metadata — all 25 entries explicit, no nulls, valid values ────
{
  assert(
    AVATAR_CATALOG.length >= 25,
    `[V14 PR1.8] AVATAR_CATALOG has ≥25 entries (found ${AVATAR_CATALOG.length})`,
  );
  let badArchetype = 0;
  let badRegister = 0;
  for (const a of AVATAR_CATALOG) {
    if (!VALID_ARCHETYPES.has(a.archetype)) {
      badArchetype++;
      console.error(`   bad archetype on "${a.id}": ${a.archetype as string}`);
    }
    if (!VALID_REGISTERS.has(a.religiousRegister)) {
      badRegister++;
      console.error(
        `   bad religiousRegister on "${a.id}": ${a.religiousRegister as string}`,
      );
    }
  }
  assert(
    badArchetype === 0,
    '[V14 PR1.8] every avatar archetype is one of the 6 enum values',
  );
  assert(
    badRegister === 0,
    '[V14 PR1.8] every avatar religiousRegister is one of the 3 enum values',
  );

  // The catalog should span at least 4 archetypes (we don't want the
  // catalog quietly converging to all young_tel_aviv).
  const distinctArchetypes = new Set(AVATAR_CATALOG.map((a) => a.archetype));
  assert(
    distinctArchetypes.size >= 4,
    `[V14 PR1.8] catalog spans ≥4 distinct archetypes (found ${distinctArchetypes.size})`,
  );

  // Religious + traditional registers are represented (so PR2 onwards has
  // avatars to test religious gating against).
  const hasTraditional = AVATAR_CATALOG.some(
    (a) => a.religiousRegister === 'traditional',
  );
  assert(
    hasTraditional,
    '[V14 PR1.8] at least one avatar carries religiousRegister="traditional"',
  );
}

// ── 9. Backward-compat shim — V13 PR2 invariants preserved ──────────────────
{
  const block = buildIsraeliRealismBlock({});
  assert(
    block.mustAvoid.length >= 4,
    '[V14 PR1.9] shim mustAvoid lists ≥4 forbidden patterns',
  );
  assert(
    block.mustAvoid.some(
      (s) => /Type H|outlet|plug/i.test(s) || s.includes('foreign-looking'),
    ),
    '[V14 PR1.9] shim mustAvoid mentions foreign outlets / plugs',
  );
  assert(
    block.mustAvoid.some((s) => s.toLowerCase().includes('suburban')),
    '[V14 PR1.9] shim mustAvoid forbids US-style suburbia',
  );
  assert(
    block.promptText.includes('Type H') && block.promptText.includes('Israeli'),
    '[V14 PR1.9] shim promptText mentions Type H + Israeli framing',
  );

  const noTalking = buildIsraeliRealismBlock({ isTalking: false });
  assert(
    !noTalking.mustAvoid.some((s) => s.includes('studio portrait')),
    '[V14 PR1.9] shim omits studio-portrait guard when isTalking=false',
  );
  const talking = buildIsraeliRealismBlock({ isTalking: true });
  assert(
    talking.mustAvoid.some((s) => s.includes('studio portrait')),
    '[V14 PR1.9] shim includes studio-portrait guard when isTalking=true',
  );

  // V14 expansion: shim mustShow now carries positive cue lines (used to
  // be empty in V13). Invariant: still an array, at least one item.
  assert(
    Array.isArray(block.mustShow) && block.mustShow.length >= 1,
    '[V14 PR1.9] shim mustShow now exposes positive cue lines (V14 paired model)',
  );
}

// ── 10. End-to-end landing — buildImageBrief contains specific cue text ─────
{
  // Generic product_demo path (no intelligence). The shim path runs and
  // surfaces Type H verbatim through israeliContextInstruction.
  const brief = buildImageBrief({
    sceneNumber: 1,
    totalScenes: 4,
    sceneGoal: 'demo the product',
    sceneGenerationType: 'product_demo',
    faceVisibility: 'no_face',
    spokenTextHebrew: 'תראו איך זה עובד',
    rawVisualBrief: 'hands using the product over a sink',
    cameraDirection: null,
    intelligence: null,
  });
  assert(
    brief.israeliContextInstruction.includes('Israeli Type H electrical socket'),
    '[V14 PR1.10] brief.israeliContextInstruction carries the Type H positive line verbatim',
  );
  assert(
    brief.finalImagePrompt.includes('ISRAELI CONTEXT'),
    '[V14 PR1.10] finalImagePrompt still labels its ISRAELI CONTEXT section',
  );
  assert(
    brief.finalImagePrompt.includes('Israeli Type H electrical socket'),
    '[V14 PR1.10] finalImagePrompt contains the Type H positive cue line verbatim',
  );
  assert(
    brief.mustAvoid.some((s) => s.includes('NOT American suburban context')),
    '[V14 PR1.10] brief.mustAvoid includes the universal "American suburban" negative',
  );
}

// ── 11. Cue ID stability — anchor IDs exist (renames must break tests) ──────
{
  const required = [
    'socket.type_h',
    'switch.israeli_rocker',
    'arch.trissim',
    'arch.mirpeset',
    'street.hebrew_signage',
    'street.yellow_plates',
    'vehicle.tel_aviv_compact',
    'brand.tnuva_dairy',
    'brand.bamba_orange',
    'religious.mezuzah_doorpost',
    'climate.warm_daylight_indoor',
  ];
  for (const id of required) {
    assert(Boolean(CUES[id]), `[V14 PR1.11] cue id "${id}" exists`);
  }
}

// ── 12. Order determinism — cues[] is sorted category-then-alpha ────────────
{
  const set: IsraeliCueSet = chooseIsraeliCues({
    environmentType: 'living_room',
    personaArchetype: 'young_tel_aviv',
    religiousRegister: 'religious',
    vehicleInFrame: true,
    isExterior: false,
    isWindowVisible: true,
    isTalkingHead: true,
    productCategory: 'beauty',
  });

  // Verify sorted: each adjacent pair must be (cat_a < cat_b) OR
  // (cat_a == cat_b AND id_a <= id_b).
  const CATEGORY_ORDER = [
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
  ] as const;
  const idx = (cat: string) => CATEGORY_ORDER.indexOf(cat as never);
  let outOfOrder = 0;
  for (let i = 1; i < set.cues.length; i++) {
    const a = set.cues[i - 1];
    const b = set.cues[i];
    if (!a || !b) continue;
    if (idx(a.category) > idx(b.category)) outOfOrder++;
    else if (idx(a.category) === idx(b.category) && a.id > b.id) outOfOrder++;
  }
  assert(
    outOfOrder === 0,
    '[V14 PR1.12] cues[] sorted by (category-position, id-alpha)',
    outOfOrder ? `${outOfOrder} adjacent pairs were out of order` : '',
  );
}

// ── 13. Beauty/skincare trigger — influencer cues attach automatically ──────
{
  const beauty = chooseIsraeliCues({
    environmentType: 'bathroom',
    personaArchetype: 'young_tel_aviv',
    religiousRegister: 'secular',
    vehicleInFrame: false,
    isExterior: false,
    isWindowVisible: false,
    productCategory: 'skincare',
  });
  assert(
    beauty.cues.some((c) => c.id === 'influencer.casual_outfit_tlv'),
    '[V14 PR1.13] productCategory="skincare" attaches influencer.casual_outfit_tlv',
  );
  assert(
    beauty.cues.some((c) => c.id === 'influencer.mediterranean_phenotype'),
    '[V14 PR1.13] productCategory="skincare" attaches influencer.mediterranean_phenotype',
  );

  const electronics = chooseIsraeliCues({
    environmentType: 'bathroom',
    personaArchetype: 'young_tel_aviv',
    religiousRegister: 'secular',
    vehicleInFrame: false,
    isExterior: false,
    isWindowVisible: false,
    productCategory: 'electronics',
  });
  assert(
    !electronics.cues.some((c) => c.category === 'influencer'),
    '[V14 PR1.13] non-beauty productCategory does NOT attach influencer cues',
  );
}

// ── 14. Talking-head trigger — iPhone + ring light attach ───────────────────
{
  const talk = chooseIsraeliCues({
    environmentType: 'living_room',
    personaArchetype: 'young_tel_aviv',
    religiousRegister: 'secular',
    vehicleInFrame: false,
    isExterior: false,
    isWindowVisible: false,
    isTalkingHead: true,
  });
  assert(
    talk.cues.some((c) => c.id === 'influencer.iphone_magsafe'),
    '[V14 PR1.14] isTalkingHead=true attaches influencer.iphone_magsafe',
  );
  assert(
    talk.cues.some((c) => c.id === 'influencer.ring_light_setup'),
    '[V14 PR1.14] isTalkingHead=true attaches influencer.ring_light_setup',
  );
}

// ── 15. Legacy regression fixture — old-shape ProductData flows safely ──────
//
// User concern (V14 plan §4): if there are active projects in the DB with
// pre-V14 ProductData (no archetype, no lockedOutfit), the brief builder
// must still compose end-to-end without throwing. Test the worst-case path:
// scene with intelligence=null, generic problem-context, no avatar wired.
{
  let threw = false;
  let brief: ReturnType<typeof buildImageBrief> | null = null;
  try {
    brief = buildImageBrief({
      sceneNumber: 0,
      totalScenes: 5,
      sceneGoal: 'establish_pain',
      sceneGenerationType: 'problem_visual',
      faceVisibility: 'partial_face',
      spokenTextHebrew: 'אני לא מצליחה לישון בלילה',
      rawVisualBrief: 'tired person in messy bedroom, evening',
      cameraDirection: null,
      intelligence: null,
    });
  } catch (e) {
    threw = true;
    console.error(`   ${(e as Error).message}`);
  }
  assert(!threw, '[V14 PR1.15] legacy-shape brief input does NOT throw');
  assert(
    brief !== null && brief.finalImagePrompt.length > 0,
    '[V14 PR1.15] legacy brief still produces a non-empty finalImagePrompt',
  );
  assert(
    brief !== null &&
      brief.israeliContextInstruction.includes('Israeli'),
    '[V14 PR1.15] legacy brief still injects Israeli realism context',
  );
}

console.log('');
if (failures === 0) {
  console.log('V14 PR1 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`V14 PR1 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
