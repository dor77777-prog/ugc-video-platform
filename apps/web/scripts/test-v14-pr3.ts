// V14 PR3 verification — avatar + outfit consistency lock.
//
// Covers:
//   1. computeLockedOutfit determinism — 100 runs byte-identical per ctx
//   2. Outfit varies across distinct inputs (no global default trap)
//   3. Religious gating — religious-register females get long sleeves +
//      modest bottoms + head covering; religious-register males get a kippa
//   4. Product-category bias — fitness products push sportier elements
//   5. Component completeness — every outfit string contains top + bottom +
//      footwear (recognizable substrings)
//   6. End-to-end: buildImageBrief.outfitDescriptionLocked → consistency
//      anchor snippet → finalImagePrompt contains the outfit verbatim
//   7. Avatar description byte-identity — describeAvatar(avatar) is a pure
//      function of AvatarProfile (no scene context, no mutation)
//   8. Avatar catalog tests — same avatar id resolves to same description
//   9. Legacy fixture — brief with no outfitDescriptionLocked still
//      composes; consistency anchor falls back to generic instruction
//  10. PR2 regression — V14 PR2 snippet selector still gets the outfit
//      when passed via context

import { computeLockedOutfit } from '../lib/avatars/outfit';
import { AVATAR_CATALOG, describeAvatar, findAvatar } from '../lib/avatars/catalog';
import { consistencyAnchorSnippet } from '../lib/image-briefs/frame-technique-snippets';
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

// ── 1. computeLockedOutfit determinism ──────────────────────────────────────
{
  const cases = [
    {
      gender: 'female' as const,
      style: 'casual' as const,
      archetype: 'young_tel_aviv' as const,
      religiousRegister: 'secular' as const,
    },
    {
      gender: 'female' as const,
      style: 'lifestyle' as const,
      archetype: 'mature_traditional' as const,
      religiousRegister: 'religious' as const,
    },
    {
      gender: 'male' as const,
      style: 'professional' as const,
      archetype: 'aspirational_modern' as const,
      religiousRegister: 'secular' as const,
    },
    {
      gender: 'male' as const,
      style: 'sporty' as const,
      archetype: 'outdoorsy' as const,
      religiousRegister: 'traditional' as const,
      productCategory: 'fitness',
    },
  ];
  for (const ctx of cases) {
    const first = computeLockedOutfit(ctx);
    let mismatch = 0;
    for (let i = 0; i < 100; i++) {
      if (computeLockedOutfit(ctx) !== first) mismatch++;
    }
    assert(
      mismatch === 0,
      `[V14 PR3.1] determinism: 100 runs identical for ${ctx.gender}/${ctx.style}/${ctx.archetype}/${ctx.religiousRegister}`,
      mismatch ? `${mismatch} drifted` : '',
    );
    assert(
      first.length > 20,
      `[V14 PR3.1] outfit string is non-trivially long (≥20 chars)`,
      `got: "${first}"`,
    );
  }
}

// ── 2. Outfit varies across inputs ──────────────────────────────────────────
{
  const a = computeLockedOutfit({
    gender: 'female',
    style: 'casual',
    archetype: 'young_tel_aviv',
    religiousRegister: 'secular',
  });
  const b = computeLockedOutfit({
    gender: 'female',
    style: 'professional',
    archetype: 'aspirational_modern',
    religiousRegister: 'secular',
  });
  const c = computeLockedOutfit({
    gender: 'male',
    style: 'casual',
    archetype: 'young_tel_aviv',
    religiousRegister: 'secular',
  });
  assert(a !== b, '[V14 PR3.2] female casual TLV ≠ female professional aspirational');
  assert(a !== c, '[V14 PR3.2] female casual TLV ≠ male casual TLV');
  assert(b !== c, '[V14 PR3.2] female professional ≠ male casual');
}

