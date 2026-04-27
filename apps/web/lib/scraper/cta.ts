import type { CheerioAPI } from 'cheerio';

// Heuristics for "is there an Add-to-Cart / Buy Now button on the page?"
// — strong signal that this is a product page, not a category or article.

const CTA_PATTERNS = [
  // English
  /\b(buy now|buy it now|add to cart|add to bag|add to basket|order now|shop now|purchase now|checkout|proceed to checkout)\b/i,
  /\b(pre[- ]?order|reserve now|get yours)\b/i,
  // Hebrew
  /(הוסף לסל|הוסף לעגלה|הוסיפי לסל|הוסיפי לעגלה)/,
  /(לקנייה|לרכישה|רכוש עכשיו|רכשי עכשיו|קנה עכשיו|קני עכשיו)/,
  /(הזמן עכשיו|הזמיני עכשיו|להזמנה|לתשלום|המשך לתשלום)/,
  /(הוסף עכשיו|הוסיפי עכשיו|הוסף לקנייה)/,
];

export interface CtaDetection {
  found: boolean;
  text?: string;
}

export function detectCta($: CheerioAPI): CtaDetection {
  let result: CtaDetection = { found: false };

  $('button, a, input[type="submit"], input[type="button"], [role="button"]').each((_, el) => {
    if (result.found) return false;
    const $el = $(el);
    const candidates = [
      $el.text(),
      $el.attr('value'),
      $el.attr('aria-label'),
      $el.attr('title'),
      $el.attr('data-action'),
    ];
    for (const cand of candidates) {
      const text = (cand ?? '').trim();
      if (!text || text.length > 80) continue;
      for (const p of CTA_PATTERNS) {
        if (p.test(text)) {
          result = { found: true, text };
          return false;
        }
      }
    }
  });

  // Also: a form posting to /cart/add (Shopify) or similar is a strong signal.
  if (!result.found) {
    const action = $('form[action*="cart"]').attr('action');
    if (action && /(cart\/add|add[-_]?to[-_]?cart|checkout)/i.test(action)) {
      result = { found: true, text: `form→${action}` };
    }
  }

  return result;
}
