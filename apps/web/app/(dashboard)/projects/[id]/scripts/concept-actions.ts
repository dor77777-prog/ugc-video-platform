'use server';

// V27.11.PR6 — Concept-first interactive server actions.
//
// Four actions back the concept_interactive UX:
//   1. generateConceptsAction(projectId)
//      → 6 concepts, persisted to Project.productData.pendingConcepts
//   2. regenerateSelectedConceptsAction(projectId, conceptIdsToReplace[])
//      → replaces only those slots; kept slots stay byte-identical
//   3. regenerateAllConceptsAction(projectId)
//      → replaces all 6
//   4. expandPickedConceptsAction(projectId, selectedConceptIds[])
//      → expands 1-3 selected concepts into Script rows; selection
//        validated [1, 3]; user re-pick stays possible.
//
// Cost / credits:
//   - Concept generation + regen: no user-facing credit charge.
//     Provider cost is logged via ApiCall (operation = 'script_concept_*').
//   - Expansion is the equivalent of legacy script_batch — charged
//     PER expansion using the existing PER_OPERATION_CREDITS.script_batch.
//     (User who expands twice → charged twice. Re-pick from the same
//     pendingConcepts → also charged again, by design.)
//
// Backwards-compat / safety:
//   - Each action validates project ownership via getOrCreateAppUser().
//   - Each action validates engineMode === 'concept_interactive'; if
//     mode mismatched it returns an error so the UI can show a hint.

import { revalidatePath } from 'next/cache';
import { ScriptAngle, SceneType } from '@prisma/client';
import { selectedFeaturesFromProductData } from '@ugc-video/shared';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { invalidateUserCacheById } from '@/lib/auth/user-cache';
import {
  type GeneratedScript,
  type ProductInput,
  buildSystemInstructionWithIntelligence,
  buildConceptBatchUserPrompt,
} from '@/lib/llm/scripts';
import {
  generateConceptCards,
  regenerateSelectedConcepts,
  buildExpansionPromptFragment,
  resolveScriptEngineMode,
  type RawConceptCard,
  type StoredConcept,
  type ScriptProvider,
} from '@/lib/llm/concept-engine';
import {
  readPendingConcepts,
  writePendingConcepts,
  clearPendingConcepts,
  wrapRawConceptsForStorage,
  replaceSlots,
  validateSelection,
  type PendingConcepts,
} from '@/lib/llm/concept-storage';
import { recordApiCallStart, recordApiCallComplete } from '@/lib/usage/log';
import {
  attributeAnthropicTextCost,
  attributeGeminiTextCost,
  attributeOpenAiTextCost,
} from '@/lib/usage/cost-attribution';
import { OPENAI_DEFAULT_SCRIPT_MODEL } from '@/lib/llm/openai-script-client';
import { ANTHROPIC_DEFAULT_SCRIPT_MODEL } from '@/lib/llm/anthropic-script-client';
import { GEMINI_DEFAULT_MODEL } from '@/lib/llm/gemini-client';
import { checkRateLimit, RateLimitedError } from '@/lib/usage/rate-limit';
import { checkSpendCap, SpendCapExceededError } from '@/lib/usage/spend-cap';
import { findAvatar, describeAvatar } from '@/lib/avatars/catalog';
import {
  findCategory,
  categoryGuidance,
  mapDossierCategoryToId,
  type ProductCategoryId,
} from '@/lib/categories';
import {
  openaiStructuredCall,
} from '@/lib/llm/openai-script-client';
import {
  anthropicStructuredCall,
} from '@/lib/llm/anthropic-script-client';
import {
  geminiStructuredCall,
} from '@/lib/llm/gemini-client';
import { SINGLE_SCRIPT_JSON_SCHEMA } from '@ugc-video/prompts';
import { PER_OPERATION_CREDITS } from '@/lib/plans';

const EXPAND_COST_CREDITS_PER_SCRIPT = PER_OPERATION_CREDITS.script_batch;

function resolveScriptProvider(): ScriptProvider {
  const raw = process.env.LLM_SCRIPT_PROVIDER?.trim().toLowerCase();
  if (raw === 'anthropic') return 'anthropic';
  if (raw === 'gemini') return 'gemini';
  return 'openai';
}

function resolveScriptModel(provider: ScriptProvider): string {
  if (provider === 'anthropic') {
    return process.env.ANTHROPIC_SCRIPT_MODEL || ANTHROPIC_DEFAULT_SCRIPT_MODEL;
  }
  if (provider === 'gemini') {
    return process.env.GEMINI_SCRIPT_MODEL || GEMINI_DEFAULT_MODEL;
  }
  return process.env.OPENAI_SCRIPT_MODEL || OPENAI_DEFAULT_SCRIPT_MODEL;
}

