// Shared scene-generation core. Both the server action (single-scene
// "Create" button) and the parallel-friendly Route Handler (the "Generate
// all" loop) call into this function. Keeping the heavy logic here lets
// the HTTP entry point parallelize cleanly — Next.js serializes server
// actions per-route but does NOT serialize Route Handlers, so the
// "Generate all" loop now actually runs scenes concurrently.

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { findAvatar, describeAvatar } from '@/lib/avatars/catalog';
import {
  generateSceneImage,
  SceneImageSafetyError,
  SceneImageTimeoutError,
  type AspectRatio,
} from '@/lib/llm/scene-images';
import { LlmConfigError } from '@/lib/llm/scripts';
import { getStorage } from '@/lib/storage';
import { recordApiCallStart, recordApiCallComplete, recordApiCall } from '@/lib/usage/log';
import { priceOpenAiImage, priceOpenAiText } from '@/lib/usage/pricing';
import { buildCreditMutationOps } from '@/lib/usage/credits';
import { checkRateLimit, RateLimitedError } from '@/lib/usage/rate-limit';
import { checkSpendCap, SpendCapExceededError } from '@/lib/usage/spend-cap';
import { PER_OPERATION_CREDITS, FIRST_REGEN_FREE } from '@/lib/plans';
import {
  buildImageBrief,
  buildCorrectiveBrief,
  isProblemSceneType,
  type ImageBrief,
} from '@/lib/image-briefs/image-brief-builder';
import { evaluateImageQa, type ImageQaResult } from '@/lib/image-qa/image-qa-evaluator';
import type { ProductIntelligence } from '@/lib/product-intelligence';

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

  // Mark in-flight + run inside try/finally so we always clean up.
  await prisma.scene.update({
    where: { id: sceneId },
    data: { imageInFlightAt: new Date() },
  });
  try {
    return await generateSceneImageImplInner(sceneId, userId, scene);
  } finally {
    await prisma.scene
      .update({ where: { id: sceneId }, data: { imageInFlightAt: null } })
      .catch(() => {/* best effort */});
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
  const totalScenes = await prisma.scene.count({ where: { scriptId: scene.scriptId } });

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

  // ── Auto-regen loop ────────────────────────────────────────────────────
  // Generate → persist → run QA → on fail rebuild a corrective brief
  // and try again, up to IMAGE_QA_MAX_RETRIES additional attempts. Each
  // attempt is a billed gpt-image-2 call ($0.06) + a billed QA call
  // ($0.005); the loop is bounded so the worst case is ~3x the cost.
  const MAX_RETRIES = Number.isFinite(Number(process.env.IMAGE_QA_MAX_RETRIES))
    ? Number(process.env.IMAGE_QA_MAX_RETRIES)
    : 2;
  // Skip QA entirely when explicitly disabled (env switch for the rare
  // "ship the first frame regardless" case). Default ON.
  const QA_ENABLED = process.env.IMAGE_QA_ENABLED !== 'false';

  const previousAttempts =
    (scene as { imageRegenAttempts?: number | null }).imageRegenAttempts ?? 0;

  let result;
  let url: string;
  let qaResult: ImageQaResult | null = null;
  let attempt = 0;
  let lastError: { message: string; code?: 'timeout' | 'safety' | 'config' | 'generic' } | null = null;

  while (true) {
    const imageStartedAt = Date.now();
    const imageCallId = await recordApiCallStart({
      provider: 'openai',
      operation: 'image_gen',
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
      units: 1,
      userId,
      projectId: project.id,
    });
    try {
      result = await generateSceneImage({
        productImageUrl: heroImageUrl,
        avatarImageUrl: selectedAvatar?.imageUrl ?? null,
        categoryId,
        promptInput: {
          productName: project.productName ?? 'Product',
          productBrand: typeof data.brand === 'string' ? data.brand : null,
          productDescription: typeof data.description === 'string' ? data.description : null,
          // V11: replace the raw narration brief with the deterministic
          // ImageBrief.finalImagePrompt. The prompt builder still wraps
          // it with the avatar identity anchor + safety tokens, but the
          // creative content is now the contract from the brief.
          sceneVisualBrief: brief.finalImagePrompt,
          sceneOrder: scene.sceneOrder,
          totalScenes,
          sceneType: scene.sceneType,
          aspectRatio,
          avatarPresent: !!selectedAvatar,
          productPresent: !!heroImageUrl,
          avatarDescription: selectedAvatar ? describeAvatar(selectedAvatar) : '',
          silentTalkingPlate,
          // V4 product-first metadata. Pass through so the prompt builder
          // can swap the opener from "of THE EXACT person" to a
          // product-led composition when the LLM committed to one.
          primarySubject:
            (scene as { primarySubject?: string | null }).primarySubject ?? undefined,
          mustShowProduct:
            (scene as { mustShowProduct?: boolean | null }).mustShowProduct ?? undefined,
          productVisibilityPriority:
            (scene as { productVisibilityPriority?: string | null }).productVisibilityPriority ??
            undefined,
          cameraFocus: (scene as { cameraFocus?: string | null }).cameraFocus ?? undefined,
          showFace: (scene as { showFace?: boolean | null }).showFace ?? undefined,
        },
        quality: 'medium',
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      await recordApiCallComplete(imageCallId, {
        success: false,
        errorMessage: errMsg,
        durationMs: Date.now() - imageStartedAt,
      });
      if (err instanceof LlmConfigError) {
        return { success: false, error: err.message };
      }
      if (err instanceof SceneImageTimeoutError) {
        return {
          success: false,
          error: 'OpenAI לא הגיב תוך 3 דקות לסצנה זו. נסה שוב — אם זה חוזר על עצמו, יש עומס/תקלה אצלם.',
          timedOut: true,
        };
      }
      if (err instanceof SceneImageSafetyError) {
        return {
          success: false,
          error:
            'OpenAI סירבו ליצור את הסצנה גם בלי תמונת המוצר וגם עם הוראות modesty. ערוך ידנית את ה-visual_prompt_english (הסר/החלף מילים כמו bodysuit / shaper / lingerie / sexy / revealing / skin-tight), או דלג על הסצנה הזו.',
          safetyBlocked: true,
        };
      }
      lastError = { message: errMsg, code: 'generic' };
      return { success: false, error: `יצירת התמונה נכשלה: ${errMsg}` };
    }

    await recordApiCallComplete(imageCallId, {
      success: true,
      model: result.model,
      costUsd: priceOpenAiImage(result.model, result.quality, result.size),
      units: 1,
      durationMs: result.durationMs,
    });

    // Persist to storage so QA can read the bytes back.
    const storage = await getStorage();
    const bytes = Buffer.from(result.base64, 'base64');
    const filename = `${scene.id}-${Date.now()}.png`;
    const persisted = await storage.putBytes({
      folder: `scenes/${project.id}`,
      filename,
      data: bytes,
      contentType: 'image/png',
    });
    url = persisted.url;

    // ── Image QA pass ─────────────────────────────────────────────────
    // Skipped on talking-head + safety-retry (the safety retry already
    // dropped the product image; we don't want to regen-loop on a
    // visual that intentionally lost the product) + when env disabled.
    const skipQa = !QA_ENABLED || result.safetyRetryApplied;
    if (skipQa) break;

    const qaCallId = await recordApiCallStart({
      provider: 'openai',
      operation: 'image_qa',
      model: process.env.OPENAI_IMAGE_QA_MODEL ?? 'gpt-4o-mini',
      userId,
      projectId: project.id,
    });
    const qaStartedAt = Date.now();
    try {
      qaResult = await evaluateImageQa({
        imageUrl: url,
        brief,
        visualAnalysis: intelligence?.visualAnalysis ?? null,
        isProblemScene: isProblem,
        isTalkingHead: silentTalkingPlate,
      });
      await recordApiCallComplete(qaCallId, {
        success: true,
        model: qaResult.model,
        costUsd: priceOpenAiText(qaResult.model, qaResult.usage.inputTokens, qaResult.usage.outputTokens),
        inputTokens: qaResult.usage.inputTokens,
        outputTokens: qaResult.usage.outputTokens,
        durationMs: Date.now() - qaStartedAt,
      });
    } catch (err) {
      // QA failure is non-fatal — fall through with the image we have.
      // Better to ship an un-QA'd frame than to block on a QA outage.
      console.warn(`[scene-image] QA failed for scene=${sceneId}:`, (err as Error).message);
      await recordApiCallComplete(qaCallId, {
        success: false,
        errorMessage: (err as Error).message,
        durationMs: Date.now() - qaStartedAt,
      });
      qaResult = null;
      break;
    }

    if (qaResult.passed) break;

    // Failed QA. If we have retries left, build a corrective brief and
    // try again. Otherwise mark the scene needs_manual_review and ship
    // the last attempt.
    if (attempt >= MAX_RETRIES) {
      console.warn(
        `[scene-image] scene=${sceneId} exhausted ${MAX_RETRIES} regen retries — shipping last attempt and flagging needsManualReview`,
      );
      break;
    }
    console.log(
      `[scene-image] scene=${sceneId} QA failed (score=${qaResult.score.toFixed(2)}, attempt=${attempt + 1}/${MAX_RETRIES}) — regenerating with corrective brief. reasons: ${qaResult.failureReasons.join(' | ')}`,
    );
    brief = buildCorrectiveBrief({
      prev: brief,
      failureReasons: qaResult.failureReasons,
      correctiveActions: qaResult.correctiveActions,
    });
    attempt++;
  }
  void lastError;

  // V6: image keeps first-regen-free policy via FIRST_REGEN_FREE map.
  // (image + voice keep this UX; clips dropped it for margin reasons.)
  const prevImgCount = scene.imageGenerationCount ?? 0;
  const isFirstRegen = prevImgCount === 1 && FIRST_REGEN_FREE.image;
  const charge = isFirstRegen ? 0 : COST_PER_SCENE_IMAGE;

  // V11 — record the brief + QA on Scene so the wizard UI + admin can
  // surface the score, failure reasons, and corrective actions
  // without recomputing. previousAttempts tracks how many regen loops
  // fired this run; it accumulates across "regenerate scene" clicks.
  const totalRegenAttempts = previousAttempts + attempt;
  const needsManualReview = qaResult ? !qaResult.passed && attempt >= MAX_RETRIES : false;

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
        imageQaJson: qaResult
          ? (qaResult as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        imageRegenAttempts: totalRegenAttempts,
        needsManualReview,
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
        qaScore: qaResult?.score ?? null,
        qaPassed: qaResult?.passed ?? null,
        regenAttempts: attempt,
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
          qa: qaResult
            ? {
                passed: qaResult.passed,
                score: qaResult.score,
                checks: { ...qaResult.checks },
                failureReasons: qaResult.failureReasons,
                regenAttempts: attempt,
              }
            : null,
        } as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  return {
    success: true,
    imageUrl: url,
    safetyRetryApplied: result.safetyRetryApplied,
    freeRegen: isFirstRegen,
  };
}
