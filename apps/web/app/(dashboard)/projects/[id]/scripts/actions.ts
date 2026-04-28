'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ProjectStatus, ScriptAngle, SceneType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { generateScripts, LlmConfigError, type GeneratedScript } from '@/lib/llm/scripts';
import { recordApiCall } from '@/lib/usage/log';
import { priceOpenAiText } from '@/lib/usage/pricing';
import { findAvatar, describeAvatar } from '@/lib/avatars/catalog';
import { findCategory, categoryGuidance, type ProductCategoryId } from '@/lib/categories';

const GEN_COST_CREDITS = 1;

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
    framework: s.framework,
    regenerated: s.regenerated,
    schemaVersion: 2,
  };
}

export type GenerateState =
  | { error?: string; needsCredits?: boolean }
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

  const data = (project.productData as Record<string, unknown> | null) ?? {};

  let generated: GeneratedScript[];
  let usage: { model: string; inputTokens: number; outputTokens: number; durationMs: number } | null = null;
  try {
    const selectedAvatar = findAvatar(
      typeof data.selectedAvatarId === 'string' ? data.selectedAvatarId : null,
    );
    const categoryId = (typeof data.category === 'string' ? data.category : null) as ProductCategoryId | null;
    const category = findCategory(categoryId);
    const result = await generateScripts({
      productName: project.productName ?? 'מוצר ללא שם',
      description: typeof data.description === 'string' ? data.description : '',
      brand: typeof data.brand === 'string' ? data.brand : null,
      targetAudience: typeof data.targetAudience === 'string' ? data.targetAudience : null,
      durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : 15,
      price: typeof data.price === 'string' ? data.price : null,
      currency: typeof data.currency === 'string' ? data.currency : null,
      avatarDescription: selectedAvatar ? describeAvatar(selectedAvatar) : null,
      categoryId,
      categoryLabel: category?.labelEnglish ?? null,
      categoryGuidance: categoryGuidance(categoryId),
    });
    generated = result.scripts;
    usage = result.usage;
  } catch (err) {
    // Log the failed call so admin/usage shows it.
    await recordApiCall({
      provider: 'openai',
      operation: 'script_gen',
      model: process.env.OPENAI_SCRIPT_MODEL || 'gpt-5.4-mini',
      costUsd: 0,
      success: false,
      errorMessage: (err as Error).message,
      userId: dbUser.id,
      projectId,
    });
    if (err instanceof LlmConfigError) {
      return { error: err.message };
    }
    return { error: `יצירת התסריטים נכשלה: ${(err as Error).message}` };
  }

  // Successful call — log with computed cost.
  await recordApiCall({
    provider: 'openai',
    operation: 'script_gen',
    model: usage.model,
    costUsd: priceOpenAiText(usage.model, usage.inputTokens, usage.outputTokens),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    units: generated.length,
    durationMs: usage.durationMs,
    success: true,
    userId: dbUser.id,
    projectId,
  });

  // Persist atomically: clear existing scripts (and their scenes via cascade),
  // create the new 6, decrement credits, mark project status.
  await prisma.$transaction(async (tx) => {
    await tx.scene.deleteMany({ where: { script: { projectId } } });
    await tx.script.deleteMany({ where: { projectId } });

    for (const s of generated) {
      await tx.script.create({
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
            })),
          },
        },
      });
    }

    await tx.user.update({
      where: { id: dbUser.id },
      data: { creditsBalance: { decrement: GEN_COST_CREDITS } },
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