// ─────────────────────────────────────────────────────────────────
// Result types — Server Actions return-shape pattern (no redirect()).
// ─────────────────────────────────────────────────────────────────
export type ConceptActionError = {
  ok: false;
  error: string;
  needsCredits?: boolean;
  rateLimited?: boolean;
  spendCapExceeded?: boolean;
  modeMismatch?: boolean;
};
export type ConceptsActionSuccess = {
  ok: true;
  pendingConcepts: PendingConcepts;
};
export type ExpandActionSuccess = {
  ok: true;
  redirectTo: string;
  expandedScriptIds: string[];
};

// ─────────────────────────────────────────────────────────────────
// Project-context loader. Extracted from the legacy actions.ts logic
// so concept_interactive can build the SAME context surface.
// Returns ProductInput + Intelligence + sharedSystemInstruction.
// ─────────────────────────────────────────────────────────────────
async function loadProjectContext(projectId: string, userId: string): Promise<
  | {
      ok: true;
      project: NonNullable<Awaited<ReturnType<typeof prisma.project.findFirst>>>;
      productInput: ProductInput;
      sharedSystemInstruction: string;
    }
  | { ok: false; error: string; needsCredits?: boolean }
> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) return { ok: false, error: 'הפרויקט לא נמצא' };

  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const selectedAvatar = findAvatar(
    typeof data.selectedAvatarId === 'string' ? data.selectedAvatarId : null,
  );
  const categoryId = (typeof data.category === 'string' ? data.category : null) as
    | ProductCategoryId
    | null;
  const category = findCategory(categoryId);

  // V27.11.PR6 — staleness check. The eager prebuild on createProject
  // persisted intelligence at step 1 with a sourceHash of the input
  // fields. If the user has edited description / features / category /
  // heroImageUrl since (e.g. via /edit step), the cached intelligence
  // is stale and we rebuild lazily here — same pipeline as the
  // missing-intelligence branch below.
  const cachedIntel = (data.intelligence ?? null) as
    | import('@/lib/product-intelligence').ProductIntelligence
    | null;
  const {
    isIntelligenceFresh,
    intelligenceSourceHash,
    extractIntelligenceSourceFields,
  } = await import('@/lib/product-intelligence/source-hash');
  const currentHash = intelligenceSourceHash(
    extractIntelligenceSourceFields({
      productName: project.productName ?? 'מוצר ללא שם',
      productData: data,
    }),
  );
  const cacheIsFresh = isIntelligenceFresh({
    intelligence: cachedIntel,
    currentHash,
  });
  if (cachedIntel && !cacheIsFresh) {
    console.log(
      `[concept-actions] intelligence stale (cached=${cachedIntel.sourceHash?.slice(0, 8) ?? 'no-hash'} vs current=${currentHash.slice(0, 8)}) — rebuilding`,
    );
  }
  let intelligence: typeof cachedIntel = cacheIsFresh ? cachedIntel : null;
  let resolvedCategoryId: ProductCategoryId | null = categoryId;
  let resolvedCategory = category;
  if (!intelligence) {
    try {
      const { buildProductIntelligence } = await import('@/lib/product-intelligence');
      const built = await buildProductIntelligence({
        productName: project.productName ?? 'מוצר ללא שם',
        description: typeof data.description === 'string' ? data.description : '',
        brand: typeof data.brand === 'string' ? data.brand : null,
        features: Array.isArray(data.features)
          ? (data.features as unknown[]).filter((x): x is string => typeof x === 'string')
          : [],
        price: typeof data.price === 'string' ? data.price : null,
        currency: typeof data.currency === 'string' ? data.currency : null,
        sourceUrl: typeof data.sourceUrl === 'string' ? data.sourceUrl : null,
        userNotes: typeof data.userNotes === 'string' ? data.userNotes : null,
        categoryGuess: category?.labelEnglish ?? categoryId ?? null,
        heroImageUrl: typeof data.heroImageUrl === 'string' ? data.heroImageUrl : null,
      });
      intelligence = built.intelligence;
      if (!resolvedCategoryId || resolvedCategoryId === 'other') {
        const mapped = mapDossierCategoryToId(
          intelligence.dossier.category,
          intelligence.dossier.subcategory,
          intelligence.dossier.productType,
        );
        if (mapped !== 'other') {
          resolvedCategoryId = mapped;
          resolvedCategory = findCategory(mapped);
        }
      }
      // Persist for reuse.
      const merged = {
        ...data,
        intelligence,
        ...(resolvedCategoryId && resolvedCategoryId !== categoryId
          ? { category: resolvedCategoryId }
          : {}),
      };
      await prisma.project.update({
        where: { id: projectId },
        data: { productData: merged as object },
      });
    } catch (err) {
      console.error('[concept-actions] product intelligence failed:', (err as Error).message);
      // Fall through with null intelligence — concept system prompt
      // tolerates it.
    }
  }

  const productInput: ProductInput = {
    productName: project.productName ?? 'מוצר ללא שם',
    description: typeof data.description === 'string' ? data.description : '',
    brand: typeof data.brand === 'string' ? data.brand : null,
    targetAudience: typeof data.targetAudience === 'string' ? data.targetAudience : null,
    durationSeconds:
      typeof data.durationSeconds === 'number' ? data.durationSeconds : 30,
    price: typeof data.price === 'string' ? data.price : null,
    currency: typeof data.currency === 'string' ? data.currency : null,
    selectedFeatures: selectedFeaturesFromProductData(data),
    intelligence,
    avatarDescription: selectedAvatar ? describeAvatar(selectedAvatar) : null,
    avatarGender:
      selectedAvatar?.gender === 'male' || selectedAvatar?.gender === 'female'
        ? selectedAvatar.gender
        : null,
    categoryId: resolvedCategoryId,
    categoryLabel: resolvedCategory?.labelHebrew ?? null,
    categoryGuidance: categoryGuidance(resolvedCategoryId),
  };

  const sharedSystemInstruction = buildSystemInstructionWithIntelligence(
    intelligence ?? null,
  );

  return { ok: true, project, productInput, sharedSystemInstruction };
}

