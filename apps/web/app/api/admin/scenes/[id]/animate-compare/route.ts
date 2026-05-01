// Admin-only / dev-only diagnostic endpoint: animate the same scene
// frame with all three i2v engines in parallel and return the videos
// side-by-side so we can A/B/C the motion quality.
//
// Engines compared:
//   1. Kling Omni v3      (kling-v3-omni)
//   2. Kling video-o1     (kling-video-o1)
//   3. Grok Imagine       (grok-imagine-video)
//
// Cost: ~$2.30 per click ($0.79 + $0.79 + $0.75 at typical 5s/720p).
// No user credit charge — these are real API spends logged via
// recordApiCall* so they show up in /admin/costs, but they bypass the
// Tachles credit transaction. The compare button is gated behind
// requireAdminApi for that reason.
//
// Output is uploaded to R2 under `compare/<sceneId>/...mp4` so the
// admin compare page can render <video> tags off public URLs. The
// videos are silent — no voice mux, no caption burn-in. The point is
// purely to evaluate raw motion quality from the still + prompt.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdminApi } from '@/lib/auth/admin-api';
import { aspectRatioFromProductData } from '@ugc-video/shared';
import { klingProvider } from '@/lib/animation/kling';
import { grokImagineProvider } from '@/lib/animation/grok-imagine';
import { buildPromptFromPlan } from '@/lib/animation/kling';
import { buildAnimationPlan } from '@/lib/animation/animation-plan-builder';
import {
  detectHandsPhysicsRequired,
  detectMirrorRisk,
  detectContactProofRequired,
} from '@/lib/scene-planning/scene-rules';
import { deriveSceneRouting } from '@/lib/animation/scene-routing';
import {
  analyzeSceneForMotion,
  type MotionAnalysis,
  type ScriptContext,
} from '@/lib/animation/motion-analysis';
import { getStorage } from '@/lib/storage';
import { recordApiCallStart, recordApiCallComplete } from '@/lib/usage/log';
import {
  attributeKlingI2vCost,
  attributeGrokVideoCost,
} from '@/lib/usage/cost-attribution';

// Vercel Hobby plan caps serverless functions at 300s; Pro raises it
// to 800s. Most i2v jobs finish in 2-4 min, so 300s usually suffices —
// but a slow Kling queue may push us over and the request will time
// out. If that becomes common, split this into one endpoint per engine
// (each ≤300s) and have the client fan-out.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type Engine = 'kling-omni-v3' | 'kling-video-o1' | 'grok';

interface VariantResult {
  engine: Engine;
  model: string;
  status: 'completed' | 'failed';
  videoUrl?: string;
  durationMs: number;
  errorMessage?: string;
  promptPositive: string;
  promptNegative: string;
  cfgScale?: number;
}

