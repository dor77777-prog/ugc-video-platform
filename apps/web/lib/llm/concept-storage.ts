// V27.11.PR6 — Persistence layer for the interactive concept-first
// flow. Concepts live in `Project.productData.pendingConcepts` as a
// JSON blob; no DB migration. Cleared/replaced only on explicit
// "regenerate all" or when the user explicitly starts a new round.
//
// Server-managed wrapper fields (concept_id, slot_index, status,
// regenerationCount, regeneratedFromConceptId) are added here when
// the LLM returns raw cards. The LLM never sees them.

import { randomUUID } from 'node:crypto';

/** V27.11.PR6 — exact LLM-returned shape per CONCEPT_CARD_SCHEMA. */
export interface RawConceptCard {
  framework: string;
  big_idea: string;
  selected_hook: string;
  hook_direction: string;
  target_audience_moment: string;
  emotional_trigger: string;
  product_proof_moment: string;
  scene_outline: string[];
  why_it_fits_product: string;
  why_it_fits_audience: string;
  estimated_quality: number;
  risk_notes: string | null;
}

/** V27.11.PR6 — stored shape: LLM card + server-managed wrapper. */
export interface StoredConcept extends RawConceptCard {
  /** UUID, stable across regenerations of the same slot. */
  concept_id: string;
  /** 0-indexed position in the 6-slot grid. Stable across regen. */
  slot_index: number;
  /** When this concept was generated (ISO date). */
  generated_at: string;
  /** Number of times this slot has been regenerated. 0 for the
   *  original first-batch card; 1 after the user clicks "רענן
   *  רעיון" once on this slot; etc. */
  regenerationCount: number;
  /** When regenerationCount > 0, the ID of the previous concept
   *  this one replaced (so admin/debug can trace history). */
  regeneratedFromConceptId: string | null;
}

/** V27.11.PR6 — the JSON blob that lives in Project.productData.
 *  pendingConcepts. Survives page refresh. Cleared only via
 *  regenerateAllConceptsAction. */
export interface PendingConcepts {
  /** 'draft' = generated but no expansion yet. 'expanded' =
   *  expansion ran at least once on selectedConceptIds. The user
   *  can still re-pick from the same concepts after expansion (the
   *  blob is preserved for re-pick / debug). */
  status: 'draft' | 'expanded';
  /** Schema version; bump when changing the storage shape. */
  version: 1;
  /** Always 'concept_interactive' here — legacy mode doesn't write
   *  this blob at all. */
  scriptEngineMode: 'concept_interactive';
  /** When the FIRST batch of 6 was generated. */
  generatedAt: string;
  /** When the most recent regen (any kind) happened. */
  lastUpdatedAt: string;
  /** Concept IDs the user has selected for the current expansion
   *  intent. Stored so a refresh restores the selection. Cleared
   *  when status flips back to 'draft' on regen-all. */
  selectedConceptIds: string[];
  /** Concept IDs that HAVE been expanded into Script rows during
   *  this concepts-batch's lifetime. Used for admin debug + to
   *  prevent double-charging. */
  expandedConceptIds: string[];
  /** The 6 stored concepts. slot_index 0..5. Always exactly 6
   *  after the first generate; regen-selected/regen-one keeps
   *  the count at 6. */
  concepts: StoredConcept[];
}

/** V27.11.PR6 — wrap raw LLM cards with server-managed fields,
 *  assigning fresh UUIDs and slot indices. Used for the FIRST batch.
 *  Slot ordering follows the LLM's return order (the schema doesn't
 *  enforce FRAMEWORK_ORDER strictly anymore — concepts are valued by
 *  diversity, not framework slot). */
export function wrapRawConceptsForStorage(
  raw: RawConceptCard[],
): StoredConcept[] {
  const now = new Date().toISOString();
  return raw.map((card, idx) => ({
    ...card,
    concept_id: randomUUID(),
    slot_index: idx,
    generated_at: now,
    regenerationCount: 0,
    regeneratedFromConceptId: null,
  }));
}