// ─────────────────────────────────────────────────────────────────
// 1. generateConceptsAction
// ─────────────────────────────────────────────────────────────────
export async function generateConceptsAction(
  projectId: string,
): Promise<ConceptActionError | ConceptsActionSuccess> {
  const engineMode = resolveScriptEngineMode();
  if (engineMode !== 'concept_interactive') {
    return {
      ok: false,
      error: 'concept_interactive mode is not enabled',
      modeMismatch: true,
    };
  }

  const { dbUser } = await getOrCreateAppUser();

  // Pre-flight: rate-limit + spend cap. No credit charge for concept
  // generation itself — only for expansion.
  try {
    await checkRateLimit(dbUser.id, 'script_gen');
    await checkSpendCap(dbUser.id);
  } catch (err) {
    if (err instanceof RateLimitedError)
      return { ok: false, error: err.message, rateLimited: true };
    if (err instanceof SpendCapExceededError)
      return { ok: false, error: err.message, spendCapExceeded: true };
    throw err;
  }

  const ctx = await loadProjectContext(projectId, dbUser.id);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const provider = resolveScriptProvider();
  const model = resolveScriptModel(provider);
  const callId = await recordApiCallStart({
    provider,
    operation: 'script_concept_batch',
    model,
    userId: dbUser.id,
    projectId,
  });

  const startedAt = Date.now();
  let raw: RawConceptCard[];
  let usage = { inputTokens: 0, outputTokens: 0 };
  try {
    const out = await generateConceptCards({
      systemInstruction: ctx.sharedSystemInstruction,
      userPrompt: buildConceptBatchUserPrompt(ctx.productInput),
      provider,
      model,
    });
    raw = out.concepts;
    usage = out.usage;
  } catch (err) {
    console.error('[concept-actions] generateConceptCards failed:', (err as Error).message);
    if (callId) {
      await recordApiCallComplete(callId, {
        success: false,
        durationMs: Date.now() - startedAt,
        errorMessage: (err as Error).message,
      });
    }
    return { ok: false, error: 'יצירת הקונספטים נכשלה. נסה שוב.' };
  }

  // Wrap with concept_id / slot_index / regen-tracking + persist.
  const stored = wrapRawConceptsForStorage(raw);
  const now = new Date().toISOString();
  const pending: PendingConcepts = {
    status: 'draft',
    version: 1,
    scriptEngineMode: 'concept_interactive',
    generatedAt: now,
    lastUpdatedAt: now,
    selectedConceptIds: [],
    expandedConceptIds: [],
    concepts: stored,
  };
  await prisma.project.update({
    where: { id: projectId },
    data: {
      productData: writePendingConcepts(ctx.project.productData, pending) as object,
    },
  });

  // Log success.
  const cost = costForTextCall(provider, model, usage);
  if (callId) {
    await recordApiCallComplete(callId, {
      success: true,
      durationMs: Date.now() - startedAt,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd: cost.estimatedCostUsd,
      actualCostUsd: cost.actualCostUsd,
      metadata: { conceptCount: stored.length },
    });
  }

  revalidatePath(`/projects/${projectId}/scripts`);
  return { ok: true, pendingConcepts: pending };
}

