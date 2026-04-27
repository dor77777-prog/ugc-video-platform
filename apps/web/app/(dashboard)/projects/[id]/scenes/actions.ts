'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { findAvatar } from '@/lib/avatars/catalog';
import { describeAvatar } from '@/lib/avatars/catalog';
import { generateSceneImage, type AspectRatio } from '@/lib/llm/scene-images';
import { LlmConfigError } from '@/lib/llm/scripts';
import { getStorage } from '@/lib/storage';
import { recordApiCall } from '@/lib/usage/log';
import { priceOpenAiImage } from '@/lib/usage/pricing';

const COST_PER_SCENE_IMAGE = 1;

export type GenerateSceneImageState =
  | { error?: string; needsCredits?: boolean }
  | undefined;

export async function generateSceneImageAction(
  sceneId: string,
  _prev: GenerateSceneImageState,
  _formData: FormData,
): Promise<GenerateSceneImageState> {
  const { dbUser } = await getOrCreateAppUser();

  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      script: {
        include: {
          project: {
            include: {
              scripts: {
                include: { scenes: { orderBy: { sceneOrder: 'asc' } } },
              },
            },
          },
        },
      },
    },
  });
  if (!scene) return { error: 'הסצנה לא נמצאה' };
  if (scene.script.project.userId !== dbUser.id) return { error: 'אין הרשאה' };

  // Enforce continuity: scene N requires scene N-1 to have an image first.
  if (scene.sceneOrder > 0) {
    const prev = await prisma.scene.findFirst({
      where: { scriptId: scene.scriptId, sceneOrder: scene.sceneOrder - 1 },
    });
    if (!prev?.imageUrl) {
      return { error: `יש ליצור קודם את הסצנה ${scene.sceneOrder} לפני סצנה ${scene.sceneOrder + 1}` };
    }
  }

  if (dbUser.creditsBalance < COST_PER_SCENE_IMAGE) {
    return { error: 'אין מספיק קרדיטים', needsCredits: true };
  }

  const project = scene.script.project;
  const data = (project.productData as Record<string, unknown> | null) ?? {};

  const heroImageUrl = (typeof data.heroImageUrl === 'string' ? data.heroImageUrl : null);
  const aspectRatio = (typeof data.aspectRatio === 'string' ? data.aspectRatio : '9:16') as AspectRatio;
  const selectedAvatar = findAvatar(typeof data.selectedAvatarId === 'string' ? data.selectedAvatarId : null);

  // Previous-scene image URL (relative URLs are absolutized by the SDK helper).
  let previousSceneImageUrl: string | null = null;
  if (scene.sceneOrder > 0) {
    const prev = await prisma.scene.findFirst({
      where: { scriptId: scene.scriptId, sceneOrder: scene.sceneOrder - 1 },
    });
    previousSceneImageUrl = prev?.imageUrl ?? null;
  }

  // Total scenes in this script for "Scene N of M" framing.
  const totalScenes = await prisma.scene.count({ where: { scriptId: scene.scriptId } });

  let result;
  try {
    result = await generateSceneImage({
      productImageUrl: heroImageUrl,
      previousSceneImageUrl,
      avatarImageUrl: selectedAvatar?.imageUrl ?? null,
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
        avatarDescription: selectedAvatar ? describeAvatar(selectedAvatar) : '',
      },
      quality: 'medium',
    });
  } catch (err) {
    await recordApiCall({
      provider: 'openai',
      operation: 'image_gen',
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
      costUsd: 0,
      success: false,
      errorMessage: (err as Error).message,
      userId: dbUser.id,
      projectId: project.id,
    });
    if (err instanceof LlmConfigError) return { error: err.message };
    return { error: `יצירת התמונה נכשלה: ${(err as Error).message}` };
  }

  // Log successful image-gen call with cost computed from quality + size.
  await recordApiCall({
    provider: 'openai',
    operation: 'image_gen',
    model: result.model,
    costUsd: priceOpenAiImage(result.model, result.quality, result.size),
    units: 1,
    durationMs: result.durationMs,
    success: true,
    userId: dbUser.id,
    projectId: project.id,
  });

  // Persist the image to storage.
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
      where: { id: dbUser.id },
      data: { creditsBalance: { decrement: COST_PER_SCENE_IMAGE } },
    }),
    prisma.asset.create({
      data: {
        projectId: project.id,
        type: 'product_image', // closest existing type; will refactor when we add scene_image enum value
        provider: result.model,
        url,
        metadata: { sceneId: scene.id, sceneOrder: scene.sceneOrder, quality: result.quality, size: result.size },
      },
    }),
  ]);

  revalidatePath(`/projects/${project.id}/scenes`);
  return undefined;
}

export async function updateScenePromptAction(formData: FormData) {
  const { dbUser } = await getOrCreateAppUser();
  const sceneId = String(formData.get('sceneId') ?? '');
  const newPrompt = String(formData.get('visualPromptEnglish') ?? '').trim();
  if (!sceneId || !newPrompt) return;

  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: { script: { include: { project: true } } },
  });
  if (!scene || scene.script.project.userId !== dbUser.id) return;

  await prisma.scene.update({
    where: { id: sceneId },
    data: { visualPromptEnglish: newPrompt },
  });
  revalidatePath(`/projects/${scene.script.projectId}/scenes`);
}