// ── 3. Religious gating ────────────────────────────────────────────────────
{
  const secularFemale = computeLockedOutfit({
    gender: 'female',
    style: 'casual',
    archetype: 'young_tel_aviv',
    religiousRegister: 'secular',
  });
  const religiousFemale = computeLockedOutfit({
    gender: 'female',
    style: 'casual',
    archetype: 'mature_traditional',
    religiousRegister: 'religious',
  });
  assert(
    !/long-sleeve/i.test(secularFemale),
    '[V14 PR3.3] secular female casual outfit does NOT default to long sleeves',
  );
  assert(
    /long-sleeve/i.test(religiousFemale),
    '[V14 PR3.3] religious female casual outfit DOES include long sleeves',
  );
  assert(
    /skirt/i.test(religiousFemale),
    '[V14 PR3.3] religious female casual outfit includes a skirt (modest bottom)',
  );
  assert(
    /tichel|head/i.test(religiousFemale),
    '[V14 PR3.3] religious female outfit includes head covering reference',
  );
  assert(
    !/tichel|kippa/i.test(secularFemale),
    '[V14 PR3.3] secular female outfit does NOT include religious head-covering',
  );

  const traditionalMale = computeLockedOutfit({
    gender: 'male',
    style: 'casual',
    archetype: 'family_suburban',
    religiousRegister: 'traditional',
  });
  const religiousMale = computeLockedOutfit({
    gender: 'male',
    style: 'casual',
    archetype: 'mature_traditional',
    religiousRegister: 'religious',
  });
  const secularMale = computeLockedOutfit({
    gender: 'male',
    style: 'casual',
    archetype: 'young_tel_aviv',
    religiousRegister: 'secular',
  });
  assert(
    /kippa/i.test(traditionalMale),
    '[V14 PR3.3] traditional male outfit includes a kippa reference',
  );
  assert(
    /kippa/i.test(religiousMale),
    '[V14 PR3.3] religious male outfit includes a kippa reference',
  );
  assert(
    !/kippa/i.test(secularMale),
    '[V14 PR3.3] secular male outfit does NOT include a kippa',
  );
}

// ── 4. Product-category bias ────────────────────────────────────────────────
{
  const baseSporty = computeLockedOutfit({
    gender: 'female',
    style: 'sporty',
    archetype: 'young_tel_aviv',
    religiousRegister: 'secular',
  });
  const fitnessSporty = computeLockedOutfit({
    gender: 'female',
    style: 'sporty',
    archetype: 'young_tel_aviv',
    religiousRegister: 'secular',
    productCategory: 'fitness',
  });
  // Fitness pushes a more athletic top reading even on the sporty style.
  assert(
    baseSporty !== fitnessSporty,
    '[V14 PR3.4] productCategory="fitness" alters outfit even on sporty base style',
  );
  assert(
    /athletic|sport|moisture/i.test(fitnessSporty),
    '[V14 PR3.4] fitness outfit reads as athletic',
  );
}

// ── 5. Component completeness ───────────────────────────────────────────────
{
  for (const gender of ['female', 'male'] as const) {
    for (const style of ['casual', 'sporty', 'professional', 'lifestyle'] as const) {
      const outfit = computeLockedOutfit({
        gender,
        style,
        archetype: 'young_tel_aviv',
        religiousRegister: 'secular',
      });
      // Top
      assert(
        /shirt|tee|t-shirt|top|tank|blouse|button-up/i.test(outfit),
        `[V14 PR3.5] ${gender}/${style} outfit includes a recognizable top`,
        `got: "${outfit}"`,
      );
      // Bottom
      assert(
        /jeans|trousers|shorts|skirt|chinos|leggings|joggers/i.test(outfit),
        `[V14 PR3.5] ${gender}/${style} outfit includes a recognizable bottom`,
        `got: "${outfit}"`,
      );
      // Footwear
      assert(
        /sneakers|loafers|sandals|shoes|boots/i.test(outfit),
        `[V14 PR3.5] ${gender}/${style} outfit includes recognizable footwear`,
        `got: "${outfit}"`,
      );
    }
  }
}

// ── 6. End-to-end: brief carries the outfit verbatim into final prompt ─────
{
  const lockedOutfit =
    'oversized white cotton t-shirt, medium-blue denim cut-off shorts, white chunky low-top sneakers';
  const brief = buildImageBrief({
    sceneNumber: 2,
    totalScenes: 6,
    sceneGoal: 'lifestyle',
    sceneGenerationType: 'lifestyle',
    faceVisibility: 'partial_face',
    spokenTextHebrew: 'אני אוהבת את זה',
    rawVisualBrief: 'walking down a Tel Aviv street, casual',
    cameraDirection: null,
    intelligence: null,
    outfitDescriptionLocked: lockedOutfit,
  });
  assert(
    brief.frameTechniqueSnippetIds.includes('frame-technique.consistency_anchor'),
    '[V14 PR3.6] consistency_anchor fires when totalScenes>1',
  );
  assert(
    brief.finalImagePrompt.includes(lockedOutfit),
    '[V14 PR3.6] finalImagePrompt contains the locked outfit string verbatim',
  );

  // Snippet directly: outfit text lands in positive body
  const snippet = consistencyAnchorSnippet({
    totalScenes: 6,
    outfitDescriptionLocked: lockedOutfit,
  });
  assert(
    snippet.positive.includes(lockedOutfit),
    '[V14 PR3.6] consistencyAnchorSnippet quotes lockedOutfit verbatim',
  );
}