// ─────────────────────────────────────────────────────────────────
// 2. regenerateSelectedConceptsAction
// ─────────────────────────────────────────────────────────────────
export async function regenerateSelectedConceptsAction(
  projectId: string,
  conceptIdsToReplace: string[],
): Promise<ConceptActionError | ConceptsActionSuccess> {
  const engineMode = resolveScriptEngineMode();
  if (engineMode !== 'concept_interactive') {
    return {
      ok: false,
      error: 'concept_interactive mode is not enabled',
      modeMismatch: true,
    };
  }

  if (conceptIdsToReplace.length === 0) {
    return { ok: false, error: 'בחר לפחות רעיון אחד לרענון' };
  }
  if (conceptIdsToReplace.length > 6) {
    return { ok: false, error: 'אי אפשר לרענן יותר מ-6 רעיונות' };
  }

  const { dbUser } = await getOrCreateAppUser();

  try {
    await checkRateLimit(dbUser.id, 'script_gen');
    await checkSpendCap(dbUser.id);
  } catch (err) {
    if (err instanceof RateLimitedError)
      return { ok: false, error: err.message, rateLimited: true };
    if (err instanceof SpendCapExceededError)
      return { ok: false, error: err.message, spendCapExceeded: true };
    throw err;
  }

  const ctx = await loadProjectContext(projectId, dbUser.id);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const pending = readPendingConcepts(ctx.project.productData);
  if (!pending) {
    return {
      ok: false,
      error: 'אין כרגע קונספטים לרענן. צור 6 חדשים תחילה.',
    };
  }

  const replaceSet = new Set(conceptIdsToReplace);
  const conceptsToReplace = pending.concepts.filter((c) => replaceSet.has(c.concept_id));
  const conceptsToKeep = pending.concepts.filter((c) => !replaceSet.has(c.concept_id));
  if (conceptsToReplace.length !== conceptIdsToReplace.length) {
    return { ok: false, error: 'חלק מהמזהים לא נמצאו ברשימה הנוכחית' };
  }
  if (conceptsToReplace.length === pending.concepts.length) {
    return {
      ok: false,
      error: 'כדי לרענן את כל ה-6 השתמש בכפתור "צור את כל הרעיונות מחדש"',
    };
  }

  const provider = resolveScriptProvider();
  const model = resolveScriptModel(provider);
  const callId = await recordApiCallStart({
    provider,
    operation: 'script_concept_regenerate_selected',
    model,
    userId: dbUser.id,
    projectId,
    metadata: {
      replacedConceptIds: conceptIdsToReplace,
      keptConceptIds: conceptsToKeep.map((c) => c.concept_id),
      replaceCount: conceptsToReplace.length,
    },
  });

  const startedAt = Date.now();
  let raw: RawConceptCard[];
  let usage = { inputTokens: 0, outputTokens: 0 };
  try {
    const out = await regenerateSelectedConcepts({
      systemInstruction: ctx.sharedSystemInstruction,
      userPrompt: buildConceptBatchUserPrompt(ctx.productInput),
      conceptsToKeep,
      conceptsToReplace,
      regenerateCount: conceptsToReplace.length,
      provider,
      model,
    });
    raw = out.concepts;
    usage = out.usage;
  } catch (err) {
    console.error('[concept-actions] regenerateSelectedConcepts failed:', (err as Error).message);
    if (callId) {
      await recordApiCallComplete(callId, {
        success: false,
        durationMs: Date.now() - startedAt,
        errorMessage: (err as Error).message,
      });
    }
    return { ok: false, error: 'רענון הקונספטים נכשל. נסה שוב.' };
  }

  // Replace slots in-place (preserves slot_index, increments
  // regenerationCount, records regeneratedFromConceptId).
  const slotsToReplace = conceptsToReplace.map((c) => c.slot_index);
  const updatedConcepts = replaceSlots(pending.concepts, slotsToReplace, raw);
  const updated: PendingConcepts = {
    ...pending,
    lastUpdatedAt: new Date().toISOString(),
    selectedConceptIds: pending.selectedConceptIds.filter(
      (id) => !replaceSet.has(id),
    ),
    concepts: updatedConcepts,
  };
  await prisma.project.update({
    where: { id: projectId },
    data: {
      productData: writePendingConcepts(ctx.project.productData, updated) as object,
    },
  });

  const cost = costForTextCall(provider, model, usage);
  if (callId) {
    await recordApiCallComplete(callId, {
      success: true,
      durationMs: Date.now() - startedAt,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd: cost.estimatedCostUsd,
      actualCostUsd: cost.actualCostUsd,
    });
  }

  revalidatePath(`/projects/${projectId}/scripts`);
  return { ok: true, pendingConcepts: updated };
}

