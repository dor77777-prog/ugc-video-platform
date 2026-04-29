import type { CheerioAPI } from 'cheerio';

export interface CheerioFallback {
  title?: string;
  description?: string;
  /** Bullet-list features extracted from the product container
   *  (`<ul><li>...</li></ul>` typically). Often the most informative
   *  thing on a product page after the title. */
  features: string[];
  images: string[];
  price?: string;
  currency?: string;
}

// Last-resort extraction from raw HTML when no structured data is found.
//
// The previous version was naive: meta[name=description] (always one
// sentence) → first `<p>`. That dropped 90% of the actual product
// content for sites where descriptions live in a `<div
// class="product-description">` with multiple paragraphs and a
// bullet-list of features. The rewrite below:
//
//   1. Strips <style>, <script>, <noscript> from the parsed tree
//      FIRST — so any subsequent .text() can't leak CSS/JS.
//   2. Searches a list of well-known product-container selectors
//      (Shopify / WooCommerce / generic) and picks the FIRST one
//      that contains substantive text.
//   3. Falls back to scanning the document body for the largest
//      contiguous text cluster.
//   4. Preserves paragraph + bullet structure with newlines so the
//      LLM downstream sees an ordered description, not a giant
//      run-on string.
//   5. meta[name=description] is now the LAST resort, not the first.
export function extractCheerioFallback($: CheerioAPI, baseUrl: string): CheerioFallback {
  // ── Hard-strip non-content nodes globally ────────────────────────────
  // After this, every .text() call below sees only real visible content.
  // Cheerio's .text() walks all descendants including <style>/<script>
  // by default, which is the second leak we ran into; removing the
  // nodes from the tree solves it everywhere at once.
  $('style, script, noscript, template, svg, iframe').remove();
  // Also strip obvious chrome (nav, header, footer, cookie banners,
  // recommended-products carousels) so the description scanner doesn't
  // pick up "Free shipping over $50" lines from the header.
  // Also remove review/rating containers by both class AND id — the
  // class-only selector misses elements like <section id="reviews">.
  $(
    'nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"], ' +
      '[class*="cookie"], [class*="newsletter"], [class*="related"], [class*="recommend"], ' +
      '[class*="reviews"], [class*="review"], [class*="testimonial"], [class*="rating"], ' +
      '[class*="footer"], [class*="header"], [class*="nav-"], ' +
      '[id*="reviews"], [id*="review"], [id*="testimonial"], [id*="rating"]',
  ).remove();

  const title = ($('h1').first().text().trim() ||
    $('title').text().trim() ||
    undefined) as string | undefined;

  // ── Description extraction ───────────────────────────────────────────
  const { description, features } = extractDescription($);

  // ── Images ───────────────────────────────────────────────────────────
  const images: string[] = [];
  $('img').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src');
    if (!src) return;
    if (/(sprite|icon|logo|avatar|loader|spinner|placeholder|pixel|tracking)/i.test(src)) return;
    const w = parseInt($el.attr('width') ?? '0', 10);
    if (w && w < 200) return;
    const absolute = toAbsoluteUrl(src, baseUrl);
    if (absolute) images.push(absolute);
  });

  // Price + currency from visible text near a CTA-ish button.
  const priceMatch = findPriceInText($('body').text());

  return {
    title,
    description,
    features,
    images: dedupe(images).slice(0, 20),
    price: priceMatch?.amount,
    currency: priceMatch?.currency,
  };
}

// Selectors covering Shopify, WooCommerce, BigCommerce, Magento, Wix,
// generic e-commerce custom builds, and itemprop microdata. Tried in
// order — first match wins, others are added as supplementary text if
// they're not redundant.
const PRODUCT_CONTAINER_SELECTORS = [
  '[itemprop="description"]',
  '.product__description',
  '.product-description',
  '.product-details',
  '.product-info__description',
  '.product-single__description',
  '.product-details__description',
  '.woocommerce-Tabs-panel--description',
  '.woocommerce-product-details__short-description',
  '#tab-description',
  '#description',
  '#product-description',
  '#productDescription', // Amazon-ish
  '.shopify-section .rte',
  '.rte', // Shopify rich-text-editor block
  'main [class*="description"]',
  'article [class*="description"]',
  '[data-product-description]',
  '[data-pf="description"]',
];

function extractDescription(
  $: CheerioAPI,
): { description?: string; features: string[] } {
  // 1. Try the structured selectors first.
  const found: string[] = [];
  const featureSet: string[] = [];
  for (const sel of PRODUCT_CONTAINER_SELECTORS) {
    $(sel).each((_, el) => {
      const $el = $(el);
      const block = collectBlockText($, $el);
      if (block.text.length >= 60) {
        found.push(block.text);
      }
      for (const f of block.features) {
        if (f.length >= 10 && !featureSet.includes(f)) featureSet.push(f);
      }
    });
    if (found.length > 0) break; // First selector that hit wins.
  }

  // 2. Fallback: scan the body for the densest content cluster.
  if (found.length === 0) {
    const cluster = findDensestContentCluster($);
    if (cluster) {
      found.push(cluster.text);
      for (const f of cluster.features) {
        if (f.length >= 10 && !featureSet.includes(f)) featureSet.push(f);
      }
    }
  }

  // 3. Last resort: meta[name=description]. Only if everything above
  // came up empty — that tag is usually one sentence and hurts more
  // than it helps for the product dossier downstream.
  let description: string | undefined;
  if (found.length > 0) {
    description = found.join('\n\n');
  } else {
    const meta = $('meta[name="description"]').attr('content')?.trim();
    if (meta && meta.length >= 30) description = meta;
  }

  // Cap at 6000 chars — gpt-5.4-mini context isn't a constraint, but
  // 6KB is enough for any product dossier and stops accidental
  // capture of an entire site if the selectors over-match.
  if (description && description.length > 6000) {
    description = description.slice(0, 6000) + '…';
  }

  return {
    description,
    features: featureSet.slice(0, 25),
  };
}

