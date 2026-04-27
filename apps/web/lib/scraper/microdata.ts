import type { CheerioAPI } from 'cheerio';

// Detect schema.org/Product microdata. We don't extract from it (JSON-LD covers
// most cases); we just use it as a confidence signal.
export function hasProductMicrodata($: CheerioAPI): boolean {
  return $('[itemtype*="schema.org/Product" i]').length > 0;
}
