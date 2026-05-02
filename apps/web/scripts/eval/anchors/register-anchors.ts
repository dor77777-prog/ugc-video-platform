// Register-authenticity judge anchors. 3 paired ❌/✅ exemplars per
// category — the judge sees these as in-context primers before scoring
// each scene's spoken_text_hebrew on a 1-10 scale.
//
// The ❌ rows model the production failure mode the user reported
// (translation-Hebrew that reads as direct calque from English).
// The ✅ rows model the V14 register-lock target (תכל'ס/וואלה/סבבה,
// concrete situations, contractions).
//
// In Sub-task 4 the prompt-side 3-paired example block in
// script-system-prompt.ts will reuse these exact exemplars verbatim
// so the eval and the production prompt are anchored to the same
// definition of "good".

export type AnchorCategory = 'cosmetics' | 'electronics' | 'food';

export interface RegisterAnchor {
  category: AnchorCategory;
  /** ❌ — translation-Hebrew, reads like direct EN→HE calque. */
  bad: string;
  /** ✅ — spoken Israeli, casual, contractions, real-life cadence. */
  good: string;
  /** One-line gloss for the judge so it understands WHY each rating. */
  whyBadIsBad: string;
  whyGoodIsGood: string;
}

export const REGISTER_ANCHORS: Readonly<RegisterAnchor[]> = Object.freeze([
  // ── Cosmetics ──────────────────────────────────────────────────────
  {
    category: 'cosmetics',
    bad: 'אף אחד לא אומר כמה זה מבלבל לבחור serum נכון',
    good: 'תקשיבי, אחותי, אף אחד לא יגיד לך תכל\'ס איזה סרום באמת עובד',
    whyBadIsBad:
      'Direct EN translation ("nobody tells you how confusing it is"). No casual marker, abstract framing.',
    whyGoodIsGood:
      'Vocative + casual marker (תכל\'ס) + spoken contraction. Sounds like a friend talking.',
  },
  {
    category: 'cosmetics',
    bad: 'המוצר משלב טכנולוגיה ייחודית להשגת תוצאות מקצועיות',
    good: 'וואלה, פשוט תמרחי בבוקר, ובערב את כבר רואה אחרת',
    whyBadIsBad: 'Brochure register. Latin-derived "טכנולוגיה" + "תוצאות מקצועיות" cluster.',
    whyGoodIsGood: 'Two casual markers (וואלה, פשוט) + concrete time anchor + spoken cadence.',
  },
  {
    category: 'cosmetics',
    bad: 'הפורמולה המתקדמת מעניקה לעור שלך זוהר טבעי',
    good: 'סבבה, אז ניסיתי את זה שבוע — והעור שלי לא נורמלי כמה זוהר',
    whyBadIsBad: 'Generic adjective stack ("מתקדמת", "טבעי") with no specific moment.',
    whyGoodIsGood: 'Casual opener (סבבה) + first-person time anchor + intensifier (לא נורמלי).',
  },

  // ── Electronics ────────────────────────────────────────────────────
  {
    category: 'electronics',
    bad: 'המוצר הזה משלב טכנולוגיה מתקדמת המבטיחה ביצועים מהירים',
    good: 'וואלה, פשוט תסתכלי על זה — זה לא נורמלי כמה זה זריז',
    whyBadIsBad: 'Marketing-deck Hebrew. No human voice, no specific use moment.',
    whyGoodIsGood:
      'Spoken cadence + intensifier + simple verb ("תסתכלי") instead of nominalization.',
  },
  {
    category: 'electronics',
    bad: 'המכשיר מספק חוויית שימוש איכותית למשתמשים מתוחכמים',
    good: 'תקשיב, אני בכלל לא טכני, ופה הצלחתי להגדיר את הכל ב-2 דקות',
    whyBadIsBad: '"חוויית שימוש איכותית" = English UX-deck phrase translated literally.',
    whyGoodIsGood: 'Conversational opener + concession ("בכלל לא טכני") + concrete time.',
  },
  {
    category: 'electronics',
    bad: 'הבחירה האולטימטיבית למי שמחפש פתרון איכותי',
    good: 'פשוט פתחתי את הקופסה, חיברתי, סיימתי. בלי הוראות, בלי שטויות',
    whyBadIsBad: '"בחירה האולטימטיבית" + "פתרון איכותי" — both are calques.',
    whyGoodIsGood: 'Three-step concrete narrative + casual dismissal ("בלי שטויות").',
  },

  // ── Food ───────────────────────────────────────────────────────────
  {
    category: 'food',
    bad: 'הטעם המיוחד של המוצר מקנה חוויה ייחודית בכל ביס',
    good: 'סבבה אז תכל\'ס אני אמרה לך — הטעם הזה פשוט לא נגמר',
    whyBadIsBad: 'Three abstract Marketing nouns in one sentence. Zero spoken texture.',
    whyGoodIsGood: 'Two casual markers + reported speech ("אני אמרה לך") + intensifier.',
  },
  {
    category: 'food',
    bad: 'מוצר חדשני המבוסס על רכיבים טבעיים המעניק תחושת שובע',
    good: 'תקשיבי — אני שותה את זה בבוקר במקום קפה. וואלה, אין לי רעב עד שתיים',
    whyBadIsBad: 'Three nominalizations stacked. "תחושת שובע" reads like a label, not speech.',
    whyGoodIsGood: 'Vocative + concrete substitution moment + casual marker + time anchor.',
  },
  {
    category: 'food',
    bad: 'המוצר מהווה פתרון אידיאלי לתזונה מאוזנת ובריאה',
    good: 'אחותי, פשוט אכלתי את זה לפני אימון — ואני בכלל לא רעבה אחרי',
    whyBadIsBad: '"מהווה פתרון" + "תזונה מאוזנת" cluster — corporate register.',
    whyGoodIsGood: 'Vocative + verb-driven sentence + casual concession.',
  },
] satisfies RegisterAnchor[]);

export function anchorsByCategory(category: AnchorCategory): RegisterAnchor[] {
  return REGISTER_ANCHORS.filter((a) => a.category === category);
}
