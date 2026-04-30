// Outfit lock — V14 PR3.
//
// Deterministic outfit builder — same (gender, archetype, religiousRegister,
// style, productCategory) → byte-identical outfit string. The result lands
// on Project.productData.lockedOutfit on first scene generation, then
// flows verbatim into the consistencyAnchorSnippet so every scene of the
// same ad sees the SAME outfit text.
//
// Why an outfit lock matters: a 30s tachles ad has 5–7 scenes. Even when
// the avatar's face is held by the reference image, the outfit drifts
// across scenes (a t-shirt changes color, sneakers turn into sandals,
// jewelry appears and disappears). Drifting outfits read "not the same
// person across scenes" almost as strongly as a drifting face does.
// FRAME_PROMPT_TECHNIQUES.md §5(e).
//
// Determinism contract: this module is pure (no LLM, no I/O, no
// Math.random / Date.now). Asserted in test-v14-pr3.ts.

import type {
  AvatarGender,
  AvatarStyle,
} from '@/lib/avatars/catalog';
import type {
  PersonaArchetype,
  ReligiousRegister,
} from '@/lib/scene-planning/israeli-realism-rules';

export interface OutfitInput {
  gender: AvatarGender;
  style: AvatarStyle;
  archetype: PersonaArchetype;
  religiousRegister: ReligiousRegister;
  /** Optional. When provided, biases the outfit (fitness → sportier even
   *  for "casual" style; fashion → no obvious sportswear). */
  productCategory?: string | null;
}

export function computeLockedOutfit(opts: OutfitInput): string {
  const top = buildTop(opts);
  const bottom = buildBottom(opts);
  const footwear = buildFootwear(opts);
  const accessories = buildAccessories(opts);
  const hairOrHead = buildHairOrHead(opts);

  const parts: string[] = [top, bottom, footwear];
  if (accessories) parts.push(accessories);
  if (hairOrHead) parts.push(hairOrHead);
  return parts.join(', ');
}

// ── Component builders ──────────────────────────────────────────────────────
//
// Pure switch-based composition. The exhaustive cases keep TypeScript happy
// when AvatarStyle / PersonaArchetype expand later — falling through is a
// type error, not a silent default.

function buildTop(opts: OutfitInput): string {
  const isReligiousFemale =
    opts.gender === 'female' && opts.religiousRegister !== 'secular';
  const isFitness =
    opts.productCategory != null && /fitness|sport|athleisure|workout/i.test(opts.productCategory);

  if (opts.gender === 'female') {
    switch (opts.style) {
      case 'casual':
        if (isReligiousFemale)
          return 'a relaxed-fit cream long-sleeve cotton top with a modest crew neckline';
        return 'an oversized white cotton t-shirt with a relaxed fit';
      case 'sporty':
        if (isReligiousFemale)
          return 'a long-sleeve charcoal athletic top in moisture-wicking fabric';
        if (isFitness) return 'a fitted black sports top with thin straps';
        return 'a fitted dusty-pink cropped tank top';
      case 'professional':
        if (isReligiousFemale)
          return 'a buttoned-up navy blouse with three-quarter sleeves';
        return 'a tucked-in cream silk blouse with rolled sleeves';
      case 'lifestyle':
        if (isReligiousFemale)
          return 'a flowy beige linen long-sleeve blouse with a high crew neckline';
        return 'a soft beige linen blouse with quarter-length sleeves';
    }
  }

  // male
  switch (opts.style) {
    case 'casual':
      return 'a plain heather-grey cotton t-shirt with a relaxed fit';
    case 'sporty':
      if (isFitness) return 'a fitted black athletic t-shirt in moisture-wicking fabric';
      return 'a navy fitted cotton athletic t-shirt';
    case 'professional':
      return 'a tucked-in white oxford button-up with rolled-up sleeves';
    case 'lifestyle':
      return 'an unbuttoned beige linen short-sleeve shirt over a plain white tee';
  }
}