// ─────────────────────────────────────────────────────────────────
// 3. regenerateAllConceptsAction (explicit "fresh batch" button)
// ─────────────────────────────────────────────────────────────────
export async function regenerateAllConceptsAction(
  projectId: string,
): Promise<ConceptActionError | ConceptsActionSuccess> {
  const engineMode = resolveScriptEngineMode();
  if (engineMode !== 'concept_interactive') {
    return {
      ok: false,
      error: 'concept_interactive mode is not enabled',
      modeMismatch: true,
    };
  }

  const { dbUser } = await getOrCreateAppUser();
  try {
    await checkRateLimit(dbUser.id, 'script_gen');
    await checkSpendCap(dbUser.id);
  } catch (err) {
    if (err instanceof RateLimitedError)
      return { ok: false, error: err.message, rateLimited: true };
    if (err instanceof SpendCapExceededError)
      return { ok: false, error: err.message, spendCapExceeded: true };
    throw err;
  }

  const ctx = await loadProjectContext(projectId, dbUser.id);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  // Clear stale pendingConcepts first so a downstream reader can't
  // confuse half-old + half-new state.
  const productDataCleared = clearPendingConcepts(ctx.project.productData);
  await prisma.project.update({
    where: { id: projectId },
    data: { productData: productDataCleared as object },
  });

  const provider = resolveScriptProvider();
  const model = resolveScriptModel(provider);
  const callId = await recordApiCallStart({
    provider,
    operation: 'script_concept_batch',
    model,
    userId: dbUser.id,
    projectId,
    metadata: { regenerateAll: true },
  });

  const startedAt = Date.now();
  let raw: RawConceptCard[];
  let usage = { inputTokens: 0, outputTokens: 0 };
  try {
    const out = await generateConceptCards({
      systemInstruction: ctx.sharedSystemInstruction,
      userPrompt: buildConceptBatchUserPrompt(ctx.productInput),
      provider,
      model,
    });
    raw = out.concepts;
    usage = out.usage;
  } catch (err) {
    console.error('[concept-actions] regenerateAll failed:', (err as Error).message);
    if (callId) {
      await recordApiCallComplete(callId, {
        success: false,
        durationMs: Date.now() - startedAt,
        errorMessage: (err as Error).message,
      });
    }
    return { ok: false, error: 'יצירת הקונספטים נכשלה. נסה שוב.' };
  }

  const stored = wrapRawConceptsForStorage(raw);
  const now = new Date().toISOString();
  const pending: PendingConcepts = {
    status: 'draft',
    version: 1,
    scriptEngineMode: 'concept_interactive',
    generatedAt: now,
    lastUpdatedAt: now,
    selectedConceptIds: [],
    expandedConceptIds: [],
    concepts: stored,
  };
  await prisma.project.update({
    where: { id: projectId },
    data: {
      productData: writePendingConcepts(productDataCleared, pending) as object,
    },
  });

  const cost = costForTextCall(provider, model, usage);
  if (callId) {
    await recordApiCallComplete(callId, {
      success: true,
      durationMs: Date.now() - startedAt,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd: cost.estimatedCostUsd,
      actualCostUsd: cost.actualCostUsd,
      metadata: { regenerateAll: true, conceptCount: stored.length },
    });
  }

  revalidatePath(`/projects/${projectId}/scripts`);
  return { ok: true, pendingConcepts: pending };
}

