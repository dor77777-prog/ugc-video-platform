// Shared scene-generation core. Both the server action (single-scene
// "Create" button) and the parallel-friendly Route Handler (the "Generate
// all" loop) call into this function. Keeping the heavy logic here lets
// the HTTP entry point parallelize cleanly — Next.js serializes server
// actions per-route but does NOT serialize Route Handlers, so the
// "Generate all" loop now actually runs scenes concurrently.

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { findAvatar, describeAvatar } from '@/lib/avatars/catalog';
import { computeLockedOutfit } from '@/lib/avatars/outfit';
import {
  computeLockedEnvironmentRegister,
  describeLockedEnvironmentRegister,
  type LockedEnvironmentRegister,
} from '@/lib/avatars/environment-register';
import {
  generateSceneImage,
  SceneImageSafetyError,
  SceneImageTimeoutError,
  type AspectRatio,
} from '@/lib/llm/scene-images';
import { LlmConfigError } from '@/lib/llm/scripts';
import { getStorage } from '@/lib/storage';
import { recordApiCallStart, recordApiCallComplete, recordApiCall } from '@/lib/usage/log';
import { attributeOpenAiImageCost } from '@/lib/usage/cost-attribution';
import { priceOpenAiImage } from '@/lib/usage/pricing';
import {
  buildCreditMutationOps,
  invalidateUserCacheAfterCreditMutation,
} from '@/lib/usage/credits';
import { checkRateLimit, RateLimitedError } from '@/lib/usage/rate-limit';
import { checkSpendCap, SpendCapExceededError } from '@/lib/usage/spend-cap';
import { PER_OPERATION_CREDITS, FIRST_REGEN_FREE } from '@/lib/plans';
import {
  buildImageBrief,
  isProblemSceneType,
  type ImageBrief,
} from '@/lib/image-briefs/image-brief-builder';
import {
  SceneVariationLedger,
  chooseScrollStopperIndex,
} from '@/lib/image-briefs/scene-variation-ledger';
import type { ProductIntelligence } from '@/lib/product-intelligence';
import { logStage, flushSceneLogBuffer } from '@/lib/logging/log';

const COST_PER_SCENE_IMAGE = PER_OPERATION_CREDITS.image; // 2 credits

export interface GenerateSceneResult {
  success: boolean;
  error?: string;
  needsCredits?: boolean;
  safetyBlocked?: boolean;
  timedOut?: boolean;
  safetyRetryApplied?: boolean;
  rateLimited?: boolean;
  spendCapExceeded?: boolean;
  freeRegen?: boolean;
  imageUrl?: string;
}

export async function generateSceneImageImpl(
  sceneId: string,
  userId: string,
): Promise<GenerateSceneResult> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      script: {
        include: { project: { select: { id: true, productData: true, productName: true, userId: true } } },
      },
    },
  });
  if (!scene) return { success: false, error: 'הסצנה לא נמצאה' };
  if (scene.script.project.userId !== userId) {
    return { success: false, error: 'אין הרשאה' };
  }

  // ── In-flight guard ────────────────────────────────────────────────────
  // gpt-image-2 typically returns in 30-60s. 3-min TTL gives margin for
  // safety-retry without letting genuine stuck calls block forever.
  const IMAGE_IN_FLIGHT_TTL_MS = 3 * 60 * 1000;
  const sceneAny = scene as unknown as { imageInFlightAt?: Date | null };
  if (
    sceneAny.imageInFlightAt &&
    Date.now() - sceneAny.imageInFlightAt.getTime() < IMAGE_IN_FLIGHT_TTL_MS
  ) {
    return {
      success: false,
      error: 'יצירת תמונה כבר רצה לסצנה הזו. רענן ועקוב אחרי הספינר.',
      rateLimited: true,
    };
  }

  // Pre-flight: rate-limit + daily spend cap.
  try {
    await checkRateLimit(userId, 'image_gen');
    await checkSpendCap(userId);
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return { success: false, error: err.message, rateLimited: true };
    }
    if (err instanceof SpendCapExceededError) {
      return { success: false, error: err.message, spendCapExceeded: true };
    }
    throw err;
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditsBalance: true },
  });
  if (!dbUser) return { success: false, error: 'משתמש לא נמצא' };
  if (dbUser.creditsBalance < COST_PER_SCENE_IMAGE) {
    return { success: false, error: 'אין מספיק קרדיטים', needsCredits: true };
  }

  // Mark in-flight + transition to generating_image. Clearing
  // lastErrorCode/Message means the wizard's error panel goes away as
  // soon as a regenerate fires; the next failure will repopulate it.
  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      imageInFlightAt: new Date(),
      status: 'generating_image',
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  try {
    return await generateSceneImageImplInner(sceneId, userId, scene);
  } finally {
    await prisma.scene
      .update({ where: { id: sceneId }, data: { imageInFlightAt: null } })
      .catch(() => {/* best effort */});
    // V13 PR7.2 — flush stage logs into Scene.generationLogJson so the
    // wizard log viewer + admin debug panel can render them. Best
    // effort; failures here never affect the caller.
    await flushSceneLogBuffer(sceneId, prisma);
  }
}

