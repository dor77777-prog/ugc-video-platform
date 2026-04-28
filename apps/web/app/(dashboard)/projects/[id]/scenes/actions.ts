'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { generateSceneImageImpl } from '@/lib/scenes/generate-impl';

export type GenerateSceneImageState =
  | {
      error?: string;
      needsCredits?: boolean;
      safetyBlocked?: boolean;
      timedOut?: boolean;
      safetyRetryApplied?: boolean; // soft notice: scene generated but product image was dropped
    }
  | undefined;

// Server action used by the SINGLE-scene "Create" button on a SceneCard
// (via useActionState). The "Generate all" loop calls the parallel-friendly
// Route Handler at POST /api/scenes/[id]/generate instead, since Next.js
// serializes server actions per-route and Promise.all over them runs
// sequentially.
export async function generateSceneImageAction(
  sceneId: string,
  _prev: GenerateSceneImageState,
  _formData: FormData,
): Promise<GenerateSceneImageState> {
  const { dbUser } = await getOrCreateAppUser();
  const project = await prisma.scene
    .findUnique({ where: { id: sceneId }, select: { script: { select: { projectId: true } } } })
    .then((s) => s?.script.projectId);

  const result = await generateSceneImageImpl(sceneId, dbUser.id);

  if (project) revalidatePath(`/projects/${project}/scenes`);

  if (!result.success) {
    return {
      error: result.error,
      needsCredits: result.needsCredits,
      safetyBlocked: result.safetyBlocked,
      timedOut: result.timedOut,
    };
  }
  if (result.safetyRetryApplied) return { safetyRetryApplied: true };
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
