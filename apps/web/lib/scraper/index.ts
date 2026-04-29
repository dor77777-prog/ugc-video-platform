import * as cheerio from 'cheerio';
import { safeFetch, ScrapeFetchError } from './fetch';
import { extractJsonLd } from './json-ld';
import { extractOpenGraph } from './open-graph';
import { hasProductMicrodata } from './microdata';
import { detectCta } from './cta';
import { tryShopifyJsonEndpoint } from './shopify';
import { extractCheerioFallback } from './cheerio-fallback';
import { combine, scoreConfidence } from './normalize';
import type { ScrapeResult, Signal } from './types';

export type { ScrapeResult, ScrapeData, Signal, SourcePlatform } from './types';
export { ScrapeFetchError };

export async function scrape(rawUrl: string): Promise<ScrapeResult> {
  const { body: html, finalUrl } = await safeFetch(rawUrl);
  const $ = cheerio.load(html);

  const signals: Signal[] = [];
  const warnings: string[] = [];

  // ── Structured data ────────────────────────────────────────────────────────
  const jsonLd = extractJsonLd($);
  if (jsonLd) signals.push('json_ld_product');

  const og = extractOpenGraph($);
  if (og.type && og.type.toLowerCase().includes('product')) signals.push('og_product');

  if (hasProductMicrodata($)) signals.push('microdata_product');

  // OG product:price meta tags = explicit product signal.
  if (og.price) signals.push('product_meta_tags');

  // ── CTA ────────────────────────────────────────────────────────────────────
  const cta = detectCta($);
  if (cta.found) signals.push('cta_button');

  // ── Platform-specific ──────────────────────────────────────────────────────
  let shopify = null;
  try {
    shopify = await tryShopifyJsonEndpoint(finalUrl, html);
    if (shopify) signals.push('shopify_json_endpoint');
  } catch (err) {
    warnings.push(`shopify-endpoint: ${(err as Error).message}`);
  }

  if (
    $('body').attr('class')?.includes('single-product') ||
    $('body').attr('class')?.includes('woocommerce')
  ) {
    signals.push('woocommerce_class');
  }

  // ── Fallback HTML scraping ─────────────────────────────────────────────────
  const fallback = extractCheerioFallback($, finalUrl);
  if (fallback.price) signals.push('price_visible');

  // ── Combine + score ────────────────────────────────────────────────────────
  const data = combine({ url: finalUrl, jsonLd, og, shopify, fallback, signals });
  const { isProduct, confidence } = scoreConfidence(signals);

  if (!data.productName) warnings.push('no-product-name');
  if (data.images.length === 0) warnings.push('no-images');
  if (!data.description || data.description.length < 30) {
    // Short / empty description after cleaning is a strong signal that
    // the only available source was CSS/JS garbage that the cleaner
    // rejected. We surface this as a wizard warning so the user can
    // paste a manual description before generating scripts — the LLM
    // dossier downstream is only as good as the description it sees.
    warnings.push('weak-description');
  }

  return { isProduct, confidence, signals, data, warnings };
}
