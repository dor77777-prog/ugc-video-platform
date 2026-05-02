// POST /api/scenes/[id]/regen-prompt — Route handler that asks the
// LLM for a fresh visual_prompt_english variant, persists it on the
// Scene, and returns the new prompt to the caller.
//
// Why a route handler (not a server action): the per-card "regen
// prompt" button is intended to be clickable on multiple cards
// concurrently, just like the V11 image regenerate button. Server
// actions serialize per-route in Next.js 15.

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { regenerateScenePrompt, RegenPromptConfigError } from '@/lib/scenes/regen-prompt';
import { recordApiCallStart, recordApiCallComplete } from '@/lib/usage/log';
import { attributeOpenAiTextCost } from '@/lib/usage/cost-attribution';
import type { ProductIntelligence } from '@/lib/product-intelligence';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sceneId } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      script: {
        include: { project: { select: { id: true, productName: true, productData: true, userId: true } } },
      },
    },
  });
  if (!scene) {
    return NextResponse.json({ success: false, error: 'הסצנה לא נמצאה' }, { status: 404 });
  }
  if (scene.script.project.userId !== dbUser.id) {
    return NextResponse.json({ success: false, error: 'אין הרשאה' }, { status: 403 });
  }

  const productData =
    (scene.script.project.productData as Record<string, unknown> | null) ?? {};
  const intelligence = (productData.intelligence ?? null) as ProductIntelligence | null;
  const scriptRaw = (scene.script.rawJson as Record<string, unknown> | null) ?? {};

  const startedAt = Date.now();
  const callId = await recordApiCallStart({
    provider: 'openai',
    operation: 'prompt_regen',
    model: process.env.OPENAI_SCRIPT_MODEL ?? 'gpt-5.4-mini',
    userId: dbUser.id,
    projectId: scene.script.project.id,
  });

  try {
    const result = await regenerateScenePrompt({
      sceneGoal: (scene as { sceneGoal?: string | null }).sceneGoal ?? '',
      spokenTextHebrew: scene.textHebrew,
      sceneGenerationType:
        (scene as { sceneGenerationType?: string | null }).sceneGenerationType ?? '',
      faceVisibility: (scene as { faceVisibility?: string | null }).faceVisibility ?? '',
      previousPrompt: scene.visualPromptEnglish,
      scriptContext: {
        selectedHook: scene.script.hook ?? undefined,
        cta: scene.script.cta ?? undefined,
        targetAudience: scene.script.targetAudience ?? undefined,
        framework: (scriptRaw.framework as string | undefined) ?? scene.script.framework ?? undefined,
      },
      intelligence,
      productName: scene.script.project.productName ?? null,
    });

    // V27.10.14 — go through attributeOpenAiTextCost so the row carries
    // actualCostUsd / estimatedCostUsd / source provenance / metadata,
    // not just the bare costUsd. Matches every other LLM-backed call
    // path in the codebase.
    const attribution = attributeOpenAiTextCost({
      model: result.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
    await recordApiCallComplete(callId, {
      success: true,
      model: result.model,
      costUsd: attribution.costUsd,
      estimatedCostUsd: attribution.estimatedCostUsd,
      actualCostUsd: attribution.actualCostUsd,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      durationMs: Date.now() - startedAt,
      metadata: attribution.metadata,
    });

    // Persist the new prompt so the next image regen picks it up.
    await prisma.scene.update({
      where: { id: sceneId },
      data: { visualPromptEnglish: result.visualPromptEnglish },
    });
    try {
      revalidatePath(`/projects/${scene.script.project.id}/scenes`);
    } catch {
      /* best-effort */
    }

    return NextResponse.json({
      success: true,
      visualPromptEnglish: result.visualPromptEnglish,
      reason: result.reason,
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    await recordApiCallComplete(callId, {
      success: false,
      errorMessage: errMsg,
      durationMs: Date.now() - startedAt,
    });
    if (err instanceof RegenPromptConfigError) {
      return NextResponse.json({ success: false, error: errMsg }, { status: 200 });
    }
    return NextResponse.json(
      { success: false, error: `לא הצלחתי לייצר פרומט חדש: ${errMsg}` },
      { status: 200 },
    );
  }
}
