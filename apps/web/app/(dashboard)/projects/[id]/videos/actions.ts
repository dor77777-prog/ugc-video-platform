'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { generateSceneClipImpl, regenLipSyncOnlyImpl } from '@/lib/scenes/clip-impl';
import { deriveSceneRouting } from '@/lib/animation/scene-routing';

// Server actions used by the SINGLE-scene clip buttons on a
// SceneClipCard (via useActionState). The "Generate all clips" batch
// loop calls the parallel-friendly Route Handler directly via fetch()
// — Server Actions are serialized per-route by Next.js.
//
// V21 cleanup: voice gen is on step 4 (scenes page) and the per-card
// regen there calls /api/scenes/[id]/voice directly (no server action
// needed). The generateSceneVoiceAction + GenerateVoiceState that
// used to live here were removed — only clip actions remain.

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

// V26 — per-scene clip provider selection. The user picks which i2v
// engine animates this specific scene.
//
// V14+ — third option added: kling-video-o1 (next-gen Kling on the
// same /v1/videos/omni-video endpoint, different motion profile).
// The legacy value 'kling' is preserved for old data and treated as
// kling-omni-v3 by the dispatcher in clip-impl.
//
// Lipsync scenes can't currently route through Grok — face-gate +
// PixVerse only run against Kling output. We accept the value either
// way, but the impl quietly falls back to Kling for lipsync.
const ALLOWED_CLIP_PROVIDERS = new Set([
  'kling',           // legacy alias for kling-omni-v3
  'kling-omni-v3',
  'kling-video-o1',
  'grok',
]);

export async function setSceneClipProviderAction(
  sceneId: string,
  provider: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!ALLOWED_CLIP_PROVIDERS.has(provider)) {
    return { ok: false, error: `ספק לא נתמך: ${provider}` };
  }
  const { dbUser } = await getOrCreateAppUser();
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    select: { script: { select: { projectId: true, project: { select: { userId: true } } } } },
  });
  if (!scene) return { ok: false, error: 'הסצנה לא נמצאה' };
  if (scene.script.project.userId !== dbUser.id) {
    return { ok: false, error: 'אין הרשאה' };
  }
  await prisma.scene.update({
    where: { id: sceneId },
    data: { clipProvider: provider },
  });
  revalidatePath(`/projects/${scene.script.projectId}/videos`);
  return { ok: true };
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

// Lipsync-only regen — keep the existing scene clip's visuals, just
// run the lipsync provider (Kling/PixVerse/etc.) on the current
// clipUrl + voiceUrl. Cheaper than a full clip regen (skips $0.79
// of Kling i2v). Surfaced on the scene card next to "↻ Regen clip".
export async function regenLipSyncOnlyAction(
  sceneId: string,
  _prev: GenerateClipState,
  _formData: FormData,
): Promise<GenerateClipState> {
  const { dbUser } = await getOrCreateAppUser();
  const projectId = await prisma.scene
    .findUnique({ where: { id: sceneId }, select: { script: { select: { projectId: true } } } })
    .then((s) => s?.script.projectId);

  const result = await regenLipSyncOnlyImpl(sceneId, dbUser.id);
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