/** V27.11.PR6 — replace specific slots with new raw cards (from a
 *  partial regeneration call). Each replacement gets a fresh
 *  concept_id, increments regenerationCount, and records the
 *  previous concept_id as `regeneratedFromConceptId`. Concepts
 *  NOT in slotsToReplace stay byte-identical. */
export function replaceSlots(
  current: StoredConcept[],
  slotsToReplace: number[],
  newRaw: RawConceptCard[],
): StoredConcept[] {
  if (slotsToReplace.length !== newRaw.length) {
    throw new Error(
      `replaceSlots: slot count mismatch (slots=${slotsToReplace.length}, raw=${newRaw.length})`,
    );
  }
  const now = new Date().toISOString();
  const slotMap = new Map<number, RawConceptCard>();
  for (let i = 0; i < slotsToReplace.length; i++) {
    slotMap.set(slotsToReplace[i]!, newRaw[i]!);
  }
  return current.map((c) => {
    const replacement = slotMap.get(c.slot_index);
    if (!replacement) return c; // kept slot, byte-identical
    return {
      ...replacement,
      concept_id: randomUUID(),
      slot_index: c.slot_index,
      generated_at: now,
      regenerationCount: c.regenerationCount + 1,
      regeneratedFromConceptId: c.concept_id,
    };
  });
}

/** V27.11.PR6 — read pendingConcepts from Project.productData. Returns
 *  null when the blob is missing or shape is wrong (forward-compat
 *  with future versions). */
export function readPendingConcepts(
  productData: unknown,
): PendingConcepts | null {
  if (!productData || typeof productData !== 'object') return null;
  const pc = (productData as { pendingConcepts?: unknown }).pendingConcepts;
  if (!pc || typeof pc !== 'object') return null;
  const v = pc as Record<string, unknown>;
  if (v.version !== 1) return null;
  if (v.scriptEngineMode !== 'concept_interactive') return null;
  if (v.status !== 'draft' && v.status !== 'expanded') return null;
  if (!Array.isArray(v.concepts)) return null;
  return v as unknown as PendingConcepts;
}

/** V27.11.PR6 — write pendingConcepts back into productData. Caller
 *  is responsible for the prisma.project.update() call. Returns the
 *  merged productData object. */
export function writePendingConcepts(
  productData: unknown,
  pendingConcepts: PendingConcepts,
): Record<string, unknown> {
  const base =
    productData && typeof productData === 'object'
      ? (productData as Record<string, unknown>)
      : {};
  return {
    ...base,
    pendingConcepts,
  };
}

/** V27.11.PR6 — clear pendingConcepts from productData. Returns the
 *  merged productData object minus the pendingConcepts key. Used by
 *  regenerateAllConceptsAction before writing the new batch (so any
 *  stale shape can't confuse a downstream reader). */
export function clearPendingConcepts(
  productData: unknown,
): Record<string, unknown> {
  const base =
    productData && typeof productData === 'object'
      ? (productData as Record<string, unknown>)
      : {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pendingConcepts: _drop, ...rest } = base as {
    pendingConcepts?: unknown;
  } & Record<string, unknown>;
  return rest;
}

/** V27.11.PR6 — helpers that don't really need their own home. */
export function findConceptById(
  pending: PendingConcepts,
  conceptId: string,
): StoredConcept | null {
  return pending.concepts.find((c) => c.concept_id === conceptId) ?? null;
}

export function validateSelection(selectedIds: string[]): {
  ok: boolean;
  reason?: string;
} {
  if (selectedIds.length === 0) {
    return { ok: false, reason: 'must select at least 1 concept' };
  }
  if (selectedIds.length > 3) {
    return {
      ok: false,
      reason: `must select at most 3 concepts (got ${selectedIds.length})`,
    };
  }
  // Dedupe check.
  const set = new Set(selectedIds);
  if (set.size !== selectedIds.length) {
    return { ok: false, reason: 'duplicate concept IDs in selection' };
  }
  return { ok: true };
}