// ─────────────────────────────────────────────────────────────────
// 4. expandPickedConceptsAction
// ─────────────────────────────────────────────────────────────────
export async function expandPickedConceptsAction(
  projectId: string,
  selectedConceptIds: string[],
): Promise<ConceptActionError | ExpandActionSuccess> {
  const engineMode = resolveScriptEngineMode();
  if (engineMode !== 'concept_interactive') {
    return {
      ok: false,
      error: 'concept_interactive mode is not enabled',
      modeMismatch: true,
    };
  }

  const validation = validateSelection(selectedConceptIds);
  if (!validation.ok) {
    return { ok: false, error: validation.reason ?? 'בחירה לא תקינה' };
  }

  const { dbUser } = await getOrCreateAppUser();
  const totalCost = EXPAND_COST_CREDITS_PER_SCRIPT * selectedConceptIds.length;
  if (dbUser.creditsBalance < totalCost) {
    return {
      ok: false,
      error: `אין מספיק קרדיטים להרחבה (נדרש ${totalCost})`,
      needsCredits: true,
    };
  }

  try {
    await checkRateLimit(dbUser.id, 'script_gen');
    await checkSpendCap(dbUser.id);
  } catch (err) {
    if (err instanceof RateLimitedError)
      return { ok: false, error: err.message, rateLimited: true };
    if (err instanceof SpendCapExceededError)
      return { ok: false, error: err.message, spendCapExceeded: true };
    throw err;
  }

  const ctx = await loadProjectContext(projectId, dbUser.id);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const pending = readPendingConcepts(ctx.project.productData);
  if (!pending) {
    return { ok: false, error: 'אין קונספטים זמינים. צור 6 חדשים תחילה.' };
  }

  const selectSet = new Set(selectedConceptIds);
  const concepts = pending.concepts.filter((c) => selectSet.has(c.concept_id));
  if (concepts.length !== selectedConceptIds.length) {
    return { ok: false, error: 'חלק מהקונספטים שנבחרו לא נמצאו' };
  }

  // Clear any prior scripts on this project — same behavior as the
  // legacy generateScriptsAction so the UI doesn't show stale rows.
  await prisma.scene.deleteMany({ where: { script: { projectId } } });
  await prisma.script.deleteMany({ where: { projectId } });

  const provider = resolveScriptProvider();
  const model = resolveScriptModel(provider);
  const expandedScriptIds: string[] = [];

  // Charge credits up-front; refund if all expansions fail.
  await prisma.user.update({
    where: { id: dbUser.id },
    data: { creditsBalance: { decrement: totalCost } },
    select: { creditsBalance: true },
  });
  await prisma.creditTransaction.create({
    data: {
      userId: dbUser.id,
      amount: -totalCost,
      reason: 'script_expand',
      ref: projectId,
      refType: 'project',
    },
  });
  invalidateUserCacheById(dbUser.id);

  // Expand each concept in parallel via the existing SINGLE_SCRIPT
  // schema. Each gets its own ApiCall row + per-call cost attribution.
  const expansionResults = await Promise.all(
    concepts.map(async (concept) => {
      const callId = await recordApiCallStart({
        provider,
        operation: 'script_concept_expand',
        model,
        userId: dbUser.id,
        projectId,
        metadata: { conceptId: concept.concept_id, slotIndex: concept.slot_index },
      });
      const startedAt = Date.now();
      try {
        const userPrompt =
          buildConceptBatchUserPrompt(ctx.productInput) +
          buildExpansionPromptFragment(concept);
        const responseSchema = SINGLE_SCRIPT_JSON_SCHEMA;
        const { parsed, usage } =
          provider === 'anthropic'
            ? await anthropicStructuredCall<{ script: Record<string, unknown> }>({
                systemInstruction: ctx.sharedSystemInstruction,
                userPrompt,
                responseSchema,
                model,
              })
            : provider === 'gemini'
              ? await geminiStructuredCall<{ script: Record<string, unknown> }>({
                  systemInstruction: ctx.sharedSystemInstruction,
                  userPrompt,
                  responseSchema,
                  model,
                })
              : await openaiStructuredCall<{ script: Record<string, unknown> }>({
                  systemInstruction: ctx.sharedSystemInstruction,
                  userPrompt,
                  responseSchema,
                  model,
                  temperature: 0.7,
                });

        // Convert + persist the expanded script. Reuse existing helpers
        // by importing the toGenerated mapping and persistOneScript-like
        // logic from this file; we inline a minimal subset to avoid a
        // circular import on actions.ts.
        const generated = mapLlmScriptToGenerated(parsed.script as Record<string, unknown>);
        const created = await persistExpandedScript(projectId, generated);
        expandedScriptIds.push(created.id);

        const cost = costForTextCall(provider, model, usage);
        if (callId) {
          await recordApiCallComplete(callId, {
            success: true,
            durationMs: Date.now() - startedAt,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            estimatedCostUsd: cost.estimatedCostUsd,
            actualCostUsd: cost.actualCostUsd,
          });
        }
        return { ok: true as const, scriptId: created.id };
      } catch (err) {
        console.error('[concept-actions] expansion failed:', (err as Error).message);
        if (callId) {
          await recordApiCallComplete(callId, {
            success: false,
            durationMs: Date.now() - startedAt,
            errorMessage: (err as Error).message,
          });
        }
        return { ok: false as const, error: (err as Error).message };
      }
    }),
  );

  const successCount = expansionResults.filter((r) => r.ok).length;

  // If all expansions failed, refund the charge.
  if (successCount === 0) {
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { creditsBalance: { increment: totalCost } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId: dbUser.id,
        amount: totalCost,
        reason: 'script_expand_refund',
        ref: projectId,
        refType: 'project',
      },
    });
    invalidateUserCacheById(dbUser.id);
    return { ok: false, error: 'כל ההרחבות נכשלו. הקרדיטים הוחזרו.' };
  }

  // Partial success: refund per-failure to keep accounting honest.
  const failedCount = expansionResults.length - successCount;
  if (failedCount > 0) {
    const refundAmount = EXPAND_COST_CREDITS_PER_SCRIPT * failedCount;
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { creditsBalance: { increment: refundAmount } },
    });
    await prisma.creditTransaction.create({
      data: {
        userId: dbUser.id,
        amount: refundAmount,
        reason: 'script_expand_partial_refund',
        ref: projectId,
        refType: 'project',
      },
    });
    invalidateUserCacheById(dbUser.id);
  }

  // Mark pendingConcepts.status = 'expanded' but KEEP the blob so
  // the user can re-pick / debug. The brief explicitly asks for this.
  const updated: PendingConcepts = {
    ...pending,
    status: 'expanded',
    lastUpdatedAt: new Date().toISOString(),
    selectedConceptIds: selectedConceptIds,
    expandedConceptIds: [...new Set([...pending.expandedConceptIds, ...selectedConceptIds])],
  };
  await prisma.project.update({
    where: { id: projectId },
    data: {
      productData: writePendingConcepts(ctx.project.productData, updated) as object,
    },
  });

  revalidatePath(`/projects/${projectId}/scripts`);
  return {
    ok: true,
    redirectTo: `/projects/${projectId}/scripts`,
    expandedScriptIds,
  };
}

