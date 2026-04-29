'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ProjectStatus, ScriptAngle, SceneType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { generateScripts, LlmConfigError, type GeneratedScript } from '@/lib/llm/scripts';
import { recordApiCallStart, recordApiCallComplete } from '@/lib/usage/log';
import { priceOpenAiText } from '@/lib/usage/pricing';
import { buildCreditMutationOps } from '@/lib/usage/credits';
import { checkRateLimit, RateLimitedError } from '@/lib/usage/rate-limit';
import { checkSpendCap, SpendCapExceededError } from '@/lib/usage/spend-cap';
import { findAvatar, describeAvatar } from '@/lib/avatars/catalog';
import {
  findCategory,
  categoryGuidance,
  mapDossierCategoryToId,
  type ProductCategoryId,
} from '@/lib/categories';

// V6: script_batch = 2 credits (was 1). Real cost ≈ $0.02; we charge
// $0.20 list — 90% margin on the cheapest LLM operation in the
// pipeline. The constant flows from lib/plans.ts so per-op pricing
// has one source of truth.
import { PER_OPERATION_CREDITS } from '@/lib/plans';
const GEN_COST_CREDITS = PER_OPERATION_CREDITS.script_batch;

// V2: rich payload stored in Script.rawJson — the original LLM scripts plus
// the strategy + hook options + score breakdown + the regen flag. Keeping
// this in JSON rather than adding 12 more columns lets the strategy block
// evolve without future migrations.
function buildScriptRawJson(s: GeneratedScript): Record<string, unknown> {
  return {
    raw: s.raw,
    creativeStrategy: s.creativeStrategy,
    hookOptions: s.hookOptions,
    selectedHook: s.selectedHook,
    hookReason: s.hookReason,
    qualityScore: s.qualityScore,
    musicProfile: s.musicProfile,
    framework: s.framework,
    regenerated: s.regenerated,
    schemaVersion: 3,
  };
}

// Persist a single script + its scenes. Called from the
// generateScripts onScriptReady callback as each per-framework
// promise resolves. Independent transaction so one slow / failed
// sibling doesn't block earlier ones from being readable by the
// polling endpoint.
async function persistOneScript(projectId: string, s: GeneratedScript): Promise<void> {
  await prisma.script.create({
    data: {
      projectId,
      angle: s.angle as ScriptAngle,
      framework: s.framework,
      hook: s.selectedHook,
      selectedHookReason: s.hookReason,
      qualityScoreOverall: s.qualityScore.overall,
      cta: s.cta,
      targetAudience: s.targetAudience,
      estimatedDurationSeconds: s.estimatedDurationSeconds,
      rawJson: buildScriptRawJson(s) as object,
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
          sceneGenerationType: sc.sceneGenerationType ?? null,
          faceVisibility: sc.faceVisibility ?? null,
          requiresLipSync: sc.requiresLipSync ?? null,
          primarySubject: sc.primarySubject ?? null,
          mustShowProduct: sc.mustShowProduct ?? null,
          productVisibilityPriority: sc.productVisibilityPriority ?? null,
          cameraFocus: sc.cameraFocus ?? null,
          showFace: sc.showFace ?? null,
        })),
      },
    },
  });
  // Best-effort revalidate so the streaming UI's router.refresh()
  // picks up the new row immediately.
  revalidatePath(`/projects/${projectId}/scripts`);
}

export type GenerateState =
  | { error?: string; needsCredits?: boolean; rateLimited?: boolean; spendCapExceeded?: boolean }
  | undefined;

