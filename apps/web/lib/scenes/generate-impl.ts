// Shared scene-generation core. Both the server action (single-scene
// "Create" button) and the parallel-friendly Route Handler (the "Generate
// all" loop) call into this function. Keeping the heavy logic here lets
// the HTTP entry point parallelize cleanly — Next.js serializes server
// actions per-route but does NOT serialize Route Handlers, so the
// "Generate all" loop now actually runs scenes concurrently.

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
import { recordApiCallStart, recordApiCallComplete } from '@/lib/usage/log';
import { priceOpenAiImage } from '@/lib/usage/pricing';
import { buildCreditMutationOps } from '@/lib/usage/credits';
import { checkRateLimit, RateLimitedError } from '@/lib/usage/rate-limit';
import { checkSpendCap, SpendCapExceededError } from '@/lib/usage/spend-cap';
import { PER_OPERATION_CREDITS, FIRST_REGEN_FREE } from '@/lib/plans';

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

  let result;
  const imageStartedAt = Date.now();
  const imageCallId = await recordApiCallStart({
    provider: 'openai',
    operation: 'image_gen',
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    units: 1,
    userId,
    projectId: project.id,
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
  try {
    result = await generateSceneImage({
      productImageUrl: heroImageUrl,
      avatarImageUrl: selectedAvatar?.imageUrl ?? null,
      categoryId,
      promptInput: {
        productName: project.productName ?? 'Product',
        productBrand: typeof data.brand === 'string' ? data.brand : null,
        productDescription: typeof data.description === 'string' ? data.description : null,
        sceneVisualBrief: scene.visualPromptEnglish,
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
    if (err instanceof LlmConfigError) return { success: false, error: err.message };
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
    return { success: false, error: `יצירת התמונה נכשלה: ${errMsg}` };
  }

  await recordApiCallComplete(imageCallId, {
    success: true,
    model: result.model,
    costUsd: priceOpenAiImage(result.model, result.quality, result.size),
    units: 1,
    durationMs: result.durationMs,
  });

  const storage = await getStorage();
  const bytes = Buffer.from(result.base64, 'base64');
  const filename = `${scene.id}-${Date.now()}.png`;
  const { url } = await storage.putBytes({
    folder: `scenes/${project.id}`,
    filename,
    data: bytes,
    contentType: 'image/png',
  });

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
      },
    }),
    ...buildCreditMutationOps(prisma, {
      userId,
      amount: -charge,
      reason: isFirstRegen ? 'first_regen_free:scene_image' : 'spent:scene_image',
      ref: sceneId,
      metadata: { previousCount: prevImgCount, model: result.model },
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
        },
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
