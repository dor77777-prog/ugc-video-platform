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
import { recordApiCall } from '@/lib/usage/log';
import { priceOpenAiImage } from '@/lib/usage/pricing';

const COST_PER_SCENE_IMAGE = 1;

export interface GenerateSceneResult {
  success: boolean;
  error?: string;
  needsCredits?: boolean;
  safetyBlocked?: boolean;
  timedOut?: boolean;
  safetyRetryApplied?: boolean;
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

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditsBalance: true },
  });
  if (!dbUser) return { success: false, error: 'משתמש לא נמצא' };
  if (dbUser.creditsBalance < COST_PER_SCENE_IMAGE) {
    return { success: false, error: 'אין מספיק קרדיטים', needsCredits: true };
  }

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
      },
      quality: 'medium',
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    await recordApiCall({
      provider: 'openai',
      operation: 'image_gen',
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
      costUsd: 0,
      success: false,
      errorMessage: errMsg,
      userId,
      projectId: project.id,
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

  await recordApiCall({
    provider: 'openai',
    operation: 'image_gen',
    model: result.model,
    costUsd: priceOpenAiImage(result.model, result.quality, result.size),
    units: 1,
    durationMs: result.durationMs,
    success: true,
    userId,
    projectId: project.id,
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
    prisma.user.update({
      where: { id: userId },
      data: { creditsBalance: { decrement: COST_PER_SCENE_IMAGE } },
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
  };
}