// Generate (or regenerate) 6 scripts for the project.
export async function generateScriptsAction(
  projectId: string,
  _prev: GenerateState,
  _formData: FormData,
): Promise<GenerateState> {
  const { dbUser } = await getOrCreateAppUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
  });
  if (!project) return { error: 'הפרויקט לא נמצא' };

  if (dbUser.creditsBalance < GEN_COST_CREDITS) {
    return {
      error: 'אין מספיק קרדיטים ליצירת תסריטים',
      needsCredits: true,
    };
  }

  // Pre-flight: rate-limit + daily spend cap.
  try {
    await checkRateLimit(dbUser.id, 'script_gen');
    await checkSpendCap(dbUser.id);
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return { error: err.message, rateLimited: true };
    }
    if (err instanceof SpendCapExceededError) {
      return { error: err.message, spendCapExceeded: true };
    }
    throw err;
  }

  const data = (project.productData as Record<string, unknown> | null) ?? {};

  let generated: GeneratedScript[];
  let usage: { model: string; inputTokens: number; outputTokens: number; durationMs: number } | null = null;
  const scriptStartedAt = Date.now();
  const scriptCallId = await recordApiCallStart({
    provider: 'openai',
    operation: 'script_gen',
    model: process.env.OPENAI_SCRIPT_MODEL || 'gpt-5.4-mini',
    userId: dbUser.id,
    projectId,
  });

  // Clear any previous scripts BEFORE generation starts so the polling
  // endpoint sees an empty list and the UI shows blank slots filling in
  // one-by-one (instead of a stale 6-script grid that suddenly swaps).
  await prisma.scene.deleteMany({ where: { script: { projectId } } });
  await prisma.script.deleteMany({ where: { projectId } });

  try {
    const selectedAvatar = findAvatar(
      typeof data.selectedAvatarId === 'string' ? data.selectedAvatarId : null,
    );
    const categoryId = (typeof data.category === 'string' ? data.category : null) as ProductCategoryId | null;
    const category = findCategory(categoryId);

    // V11 — Product Intelligence. If the project's productData already
    // has an `intelligence` block (built once during scrape / Step 1
    // editing), reuse it. Otherwise build it now lazily so the script
    // engine never runs without dossier + audience grounding. Errors
    // here are non-fatal: we fall back to the lean ProductInput path
    // and the script engine just doesn't get the structured block.
    const cachedIntel = (data.intelligence ?? null) as
      | import('@/lib/product-intelligence').ProductIntelligence
      | null;
    let intelligence = cachedIntel;
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
        // V11.6 — when the wizard's heuristic landed on `other` /
        // unset, override with the dossier's category. The dossier is
        // built by gpt-5.4-mini with full text + features context, so
        // it classifies "Hair Boost Roller" → haircare correctly
        // where the keyword heuristic missed it. We only override
        // when the user didn't pick a category explicitly OR landed
        // on `other`, so we don't fight a deliberate user choice.
        if (!resolvedCategoryId || resolvedCategoryId === 'other') {
          const mapped = mapDossierCategoryToId(
            intelligence.dossier.category,
            intelligence.dossier.subcategory,
            intelligence.dossier.productType,
          );
          if (mapped !== 'other') {
            resolvedCategoryId = mapped;
            resolvedCategory = findCategory(mapped);
            console.log(
              `[scripts] dossier override: category ${categoryId ?? 'unset'} → ${mapped} ` +
                `(dossier said "${intelligence.dossier.category}" / "${intelligence.dossier.subcategory}")`,
            );
          }
        }
        // Persist for reuse on regen + scene image generation. Merge
        // back into productData without clobbering other keys.
        const merged = {
          ...data,
          intelligence,
          // Persist the resolved category so admin views + later
          // wizard steps see the corrected value.
          ...(resolvedCategoryId && resolvedCategoryId !== categoryId
            ? { category: resolvedCategoryId }
            : {}),
        };
        await prisma.project.update({
          where: { id: projectId },
          data: { productData: merged as object },
        });
      } catch (err) {
        console.warn(
          '[scripts] product intelligence build failed — falling back to lean ProductInput:',
          (err as Error).message,
        );
      }
    }

    const result = await generateScripts(
      {
        productName: project.productName ?? 'מוצר ללא שם',
        description: typeof data.description === 'string' ? data.description : '',
        brand: typeof data.brand === 'string' ? data.brand : null,
        targetAudience: typeof data.targetAudience === 'string' ? data.targetAudience : null,
        durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : 15,
        price: typeof data.price === 'string' ? data.price : null,
        currency: typeof data.currency === 'string' ? data.currency : null,
        intelligence,
        avatarDescription: selectedAvatar ? describeAvatar(selectedAvatar) : null,
        avatarGender: selectedAvatar?.gender ?? null,
        categoryId: resolvedCategoryId,
        categoryLabel: resolvedCategory?.labelEnglish ?? null,
        categoryGuidance: categoryGuidance(resolvedCategoryId),
      },
      {
        // Stream scripts to the DB as soon as each per-framework call
        // resolves. The /api/projects/[id]/scripts/list endpoint serves
        // these to the client poller so the user sees cards filling in
        // live, instead of waiting 60-90s for the slowest framework.
        onScriptReady: async (s) => {
          await persistOneScript(projectId, s);
        },
      },
    );
    generated = result.scripts;
    usage = result.usage;
  } catch (err) {
    // Close the in-progress row as failed so the dashboard reflects it.
    await recordApiCallComplete(scriptCallId, {
      success: false,
      errorMessage: (err as Error).message,
      durationMs: Date.now() - scriptStartedAt,
    });
    if (err instanceof LlmConfigError) {
      return { error: err.message };
    }
    return { error: `יצירת התסריטים נכשלה: ${(err as Error).message}` };
  }

  // Successful call — close the in-progress row with computed cost.
  await recordApiCallComplete(scriptCallId, {
    success: true,
    model: usage.model,
    costUsd: priceOpenAiText(usage.model, usage.inputTokens, usage.outputTokens),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    units: generated.length,
    durationMs: usage.durationMs,
  });

  // Scripts have already been persisted by the onScriptReady callback
  // during generation. Now: charge credits + flip project status. We
  // skip the previous bulk transaction since the rows are already in
  // the DB; doing them in a single tx now would be a no-op.
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: dbUser.id },
      data: { creditsBalance: { decrement: GEN_COST_CREDITS } },
    });
    await tx.creditTransaction.create({
      data: {
        userId: dbUser.id,
        amount: -GEN_COST_CREDITS,
        reason: 'spent:script_gen',
        ref: projectId,
        metadata: { model: usage?.model, scriptCount: generated.length } as object,
      },
    });
    await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.scripts_generated,
        selectedScriptId: null, // clear any previous selection
      },
    });
  });

  revalidatePath(`/projects/${projectId}/scripts`);
  return undefined;
}