const COMPARE_DURATION_SECONDS = 5;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const { id: sceneId } = await params;

  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      script: {
        include: {
          project: { select: { id: true, productData: true, userId: true } },
        },
      },
    },
  });
  if (!scene) return NextResponse.json({ error: 'scene not found' }, { status: 404 });
  if (!scene.imageUrl) {
    return NextResponse.json(
      { error: 'scene has no imageUrl — run image generation first' },
      { status: 400 },
    );
  }

  const projectId = scene.script.project.id;

  // Routing flags (talking-head vs product / hands / etc.).
  const routing = deriveSceneRouting({
    cameraDirection: scene.cameraDirection,
    sceneGoal: scene.sceneGoal,
    sceneType: scene.sceneType,
  });

  // Reuse cached MotionAnalysis when the image hasn't changed; otherwise
  // make a fresh vision call so the compare uses the SAME analysis the
  // real pipeline would.
  const cachedJson = (scene as { motionAnalysisJson?: unknown }).motionAnalysisJson;
  const cachedImageUrl = (scene as { motionAnalysisImageUrl?: string | null })
    .motionAnalysisImageUrl;
  let motionAnalysis: MotionAnalysis | null = null;
  if (cachedJson && cachedImageUrl === scene.imageUrl) {
    motionAnalysis = cachedJson as MotionAnalysis;
  } else {
    try {
      motionAnalysis = await analyzeSceneForMotion({
        imageUrl: scene.imageUrl,
        visualBrief: scene.visualPromptEnglish,
        isTalkingHead: routing.requiresLipSync,
        sceneGenerationType: routing.sceneGenerationType,
        scriptContext: buildScriptContext(scene),
      });
    } catch {
      motionAnalysis = null;
    }
  }

  // Build the same plan the production pipeline would, so the compare
  // is honest — we want to evaluate engines, not different planners.
  const plan = buildAnimationPlan({
    sceneGenerationType: routing.sceneGenerationType,
    requiresLipSync: routing.requiresLipSync,
    primarySubject: (scene as { primarySubject?: string | null }).primarySubject ?? null,
    mustShowProduct: (scene as { mustShowProduct?: boolean | null }).mustShowProduct ?? null,
    productVisibilityPriority:
      (scene as { productVisibilityPriority?: string | null }).productVisibilityPriority ?? null,
    cameraFocus: (scene as { cameraFocus?: string | null }).cameraFocus ?? null,
    showFace: (scene as { showFace?: boolean | null }).showFace ?? null,
    motionAnalysis,
    handsPhysicsRequired: detectHandsPhysicsRequired({
      sceneGenerationType: routing.sceneGenerationType,
      mustShowProduct: (scene as { mustShowProduct?: boolean | null }).mustShowProduct ?? null,
      cameraDirection: scene.cameraDirection,
      sceneGoal: scene.sceneGoal,
      faceVisibility: (scene as { faceVisibility?: string | null }).faceVisibility ?? null,
    }),
    mirrorRisk: detectMirrorRisk({
      sceneGenerationType: routing.sceneGenerationType,
      mustShowProduct: (scene as { mustShowProduct?: boolean | null }).mustShowProduct ?? null,
      cameraDirection: scene.cameraDirection,
      sceneGoal: scene.sceneGoal,
      faceVisibility: (scene as { faceVisibility?: string | null }).faceVisibility ?? null,
    }),
    contactProofRequired: detectContactProofRequired({
      sceneGenerationType: routing.sceneGenerationType,
    }),
  });

  // Two prompts — Kling-flavored (used for both Kling models) and Grok
  // cinematic prose. The renderer split is the whole point: each engine
  // gets the wording it responds best to.
  const klingPrompt = buildPromptFromPlan(plan, {
    provider: 'kling',
    cameraDirection: scene.cameraDirection,
  });
  const grokPrompt = buildPromptFromPlan(plan, {
    provider: 'grok',
    cameraDirection: scene.cameraDirection,
  });

  const aspectRatio = aspectRatioFromProductData(scene.script.project.productData);

  // Run all three in parallel.
  const startedAt = Date.now();
  const [omniRes, oneRes, grokRes] = await Promise.allSettled([
    runOneVariant({
      engine: 'kling-omni-v3',
      model: 'kling-v3-omni',
      sceneId,
      userId: auth.userId,
      projectId,
      imageUrl: scene.imageUrl,
      prompt: klingPrompt,
      aspectRatio,
      runner: () =>
        klingProvider.generateImageToVideo({
          imageUrl: scene.imageUrl!,
          prompt: klingPrompt.positive,
          negativePrompt: klingPrompt.negative,
          durationSeconds: COMPARE_DURATION_SECONDS,
          aspectRatio,
          sceneId,
          cfgScale: klingPrompt.cfgScale,
          model: 'kling-v3-omni',
        }),
    }),
    runOneVariant({
      engine: 'kling-video-o1',
      model: 'kling-video-o1',
      sceneId,
      userId: auth.userId,
      projectId,
      imageUrl: scene.imageUrl,
      prompt: klingPrompt,
      aspectRatio,
      runner: () =>
        klingProvider.generateImageToVideo({
          imageUrl: scene.imageUrl!,
          prompt: klingPrompt.positive,
          negativePrompt: klingPrompt.negative,
          durationSeconds: COMPARE_DURATION_SECONDS,
          aspectRatio,
          sceneId,
          cfgScale: klingPrompt.cfgScale,
          model: 'kling-video-o1',
        }),
    }),
    runOneVariant({
      engine: 'grok',
      model: 'grok-imagine-video',
      sceneId,
      userId: auth.userId,
      projectId,
      imageUrl: scene.imageUrl,
      prompt: grokPrompt,
      aspectRatio,
      runner: () =>
        grokImagineProvider.generateImageToVideo({
          imageUrl: scene.imageUrl!,
          prompt: grokPrompt.positive,
          negativePrompt: grokPrompt.negative,
          durationSeconds: COMPARE_DURATION_SECONDS,
          aspectRatio,
          sceneId,
        }),
    }),
  ]);

  const variants: VariantResult[] = [
    settledToVariant(omniRes, 'kling-omni-v3', 'kling-v3-omni', klingPrompt),
    settledToVariant(oneRes, 'kling-video-o1', 'kling-video-o1', klingPrompt),
    settledToVariant(grokRes, 'grok', 'grok-imagine-video', grokPrompt),
  ];

  return NextResponse.json({
    sceneId,
    totalDurationMs: Date.now() - startedAt,
    plan: {
      animationGoal: plan.animationGoal,
      motionSubject: plan.motionSubject,
      cameraMotion: plan.cameraMotion,
      narrativeRole: plan.narrativeRole ?? null,
      emotionalTone: plan.emotionalTone ?? null,
    },
    variants,
  });
}

