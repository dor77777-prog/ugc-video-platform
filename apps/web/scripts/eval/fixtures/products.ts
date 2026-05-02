// Gold-set product fixtures — 9 products across 3 categories.
//
// These are RAW INPUTS. The bootstrap script
// (apps/web/scripts/eval/bootstrap-gold-set.ts) calls
// buildProductIntelligence() once per fixture and writes the result
// (input + intel) to .planning/eval/gold-set/<id>.json. The eval reads
// from those JSONs (NOT from this file) so that:
//   1. The eval is deterministic across runs (intel is pinned to disk)
//   2. We don't pay $0.10 of PI cost on every run
//   3. The intel matches the hashes the engine expects
//
// To re-bootstrap (after fixture edits or PI prompt changes):
//   npm run eval:script-engine:bootstrap
//
// To bootstrap just one product:
//   npm run eval:script-engine:bootstrap -- --only=cosmetics-1

export interface ProductFixture {
  /** Stable id, used as the JSON filename + as a row label in the run output. */
  id: string;
  /** One of cosmetics / electronics / food. Used by register-anchors to
   *  pick the right ❌/✅ exemplars per category for the judge. */
  category: 'cosmetics' | 'electronics' | 'food';
  /** Inputs to buildProductIntelligence. Mirrors the production scrape
   *  + user-confirm shape. */
  productData: {
    productName: string;
    brand: string | null;
    description: string;
    features: Array<{ id: string; title: string; hook: string; source: 'llm' | 'custom' }>;
    price: string | null;
    currency: string | null;
    sourceUrl: string | null;
    userNotes: string | null;
    categoryGuess: string | null;
    heroImageUrl: string | null;
    secondaryImageUrl: string | null;
  };
  /** Wizard-completion fields the script engine reads (avatar, mode, etc.). */
  scriptInput: {
    targetAudience: string;
    durationSeconds: 15 | 30;
    avatarDescription: string;
    avatarGender: 'male' | 'female';
    categoryId: string;
    categoryLabel: string;
    categoryGuidance: string;
  };
}

// Hero image URLs are intentionally null for now — buildProductIntelligence
// gracefully skips visual analysis when null and the audience inference
// already runs in parallel without it (V27.11.PR6). Adding hero images is
// a Sub-task 1.5 enhancement once the harness is proven.