async function loadSceneForImage(sceneId: string) {
  return prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      script: {
        include: { project: { select: { id: true, productData: true, productName: true, userId: true } } },
      },
    },
  });
}
type ImageSceneType = NonNullable<Awaited<ReturnType<typeof loadSceneForImage>>>;

async function generateSceneImageImplInner(
  sceneId: string,
  userId: string,
  scene: ImageSceneType,
): Promise<GenerateSceneResult> {
  const project = scene.script.project;
  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const heroImageUrl = typeof data.heroImageUrl === 'string' ? data.heroImageUrl : null;
  const aspectRatio = (typeof data.aspectRatio === 'string' ? data.aspectRatio : '9:16') as AspectRatio;
  const selectedAvatar = findAvatar(
    typeof data.selectedAvatarId === 'string' ? data.selectedAvatarId : null,
  );
  const categoryId = typeof data.category === 'string' ? data.category : null;

  // V14 PR4 — load sibling scenes so we can build a SceneVariationLedger
  // (diversity diagnostic) AND pick the scroll-stopper. One small select
  // per scene gen; the result is used for diagnostic counts and the
  // scroll-stopper decision, not for any cross-scene mutation.
  const siblings = await prisma.scene.findMany({
    where: { scriptId: scene.scriptId },
    select: {
      sceneOrder: true,
      cameraFocus: true,
      sceneGenerationType: true,
      primarySubject: true,
      faceVisibility: true,
      sceneGoal: true,
    },
    orderBy: { sceneOrder: 'asc' },
  });
  const totalScenes = siblings.length;
  const variationLedger = SceneVariationLedger.fromRecords(
    siblings
      .filter((s) => s.sceneOrder !== scene.sceneOrder)
      .map((s) => ({
        sceneOrder: s.sceneOrder,
        cameraFocus: s.cameraFocus,
        sceneGenerationType: s.sceneGenerationType,
        primarySubject: s.primarySubject,
        faceVisibility: s.faceVisibility,
      })),
  );
  const finalSceneGoal = siblings[siblings.length - 1]?.sceneGoal ?? null;
  const scrollStopperChoice = chooseScrollStopperIndex({
    totalScenes,
    finalSceneGoal,
  });
  const isScrollStopper = scrollStopperChoice.index === scene.sceneOrder;
  const scrollStopperReason: 'hook' | 'punchline' | undefined = isScrollStopper
    ? scrollStopperChoice.reason === 'none'
      ? undefined
      : scrollStopperChoice.reason
    : undefined;

  // V14 PR3 — outfit lock. Compute once on first scene generation that has
  // an avatar, persist to Project.productData.lockedOutfit, then reuse
  // verbatim across every scene of the same project so consistency-anchor
  // sees a stable outfit string. Race-safe under concurrent first scenes:
  // computeLockedOutfit is deterministic, so two parallel writers produce
  // the same string.
  let lockedOutfit: string | null =
    typeof data.lockedOutfit === 'string' ? data.lockedOutfit : null;
  if (!lockedOutfit && selectedAvatar) {
    lockedOutfit = computeLockedOutfit({
      gender: selectedAvatar.gender,
      style: selectedAvatar.style,
      archetype: selectedAvatar.archetype,
      religiousRegister: selectedAvatar.religiousRegister,
      productCategory: categoryId,
    });
    try {
      await prisma.project.update({
        where: { id: project.id },
        data: { productData: { ...data, lockedOutfit } as Prisma.InputJsonValue },
      });
    } catch {
      // Non-fatal: outfit lock is a quality lever, not a correctness gate.
      // The next scene gen recomputes the same deterministic string.
    }
  }

  // V14 hotfix #2 — environment register lock. Same shape as outfit lock:
  // computed once on first scene gen with an avatar, persisted to
  // Project.productData.lockedEnvironmentRegister, then quoted verbatim by
  // the consistency anchor so every scene of the same ad reads the same
  // apartment register (modern / older / urban / premium). Without this,
  // the script LLM picks environment_style independently per scene and
  // half the frames read modern while the other half read older — visibly
  // breaks continuity.
  let lockedEnvRegister: LockedEnvironmentRegister | null =
    typeof data.lockedEnvironmentRegister === 'string'
      ? (data.lockedEnvironmentRegister as LockedEnvironmentRegister)
      : null;
  if (!lockedEnvRegister && selectedAvatar) {
    lockedEnvRegister = computeLockedEnvironmentRegister(selectedAvatar.archetype);
    try {
      await prisma.project.update({
        where: { id: project.id },
        data: {
          productData: {
            ...data,
            lockedOutfit,
            lockedEnvironmentRegister: lockedEnvRegister,
          } as Prisma.InputJsonValue,
        },
      });
    } catch {
      // Non-fatal — same reasoning as outfit lock: deterministic, race-safe.
    }
  }
  const environmentRegisterLockedText = lockedEnvRegister
    ? describeLockedEnvironmentRegister(lockedEnvRegister)
    : null;

  // V11 — pull the Product Intelligence bundle off productData. Used
  // by the deterministic Image Brief Builder (which replaces the old
  // narration → image prompt path) and by the QA evaluator below.
  const intelligence =
    ((data as { intelligence?: ProductIntelligence | null }).intelligence ?? null) as
      | ProductIntelligence
      | null;

  // V11 — build the deterministic Image Brief BEFORE calling
  // gpt-image-2. The brief replaces the old narration-driven prompt
  // path: it pulls mustShow / mustAvoid / Israeli realism / product
  // accuracy directly from the dossier + visual analysis, so the
  // image model receives a contract instead of a poem.
  const sceneGenType = (scene as { sceneGenerationType?: string | null }).sceneGenerationType ?? '';
  const isProblem = isProblemSceneType(sceneGenType);
  const briefLog = logStage('image-brief', sceneId);
  const imageLog = logStage('image-gen', sceneId);
  briefLog.info('building brief', {
    sceneType: sceneGenType,
    isProblem,
    hasIntelligence: !!intelligence,
    hasHero: !!heroImageUrl,
    hasAvatar: !!selectedAvatar,
  });
  let brief: ImageBrief = buildImageBrief({
    sceneNumber: scene.sceneOrder + 1,
    totalScenes,
    sceneGoal: (scene as { sceneGoal?: string | null }).sceneGoal ?? '',
    sceneGenerationType: sceneGenType,
    faceVisibility: (scene as { faceVisibility?: string | null }).faceVisibility ?? '',
    spokenTextHebrew: scene.textHebrew,
    rawVisualBrief: scene.visualPromptEnglish,
    cameraDirection: scene.cameraDirection,
    primarySubject: (scene as { primarySubject?: string | null }).primarySubject ?? null,
    mustShowProduct: (scene as { mustShowProduct?: boolean | null }).mustShowProduct ?? null,
    productVisibilityPriority:
      (scene as { productVisibilityPriority?: string | null }).productVisibilityPriority ?? null,
    cameraFocus: (scene as { cameraFocus?: string | null }).cameraFocus ?? null,
    showFace: (scene as { showFace?: boolean | null }).showFace ?? null,
    intelligence,
    isProblemScene: isProblem,
    outfitDescriptionLocked: lockedOutfit,
    environmentRegisterLocked: environmentRegisterLockedText,
    isScrollStopper,
    scrollStopperReason,
    variationLedger,
  });
  briefLog.info('brief built', {
    mustShowCount: brief.mustShow.length,
    mustAvoidCount: brief.mustAvoid.length,
    promptChars: brief.finalImagePrompt.length,
    handsPhysicsRequired: brief.handsPhysicsRequired,
    mirrorRisk: brief.mirrorRisk,
    contactProofRequired: brief.contactProofRequired,
    ruleBlocks: brief.ruleBlocks.length,
  });

  // If the scene will be lip-synced downstream, the still must look like
  // a frame from a real silent UGC speaking video — not a posed
  // portrait. We read explicit DB columns first, fall back to the
  // derived routing heuristic for legacy scenes.
  const explicitRequiresLipSync =
    (scene as { requiresLipSync?: boolean | null }).requiresLipSync;
  const silentTalkingPlate =
    explicitRequiresLipSync != null
      ? !!explicitRequiresLipSync
      : (await import('@/lib/animation/scene-routing')).deriveSceneRouting({
          cameraDirection: scene.cameraDirection,
          sceneGoal: scene.sceneGoal,
          sceneType: scene.sceneType,
        }).requiresLipSync;

  // ── Single-pass image gen ──────────────────────────────────────────────
  // V13 (PR1): the post-generation QA evaluator + auto-regen loop has been
  // removed from the active path. Quality is now driven by the upstream
  // ImageBrief (deterministic V11 builder) — not by a vision model
  // second-guessing gpt-image-2. If the frame disappoints, the user can
  // manually click "regenerate scene" or use a future scene-plan-aware
  // regeneration; we don't burn $0.18 + 60s on a corrective loop that
  // can't reliably fix what it flags. Historical Scene.imageQaJson /
  // imageRegenAttempts / needsManualReview columns remain nullable for
  // backwards compatibility but are no longer written here.
  const imageStartedAt = Date.now();
  imageLog.info('calling gpt-image-2', {
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    silentTalkingPlate,
    refs: { product: !!heroImageUrl, avatar: !!selectedAvatar },
  });
  const imageCallId = await recordApiCallStart({
    provider: 'openai',
    operation: 'image_gen',
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    units: 1,
    estimatedCostUsd: attributeOpenAiImageCost({
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
      quality: 'medium',
      size: aspectRatio === '9:16' ? '1024x1792' : '1024x1024',
    }).estimatedCostUsd,
    userId,
    projectId: project.id,
    sceneId,
    metadata: { quality: 'medium', aspectRatio },
  });
  let result;
  try {
    result = await generateSceneImage({
      productImageUrl: heroImageUrl,
      avatarImageUrl: selectedAvatar?.imageUrl ?? null,
      categoryId,
      promptInput: {
        productName: project.productName ?? 'Product',
        productBrand: typeof data.brand === 'string' ? data.brand : null,
        productDescription: typeof data.description === 'string' ? data.description : null,
        // The deterministic ImageBrief.finalImagePrompt is the prompt
        // contract: mustShow / mustAvoid / Israeli realism / product
        // accuracy all stitched in by the brief builder. The prompt
        // wrapper still anchors avatar identity + safety tokens.
        sceneVisualBrief: brief.finalImagePrompt,
        sceneOrder: scene.sceneOrder,
        totalScenes,
        sceneType: scene.sceneType,
        aspectRatio,
        avatarPresent: !!selectedAvatar,
        productPresent: !!heroImageUrl,
        avatarDescription: selectedAvatar ? describeAvatar(selectedAvatar) : '',
        silentTalkingPlate,
        primarySubject:
          (scene as { primarySubject?: string | null }).primarySubject ?? undefined,
        mustShowProduct:
          (scene as { mustShowProduct?: boolean | null }).mustShowProduct ?? undefined,
        productVisibilityPriority:
          (scene as { productVisibilityPriority?: string | null }).productVisibilityPriority ??
          undefined,
        cameraFocus: (scene as { cameraFocus?: string | null }).cameraFocus ?? undefined,
        showFace: (scene as { showFace?: boolean | null }).showFace ?? undefined,
        // V13 PR2.3 — problem scenes don't carry the product in-frame.
        isProblemScene: isProblem,
      },
      quality: 'medium',
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    const durationMs = Date.now() - imageStartedAt;
    await recordApiCallComplete(imageCallId, {
      success: false,
      errorMessage: errMsg,
      durationMs,
    });
    // Persist the failure to Scene.status + lastError* so the wizard
    // surfaces the right curated Hebrew message via PR5's map. Best-
    // effort — never let a status-write failure mask the original error.
    const writeFailure = async (code: string) => {
      await prisma.scene
        .update({
          where: { id: sceneId },
          data: { status: 'failed', lastErrorCode: code, lastErrorMessage: errMsg },
        })
        .catch(() => {/* best effort */});
    };
    if (err instanceof LlmConfigError) {
      imageLog.error('config error', { errMsg, durationMs });
      await writeFailure('image-gen.config');
      return { success: false, error: err.message };
    }
    if (err instanceof SceneImageTimeoutError) {
      imageLog.error('timed out', { durationMs });
      await writeFailure('image-gen.timeout');
      return {
        success: false,
        error: 'OpenAI לא הגיב תוך 3 דקות לסצנה זו. נסה שוב — אם זה חוזר על עצמו, יש עומס/תקלה אצלם.',
        timedOut: true,
      };
    }
    if (err instanceof SceneImageSafetyError) {
      imageLog.warn('safety rejected', { errMsg, durationMs });
      await writeFailure('image-gen.safety_rejected');
      return {
        success: false,
        error:
          'OpenAI סירבו ליצור את הסצנה גם בלי תמונת המוצר וגם עם הוראות modesty. ערוך ידנית את ה-visual_prompt_english (הסר/החלף מילים כמו bodysuit / shaper / lingerie / sexy / revealing / skin-tight), או דלג על הסצנה הזו.',
        safetyBlocked: true,
      };
    }
    imageLog.error('failed', { errMsg, durationMs });
    await writeFailure('image-gen.generic');
    return { success: false, error: `יצירת התמונה נכשלה: ${errMsg}` };
  }

  const imageAttribution = attributeOpenAiImageCost({
    model: result.model,
    quality: result.quality,
    size: result.size,
  });
  await recordApiCallComplete(imageCallId, {
    success: true,
    model: result.model,
    costUsd: imageAttribution.costUsd,
    estimatedCostUsd: imageAttribution.estimatedCostUsd,
    actualCostUsd: imageAttribution.actualCostUsd,
    units: 1,
    durationMs: result.durationMs,
    metadata: { ...imageAttribution.metadata, source: imageAttribution.source },
  });
  imageLog.info('gpt-image-2 returned', {
    model: result.model,
    quality: result.quality,
    size: result.size,
    durationMs: result.durationMs,
    safetyRetryApplied: result.safetyRetryApplied,
    bytes: Buffer.byteLength(result.base64, 'base64'),
  });

  // Persist the generated frame.
  const storage = await getStorage();
  const bytes = Buffer.from(result.base64, 'base64');
  const filename = `${scene.id}-${Date.now()}.png`;
  const persisted = await storage.putBytes({
    folder: `scenes/${project.id}`,
    filename,
    data: bytes,
    contentType: 'image/png',
  });
  const url = persisted.url;
  imageLog.info('persisted', { url });

  // V6: image keeps first-regen-free policy via FIRST_REGEN_FREE map.
  // (image + voice keep this UX; clips dropped it for margin reasons.)
  const prevImgCount = scene.imageGenerationCount ?? 0;
  const isFirstRegen = prevImgCount === 1 && FIRST_REGEN_FREE.image;
  const charge = isFirstRegen ? 0 : COST_PER_SCENE_IMAGE;

  await prisma.$transaction([
    prisma.scene.update({
      where: { id: sceneId },
      data: {
        imageUrl: url,
        imagePromptUsed: result.promptUsed,
        imageGeneratedAt: new Date(),
        imageGenerationCount: { increment: 1 },
        imageProvider: result.model,
        imageBriefJson: brief as unknown as Prisma.InputJsonValue,
        // V13 PR7.1 — image stage succeeded; clear any prior error.
        status: 'image_ready',
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    }),
    ...buildCreditMutationOps(prisma, {
      userId,
      amount: -charge,
      reason: isFirstRegen ? 'first_regen_free:scene_image' : 'spent:scene_image',
      ref: sceneId,
      metadata: {
        previousCount: prevImgCount,
        model: result.model,
      },
    }),
    prisma.asset.create({
      data: {
        projectId: project.id,
        type: 'product_image',
        provider: result.model,
        url,
        metadata: {
          sceneId: scene.id,
          sceneOrder: scene.sceneOrder,
          quality: result.quality,
          size: result.size,
        } as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);
  // V14.2-A — credit mutation inside a $transaction; we must invalidate
  // the user cache AFTER commit so router.refresh() picks up the new
  // balance.
  invalidateUserCacheAfterCreditMutation(userId);

  return {
    success: true,
    imageUrl: url,
    safetyRetryApplied: result.safetyRetryApplied,
    freeRegen: isFirstRegen,
  };
}
