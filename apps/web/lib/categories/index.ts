// Product category catalog. Drives how the LLM writes scripts (which beats /
// settings make sense for the category) and how gpt-image-2 frames each scene.
//
// Each category has:
//   - id            machine code passed to the LLM
//   - labelHebrew   shown to the user
//   - labelEnglish  used in the LLM prompt
//   - guidance      a short directive the LLM uses when writing 6 scripts
//                   for this category. Mentions natural settings, when to
//                   keep / vary outfits, common camera angles.

export type ProductCategoryId =
  | 'skincare'
  | 'haircare'
  | 'beauty'
  | 'fitness'
  | 'food_snack'
  | 'kitchen_tool'
  | 'fashion'
  | 'tech_gadget'
  | 'wellness_sleep'
  | 'baby_kids'
  | 'pets'
  | 'home_cleaning'
  | 'jewelry_accessory'
  | 'supplement'
  | 'other';

export interface ProductCategory {
  id: ProductCategoryId;
  labelHebrew: string;
  labelEnglish: string;
  guidance: string;
}

export const CATEGORIES: ProductCategory[] = [
  {
    id: 'skincare',
    labelHebrew: 'טיפוח עור / סקינקייר',
    labelEnglish: 'Skincare',
    guidance:
      'Beats live around bathroom mirrors, vanities, post-shower glow. Outfits often the same (robe, oversized tee). Mirror selfies welcome — character holds phone at arm height. Lighting: soft natural daylight from window or warm bathroom lamps. Common poses: hands on face, applying product, examining skin in mirror, smile of relief.',
  },
  {
    id: 'haircare',
    labelHebrew: 'טיפוח שיער',
    labelEnglish: 'Haircare',
    guidance:
      'Bathroom or vanity scenes. Hair-focused close-ups (running fingers through hair, brushing). Mirror selfies common. Outfits: same robe / casual top across scenes. Variety comes from before/after hair states, not location.',
  },
  {
    id: 'beauty',
    labelHebrew: 'איפור / יופי',
    labelEnglish: 'Beauty / makeup',
    guidance:
      'Vanity or bathroom mirror, getting-ready energy. Selfie shots and mirror reflections are core. Show application action (lipstick, mascara, blush) close-up. Outfit can change between "just woke up" and "ready to go out" beats.',
  },
  {
    id: 'fitness',
    labelHebrew: 'כושר / ספורט',
    labelEnglish: 'Fitness / sports',
    guidance:
      'Gym, home workout, post-workout cooldown, meal prep. OUTFITS CHANGE: workout gear in active scenes, casual after. Locations vary: home → gym → kitchen for protein meal. Sweaty realism, not glamour.',
  },
  {
    id: 'food_snack',
    labelHebrew: 'מזון / חטיף',
    labelEnglish: 'Food / snack',
    guidance:
      'Kitchen counter, breakfast nook, on-the-go (bag, car, office). Hand-and-product close-ups, biting / sipping moments. Settings vary. Outfits casual.',
  },
  {
    id: 'kitchen_tool',
    labelHebrew: 'מטבח / כלי מטבח',
    labelEnglish: 'Kitchen tool',
    guidance:
      'Kitchen counter is the home base. Action shots: cooking, prepping, before/after of food. Outfits same casual home wear. Camera angles vary: top-down on counter, side view of action, close-up on tool.',
  },
  {
    id: 'fashion',
    labelHebrew: 'אופנה / ביגוד',
    labelEnglish: 'Fashion / clothing',
    guidance:
      'OUTFIT-OF-THE-DAY mindset: the OUTFIT IS the product, so each scene shows it from a different angle and a different setting (mirror getting ready → walking outside → at café → meeting friends). Mirror selfies natural. Locations vary.',
  },
  {
    id: 'tech_gadget',
    labelHebrew: 'טק / גאדג׳ט',
    labelEnglish: 'Tech / gadget',
    guidance:
      'Desk, problem-solving moments, hands using the device. Show the pain ("I keep forgetting…") and the relief ("now I just…"). Settings: home office, café, on-the-go. Outfits casual, can stay similar.',
  },
  {
    id: 'wellness_sleep',
    labelHebrew: 'וולנס / שינה',
    labelEnglish: 'Wellness / sleep',
    guidance:
      'Bedroom, evening routine, dim warm light. Pajamas / loungewear outfits. Slow, intimate beats. Shots of person in bed, on nightstand product, dim lamp light. Same setting and outfit across scenes is appropriate.',
  },
  {
    id: 'baby_kids',
    labelHebrew: 'תינוקות וילדים',
    labelEnglish: 'Baby / kids',
    guidance:
      'Home settings (living room, kid bedroom, kitchen). Parent-child interaction. The PARENT is usually on camera (the avatar), the kid is implied or in arms. Casual home outfits. Real-life messy energy.',
  },
  {
    id: 'pets',
    labelHebrew: 'חיות מחמד',
    labelEnglish: 'Pets',
    guidance:
      'Home or outdoor. Pet must be in frame in some scenes. Casual outfits. Real-life owner-pet moments — playful or messy.',
  },
  {
    id: 'home_cleaning',
    labelHebrew: 'בית / ניקיון',
    labelEnglish: 'Home / cleaning',
    guidance:
      'Living room, kitchen, bathroom — wherever the cleaning happens. Before/after is the dominant arc. Same outfit (cleaning clothes) across scenes is fine. Action shots of using the product.',
  },
  {
    id: 'jewelry_accessory',
    labelHebrew: 'תכשיטים / אקססוריז',
    labelEnglish: 'Jewelry / accessory',
    guidance:
      'Hand and neck close-ups dominate. Mirror reflections. Outfit can change to show how the piece dresses up different looks. Soft natural light, shimmer.',
  },
  {
    id: 'supplement',
    labelHebrew: 'תוספי תזונה / ויטמינים',
    labelEnglish: 'Supplement / vitamins',
    guidance:
      'Kitchen counter morning routine, water glass nearby, breakfast. Sometimes gym/post-workout. Same outfit across morning beats; variation when showing energy throughout the day.',
  },
  {
    id: 'other',
    labelHebrew: 'אחר',
    labelEnglish: 'Other',
    guidance:
      'Pick settings and outfits that fit the product description. Aim for variety across the 5 scenes — different angles, different beats — unless the product clearly belongs to a single setting.',
  },
];