// ─────────────────────────────────────────────────────────────────
// Helpers — minimal copies of existing actions.ts logic to keep
// concept-actions.ts free of circular imports.
// ─────────────────────────────────────────────────────────────────

interface MinimalExpandedScript {
  framework: string;
  angle: string;
  selectedHook: string;
  hookReason: string;
  qualityScoreOverall: number;
  cta: string;
  targetAudience: string;
  estimatedDurationSeconds: number;
  rawJson: Record<string, unknown>;
  scenes: Array<{
    sceneOrder: number;
    sceneGoal: string;
    textHebrew: string;
    onScreenCaptionHebrew: string;
    visualPromptEnglish: string;
    cameraDirection: string;
    performanceNote: string;
    durationSeconds: number;
    sceneType: string;
    sceneGenerationType: string | null;
    faceVisibility: string | null;
    requiresLipSync: boolean | null;
    primarySubject: string | null;
    mustShowProduct: boolean | null;
    productVisibilityPriority: string | null;
    cameraFocus: string | null;
    showFace: boolean | null;
  }>;
}

function mapLlmScriptToGenerated(script: Record<string, unknown>): MinimalExpandedScript {
  const FRAMEWORK_TO_LEGACY_ANGLE: Record<string, string> = {
    problem_agitation_solution: 'problem_solution',
    skeptical_testimonial: 'testimonial',
    demonstration_proof: 'product_demo',
    price_alternative_anchor: 'price_anchor',
    relatable_israeli_moment: 'testimonial',
    fast_direct_response: 'fast_benefit',
  };
  const SCENE_GOAL_TO_LEGACY_TYPE: Record<string, string> = {
    stop_scroll: 'hook',
    establish_pain: 'problem',
    introduce_product: 'product_demo',
    prove_it_works: 'benefit',
    decision_push: 'cta',
    other: 'other',
  };
  const framework = (script.framework as string) ?? 'problem_agitation_solution';
  const cs = script.creative_strategy as Record<string, string> | undefined;
  const qs = script.quality_score as Record<string, unknown> | undefined;
  const overall = typeof qs?.overall === 'number' ? qs.overall : 0;
  const scenesArr = Array.isArray(script.scenes) ? script.scenes : [];
  return {
    framework,
    angle: FRAMEWORK_TO_LEGACY_ANGLE[framework] ?? 'problem_solution',
    selectedHook: (script.selected_hook as string) ?? '',
    hookReason: (script.hook_reason as string) ?? '',
    qualityScoreOverall: overall,
    cta: (script.cta as string) ?? '',
    targetAudience: (script.target_audience as string) ?? '',
    estimatedDurationSeconds:
      typeof script.estimated_duration_seconds === 'number'
        ? (script.estimated_duration_seconds as number)
        : 30,
    rawJson: {
      raw: script,
      creativeStrategy: cs ?? {},
      hookOptions: Array.isArray(script.hook_options) ? script.hook_options : [],
      selectedHook: script.selected_hook,
      hookReason: script.hook_reason,
      qualityScore: qs ?? {},
      musicProfile: script.music_profile ?? null,
      framework,
      regenerated: false,
      schemaVersion: 3,
      // V27.11.PR6: provenance
      generatedFromConceptId: undefined,
    },
    scenes: scenesArr.map((s) => {
      const sc = s as Record<string, unknown>;
      const sceneGoal = (sc.scene_goal as string) ?? 'other';
      return {
        sceneOrder: typeof sc.scene_order === 'number' ? (sc.scene_order as number) : 0,
        sceneGoal,
        textHebrew: (sc.spoken_text_hebrew as string) ?? '',
        onScreenCaptionHebrew: (sc.on_screen_caption_hebrew as string) ?? '',
        visualPromptEnglish: (sc.visual_prompt_english as string) ?? '',
        cameraDirection: (sc.camera_direction as string) ?? '',
        performanceNote: (sc.performance_note as string) ?? '',
        durationSeconds:
          typeof sc.duration_seconds === 'number' ? (sc.duration_seconds as number) : 5,
        sceneType: SCENE_GOAL_TO_LEGACY_TYPE[sceneGoal] ?? 'other',
        sceneGenerationType: (sc.scene_generation_type as string) ?? null,
        faceVisibility: (sc.face_visibility as string) ?? null,
        requiresLipSync:
          typeof sc.requires_lip_sync === 'boolean' ? (sc.requires_lip_sync as boolean) : null,
        primarySubject: (sc.primary_subject as string) ?? null,
        mustShowProduct:
          typeof sc.must_show_product === 'boolean' ? (sc.must_show_product as boolean) : null,
        productVisibilityPriority: (sc.product_visibility_priority as string) ?? null,
        cameraFocus: (sc.camera_focus as string) ?? null,
        showFace: typeof sc.show_face === 'boolean' ? (sc.show_face as boolean) : null,
      };
    }),
  };
}