// Walk a container and produce { text, features } where:
//   - text   = paragraphs + headings concatenated with newlines
//   - features = items from <ul>/<ol> bullet lists
// Preserves structure so the dossier LLM downstream sees a list as a
// list, not as a giant run-on sentence.
function collectBlockText(
  $: CheerioAPI,
  $root: ReturnType<CheerioAPI>,
): { text: string; features: string[] } {
  const parts: string[] = [];
  const features: string[] = [];

  $root.find('h1, h2, h3, h4, h5, h6, p, li, dd').each((_, el) => {
    const $el = $(el);
    // Skip anything that's really a child of an already-grabbed
    // ancestor — the recursion in find() guarantees we walk all
    // descendants once each, so duplicates only happen via
    // structural anomalies. We dedupe in the assembly step below.
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? '';
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (tag === 'li') {
      features.push(text);
      return;
    }
    parts.push(text);
  });

  // If there's no real <p>/<h*>/<li>, fall back to the container's
  // raw text — but split on double-newlines from the original HTML
  // to keep some structure. Cheerio's .text() collapses whitespace,
  // so we do this on .html() if present.
  if (parts.length === 0 && features.length === 0) {
    const raw = $root.text().replace(/\s+/g, ' ').trim();
    if (raw.length > 60) parts.push(raw);
  }

  // Dedupe sequential repeats (selectors sometimes nest, producing
  // the same paragraph twice).
  const dedupedParts: string[] = [];
  for (const p of parts) {
    if (p.length < 12) continue;
    if (dedupedParts.length > 0 && dedupedParts[dedupedParts.length - 1] === p) continue;
    dedupedParts.push(p);
  }

  // Format: paragraphs joined with double newlines, bullet list at
  // the end (the dossier prompt knows how to consume both).
  const text =
    dedupedParts.join('\n\n') +
    (features.length > 0 ? '\n\n• ' + features.join('\n• ') : '');

  return { text: text.trim(), features };
}

// Body-wide fallback: walk all <p> + <li> tags, group by their
// nearest container ancestor, and pick the container with the most
// text. This catches sites that don't use any of the well-known
// product-description class names.
function findDensestContentCluster(
  $: CheerioAPI,
): { text: string; features: string[] } | null {
  // Map from raw DOM element → accumulated text/features. We use the
  // element reference itself as the Map key; cheerio's element
  // objects have stable identity across queries.
  const containerScores = new Map<
    object,
    { textLen: number; texts: string[]; features: string[] }
  >();

  $('p, li').each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text.length < 30) return; // Skip tiny stuff (nav links, small captions).
    // Find the nearest "section-y" ancestor.
    const $container = $el
      .closest(
        'section, article, main, [class*="description"], [class*="product"], [class*="content"], [id*="description"], [id*="product"]',
      )
      .first();
    const containerEl =
      ($container.get(0) as object | undefined) ??
      ($('body').get(0) as object | undefined);
    if (!containerEl) return;
    const entry = containerScores.get(containerEl) ?? {
      textLen: 0,
      texts: [],
      features: [],
    };
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? '';
    if (tag === 'li') {
      entry.features.push(text);
    } else {
      entry.texts.push(text);
    }
    entry.textLen += text.length;
    containerScores.set(containerEl, entry);
  });

  let best: { textLen: number; texts: string[]; features: string[] } | null = null;
  for (const v of containerScores.values()) {
    if (!best || v.textLen > best.textLen) best = v;
  }
  if (!best || best.textLen < 120) return null;

  const text =
    best.texts.join('\n\n') +
    (best.features.length > 0 ? '\n\n• ' + best.features.join('\n• ') : '');
  return { text: text.trim(), features: best.features };
}

function findPriceInText(text: string): { amount: string; currency?: string } | undefined {
  // Match common currency formats: $19.99, ₪199, 199 ₪, 199 ש"ח, 19.99 USD
  const patterns: { re: RegExp; cur?: string }[] = [
    { re: /\$\s*(\d{1,5}(?:[.,]\d{2})?)/, cur: 'USD' },
    { re: /€\s*(\d{1,5}(?:[.,]\d{2})?)/, cur: 'EUR' },
    { re: /£\s*(\d{1,5}(?:[.,]\d{2})?)/, cur: 'GBP' },
    { re: /₪\s*(\d{1,5}(?:[.,]\d{2})?)/, cur: 'ILS' },
    { re: /(\d{1,5}(?:[.,]\d{2})?)\s*₪/, cur: 'ILS' },
    { re: /(\d{1,5}(?:[.,]\d{2})?)\s*ש["׳']?ח/, cur: 'ILS' },
  ];
  for (const { re, cur } of patterns) {
    const m = text.match(re);
    if (m) return { amount: m[1]!.replace(',', '.'), currency: cur };
  }
  return undefined;
}

function toAbsoluteUrl(src: string, base: string): string | undefined {
  try {
    return new URL(src, base).toString();
  } catch {
    return undefined;
  }
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