export const PRODUCT_FIXTURES: ProductFixture[] = [
  {
    id: 'cosmetics-1',
    category: 'cosmetics',
    productData: {
      productName: 'סרום ויטמין C מוקצף',
      brand: 'Glow Lab',
      description:
        'סרום פנים יומי המבוסס על ויטמין C יציב בריכוז 15%, חומצה היאלורונית ופרוביוטיקה. מיועד לעור עייף, להפחתת כתמי שמש, חידוש קולגן והבהרה כללית. מתאים לבוקר, מתחת לקרם לחות. בקבוקון 30 מ"ל.',
      features: [
        { id: 'f1', title: 'ויטמין C יציב 15%', hook: 'אפקט הברקה תוך שבועיים', source: 'llm' },
        { id: 'f2', title: 'חומצה היאלורונית', hook: 'לחות עומק שלא מבריקה', source: 'llm' },
      ],
      price: '189',
      currency: 'שקלים',
      sourceUrl: null,
      userNotes: null,
      categoryGuess: 'skincare',
      heroImageUrl: null,
      secondaryImageUrl: null,
    },
    scriptInput: {
      targetAudience: 'נשים 28-45 עם עור עייף אחרי לידות / שינה לקויה',
      durationSeconds: 30,
      avatarDescription: 'late-twenties Israeli woman, Tel Aviv, casual style',
      avatarGender: 'female',
      categoryId: 'skincare',
      categoryLabel: 'skincare',
      categoryGuidance: 'mirror selfies בבית, vanity, bathroom. אור בוקר רך.',
    },
  },
  {
    id: 'cosmetics-2',
    category: 'cosmetics',
    productData: {
      productName: 'מסכת שיער טיפוח עמוק עם שמן ארגן',
      brand: 'Sahara Hair',
      description:
        'מסכת שיער שבועית עם שמן ארגן מרוקאי וקרטין צמחי. משקמת שיער יבש, פגום וצבוע. שימוש: 10 דקות פעם בשבוע אחרי שמפו. צנצנת 250 מ"ל.',
      features: [
        { id: 'f1', title: 'שמן ארגן מרוקאי', hook: 'שיער חלק תוך שימוש אחד', source: 'llm' },
        { id: 'f2', title: 'שיקום שיער צבוע', hook: 'הצבע נשאר רענן יותר זמן', source: 'llm' },
      ],
      price: '79',
      currency: 'שקלים',
      sourceUrl: null,
      userNotes: null,
      categoryGuess: 'haircare',
      heroImageUrl: null,
      secondaryImageUrl: null,
    },
    scriptInput: {
      targetAudience: 'נשים 25-40 עם שיער יבש או צבוע',
      durationSeconds: 30,
      avatarDescription: 'mid-thirties Israeli woman, Haifa, hair-conscious',
      avatarGender: 'female',
      categoryId: 'haircare',
      categoryLabel: 'haircare',
      categoryGuidance: 'אמבטיה אחרי מקלחת, שיער רטוב, מגבת על הכתפיים.',
    },
  },
  {
    id: 'cosmetics-3',
    category: 'cosmetics',
    productData: {
      productName: 'קרם ידיים אנטי-אייג\'ינג',
      brand: 'Soft Touch',
      description:
        'קרם ידיים יומי עם רטינול קל, חומצה היאלורונית וקולגן. מטפל בכתמי גיל בידיים, מחזק את העור ומונע יובש. נספג מהר, לא משאיר שכבה דביקה. שפופרת 75 מ"ל.',
      features: [
        { id: 'f1', title: 'נסיגה מיידית, בלי שכבה דביקה', hook: 'אפשר להמשיך ישר עם הטלפון', source: 'llm' },
        { id: 'f2', title: 'מטפל בכתמי גיל', hook: 'כתמים מתבהרים תוך שבועות', source: 'llm' },
      ],
      price: '49',
      currency: 'שקלים',
      sourceUrl: null,
      userNotes: null,
      categoryGuess: 'skincare',
      heroImageUrl: null,
      secondaryImageUrl: null,
    },
    scriptInput: {
      targetAudience: 'נשים 35-55 שמתחילות לראות שינוי בידיים',
      durationSeconds: 15,
      avatarDescription: 'mid-forties Israeli woman, Sharon area, polished casual',
      avatarGender: 'female',
      categoryId: 'skincare',
      categoryLabel: 'skincare',
      categoryGuidance: 'בית, סלון, אור טבעי, יד מורמת.',
    },
  },

  {
    id: 'electronics-1',
    category: 'electronics',
    productData: {
      productName: 'אוזניות בלוטות\' עם ביטול רעשים',
      brand: 'AudioMax',
      description:
        'אוזניות אלחוטיות עם ביטול רעשים אקטיבי, סוללה ל-30 שעות, חיבור Bluetooth 5.3 וקצף זיכרון. מתאימות לעבודה, נסיעות ופעילות ספורטיבית. מגיעות עם נרתיק טעינה ומוט שדרוג.',
      features: [
        { id: 'f1', title: 'ביטול רעשים אקטיבי', hook: 'גם בקפה הכי רועש', source: 'llm' },
        { id: 'f2', title: '30 שעות סוללה', hook: 'טיסה בינלאומית בלי דאגה', source: 'llm' },
      ],
      price: '349',
      currency: 'שקלים',
      sourceUrl: null,
      userNotes: null,
      categoryGuess: 'electronics',
      heroImageUrl: null,
      secondaryImageUrl: null,
    },
    scriptInput: {
      targetAudience: 'גילאי 25-45 שעובדים מהבית או נוסעים הרבה',
      durationSeconds: 30,
      avatarDescription: 'late-twenties Israeli man, Tel Aviv, hybrid worker',
      avatarGender: 'male',
      categoryId: 'electronics',
      categoryLabel: 'electronics',
      categoryGuidance: 'בית קפה, משרד, רחוב. אור טבעי שדרך החלון.',
    },
  },
  {
    id: 'electronics-2',
    category: 'electronics',
    productData: {
      productName: 'מטען נייד 20,000mAh',
      brand: 'PowerCore',
      description:
        'סוללת גיבוי נייידת לטלפון/טאבלט עם תפוקה של 20,000mAh, 2 חיבורי USB-A ו-USB-C, טעינה מהירה (PD 22.5W) ומסך LCD המציג את אחוזי הסוללה. שוקלת 350 גרם.',
      features: [
        { id: 'f1', title: 'PD 22.5W טעינה מהירה', hook: 'מאפס ל-50% תוך 25 דק\'', source: 'llm' },
        { id: 'f2', title: 'מסך LCD עם אחוזים', hook: 'יודעת בדיוק כמה נשאר', source: 'llm' },
      ],
      price: '129',
      currency: 'שקלים',
      sourceUrl: null,
      userNotes: null,
      categoryGuess: 'electronics',
      heroImageUrl: null,
      secondaryImageUrl: null,
    },
    scriptInput: {
      targetAudience: 'סטודנטים, מטיילים, אנשי שטח',
      durationSeconds: 15,
      avatarDescription: 'early-twenties Israeli woman, Jerusalem student',
      avatarGender: 'female',
      categoryId: 'electronics',
      categoryLabel: 'electronics',
      categoryGuidance: 'תרמיל, אוטובוס, ספרייה. אור טבעי.',
    },
  },
  {
    id: 'electronics-3',
    category: 'electronics',
    productData: {
      productName: 'מצלמת רחוב חכמה לרכב',
      brand: 'RoadEye',
      description:
        'מצלמת דאש קאם 4K לרכב עם זיהוי תאונות אוטומטי, חיישן G, GPS וצילום לילה משופר. מתחברת ל-Wi-Fi וצופים בלייב מהאפליקציה. מתאימה לכל סוגי הרכב, התקנה עצמית בלי כבלים.',
      features: [
        { id: 'f1', title: 'זיהוי תאונות אוטומטי', hook: 'הקלטה נשמרת גם אם הרכב כבוי', source: 'llm' },
        { id: 'f2', title: '4K + צילום לילה', hook: 'רואים מספרי רישוי גם בחושך', source: 'llm' },
      ],
      price: '459',
      currency: 'שקלים',
      sourceUrl: null,
      userNotes: null,
      categoryGuess: 'electronics',
      heroImageUrl: null,
      secondaryImageUrl: null,
    },
    scriptInput: {
      targetAudience: 'בעלי רכב פרטי, נהגי משלוחים',
      durationSeconds: 30,
      avatarDescription: 'mid-thirties Israeli man, Be\'er Sheva, owner-driver',
      avatarGender: 'male',
      categoryId: 'electronics',
      categoryLabel: 'electronics',
      categoryGuidance: 'תוך הרכב, חניון, רחוב. דאש בולט בקדמת הרכב.',
    },
  },

  {
    id: 'food-1',
    category: 'food',
    productData: {
      productName: 'גרנולה עם פרוטאין צמחי',
      brand: 'Wholesome',
      description:
        'גרנולה אפויה ידנית עם 18 גרם חלבון לקופסה, חופן שקדים, סירופ תמרים וקקאו גולמי. ללא תוספת סוכר, ללא גלוטן, ללא חומרים משמרים. שקית 350 גרם.',
      features: [
        { id: 'f1', title: '18 גרם חלבון לקופסה', hook: 'ארוחת בוקר שמחזיקה עד 12:00', source: 'llm' },
        { id: 'f2', title: 'בלי תוספת סוכר', hook: 'הסירופ הוא תמר טבעי בלבד', source: 'llm' },
      ],
      price: '34',
      currency: 'שקלים',
      sourceUrl: null,
      userNotes: null,
      categoryGuess: 'food',
      heroImageUrl: null,
      secondaryImageUrl: null,
    },
    scriptInput: {
      targetAudience: 'נשים 25-40 שמתאמנות + רוצות בריא ונוח',
      durationSeconds: 15,
      avatarDescription: 'late-twenties Israeli woman, Ramat Gan, fitness-focused',
      avatarGender: 'female',
      categoryId: 'food',
      categoryLabel: 'food',
      categoryGuidance: 'מטבח בית, ארוחת בוקר על השיש, אור בוקר.',
    },
  },
  {
    id: 'food-2',
    category: 'food',
    productData: {
      productName: 'קוביות תה לימון-זנגביל בכוסיות',
      brand: 'Tea Pop',
      description:
        'קוביות תה תמציתיות במכלים יחידים. ממיסים בכוס מים חמים וקיבלת תה לימון-זנגביל מוכן. ללא תוספת סוכר, מתוק טבעי מסטיביה. אריזה של 12 כוסיות.',
      features: [
        { id: 'f1', title: 'מוכן ב-15 שניות', hook: 'בלי לטחון, בלי לבחוש', source: 'llm' },
        { id: 'f2', title: 'מתוק טבעי מסטיביה', hook: 'בלי קלוריות, בלי סוכר', source: 'llm' },
      ],
      price: '24',
      currency: 'שקלים',
      sourceUrl: null,
      userNotes: null,
      categoryGuess: 'food',
      heroImageUrl: null,
      secondaryImageUrl: null,
    },
    scriptInput: {
      targetAudience: 'גילאי 30-55 שאוהבים תה ביום עמוס',
      durationSeconds: 15,
      avatarDescription: 'early-thirties Israeli woman, Petah Tikva office worker',
      avatarGender: 'female',
      categoryId: 'food',
      categoryLabel: 'food',
      categoryGuidance: 'משרד open-space, מטבח, כוס שקופה.',
    },
  },
  {
    id: 'food-3',
    category: 'food',
    productData: {
      productName: 'חטיפי אנרגיה מתמרים ושקדים',
      brand: 'BarBox',
      description:
        'חטיפי אנרגיה טבעיים מתמרים, שקדים, גרעיני דלעת ואגוזי קשיו. ללא קמח, ללא תוספת סוכר, פטיש שקדים בלבד. מתאים לרוכבי אופניים, מטיילים, סטודנטים. 60 גרם.',
      features: [
        { id: 'f1', title: 'אנרגיה טבעית מתמרים', hook: 'בלי הקראש של חטיפי סוכר', source: 'llm' },
        { id: 'f2', title: 'בלי קמח, בלי גלוטן', hook: 'מתאים לרגישים', source: 'llm' },
      ],
      price: '12',
      currency: 'שקלים',
      sourceUrl: null,
      userNotes: null,
      categoryGuess: 'food',
      heroImageUrl: null,
      secondaryImageUrl: null,
    },
    scriptInput: {
      targetAudience: 'ספורטאים חובבים, מטיילים, אנשי outdoor',
      durationSeconds: 30,
      avatarDescription: 'mid-twenties Israeli man, North-region cyclist',
      avatarGender: 'male',
      categoryId: 'food',
      categoryLabel: 'food',
      categoryGuidance: 'שביל אופניים, יער, מנוחה במהלך רכיבה.',
    },
  },
];