// Runs a single variant: cost-attribute, two-phase log, call provider,
// upload video bytes to R2, return URL + duration. Throws on failure
// (caught by Promise.allSettled).
async function runOneVariant(args: {
  engine: Engine;
  model: string;
  sceneId: string;
  userId: string;
  projectId: string;
  imageUrl: string;
  prompt: { positive: string; negative: string; cfgScale?: number };
  aspectRatio: '9:16' | '1:1' | '16:9';
  runner: () => Promise<{
    videoBytes: Buffer;
    videoUrl: string;
    durationSeconds: number;
    modelUsed: string;
  }>;
}): Promise<{ videoUrl: string; durationMs: number }> {
  const { engine, model, sceneId, userId, projectId } = args;
  const isGrok = engine === 'grok';
  const estimated = isGrok
    ? attributeGrokVideoCost({
        resolution: process.env.XAI_VIDEO_RESOLUTION ?? '720p',
        durationSeconds: COMPARE_DURATION_SECONDS,
      }).estimatedCostUsd
    : attributeKlingI2vCost({
        modelUsed: model,
        durationSeconds: COMPARE_DURATION_SECONDS,
      }).estimatedCostUsd;

  const callId = await recordApiCallStart({
    provider: isGrok ? 'xai' : 'kling',
    operation: 'i2v_compare',
    model,
    units: 1,
    estimatedCostUsd: estimated,
    userId,
    projectId,
    sceneId,
    metadata: { compare: true, durationSeconds: COMPARE_DURATION_SECONDS },
  });

  const startedAt = Date.now();
  try {
    const result = await args.runner();
    const durationMs = Date.now() - startedAt;
    // Upload to R2 (or local in dev) under compare/<sceneId>/.
    const storage = await getStorage();
    const filename = `${engine}-${Date.now()}.mp4`;
    const { url } = await storage.putBytes({
      folder: `compare/${sceneId}`,
      filename,
      data: result.videoBytes,
      contentType: 'video/mp4',
    });
    await recordApiCallComplete(callId, {
      success: true,
      model,
      costUsd: estimated,
      estimatedCostUsd: estimated,
      durationMs,
      metadata: { compare: true, videoUrl: url },
    });
    return { videoUrl: url, durationMs };
  } catch (err) {
    const errMsg = (err as Error).message;
    const durationMs = Date.now() - startedAt;
    await recordApiCallComplete(callId, {
      success: false,
      errorMessage: errMsg,
      durationMs,
    });
    throw err;
  }
}

function settledToVariant(
  res: PromiseSettledResult<{ videoUrl: string; durationMs: number }>,
  engine: Engine,
  model: string,
  prompt: { positive: string; negative: string; cfgScale?: number },
): VariantResult {
  const promptFields = {
    promptPositive: prompt.positive,
    promptNegative: prompt.negative,
    cfgScale: prompt.cfgScale,
  };
  if (res.status === 'fulfilled') {
    return {
      engine,
      model,
      status: 'completed',
      videoUrl: res.value.videoUrl,
      durationMs: res.value.durationMs,
      ...promptFields,
    };
  }
  return {
    engine,
    model,
    status: 'failed',
    durationMs: 0,
    errorMessage: (res.reason as Error)?.message ?? 'unknown',
    ...promptFields,
  };
}

// Same shape buildScriptContextForMotion in clip-impl.ts produces.
// Inlined here so the compare endpoint can run without depending on
// clip-impl's other concerns (credits, in-flight columns, etc.).
function buildScriptContext(scene: {
  sceneOrder: number;
  textHebrew: string;
  textHebrewTts: string | null;
  sceneGoal: string | null;
  script: {
    rawJson: unknown;
    project: { productData: unknown };
  };
}): ScriptContext {
  const raw = scene.script.rawJson as
    | {
        framework?: string;
        creative_strategy?: { selected_hook?: string };
        selected_hook?: string;
        scenes?: Array<{
          scene_order?: number;
          spoken_text_hebrew?: string;
          visual_prompt_english?: string;
        }>;
      }
    | null;
  const productData = scene.script.project.productData as
    | { productName?: string }
    | null;
  const hookHebrew =
    raw?.creative_strategy?.selected_hook ?? raw?.selected_hook ?? null;
  const allScenes = Array.isArray(raw?.scenes) ? raw!.scenes! : [];
  const totalScenes = allScenes.length || 1;
  const i = scene.sceneOrder;
  const gistOf = (s: { spoken_text_hebrew?: string; visual_prompt_english?: string }) =>
    (s.spoken_text_hebrew ?? s.visual_prompt_english ?? '').trim() || null;
  const prevGist = i > 0 && allScenes[i - 1] ? gistOf(allScenes[i - 1]!) : null;
  const nextGist =
    i + 1 < allScenes.length && allScenes[i + 1] ? gistOf(allScenes[i + 1]!) : null;
  return {
    framework: raw?.framework ?? null,
    productName: productData?.productName ?? null,
    hookHebrew,
    currentSceneIndex: i,
    totalScenes,
    currentSceneTextHebrew: scene.textHebrewTts ?? scene.textHebrew ?? null,
    currentSceneGoal: scene.sceneGoal ?? null,
    prevSceneGist: prevGist,
    nextSceneGist: nextGist,
  };
}