// ── 7. Avatar description byte-identity (pure function) ─────────────────────
{
  const a = AVATAR_CATALOG[0];
  if (!a) throw new Error('catalog empty');
  const first = describeAvatar(a);
  let mismatch = 0;
  for (let i = 0; i < 100; i++) {
    if (describeAvatar(a) !== first) mismatch++;
  }
  assert(
    mismatch === 0,
    '[V14 PR3.7] describeAvatar is byte-identical across 100 calls (same input → same output)',
    mismatch ? `${mismatch} drifted` : '',
  );

  // Cross-check: every avatar in the catalog produces a stable, unique
  // description for itself.
  for (const av of AVATAR_CATALOG) {
    const d1 = describeAvatar(av);
    const d2 = describeAvatar(av);
    assert(
      d1 === d2,
      `[V14 PR3.7] describeAvatar("${av.id}") byte-identical across calls`,
    );
  }
}

// ── 8. findAvatar + describeAvatar are deterministic by ID ─────────────────
{
  const id = AVATAR_CATALOG[0]?.id ?? 'noa';
  const a = findAvatar(id);
  if (!a) throw new Error(`avatar ${id} missing`);
  const d1 = describeAvatar(a);
  const a2 = findAvatar(id);
  if (!a2) throw new Error(`avatar ${id} missing on re-lookup`);
  const d2 = describeAvatar(a2);
  assert(
    d1 === d2,
    '[V14 PR3.8] avatar id → description is stable across catalog re-reads',
  );
}

// ── 9. Legacy fixture — no outfit lock → consistency anchor falls back ─────
{
  const brief = buildImageBrief({
    sceneNumber: 1,
    totalScenes: 5,
    sceneGoal: 'demo',
    sceneGenerationType: 'product_demo',
    faceVisibility: 'no_face',
    spokenTextHebrew: '',
    rawVisualBrief: 'product demo',
    cameraDirection: null,
    intelligence: null,
    // no outfitDescriptionLocked
  });
  assert(
    brief.frameTechniqueSnippetIds.includes('frame-technique.consistency_anchor'),
    '[V14 PR3.9] legacy brief still gets consistency_anchor (totalScenes>1)',
  );
  assert(
    /Outfit drift is a distraction/.test(brief.finalImagePrompt),
    '[V14 PR3.9] consistency_anchor falls back to generic continuity instruction without lockedOutfit',
  );
}

// ── 10. PR2 regression — selector still receives outfit when passed ────────
{
  const lockedOutfit = 'plain heather-grey cotton t-shirt, medium-blue denim';
  const brief = buildImageBrief({
    sceneNumber: 0,
    totalScenes: 4,
    sceneGoal: 'hook',
    sceneGenerationType: 'selfie_talking',
    faceVisibility: 'clear_front_facing',
    spokenTextHebrew: 'תקשיבי',
    rawVisualBrief: 'selfie talking',
    cameraDirection: null,
    intelligence: null,
    outfitDescriptionLocked: lockedOutfit,
  });
  // Both PR2 snippets (selfie_handheld + consistency_anchor) should fire and
  // the brief should embed the outfit string verbatim via the anchor.
  assert(
    brief.frameTechniqueSnippetIds.includes('frame-technique.selfie_handheld'),
    '[V14 PR3.10] selfie_handheld snippet still fires for selfie_talking',
  );
  assert(
    brief.frameTechniqueSnippetIds.includes('frame-technique.consistency_anchor'),
    '[V14 PR3.10] consistency_anchor still fires alongside selfie_handheld',
  );
  assert(
    brief.finalImagePrompt.includes(lockedOutfit),
    '[V14 PR3.10] outfit lands in finalImagePrompt for multi-snippet scene',
  );
}

// ── 11. Spot check — every avatar in the catalog produces a valid outfit ───
//
// This guards against an avatar metadata drift breaking the outfit builder
// (e.g. an archetype enum value being added without a matching outfit case).
{
  let bad = 0;
  for (const av of AVATAR_CATALOG) {
    let outfit = '';
    let threw = false;
    try {
      outfit = computeLockedOutfit({
        gender: av.gender,
        style: av.style,
        archetype: av.archetype,
        religiousRegister: av.religiousRegister,
      });
    } catch (e) {
      threw = true;
      console.error(`   threw on "${av.id}": ${(e as Error).message}`);
    }
    if (threw || !outfit || outfit.length < 20) {
      bad++;
    }
  }
  assert(
    bad === 0,
    `[V14 PR3.11] every avatar in the catalog produces a valid (≥20 char) outfit (${AVATAR_CATALOG.length} checked)`,
    bad ? `${bad} avatars failed to produce a valid outfit` : '',
  );
}

console.log('');
if (failures === 0) {
  console.log('V14 PR3 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`V14 PR3 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