async function persistExpandedScript(
  projectId: string,
  s: MinimalExpandedScript,
): Promise<{ id: string }> {
  return prisma.script.create({
    data: {
      projectId,
      angle: s.angle as ScriptAngle,
      framework: s.framework,
      hook: s.selectedHook,
      selectedHookReason: s.hookReason,
      qualityScoreOverall: s.qualityScoreOverall,
      cta: s.cta,
      targetAudience: s.targetAudience,
      estimatedDurationSeconds: s.estimatedDurationSeconds,
      rawJson: s.rawJson as object,
      scenes: {
        create: s.scenes.map((sc) => ({
          sceneOrder: sc.sceneOrder,
          sceneGoal: sc.sceneGoal,
          textHebrew: sc.textHebrew,
          onScreenCaptionHebrew: sc.onScreenCaptionHebrew || null,
          visualPromptEnglish: sc.visualPromptEnglish,
          cameraDirection: sc.cameraDirection || null,
          performanceNote: sc.performanceNote || null,
          durationSeconds: sc.durationSeconds,
          sceneType: sc.sceneType as SceneType,
          sceneGenerationType: sc.sceneGenerationType,
          faceVisibility: sc.faceVisibility,
          requiresLipSync: sc.requiresLipSync,
          primarySubject: sc.primarySubject,
          mustShowProduct: sc.mustShowProduct,
          productVisibilityPriority: sc.productVisibilityPriority,
          cameraFocus: sc.cameraFocus,
          showFace: sc.showFace,
        })),
      },
    },
    select: { id: true },
  });
}

function costForTextCall(
  provider: ScriptProvider,
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): { estimatedCostUsd: number; actualCostUsd?: number } {
  if (provider === 'anthropic') {
    const r = attributeAnthropicTextCost({
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
    return {
      estimatedCostUsd: r.estimatedCostUsd,
      actualCostUsd: r.actualCostUsd,
    };
  }
  if (provider === 'gemini') {
    const r = attributeGeminiTextCost({
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
    return {
      estimatedCostUsd: r.estimatedCostUsd,
      actualCostUsd: r.actualCostUsd,
    };
  }
  const r = attributeOpenAiTextCost({
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
  return { estimatedCostUsd: r.estimatedCostUsd, actualCostUsd: r.actualCostUsd };
}