export async function selectScriptAction(formData: FormData) {
  const { dbUser } = await getOrCreateAppUser();
  const projectId = String(formData.get('projectId') ?? '');
  const scriptId = String(formData.get('scriptId') ?? '');
  if (!projectId || !scriptId) return;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    include: { scripts: { where: { id: scriptId }, select: { id: true } } },
  });
  if (!project || project.scripts.length === 0) return;

  await prisma.project.update({
    where: { id: projectId },
    data: { selectedScriptId: scriptId },
  });
  revalidatePath(`/projects/${projectId}/scripts`);
}

export async function continueAfterSelectAction(formData: FormData) {
  const projectId = String(formData.get('projectId') ?? '');
  if (!projectId) return;
  // Next step is /scenes (placeholder for now).
  redirect(`/projects/${projectId}/scenes`);
}

// Save user edits to hook / cta / scenes for a single script.
export async function updateScriptAction(formData: FormData) {
  const { dbUser } = await getOrCreateAppUser();
  const scriptId = String(formData.get('scriptId') ?? '');
  const hook = String(formData.get('hook') ?? '').trim();
  const cta = String(formData.get('cta') ?? '').trim();
  const scenesRaw = String(formData.get('scenes') ?? '[]');
  if (!scriptId || !hook) return;

  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    include: { project: true, scenes: true },
  });
  if (!script || script.project.userId !== dbUser.id) return;

  let scenePatches: { id: string; textHebrew: string; durationSeconds: number }[];
  try {
    scenePatches = JSON.parse(scenesRaw);
  } catch {
    return;
  }
  const validIds = new Set(script.scenes.map((s) => s.id));
  scenePatches = scenePatches.filter((s) => validIds.has(s.id));

  // Total duration = sum of scene durations (clamp to 5–120s per scene).
  const total = scenePatches.reduce(
    (sum, s) => sum + Math.max(2, Math.min(20, Math.floor(s.durationSeconds || 0))),
    0,
  );

  await prisma.$transaction([
    prisma.script.update({
      where: { id: scriptId },
      data: {
        hook,
        cta: cta || null,
        estimatedDurationSeconds: total || script.estimatedDurationSeconds,
      },
    }),
    ...scenePatches.map((s) =>
      prisma.scene.update({
        where: { id: s.id },
        data: {
          textHebrew: s.textHebrew,
          durationSeconds: Math.max(2, Math.min(20, Math.floor(s.durationSeconds || 0))),
        },
      }),
    ),
  ]);

  revalidatePath(`/projects/${script.project.id}/scripts`);
}
