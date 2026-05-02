// V27.11.PR6 — deterministic hash of the source product data that
// `buildProductIntelligence` consumes. Used to detect staleness:
// if the user edits description / features / category / hero image
// after the eager prebuild ran, the cached intelligence's sourceHash
// will not match the recomputed one and concept-actions.ts will
// rebuild lazily.
//
// Pure function. Deterministic across processes (Node crypto SHA-1
// of normalized JSON). Pure SOURCE-data — does NOT include avatar
// id, voice id, captions/music toggles, or anything that doesn't
// affect intelligence content. If you add a new product field that
// the intelligence pipeline reads, add it here.

import { createHash } from 'node:crypto';

export interface IntelligenceSourceFields {
  productName: string;
  description?: string | null;
  brand?: string | null;
  features?: string[] | null;
  price?: string | null;
  currency?: string | null;
  sourceUrl?: string | null;
  userNotes?: string | null;
  category?: string | null;
  heroImageUrl?: string | null;
}

/** V27.11.PR6 — extract the intelligence-source fields from a project's
 *  productData JSON blob. Tolerant of missing keys — the production
 *  data is unstructured. */
export function extractIntelligenceSourceFields(args: {
  productName: string;
  productData: unknown;
}): IntelligenceSourceFields {
  const d =
    args.productData && typeof args.productData === 'object'
      ? (args.productData as Record<string, unknown>)
      : {};
  return {
    productName: args.productName,
    description: typeof d.description === 'string' ? d.description : null,
    brand: typeof d.brand === 'string' ? d.brand : null,
    features: Array.isArray(d.features)
      ? (d.features as unknown[]).filter((x): x is string => typeof x === 'string')
      : null,
    price: typeof d.price === 'string' ? d.price : null,
    currency: typeof d.currency === 'string' ? d.currency : null,
    sourceUrl: typeof d.sourceUrl === 'string' ? d.sourceUrl : null,
    userNotes: typeof d.userNotes === 'string' ? d.userNotes : null,
    category: typeof d.category === 'string' ? d.category : null,
    heroImageUrl: typeof d.heroImageUrl === 'string' ? d.heroImageUrl : null,
  };
}

/** V27.11.PR6 — deterministic hash. SHA-1 (160 bits) over JSON-
 *  stringified normalized fields. Hex output, ~40 chars. Identity
 *  is what matters; not cryptographic strength. */
export function intelligenceSourceHash(fields: IntelligenceSourceFields): string {
  const normalized = {
    productName: (fields.productName ?? '').trim(),
    description: (fields.description ?? '').trim(),
    brand: (fields.brand ?? '').trim(),
    features: (fields.features ?? []).map((f) => f.trim()).filter((f) => f.length > 0),
    price: (fields.price ?? '').trim(),
    currency: (fields.currency ?? '').trim(),
    sourceUrl: (fields.sourceUrl ?? '').trim(),
    userNotes: (fields.userNotes ?? '').trim(),
    category: (fields.category ?? '').trim(),
    heroImageUrl: (fields.heroImageUrl ?? '').trim(),
  };
  return createHash('sha1').update(JSON.stringify(normalized)).digest('hex');
}

/** V27.11.PR6 — convenience: returns true when the intelligence's
 *  cached sourceHash matches the current product data hash, i.e. the
 *  intelligence is fresh. Also returns true when no intelligence is
 *  cached at all (caller falls into the "build lazily" branch). */
export function isIntelligenceFresh(args: {
  intelligence: { sourceHash?: string } | null;
  currentHash: string;
}): boolean {
  if (!args.intelligence) return false; // missing → not fresh
  if (!args.intelligence.sourceHash) return false; // pre-PR6 intelligence has no hash → treat as stale
  return args.intelligence.sourceHash === args.currentHash;
}
