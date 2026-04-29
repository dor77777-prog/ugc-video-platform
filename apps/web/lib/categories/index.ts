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

// Lightweight heuristic to guess a category from product name +
// description. Used as a default in step 1 — user can always override,
// and the V11 dossier path overrides it again with a much-better LLM
// classification (see mapDossierCategoryToId below).
//
// We score each category instead of first-match because many product
// descriptions hit more than one keyword family (e.g. a haircare
// serum's description mentions "serum" too — but should land on
// haircare, not skincare). The category with the most keyword hits
// wins; ties break on declaration order.
const CATEGORY_KEYWORDS: Array<{ id: ProductCategoryId; words: string[] }> = [
  {
    id: 'haircare',
    words: [
      // English
      'shampoo', 'conditioner', 'hair mask', 'hair oil', 'hair serum',
      'hair growth', 'hair treatment', 'scalp', 'scalp serum', 'scalp treatment',
      'follicle', 'roots', 'dandruff', 'hair loss', 'thinning hair',
      'hair brush', 'hair roller', 'leave-in', 'heat protectant', 'split ends',
      'hair styling', 'curl cream', 'frizz', 'porosity',
      // Hebrew
      'שמפו', 'מרכך', 'מסכת שיער', 'שמן שיער', 'סרום שיער',
      'קרקפת', 'שורשי השיער', 'שורשים', 'נשירת שיער', 'שיער מידלדל',
      'מברשת שיער', 'גידול שיער', 'קשקשים', 'מסלסל', 'מחליק שיער',
    ],
  },
  {
    id: 'skincare',
    words: [
      // English — explicit FACE skincare
      'face serum', 'face cream', 'moisturizer', 'cleanser', 'toner',
      'spf', 'sunscreen', 'face wash', 'face mask', 'eye cream',
      'retinol', 'hyaluronic', 'niacinamide', 'vitamin c serum', 'face peel',
      'acne', 'pimple', 'wrinkle', 'anti-aging', 'pore', 'blackhead',
      'face oil', 'serum', 'skincare', 'skin care',
      // Hebrew
      'סרום פנים', 'קרם פנים', 'קרם לחות', 'מנקה פנים', 'טונר',
      'הגנה מהשמש', 'מסכת פנים', 'קרם עיניים', 'רטינול',
      'אקנה', 'פצעונים', 'קמטים', 'נוגד הזדקנות', 'נקבוביות',
    ],
  },
  {
    id: 'beauty',
    words: [
      'lipstick', 'mascara', 'foundation', 'concealer', 'blush', 'eyeliner',
      'eyeshadow', 'highlighter', 'bronzer', 'lip gloss', 'lip liner',
      'brow', 'eyebrow', 'nail polish', 'manicure', 'pedicure',
      'איפור', 'שפתון', 'מסקרה', 'מייקאפ', 'אייליינר', 'צללית', 'סומק',
      'גבות', 'לק', 'מניקור', 'פדיקור',
    ],
  },
  {
    id: 'fitness',
    words: [
      'protein', 'whey', 'pre-workout', 'pre workout', 'creatine', 'bcaa',
      'workout', 'gym', 'fitness', 'crossfit', 'yoga mat', 'resistance band',
      'dumbbell', 'kettlebell', 'training', 'recovery', 'muscle',
      'חלבון', 'אימון', 'אימונים', 'כושר', 'יוגה', 'מתח', 'משקולות',
      'חדר כושר', 'התאוששות',
    ],
  },
  {
    id: 'food_snack',
    words: [
      'snack', 'chocolate', 'bar', 'cookie', 'biscuit', 'soda', 'juice',
      'energy drink', 'protein bar', 'granola', 'cereal', 'candy',
      'tea', 'coffee', 'beverage', 'sparkling water',
      'חטיף', 'משקה', 'שוקולד', 'קפה', 'תה', 'עוגייה', 'גרנולה',
      'דגנים', 'ממתק', 'מיץ',
    ],
  },
  {
    id: 'kitchen_tool',
    words: [
      'blender', 'pan', 'pot', 'cookware', 'spatula', 'whisk', 'knife set',
      'cutting board', 'air fryer', 'toaster', 'kettle', 'mixer',
      'food processor', 'cookie sheet', 'measuring cup',
      'מחבת', 'סיר', 'בלנדר', 'מיקסר', 'סכין', 'קרש חיתוך',
      'אייר פרייר', 'טוסטר', 'קומקום',
    ],
  },
  {
    id: 'fashion',
    words: [
      'shirt', 't-shirt', 'tshirt', 'dress', 'jeans', 'jacket', 'coat',
      'shoes', 'sneakers', 'sandals', 'boots', 'bag', 'handbag', 'backpack',
      'belt', 'scarf', 'hat', 'sunglasses', 'wallet', 'denim',
      'בגד', 'בגדים', 'נעליים', 'חולצה', 'שמלה', 'מכנסיים', 'ג׳ינס',
      'תיק', 'משקפי שמש', 'כובע', 'סנדלים',
    ],
  },
  {
    id: 'tech_gadget',
    words: [
      'headphone', 'headphones', 'earbud', 'earbuds', 'charger', 'cable',
      'usb-c', 'speaker', 'bluetooth', 'phone case', 'screen protector',
      'gadget', 'tablet', 'laptop stand', 'wireless', 'powerbank',
      'אוזניות', 'מטען', 'מטענים', 'רמקול', 'בלוטות', 'כיסוי לטלפון',
      'מגן מסך', 'גאדג׳ט', 'מטען נייד',
    ],
  },
  {
    id: 'wellness_sleep',
    words: [
      'mattress', 'pillow', 'sleep', 'sleep aid', 'melatonin', 'sleep mask',
      'silk pillowcase', 'memory foam', 'weighted blanket', 'meditation',
      'מזרון', 'כרית', 'שינה', 'שינה טובה', 'מלטונין', 'מסכת שינה',
      'שמיכה כבדה', 'מדיטציה',
    ],
  },
  {
    id: 'baby_kids',
    words: [
      'baby', 'toddler', 'newborn', 'diaper', 'stroller', 'pacifier',
      'baby food', 'baby bottle', 'crib', 'bib', 'kid', 'child',
      'תינוק', 'תינוקת', 'חיתול', 'חיתולים', 'עגלה', 'מוצץ',
      'בקבוק תינוק', 'מיטת תינוק', 'ילדים', 'ילד',
    ],
  },
  {
    id: 'pets',
    words: [
      'dog', 'cat', 'pet', 'leash', 'collar', 'pet food', 'cat litter',
      'pet bed', 'pet toy', 'aquarium',
      'כלב', 'חתול', 'חיית מחמד', 'מזון לכלב', 'מזון לחתול', 'רצועה',
    ],
  },
  {
    id: 'home_cleaning',
    words: [
      'cleaner', 'detergent', 'wipes', 'mop', 'sponge', 'spray bottle',
      'all-purpose', 'multi-surface', 'descaler', 'fabric softener',
      'ניקוי', 'מטהר', 'מנקה', 'סבון כלים', 'מגבונים', 'מטהר אוויר',
    ],
  },
  {
    id: 'jewelry_accessory',
    words: [
      'necklace', 'ring', 'bracelet', 'earring', 'pendant', 'chain',
      'watch', 'jewelry', 'gold', 'silver', 'diamond',
      'תכשיט', 'תכשיטים', 'שרשרת', 'טבעת', 'עגיל', 'צמיד', 'שעון יד',
    ],
  },
  {
    id: 'supplement',
    words: [
      'vitamin', 'supplement', 'omega', 'omega-3', 'collagen', 'magnesium',
      'multivitamin', 'probiotic', 'fish oil', 'biotin', 'zinc', 'b12',
      'turmeric', 'ashwagandha',
      'ויטמין', 'תוסף', 'תוסף תזונה', 'אומגה', 'קולגן', 'מגנזיום',
      'פרוביוטיקה', 'ביוטין',
    ],
  },
];