function buildBottom(opts: OutfitInput): string {
  const isReligiousFemale =
    opts.gender === 'female' && opts.religiousRegister !== 'secular';

  if (opts.gender === 'female') {
    switch (opts.style) {
      case 'casual':
        if (isReligiousFemale)
          return 'a knee-length denim skirt with a modest A-line cut';
        return 'medium-blue denim cut-off shorts that hit mid-thigh';
      case 'sporty':
        if (isReligiousFemale)
          return 'full-length charcoal athletic leggings under a knee-length athletic skirt';
        return 'full-length charcoal athletic leggings';
      case 'professional':
        if (isReligiousFemale)
          return 'tailored ankle-length navy trousers with a slim cut';
        return 'tailored ankle-length cream trousers';
      case 'lifestyle':
        if (isReligiousFemale)
          return 'a flowy ankle-length sand-colored midi skirt';
        return 'wide-leg sand-colored cotton trousers';
    }
  }

  // male
  switch (opts.style) {
    case 'casual':
      return 'medium-blue straight-fit denim jeans with a slight cuff';
    case 'sporty':
      return 'full-length charcoal athletic joggers';
    case 'professional':
      return 'tailored ankle-length sand-colored chinos';
    case 'lifestyle':
      return 'wide-leg cream linen trousers';
  }
}

function buildFootwear(opts: OutfitInput): string {
  if (opts.gender === 'female') {
    switch (opts.style) {
      case 'casual':
        return 'white chunky low-top sneakers with no-show socks';
      case 'sporty':
        return 'pale-grey running shoes with thin athletic socks';
      case 'professional':
        return 'soft-leather almond-toe cream loafers';
      case 'lifestyle':
        return 'flat woven sand-colored slide sandals';
    }
  }

  switch (opts.style) {
    case 'casual':
      return 'white slim low-top sneakers with no-show socks';
    case 'sporty':
      return 'navy and white running shoes with low athletic socks';
    case 'professional':
      return 'tan-leather penny loafers, no socks';
    case 'lifestyle':
      return 'leather slide sandals in a natural tan finish';
  }
}

function buildAccessories(opts: OutfitInput): string {
  // Religious gating — sheitel/tichel are handled in buildHairOrHead so they
  // don't double up here. This builder handles jewelry / phone-grip / bags.
  if (opts.gender === 'female') {
    switch (opts.archetype) {
      case 'young_tel_aviv':
        return 'small silver hoop earrings, a thin gold chain, and a clear-cased iPhone';
      case 'aspirational_modern':
        return 'small gold studs, a delicate gold chain, and a slim Apple Watch';
      case 'family_suburban':
        return 'a thin pendant necklace and a tan crossbody bag strap';
      case 'periphery_practical':
        return 'small silver studs and a phone with a black silicone case';
      case 'outdoorsy':
        return 'a leather woven bracelet and a fabric phone wallet';
      case 'mature_traditional':
        return 'a single thin gold pendant necklace';
    }
  }

  switch (opts.archetype) {
    case 'young_tel_aviv':
      return 'a thin black braided bracelet and a clear-cased iPhone';
    case 'aspirational_modern':
      return 'a slim Apple Watch and a thin silver chain';
    case 'family_suburban':
      return 'a stainless steel watch with a leather strap';
    case 'periphery_practical':
      return 'a digital sports watch';
    case 'outdoorsy':
      return 'a paracord bracelet and a clip-on carabiner on the belt loop';
    case 'mature_traditional':
      return 'a slim leather-strap analog watch';
  }
}

function buildHairOrHead(opts: OutfitInput): string {
  // Religious married woman → tichel or sheitel reference (no specific
  // person/age hint here since the avatar reference image already carries
  // the face). Religious men → kippa note.
  if (opts.gender === 'female') {
    if (opts.religiousRegister === 'religious') {
      return 'a softly tied beige tichel covering the hair';
    }
    if (opts.religiousRegister === 'traditional') {
      return 'shoulder-length hair worn loose or in a low ponytail with a tortoiseshell hair clip';
    }
    // secular — sporty style overrides the archetype default with a more
    // active hair tie regardless of where the persona usually lives.
    if (opts.style === 'sporty') {
      return 'hair pulled into a high ponytail with a thin elastic';
    }
    switch (opts.archetype) {
      case 'young_tel_aviv':
        return 'shoulder-length hair pulled into a messy low bun with a soft scrunchie';
      case 'aspirational_modern':
        return 'mid-length hair styled loose with a soft blow-dry';
      case 'family_suburban':
        return 'mid-length hair tied back in a low ponytail';
      case 'periphery_practical':
        return 'hair pulled into a simple low ponytail';
      case 'outdoorsy':
        return 'hair pulled into a low braid';
      case 'mature_traditional':
        return 'shoulder-length hair worn loose with a side part';
    }
  }

  // male
  if (opts.religiousRegister === 'religious') {
    return 'wearing a black velvet kippa centered on the head';
  }
  if (opts.religiousRegister === 'traditional') {
    return 'wearing a small knitted modern-Orthodox kippa';
  }
  // secular — no head covering
  return '';
}