export function findCategory(id: string | null | undefined): ProductCategory | null {
  if (!id) return null;
  return CATEGORIES.find((c) => c.id === id) ?? null;
}

// Used by the script-gen LLM. Returns a few sentences telling it how to vary
// (or not vary) outfits/settings/poses across the 5 scenes.
export function categoryGuidance(id: string | null | undefined): string {
  const cat = findCategory(id);
  if (!cat) return CATEGORIES.find((c) => c.id === 'other')!.guidance;
  return cat.guidance;
}

// Lightweight heuristic to guess a category from product name + description.
// Used as a default in step 1 — user can always override.
export function guessCategory(input: { name: string; description: string }): ProductCategoryId {
  const text = `${input.name ?? ''} ${input.description ?? ''}`.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => text.includes(n));

  if (has('serum', 'cream', 'moisturizer', 'cleanser', 'toner', 'spf', 'סרום', 'קרם פנים', 'קרם לחות', 'מנקה'))
    return 'skincare';
  if (has('shampoo', 'conditioner', 'hair mask', 'שמפו', 'מרכך'))
    return 'haircare';
  if (has('lipstick', 'mascara', 'foundation', 'blush', 'eyeliner', 'איפור', 'שפתון'))
    return 'beauty';
  if (has('protein', 'whey', 'pre-workout', 'creatine', 'חלבון', 'יותר אנרגיה', 'אימון'))
    return 'fitness';
  if (has('snack', 'chocolate', 'bar', 'drink', 'soda', 'חטיף', 'משקה', 'שוקולד'))
    return 'food_snack';
  if (has('blender', 'pan', 'pot', 'kitchen', 'cookware', 'spatula', 'מחבת', 'סיר', 'בלנדר'))
    return 'kitchen_tool';
  if (has('shirt', 'dress', 'jeans', 'jacket', 'shoes', 'sneakers', 'בגד', 'נעליים', 'חולצה', 'שמלה'))
    return 'fashion';
  if (has('headphone', 'earbud', 'charger', 'cable', 'speaker', 'phone case', 'gadget', 'אוזניות', 'מטען'))
    return 'tech_gadget';
  if (has('mattress', 'pillow', 'sleep', 'melatonin', 'מזרון', 'כרית', 'שינה'))
    return 'wellness_sleep';
  if (has('baby', 'toddler', 'diaper', 'stroller', 'תינוק', 'תינוקת', 'חיתול', 'עגלה'))
    return 'baby_kids';
  if (has('dog', 'cat', 'pet', 'leash', 'collar', 'כלב', 'חתול', 'חיית מחמד'))
    return 'pets';
  if (has('cleaner', 'detergent', 'wipes', 'mop', 'ניקוי', 'מטהר'))
    return 'home_cleaning';
  if (has('necklace', 'ring', 'bracelet', 'earring', 'תכשיט', 'שרשרת', 'טבעת', 'עגיל'))
    return 'jewelry_accessory';
  if (has('vitamin', 'supplement', 'omega', 'collagen', 'magnesium', 'ויטמין', 'תוסף'))
    return 'supplement';
  return 'other';
}