export function guessCategory(input: { name: string; description: string }): ProductCategoryId {
  const text = `${input.name ?? ''} ${input.description ?? ''}`.toLowerCase();
  if (text.trim().length < 3) return 'other';
  let bestId: ProductCategoryId = 'other';
  let bestScore = 0;
  for (const { id, words } of CATEGORY_KEYWORDS) {
    let score = 0;
    for (const w of words) {
      if (!w) continue;
      const needle = w.toLowerCase();
      // Word-boundary match for ASCII; `includes` for Hebrew/multi-char.
      if (/^[\x00-\x7F]+$/.test(needle)) {
        const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (re.test(text)) score++;
      } else if (text.includes(needle)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  // Single-keyword hits in `other`-leaning text aren't strong enough.
  // Require at least one match before promoting away from 'other'.
  return bestScore > 0 ? bestId : 'other';
}

// Map a free-form category string from the V11 Product Intelligence
// dossier ("scalp serum applicator" / "haircare / hair growth" /
// "Israeli skincare brand") onto one of our discrete category IDs.
// Used by scripts/actions.ts to override the heuristic guess once
// the dossier is built — same fuzzy keyword approach as
// guessCategory, just runs against the dossier's category +
// subcategory + productType strings.
export function mapDossierCategoryToId(
  dossierCategory: string | null | undefined,
  dossierSubcategory?: string | null,
  dossierProductType?: string | null,
): ProductCategoryId {
  const text = [dossierCategory, dossierSubcategory, dossierProductType]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .join(' ')
    .toLowerCase();
  if (!text.trim()) return 'other';
  return guessCategory({ name: text, description: '' });
}
