'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { generateSceneVoiceImpl } from '@/lib/scenes/voice-impl';
import { generateSceneClipImpl } from '@/lib/scenes/clip-impl';
import { deriveSceneRouting } from '@/lib/animation/scene-routing';

// Server actions used by the SINGLE-scene buttons on a SceneClipCard
// (via useActionState). The "Generate all voices" / "Generate all clips"
// batch loops call the parallel-friendly Route Handlers directly via
// fetch() — Server Actions are serialized per-route by Next.js, so
// Promise.all over them runs sequentially.

export type GenerateVoiceState =
  | {
      error?: string;
      needsCredits?: boolean;
      needsVoiceSelection?: boolean;
      configError?: boolean;
      timedOut?: boolean;
    }
  | undefined;

export type GenerateClipState =
  | {
      error?: string;
      needsCredits?: boolean;
      needsImage?: boolean;
      needsVoice?: boolean;
      configError?: boolean;
      timedOut?: boolean;
      failedStage?: 'motion' | 'lipsync';
    }
  | undefined;

export async function generateSceneVoiceAction(
  sceneId: string,
  _prev: GenerateVoiceState,
  _formData: FormData,
): Promise<GenerateVoiceState> {
  const { dbUser } = await getOrCreateAppUser();
  const projectId = await prisma.scene
    .findUnique({ where: { id: sceneId }, select: { script: { select: { projectId: true } } } })
    .then((s) => s?.script.projectId);

  const result = await generateSceneVoiceImpl(sceneId, dbUser.id);
  if (projectId) revalidatePath(`/projects/${projectId}/videos`);

  if (!result.success) {
    return {
      error: result.error,
      needsCredits: result.needsCredits,
      needsVoiceSelection: result.needsVoiceSelection,
      configError: result.configError,
      timedOut: result.timedOut,
    };
  }
  return undefined;
}

// Set or clear the per-scene "requires lipsync" override. `null` means
// "use the auto-derived value" (deriveSceneRouting on cameraDirection).
// `true` / `false` is an explicit user choice that the next clip
// generation will honor.
export async function setSceneRequiresLipSyncAction(
  sceneId: string,
  requiresLipSync: boolean | null,
): Promise<{ ok: boolean; error?: string; effective?: boolean }> {
  const { dbUser } = await getOrCreateAppUser();

  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: {
      cameraDirection: true,
      sceneGoal: true,
      sceneType: true,
      script: { select: { projectId: true, project: { select: { userId: true } } } },
    },
  });
  if (!scene) return { ok: false, error: 'הסצנה לא נמצאה' };
  if (scene.script.project.userId !== dbUser.id) {
    return { ok: false, error: 'אין הרשאה' };
  }

  // When the user clears their override, we still want to give them a
  // visible "effective" answer — the auto-derived value the pipeline
  // will use on the next generate.
  const derived = deriveSceneRouting({
    cameraDirection: scene.cameraDirection,
    sceneGoal: scene.sceneGoal,
    sceneType: scene.sceneType,
  });

  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      requiresLipSync,
      // Keep the derived metadata in sync when the user explicitly toggles.
      // Doesn't hurt — these columns are advisory.
      sceneGenerationType: derived.sceneGenerationType,
      faceVisibility: derived.faceVisibility,
    },
  });

  revalidatePath(`/projects/${scene.script.projectId}/videos`);
  return {
    ok: true,
    effective: requiresLipSync ?? derived.requiresLipSync,
  };
}

export async function generateSceneClipAction(
  sceneId: string,
  _prev: GenerateClipState,
  _formData: FormData,
): Promise<GenerateClipState> {
  const { dbUser } = await getOrCreateAppUser();
  const projectId = await prisma.scene
    .findUnique({ where: { id: sceneId }, select: { script: { select: { projectId: true } } } })
    .then((s) => s?.script.projectId);

  const result = await generateSceneClipImpl(sceneId, dbUser.id);
  if (projectId) revalidatePath(`/projects/${projectId}/videos`);

  if (!result.success) {
    return {
      error: result.error,
      needsCredits: result.needsCredits,
      needsImage: result.needsImage,
      needsVoice: result.needsVoice,
      configError: result.configError,
      timedOut: result.timedOut,
      failedStage: result.failedStage,
    };
  }
  return undefined;
}
