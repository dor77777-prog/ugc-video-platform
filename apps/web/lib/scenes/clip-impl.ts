// Scene clip generation — routes per scene to the right pipeline.
//
//   Talking-head scenes (selfie / mirror selfie / clear front-facing):
//     1. Kling i2v        → silent talking-head video
//     2. Kling LipSync    → lip-synced video (audio embedded by Kling)
//     3. Save lip-synced video as scene.clipUrl
//
//   B-roll / product / hands-only / closeup scenes:
//     1. Kling i2v        → silent video
//     2. ffmpeg mux       → silent video + voice MP3 → final video
//     3. Save the muxed (audio-embedded) video as scene.clipUrl
//
// Either way, scene.clipUrl is ALWAYS a "ready to play" file with audio
// embedded. The final composition step just concats and burns captions —
// it never touches per-scene audio anymore.
//
// Routing is read from explicit columns (sceneGenerationType /
// requiresLipSync / faceVisibility) when set, otherwise derived on the
// fly from cameraDirection / sceneGoal via deriveSceneRouting().

import { aspectRatioFromProductData } from '@ugc-video/shared';
import { prisma } from '@/lib/db';
import {
  klingProvider,
  buildKlingPromptFromPlan,
} from '@/lib/animation/kling';
import { grokImagineProvider } from '@/lib/animation/grok-imagine';
import { buildAnimationPlan } from '@/lib/animation/animation-plan-builder';
import {
  detectHandsPhysicsRequired,
  detectMirrorRisk,
  detectContactProofRequired,
} from '@/lib/scene-planning/scene-rules';
import { logStage, flushSceneLogBuffer } from '@/lib/logging/log';
import {
  getLipSyncProvider,
  LipSyncProviderError,
  LipSyncTimeoutError as LipSyncTimeoutErrorAbstract,
  LipSyncConfigError,
} from '@/lib/animation/lipsync';
import {
  VideoProviderApiError,
  VideoProviderConfigError,
  VideoProviderTimeoutError,
} from '@/lib/animation/types';
import { deriveSceneRouting } from '@/lib/animation/scene-routing';
import { videoModeFromProductData } from '@/lib/video-mode';
import {
  creditsForClip,
  creditsForOperation,
  getPlanConfig,
  FIRST_REGEN_FREE,
  PER_OPERATION_CREDITS,
} from '@/lib/plans';
import { toPublicUrl, PublicUrlError } from '@/lib/animation/public-url';
import {
  analyzeSceneForMotion,
  type MotionAnalysis,
} from '@/lib/animation/motion-analysis';
import { muxVoiceOntoVideo, readUrlAsBuffer, MuxError } from '@/lib/scenes/mux-audio';
import { getStorage } from '@/lib/storage';
import { recordApiCall, recordApiCallStart, recordApiCallComplete } from '@/lib/usage/log';
import {
  attributeOpenAiTextCost,
  attributeKlingI2vCost,
  attributeGrokVideoCost,
  attributePixVerseLipSyncCost,
  attributeLocalComposeCost,
} from '@/lib/usage/cost-attribution';
import {
  priceKling,
  klingPricingKeyForModel,
  priceOpenAiText,
  priceLipSync,
} from '@/lib/usage/pricing';
import {
  buildCreditMutationOps,
  invalidateUserCacheAfterCreditMutation,
} from '@/lib/usage/credits';
import { checkRateLimit, RateLimitedError } from '@/lib/usage/rate-limit';
import { checkSpendCap, SpendCapExceededError } from '@/lib/usage/spend-cap';

// Clip credit cost is now differentiated by lipsync vs b-roll. See
// lib/plans.ts: clip_broll = 18 credits, clip_lipsync = 30 credits.
// We resolve the right number once per scene via creditsForClip().

// Pick the Kling clip duration to comfortably contain the voice.
// Kling omni-video supports 3-15s as discrete seconds; we expose 3-10
// in our type. Two strategies:
//   - Talking-head scenes (requiresLipSync=true): keep SHORT (3-6s).
//     Anything longer either (a) drags the speaking performance into
//     awkward silent territory at the end, or (b) costs extra Kling
//     units for a clip that the script doesn't need. Cap at 6s.
//   - B-roll / non-lipsync: 5s default, 10s when voice exceeds ~5s.
// The mux step's tpad still pads with last frame if audio overshoots
// by a hair, so we err toward shorter clips and let mux handle slack.
function pickClipDuration(
  voiceDurationSeconds: number | null | undefined,
  scriptedDurationSeconds: number | null | undefined,
  requiresLipSync: boolean,
): import('@/lib/animation/types').ClipDurationSeconds {
  const v = voiceDurationSeconds ?? 0;
  // Honor the LLM's scripted duration (within Kling's 3-10 enum) so a
  // user who picked "15s total" gets ~3s scenes, not stretched 5s ones.
  // We still take max(scripted, voice+margin) — never cut off speech.
  const target = Math.max(v + 0.5, scriptedDurationSeconds ?? 0, 3);
  // CRITICAL — DO NOT cap talking-head at 6s.
  // Kling Lip-Sync v1's OUTPUT duration = INPUT VIDEO duration. If the
  // voice MP3 is 7.5s and we feed Lip-Sync a 6s silent clip, the audio
  // gets truncated mid-word inside the synced output. The user sees
  // "speech ended mid-sentence even though clip duration ≥ voice
  // duration" because clipDurationSeconds is set to the lipsync output
  // (6s) — but the ORIGINAL voice was 7.5s.
  //
  // Both talking-head and b-roll now span the full Kling enum [3..10].
  // The aesthetic preference for short talking shots is now enforced
  // upstream by the per-mode word budgets (15s mode: ≤50 words total,
  // 30s mode: ≤110), not by silently chopping audio at clip-pick time.
  const allowed: import('@/lib/animation/types').ClipDurationSeconds[] = [
    3, 4, 5, 6, 7, 8, 9, 10,
  ];
  void requiresLipSync;
  for (const d of allowed) {
    if (d >= target) return d;
  }
  return allowed[allowed.length - 1]!;
}

export interface GenerateClipResult {
  success: boolean;
  error?: string;
  needsCredits?: boolean;
  needsImage?: boolean;
  needsVoice?: boolean;
  configError?: boolean;
  timedOut?: boolean;
  failedStage?: 'motion' | 'lipsync';
  /** True when the user is being throttled. */
  rateLimited?: boolean;
  /** True when the user hit their daily spend cap. */
  spendCapExceeded?: boolean;
  /** When true, lipsync was skipped because the scene doesn't need it. */
  silentOnly?: boolean;
  /** When true, this generation was first regen → no credit charged. */
  freeRegen?: boolean;
  clipUrl?: string;
  durationSeconds?: number;
}

export async function generateSceneClipImpl(
  sceneId: string,
  userId: string,
): Promise<GenerateClipResult> {
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
  if (!scene) return { success: false, error: 'הסצנה לא נמצאה' };
  if (scene.script.project.userId !== userId) {
    return { success: false, error: 'אין הרשאה' };
  }
  if (!scene.imageUrl) {
    return {
      success: false,
      error: 'צור קודם תמונה לסצנה הזו (שלב 4) לפני שמנפישים אותה.',
      needsImage: true,
    };
  }

  // ── In-flight guard ────────────────────────────────────────────────────
  // If a previous clip generation is still running (within 15 min — our
  // Kling poll budget), refuse to start a duplicate. Without this, every
  // page-refresh-then-click would burn another $0.82 on an identical
  // Kling task. The UI watches clipInFlightAt to keep the spinner alive
  // across refreshes, so the user sees what's happening.
  const IN_FLIGHT_TTL_MS = 15 * 60 * 1000;
  const sceneAny = scene as unknown as { clipInFlightAt?: Date | null };
  if (
    sceneAny.clipInFlightAt &&
    Date.now() - sceneAny.clipInFlightAt.getTime() < IN_FLIGHT_TTL_MS
  ) {
    return {
      success: false,
      error: 'הנפשה כבר רצה לסצנה הזו. רענן את הדף ועקוב אחרי הספינר — לא נריץ פעמיים.',
      rateLimited: true,
    };
  }

  // ── Pre-flight: rate-limit + daily spend cap ───────────────────────────
  // These run BEFORE we hit any provider so abusers / mis-clicks can't
  // burn money. Rate limit applies per-operation per-user.
  try {
    await checkRateLimit(userId, 'i2v');
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

  // Mark in-flight in a separate write so the UI can show a persistent
  // spinner even if this process crashes mid-generation. Wrap the rest
  // in a try/finally so we always clear the flag — even on unexpected
  // exceptions or returns.
  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      clipInFlightAt: new Date(),
      // V13 PR7.1 — transition to generating_clip; clear prior errors.
      status: 'generating_clip',
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  try {
    return await generateSceneClipImplInner(sceneId, userId, scene);
  } finally {
    await prisma.scene
      .update({ where: { id: sceneId }, data: { clipInFlightAt: null } })
      .catch(() => {/* best effort */});
    // V13 PR7.2 — flush the per-scene log buffer.
    await flushSceneLogBuffer(sceneId, prisma);
  }
}

// Inner function holds the existing body after the in-flight guard. The
// outer wrapper above takes care of setting/clearing clipInFlightAt so
// every return path (including thrown errors) leaves a clean flag.
// Loose typing is fine here — the outer function already validated.
type SceneWithScript = Awaited<ReturnType<typeof loadSceneForClip>>;

async function loadSceneForClip(sceneId: string) {
  return prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      script: {
        include: {
          project: { select: { id: true, productData: true, userId: true } },
        },
      },
    },
  });
}

async function generateSceneClipImplInner(
  sceneId: string,
  userId: string,
  scene: NonNullable<SceneWithScript>,
): Promise<GenerateClipResult> {

  // Read explicit DB columns when present, otherwise derive on the fly.
  const explicitRequiresLipSync =
    (scene as { requiresLipSync?: boolean | null }).requiresLipSync;
  const routing =
    explicitRequiresLipSync != null
      ? {
          sceneGenerationType:
            (scene as { sceneGenerationType?: string | null }).sceneGenerationType ?? 'broll',
          faceVisibility:
            (scene as { faceVisibility?: string | null }).faceVisibility ?? 'partial_face',
          requiresLipSync: !!explicitRequiresLipSync,
        }
      : deriveSceneRouting({
          cameraDirection: scene.cameraDirection,
          sceneGoal: scene.sceneGoal,
          sceneType: scene.sceneType,
        });

  // ── Lipsync cap (per video duration mode + per plan) ───────────────────
  // The effective cap is the MIN of:
  //   1. Mode-based cap (15s → 1, 30s → 2 from videoMode.maxLipSyncScenes).
  //   2. Plan-based cap (Creator → 1, Brand/Agency → 2 from
  //      planConfig.maxLipSyncScenesPerVideo). Free trial → 0.
  // So a Creator subscriber on 30s mode gets 1 lipsync, not 2 — the
  // tighter limit wins.
  // We only apply the cap to AUTO-derived routing; an explicit user
  // toggle on the LipSync button still gets through (admin can
  // override via plan grant if needed).
  const videoMode = videoModeFromProductData(scene.script.project.productData);
  const planLipSyncCap = (await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  }).then((u) => getPlanConfig(u?.plan).maxLipSyncScenesPerVideo)) ?? 0;
  const effectiveLipSyncCap = Math.min(
    videoMode.maxLipSyncScenes,
    planLipSyncCap,
  );
  const lipSyncMaxSceneOrder = effectiveLipSyncCap - 1; // zero-indexed
  const clipLog = logStage('clip', sceneId);
  const motionLog = logStage('motion-analysis', sceneId);
  const klingLog = logStage('kling', sceneId);
  const faceGateLog = logStage('face-gate', sceneId);
  const pixverseLog = logStage('pixverse', sceneId);

  if (
    explicitRequiresLipSync == null &&
    routing.requiresLipSync &&
    scene.sceneOrder > lipSyncMaxSceneOrder
  ) {
    clipLog.info('lipsync cap forces silent path', {
      order: scene.sceneOrder,
      mode: videoMode.mode,
      autoRoutedAs: routing.sceneGenerationType,
      maxLipSyncScenes: videoMode.maxLipSyncScenes,
      planLipSyncCap,
      effectiveLipSyncCap,
    });
    routing.requiresLipSync = false;
    routing.sceneGenerationType = 'broll';
    routing.faceVisibility = 'partial_face';
  }

  // Talking-head pipeline needs the scene's voiceUrl resolvable from the
  // public internet. If voice isn't ready or PUBLIC_BASE_URL isn't set,
  // we can still do the i2v and skip lipsync. The composer will mux the
  // voice in later — same outcome, just without lip-perfect sync.
  const needsLipSync = routing.requiresLipSync;
  if (needsLipSync && !scene.voiceUrl) {
    return {
      success: false,
      error:
        'סצנה זו דורשת lipsync — צור קודם voice-over לפני שמנפישים אותה.',
      needsVoice: true,
    };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditsBalance: true, plan: true },
  });
  if (!dbUser) return { success: false, error: 'משתמש לא נמצא' };

  // Clip credit cost is differentiated by lipsync vs b-roll (see
  // lib/plans.ts). The free-trial plan disallows clip generation
  // entirely — those users see the wizard but must upgrade to render.
  const creditCost = creditsForClip(needsLipSync);
  const planConfig = getPlanConfig(dbUser.plan);
  if (planConfig.slug === 'free_trial') {
    return {
      success: false,
      error: 'יצירת קליפים אינה זמינה בתקופת הניסיון. שדרג ל-Creator כדי להמשיך.',
      needsCredits: true,
    };
  }
  if (dbUser.creditsBalance < creditCost) {
    return {
      success: false,
      error: `אין מספיק קרדיטים — צריך ${creditCost}, יש לך ${dbUser.creditsBalance}.`,
      needsCredits: true,
    };
  }

  const projectId = scene.script.project.id;

  // V7 (2026-04-29) — there is no longer a "talking-scene fast path".
  // Every clip goes: Kling i2v → (optional PixVerse lipsync if face
  // gate passes). The fast-path providers (Kling Avatar v2 / advanced
  // lipsync / lipsync_v1) were removed along with the Sync.so + Kling
  // LipSync v1 + ElevenLabs Omnihuman alternatives. PixVerse is the
  // sole lipsync route. See lib/animation/lipsync/pixverse.ts.

  // ── Stage 0 — vision-grounded motion analysis (with cache) ─────────────
  // Look at the actual rendered scene image and ask gpt-4o-mini what
  // should plausibly move. With it, Kling gets ground-truth motion
  // ("the right hand tilts the bottle, water flows...") instead of the
  // generic "hands move with intent" fallback that animates only blinks.
  //
  // V6 cache: if scene.imageUrl matches scene.motionAnalysisImageUrl,
  // we reuse the stored JSON instead of re-calling gpt-4o-mini. The
  // cache is invalidated automatically when the user regenerates the
  // image (which sets a new imageUrl). Saves ~$0.005 + 3-5s per clip
  // regen on an unchanged image.
  let motionAnalysis: MotionAnalysis | null = null;
  const cachedJson = (scene as { motionAnalysisJson?: unknown }).motionAnalysisJson;
  const cachedImageUrl = (scene as { motionAnalysisImageUrl?: string | null })
    .motionAnalysisImageUrl;
  const cacheValid =
    cachedJson != null &&
    cachedImageUrl != null &&
    cachedImageUrl === scene.imageUrl;

  if (cacheValid) {
    motionAnalysis = cachedJson as MotionAnalysis;
    motionLog.info('cache hit — skipping gpt-4o-mini call', {
      cachedImageUrl,
    });
  } else {
    motionLog.info('calling gpt-4o-mini', {
      model: process.env.OPENAI_MOTION_VISION_MODEL ?? 'gpt-4o-mini',
      isTalkingHead: routing.requiresLipSync,
      sceneType: routing.sceneGenerationType,
    });
    const motionAnalysisCallId = await recordApiCallStart({
      provider: 'openai',
      operation: 'motion_analysis',
      model: process.env.OPENAI_MOTION_VISION_MODEL ?? 'gpt-4o-mini',
      userId,
      projectId,
      sceneId,
    });
    const motionAnalysisStartedAt = Date.now();
    try {
      motionAnalysis = await analyzeSceneForMotion({
        imageUrl: scene.imageUrl!,
        visualBrief: scene.visualPromptEnglish,
        isTalkingHead: routing.requiresLipSync,
        sceneGenerationType: routing.sceneGenerationType,
      });
      const durationMs = Date.now() - motionAnalysisStartedAt;
      const motionAttribution = attributeOpenAiTextCost({
        model: process.env.OPENAI_MOTION_VISION_MODEL ?? 'gpt-4o-mini',
        inputTokens: motionAnalysis.usage.inputTokens,
        outputTokens: motionAnalysis.usage.outputTokens,
      });
      await recordApiCallComplete(motionAnalysisCallId, {
        success: true,
        model: process.env.OPENAI_MOTION_VISION_MODEL ?? 'gpt-4o-mini',
        costUsd: motionAttribution.costUsd,
        estimatedCostUsd: motionAttribution.estimatedCostUsd,
        actualCostUsd: motionAttribution.actualCostUsd,
        inputTokens: motionAnalysis.usage.inputTokens,
        outputTokens: motionAnalysis.usage.outputTokens,
        durationMs,
        metadata: { ...motionAttribution.metadata, source: motionAttribution.source },
      });
      motionLog.info('analysis returned', {
        primaryAction: motionAnalysis.primaryAction,
        secondaryMotions: motionAnalysis.secondaryMotions.length,
        preserveElements: motionAnalysis.preserveElements.length,
        framingRisks: motionAnalysis.framingRisks.length,
        faceState: motionAnalysis.faceState,
        durationMs,
      });
      // Persist the result so the next clip-regen on this same image
      // reuses it. Best-effort — if the write fails (race with another
      // worker, image just got swapped), we silently swallow.
      await prisma.scene
        .update({
          where: { id: sceneId },
          data: {
            motionAnalysisJson: motionAnalysis as unknown as object,
            motionAnalysisImageUrl: scene.imageUrl,
            motionAnalysisAt: new Date(),
          },
        })
        .catch(() => {/* best effort */});
    } catch (err) {
      // Vision analysis is best-effort. If it fails (timeout / quota /
      // bad JSON), we fall back to the generic motion prompt — Kling will
      // still produce something usable, just less specific.
      const durationMs = Date.now() - motionAnalysisStartedAt;
      const errMsg = (err as Error).message;
      await recordApiCallComplete(motionAnalysisCallId, {
        success: false,
        errorMessage: errMsg,
        durationMs,
      });
      motionLog.warn('analysis failed — falling back to generic motion prompt', {
        errMsg,
        durationMs,
      });
      motionAnalysis = null;
    }
  }

  // V13 PR3.3 — build the AnimationPlan once, then render the Kling
  // prompt FROM the plan. The plan is the contract; the prompt is just
  // its rendered form. This route also pulls the V13 PR2 brief flags
  // (handsPhysicsRequired / mirrorRisk / contactProofRequired) through
  // detection on the same scene fields so the motion contract matches
  // the still contract.
  const animationPlan = buildAnimationPlan({
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
  const motionPrompt = buildKlingPromptFromPlan(animationPlan, {
    cameraDirection: scene.cameraDirection,
  });

  // Multi-reference for non-talking scenes: feed Kling Omni the product
  // photo as a SECONDARY reference alongside the prepared scene image.
  // This is the single biggest fix for product-disappearing drift —
  // Omni weights image_list[0] highest (the prepared frame) but uses
  // image_list[1+] to lock identity of the secondary subject (the
  // product). Talking-head scenes don't need this — the avatar IS the
  // subject and adding extra refs confuses framing.
  const productRefUrl = (() => {
    if (routing.requiresLipSync) return null;
    const data = scene.script.project.productData as Record<string, unknown> | null;
    const hero = data && typeof data.heroImageUrl === 'string' ? data.heroImageUrl : null;
    return hero || null;
  })();

  // One log line summarizing the routing decision for /admin/costs
  // forensics. Lets us answer "why did Kling drift on this scene?"
  // without having to re-derive the inputs.
  clipLog.info('routing decided', {
    sceneType: routing.sceneGenerationType,
    lipsync: routing.requiresLipSync,
    productRef: !!productRefUrl,
    motionAnalysis: !!motionAnalysis,
    plan: {
      animationGoal: animationPlan.animationGoal,
      motionSubject: animationPlan.motionSubject,
      cameraMotion: animationPlan.cameraMotion,
      forbiddenMotionCount: animationPlan.forbiddenMotion.length,
    },
  });

  // ── Stage 1 — silent image-to-video ────────────────────────────────────
  // Match the Kling clip length to the voice duration so the audio mux
  // doesn't have to lean on tpad (visual freeze) for normal-length
  // scripts. Anything > 5s of voice → 10s clip.
  const clipDuration = pickClipDuration(
    scene.voiceDurationSeconds,
    scene.durationSeconds, // honor the script's planned scene length
    routing.requiresLipSync,
  );
  // V26 / V26.4 / V26.14 — per-scene provider choice.
  //
  // V26.14: default flipped Kling → Grok. Operator can override the
  // global default via DEFAULT_CLIP_PROVIDER env (`grok` | `kling`),
  // and the user can override per-scene via `Scene.clipProvider`
  // (the existing toggle in step 5).
  //
  // V26.4 carryover: Grok works on lipsync scenes too. The lipsync
  // pipeline is provider-agnostic — PixVerse takes a silent video URL
  // regardless of who produced it, and the face-gate inspects
  // scene.imageUrl (not the video).
  const DEFAULT_PROVIDER =
    (process.env.DEFAULT_CLIP_PROVIDER ?? 'grok').toLowerCase() === 'kling'
      ? 'kling'
      : 'grok';
  const userPreferredProvider =
    (scene as { clipProvider?: string | null }).clipProvider ?? null;
  const effectiveProvider = userPreferredProvider ?? DEFAULT_PROVIDER;
  const useGrok = effectiveProvider === 'grok';
  const providerName = useGrok ? 'xai' : 'kling';
  const providerLog = useGrok ? logStage('grok-imagine', sceneId) : klingLog;
  const grokResolution = (process.env.XAI_VIDEO_RESOLUTION ?? '720p').toLowerCase();
  const grokModel = process.env.XAI_VIDEO_MODEL ?? 'grok-imagine-video';
  const i2vModel = useGrok
    ? grokModel
    : process.env.KLING_IMAGE_TO_VIDEO_MODEL ?? 'kling-v3-omni';

  // V26.16 — read the project's aspect ratio off productData so each
  // i2v call uses the user-selected output shape (Kling and Grok both
  // accept 9:16 / 1:1 / 16:9 natively). Pre-V26.16 this was hardcoded
  // to '9:16' which silently overrode any 1:1 / 16:9 selection in the
  // wizard.
  const projectAspectRatio = aspectRatioFromProductData(
    scene.script.project.productData,
  );

  let i2vResult;
  const i2vStartedAt = Date.now();
  providerLog.info('calling i2v', {
    provider: providerName,
    model: i2vModel,
    durationSeconds: clipDuration,
    aspectRatio: projectAspectRatio,
    referenceCount: productRefUrl && !useGrok ? 1 : 0,
    promptChars: motionPrompt.positive.length,
    negativeChars: motionPrompt.negative.length,
  });
  const estimatedCostUsd = useGrok
    ? attributeGrokVideoCost({
        resolution: grokResolution,
        durationSeconds: clipDuration,
      }).estimatedCostUsd
    : attributeKlingI2vCost({
        modelUsed: i2vModel,
        durationSeconds: clipDuration,
      }).estimatedCostUsd;
  // Two-phase log: row appears in /admin/costs as "in_progress" the
  // moment we start, with createdAt = now. Closes when we know the result.
  const i2vCallId = await recordApiCallStart({
    provider: providerName,
    operation: 'i2v',
    model: i2vModel,
    units: 1,
    estimatedCostUsd,
    userId,
    projectId,
    sceneId,
    metadata: {
      durationSeconds: clipDuration,
      hasProductRef: !!productRefUrl && !useGrok,
      ...(useGrok ? { resolution: grokResolution } : {}),
    },
  });
  try {
    if (useGrok) {
      // Grok currently single-image i2v only — no reference frames, no
      // negative prompt as a separate field. The provider folds the
      // negative into the main prompt (see grok-imagine.ts).
      i2vResult = await grokImagineProvider.generateImageToVideo({
        imageUrl: scene.imageUrl!,
        prompt: motionPrompt.positive,
        negativePrompt: motionPrompt.negative,
        durationSeconds: clipDuration,
        aspectRatio: projectAspectRatio,
        sceneId,
      });
    } else {
      i2vResult = await klingProvider.generateImageToVideo({
        imageUrl: scene.imageUrl!, // null-checked in outer function before in-flight set
        prompt: motionPrompt.positive,
        negativePrompt: motionPrompt.negative,
        referenceImageUrls: productRefUrl ? [productRefUrl] : undefined,
        durationSeconds: clipDuration,
        aspectRatio: projectAspectRatio,
        sceneId,
      });
    }
  } catch (err) {
    const errMsg = (err as Error).message;
    const durationMs = Date.now() - i2vStartedAt;
    await recordApiCallComplete(i2vCallId, {
      success: false,
      errorMessage: errMsg,
      durationMs,
    });
    providerLog.error('i2v failed', { provider: providerName, errMsg, durationMs });
    // V13 PR7.1 — persist failure state + curated code so the wizard
    // can render the right Hebrew error message via PR5's map.
    // V26 — Grok errors share the kling.* code prefix because
    // scene-error-messages.ts groups them as i2v-stage failures.
    const code =
      err instanceof VideoProviderConfigError
        ? 'kling.config'
        : err instanceof VideoProviderTimeoutError
          ? 'kling.timeout'
          : err instanceof VideoProviderApiError
            ? 'kling.task_failed'
            : 'kling.network';
    await prisma.scene
      .update({
        where: { id: sceneId },
        data: { status: 'failed', lastErrorCode: code, lastErrorMessage: errMsg },
      })
      .catch(() => {/* best effort */});
    return classifyClipError(err, 'motion');
  }

  const i2vDurationMs = Date.now() - i2vStartedAt;
  const i2vAttribution = useGrok
    ? attributeGrokVideoCost({
        resolution: grokResolution,
        durationSeconds: i2vResult.durationSeconds,
      })
    : attributeKlingI2vCost({
        modelUsed: i2vResult.modelUsed,
        durationSeconds: i2vResult.durationSeconds,
        // Kling does NOT expose token_count today. If they ever do, pass it
        // here as `tokensUsed` and the attribution helper will switch from
        // observed-constant ($0.79/clip) to actual_usage (tokens × $0.546).
      });
  await recordApiCallComplete(i2vCallId, {
    success: true,
    model: i2vResult.modelUsed,
    costUsd: i2vAttribution.costUsd,
    estimatedCostUsd: i2vAttribution.estimatedCostUsd,
    actualCostUsd: i2vAttribution.actualCostUsd,
    units: 1,
    durationMs: i2vDurationMs,
    metadata: {
      ...i2vAttribution.metadata,
      source: i2vAttribution.source,
      durationSecondsActual: i2vResult.durationSeconds,
    },
  });
  providerLog.info('i2v returned', {
    provider: providerName,
    model: i2vResult.modelUsed,
    durationSeconds: i2vResult.durationSeconds,
    bytes: i2vResult.videoBytes.byteLength,
    durationMs: i2vDurationMs,
  });

  // ── Stage 2 — optional lipsync ─────────────────────────────────────────
  // Only when the scene actually shows a speaking face. For b-roll the
  // silent i2v output IS the final clip; the composer adds audio later.
  let finalVideoBytes: Buffer = i2vResult.videoBytes;
  let finalDuration = i2vResult.durationSeconds;
  let lipSyncTaskId: string | null = null;
  let lipSyncSkipReason:
    | 'not_required'
    | 'public_url_unavailable'
    | 'lipsync_config_error'
    | 'lipsync_timeout'
    | 'lipsync_provider_error'
    | 'unsuitable_base_video'
    | null = null;

  if (needsLipSync && scene.voiceUrl) {
    // V7 face-detection gate. Before paying PixVerse for a lipsync,
    // confirm via gpt-4o-mini that the still has a clear front-facing
    // face with a visible mouth. If the gate rejects, we keep the
    // Kling clip + mux audio downstream — no PixVerse call, no
    // PixVerse credits burned.
    let gateResult: import('@/lib/animation/face-gate').FaceGateResult | null = null;
    try {
      const { runFaceGate } = await import('@/lib/animation/face-gate');
      gateResult = await runFaceGate({ imageUrl: scene.imageUrl! });
      faceGateLog.info('verdict', {
        shouldLipSync: gateResult.shouldLipSync,
        fullFaceDetected: gateResult.fullFaceDetected,
        mouthVisible: gateResult.mouthVisible,
        faceVisibility: gateResult.faceVisibility,
        confidence: Number(gateResult.faceDetectionConfidence.toFixed(2)),
        reason: gateResult.reason,
      });
    } catch (err) {
      // Gate failure is non-fatal — be conservative and SKIP lipsync.
      // Better to ship a non-lipsynced clip than burn PixVerse credits
      // on an unverified face.
      faceGateLog.warn('failed — skipping lipsync to be safe', {
        errMsg: (err as Error).message,
      });
    }

    if (!gateResult || !gateResult.shouldLipSync) {
      lipSyncSkipReason = 'unsuitable_base_video';
    }
  }

  if (needsLipSync && scene.voiceUrl && !lipSyncSkipReason) {
    pixverseLog.info('entering lipsync stage', {
      order: scene.sceneOrder,
    });
    // Save the silent clip first so we can hand a public URL to Kling.
    const silentStorage = await getStorage();
    const silentFilename = `${scene.id}-silent-${Date.now()}.mp4`;
    const silentSaved = await silentStorage.putBytes({
      folder: `clips/${projectId}/silent`,
      filename: silentFilename,
      data: i2vResult.videoBytes,
      contentType: 'video/mp4',
    });

    let videoPublicUrl: string;
    let audioPublicUrl: string;
    try {
      videoPublicUrl = toPublicUrl(silentSaved.url);
      audioPublicUrl = toPublicUrl(scene.voiceUrl);
    } catch (err) {
      // Public URL not configured — skip lipsync, keep silent. Pipeline
      // continues; the composer's voice mux still produces a watchable
      // video, just without lip-perfect sync.
      if (err instanceof PublicUrlError) {
        lipSyncSkipReason = 'public_url_unavailable';
        await recordApiCall({
          provider: 'pixverse',
          operation: 'lipsync',
          model: 'pixverse-lip-sync',
          costUsd: 0,
          success: false,
          errorMessage: 'skipped:public_url_unavailable',
          userId,
          projectId,
        });
      } else {
        throw err;
      }
    }

    if (!lipSyncSkipReason) {
      // V7: PixVerse is the sole lipsync provider. No selection logic,
      // no env switch, no per-project override.
      const lipsyncProvider = getLipSyncProvider();
      const lipsyncStartedAt = Date.now();
      const lipsyncCallId = await recordApiCallStart({
        provider: lipsyncProvider.name,
        operation: 'lipsync',
        model: 'pixverse-lip-sync',
        units: 1,
        estimatedCostUsd: attributePixVerseLipSyncCost({
          durationSeconds: finalDuration,
        }).estimatedCostUsd,
        userId,
        projectId,
        sceneId,
        metadata: { durationSeconds: finalDuration, faceVisibility: routing.faceVisibility },
      });
      try {
        pixverseLog.info('calling lipsync provider', {
          provider: lipsyncProvider.name,
          durationSeconds: finalDuration,
          faceVisibility: routing.faceVisibility,
        });
        const lsResult = await lipsyncProvider.generate({
          videoUrl: videoPublicUrl!,
          audioUrl: audioPublicUrl!,
          durationSeconds: finalDuration,
          sceneId,
          faceVisibility: routing.faceVisibility as never,
        });
        finalVideoBytes = lsResult.videoBytes;
        finalDuration = lsResult.durationSeconds;
        lipSyncTaskId = lsResult.providerJobId;
        const lsDurationMs = Date.now() - lipsyncStartedAt;
        const lipsyncAttribution = attributePixVerseLipSyncCost({
          durationSeconds: finalDuration,
          // PixVerse doesn't return credit_consumed today. If they
          // ever do, pass it here and the helper will switch to actual.
        });
        await recordApiCallComplete(lipsyncCallId, {
          success: true,
          model: lsResult.modelUsed,
          costUsd: lipsyncAttribution.costUsd,
          estimatedCostUsd: lipsyncAttribution.estimatedCostUsd,
          actualCostUsd: lipsyncAttribution.actualCostUsd,
          units: 1,
          durationMs: lsDurationMs,
          metadata: {
            ...lipsyncAttribution.metadata,
            providerJobId: lsResult.providerJobId,
            source: lipsyncAttribution.source,
          },
        });
        // Trust completion data, ignore status field — see comment in
        // lib/animation/lipsync/pixverse.ts about the unreliability of
        // the status enum on Pixverse.
        pixverseLog.info('lipsync returned (status field ignored)', {
          providerJobId: lsResult.providerJobId,
          durationSeconds: lsResult.durationSeconds,
          bytes: lsResult.videoBytes.byteLength,
          durationMs: lsDurationMs,
        });
      } catch (err) {
        const errMsg = (err as Error).message;
        const lsDurationMs = Date.now() - lipsyncStartedAt;
        await recordApiCallComplete(lipsyncCallId, {
          success: false,
          errorMessage: errMsg,
          durationMs: lsDurationMs,
        });
        pixverseLog.error('lipsync failed — keeping silent clip', {
          errMsg,
          durationMs: lsDurationMs,
        });
        // Fallback: keep the silent clip. Don't crash the whole project.
        // The composer will mux audio later — viewer gets a watchable
        // video with a noticeable but acceptable lip mismatch.
        // Distinguish provider/timeout/config errors so admin sees real cause.
        const reason =
          err instanceof LipSyncConfigError
            ? 'lipsync_config_error'
            : err instanceof LipSyncTimeoutErrorAbstract
              ? 'lipsync_timeout'
              : err instanceof LipSyncProviderError
                ? 'lipsync_provider_error'
                : 'public_url_unavailable';
        lipSyncSkipReason = reason as NonNullable<typeof lipSyncSkipReason>;
      }
    }
  } else if (!needsLipSync) {
    lipSyncSkipReason = 'not_required';
  }

  // ── Mux voice audio onto the silent clip (b-roll path only) ────────────
  // For lipsync scenes Kling embedded audio in finalVideoBytes already.
  // For everyone else we run a local ffmpeg pass to embed the voice MP3,
  // so scene.clipUrl is always self-contained ("press play" works in the
  // scene tile without per-scene client-side mux).
  let audioMuxed = false;
  let muxErrorMessage: string | null = null;
  if (lipSyncSkipReason && scene.voiceUrl) {
    try {
      const voiceBytes = await readUrlAsBuffer(scene.voiceUrl);
      finalVideoBytes = await muxVoiceOntoVideo({
        silentVideoBytes: finalVideoBytes,
        voiceMp3Bytes: voiceBytes,
      });
      audioMuxed = true;
    } catch (err) {
      const errMsg = err instanceof MuxError ? err.message : (err as Error).message;
      muxErrorMessage = errMsg;
      const muxAttribution = attributeLocalComposeCost({ operation: 'mux' });
      await recordApiCall({
        provider: 'ffmpeg',
        operation: 'mux',
        model: 'ffmpeg-local',
        costUsd: muxAttribution.costUsd,
        estimatedCostUsd: muxAttribution.estimatedCostUsd,
        success: false,
        errorMessage: `audio mux failed: ${errMsg}`,
        userId,
        projectId,
        sceneId,
        metadata: { ...muxAttribution.metadata, errorMessage: errMsg },
      });
    }
  }

  // V13 — refund the user when a non-lipsync scene's mux fails. The
  // Kling i2v call burnt provider credits regardless, but charging
  // the user for a silent clip they can't actually use is wrong. We:
  //   1. SKIP persisting clipUrl (silent clip is unusable for the
  //      end product — composer can't mux it after the fact reliably).
  //   2. Mark scene.status = 'failed' + lastErrorCode so the wizard
  //      surfaces the right Hebrew error via PR5's map.
  //   3. Return a clear error to the caller. NO credit charge runs
  //      below because we early-return before the charge transaction.
  if (
    lipSyncSkipReason &&
    scene.voiceUrl &&
    !audioMuxed &&
    muxErrorMessage
  ) {
    klingLog.error('mux failed — refusing to ship a silent clip', {
      errMsg: muxErrorMessage,
    });
    await prisma.scene
      .update({
        where: { id: sceneId },
        data: {
          status: 'failed',
          lastErrorCode: 'render.ffmpeg_failed',
          lastErrorMessage: muxErrorMessage,
        },
      })
      .catch(() => {/* best effort */});
    return {
      success: false,
      error: `מיקס הקול לקליפ נכשל: ${muxErrorMessage}. הסצנה לא תיווצר עד שזה יסתדר — לא חויבת קרדיטים על הקריאה הזו.`,
      failedStage: 'motion',
    };
  }

  // ── Persist the final clip ─────────────────────────────────────────────
  const storage = await getStorage();
  const filename = `${scene.id}-${Date.now()}.mp4`;
  const { url } = await storage.putBytes({
    folder: `clips/${projectId}`,
    filename,
    data: finalVideoBytes,
    contentType: 'video/mp4',
  });

  // V8 (2026-04-29): split the clip charge into two line items so
  // PixVerse credits aren't burned when the face-gate skips lipsync.
  //   1. Kling i2v charge — UNCONDITIONAL once Kling returned a clip.
  //      Since the i2v call already succeeded (we only reach this
  //      point on success), the user pays for it whether or not
  //      lipsync ran later.
  //   2. PixVerse lipsync charge — ONLY when PixVerse actually
  //      produced a synced clip (lipSyncTaskId is non-null AND
  //      lipSyncSkipReason is null).
  //
  // First-regen-free still applies to the Kling line item per
  // FIRST_REGEN_FREE.kling_i2v_clip (currently false). It NEVER
  // applies to the PixVerse line item — lipsync regens are paid.
  // Provider-failure refunds (timeouts, 5xx) come through the catch
  // blocks above and bypass this map.
  const previousCount = scene.clipGenerationCount ?? 0;
  const klingCredits = creditsForOperation('kling_i2v_clip');
  const pixverseRan = lipSyncTaskId != null && lipSyncSkipReason == null;
  const pixverseCredits = pixverseRan
    ? creditsForOperation('pixverse_lipsync_scene')
    : 0;
  const isFirstRegen = previousCount === 1 && FIRST_REGEN_FREE.kling_i2v_clip;
  const klingCharge = isFirstRegen ? 0 : klingCredits;

  // V26 — `clipProvider` reflects who actually produced the i2v. Both
  // Kling and Grok currently roll up to the SAME Tachles credit charge
  // (kling_i2v_clip) — provider-cost differences fall on us, not the
  // user. The user's preference column is overwritten here so the next
  // regen defaults to the same provider unless they flip it.
  const recordedProvider = useGrok ? 'grok' : 'kling';
  await prisma.$transaction([
    prisma.scene.update({
      where: { id: sceneId },
      data: {
        clipUrl: url,
        clipProvider: recordedProvider,
        clipGeneratedAt: new Date(),
        clipDurationSeconds: finalDuration,
        clipGenerationCount: { increment: 1 },
        // Cache hooks (used if the user retries while the same image is
        // still in place). Kept loosely-coupled — clip-impl reads but
        // doesn't strictly require these.
        clipMotionTaskId: i2vResult.providerJobId,
        clipMotionImageUrl: scene.imageUrl,
        clipMotionGeneratedAt: new Date(),
        clipMotionDurationSec: finalDuration,
        // V13 PR7.1 — clip stage succeeded; clear any prior error.
        // Lipsync skip reasons (face-gate / public-url) don't fail the
        // overall clip — the user gets a watchable result with audio
        // muxed in by ffmpeg, so we still mark this clip_ready.
        status: 'clip_ready',
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    }),
    ...buildCreditMutationOps(prisma, {
      userId,
      amount: -klingCharge,
      reason: isFirstRegen
        ? 'first_regen_free:kling_i2v_clip'
        : 'spent:kling_i2v_clip',
      ref: sceneId,
      metadata: {
        previousCount,
        routing,
        i2vProvider: recordedProvider,
        i2vModel: i2vResult.modelUsed,
        audioMuxed,
        lipSyncSkipReason,
      },
    }),
    ...(pixverseRan
      ? buildCreditMutationOps(prisma, {
          userId,
          amount: -pixverseCredits,
          reason: 'spent:pixverse_lipsync_scene',
          ref: sceneId,
          metadata: {
            taskId: lipSyncTaskId,
            faceVisibility: routing.faceVisibility,
          },
        })
      : []),
    prisma.asset.create({
      data: {
        projectId,
        type: 'avatar_video',
        provider: recordedProvider,
        url,
        durationSeconds: finalDuration,
        metadata: {
          sceneId: scene.id,
          sceneOrder: scene.sceneOrder,
          routing,
          audioMuxed,
          stageA: {
            provider: recordedProvider,
            model: i2vResult.modelUsed,
            taskId: i2vResult.providerJobId,
            costUsd: useGrok
              ? attributeGrokVideoCost({
                  resolution: grokResolution,
                  durationSeconds: finalDuration,
                }).costUsd
              : priceKling(klingPricingKeyForModel(i2vResult.modelUsed)),
          },
          stageB:
            lipSyncTaskId != null
              ? {
                  provider: 'pixverse',
                  model: 'pixverse-lip-sync',
                  taskId: lipSyncTaskId,
                }
              : null,
          lipSyncSkipReason,
          motionPrompt: { positive: motionPrompt.positive, negative: motionPrompt.negative },
        },
      },
    }),
  ]);
  // V14.2-A — credits changed in the transaction above; drop cached User row.
  invalidateUserCacheAfterCreditMutation(userId);

  return {
    success: true,
    clipUrl: url,
    durationSeconds: finalDuration,
    silentOnly: !!lipSyncSkipReason,
    freeRegen: isFirstRegen,
  };
}

function classifyClipError(err: unknown, stage: 'motion' | 'lipsync'): GenerateClipResult {
  const errMsg = (err as Error).message;
  if (err instanceof VideoProviderConfigError) {
    return { success: false, error: err.message, configError: true, failedStage: stage };
  }
  if (err instanceof VideoProviderTimeoutError) {
    return {
      success: false,
      error:
        stage === 'motion'
          ? 'Kling לא הגיב בזמן בשלב יצירת התנועה. נסה שוב.'
          : 'Kling לא הגיב בזמן בשלב סנכרון השפתיים. נסה שוב.',
      timedOut: true,
      failedStage: stage,
    };
  }
  if (err instanceof VideoProviderApiError) {
    return {
      success: false,
      error:
        stage === 'motion'
          ? `Kling i2v נכשל: ${err.message}`
          : `סנכרון שפתיים נכשל: ${err.message}`,
      failedStage: stage,
    };
  }
  return {
    success: false,
    error:
      stage === 'motion'
        ? `יצירת התנועה נכשלה: ${errMsg}`
        : `סנכרון שפתיים נכשל: ${errMsg}`,
    failedStage: stage,
  };
}

// ── Lipsync-only regeneration ──────────────────────────────────────────────
// Run the lipsync provider on an existing scene's clip + voice WITHOUT
// re-running Kling i2v. Saves $0.79 (the i2v call) per regen when the
// user just wants to try a different lipsync provider on a clip whose
// visuals are already fine.
//
// Preconditions:
//   - scene.clipUrl exists (scene already has a video to lipsync into)
//   - scene.voiceUrl exists (need an audio source)
//   - scene routing says requiresLipSync (or user explicitly opted in)
//   - PUBLIC_BASE_URL is configured (lipsync providers fetch URLs)
//   - user has enough credits (12 for lipsync_only)
export async function regenLipSyncOnlyImpl(
  sceneId: string,
  userId: string,
): Promise<GenerateClipResult> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      script: {
        include: { project: { select: { id: true, productData: true, userId: true } } },
      },
    },
  });
  if (!scene) return { success: false, error: 'הסצנה לא נמצאה' };
  if (scene.script.project.userId !== userId) {
    return { success: false, error: 'אין הרשאה' };
  }
  if (!scene.clipUrl) {
    return {
      success: false,
      error: 'אין קליפ קיים לסצנה. צור קודם הנפשה רגילה ואז תוכל להריץ lipsync לבד.',
      needsImage: true, // best signal we have for "need to do prior step"
    };
  }
  if (!scene.voiceUrl) {
    return {
      success: false,
      error: 'אין voice-over לסצנה. צור voice-over קודם.',
      needsVoice: true,
    };
  }

  const COST_PER_LIPSYNC_ONLY = PER_OPERATION_CREDITS.lipsync_only;
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditsBalance: true, plan: true },
  });
  if (!dbUser) return { success: false, error: 'משתמש לא נמצא' };
  const planConfig = getPlanConfig(dbUser.plan);
  if (planConfig.slug === 'free_trial') {
    return {
      success: false,
      error: 'יצירת lipsync אינה זמינה בתקופת הניסיון. שדרג ל-Creator.',
      needsCredits: true,
    };
  }
  if (planConfig.maxLipSyncScenesPerVideo === 0) {
    return {
      success: false,
      error: 'התוכנית הנוכחית לא תומכת ב-lipsync.',
      needsCredits: true,
    };
  }
  if (dbUser.creditsBalance < COST_PER_LIPSYNC_ONLY) {
    return {
      success: false,
      error: `אין מספיק קרדיטים — צריך ${COST_PER_LIPSYNC_ONLY}, יש לך ${dbUser.creditsBalance}.`,
      needsCredits: true,
    };
  }

  // Pre-flight: rate-limit + spend cap (same as full clip path).
  try {
    await checkRateLimit(userId, 'lipsync');
    await checkSpendCap(userId);
  } catch (err) {
    if (err instanceof RateLimitedError) return { success: false, error: err.message, rateLimited: true };
    if (err instanceof SpendCapExceededError) return { success: false, error: err.message, spendCapExceeded: true };
    throw err;
  }

  // In-flight guard piggybacks on clipInFlightAt — same column the
  // full-clip path uses. Concurrent lipsync-only + clip-regen on the
  // same scene would race; the guard serializes them.
  const IN_FLIGHT_TTL_MS = 15 * 60 * 1000;
  const sceneAny = scene as unknown as { clipInFlightAt?: Date | null };
  if (
    sceneAny.clipInFlightAt &&
    Date.now() - sceneAny.clipInFlightAt.getTime() < IN_FLIGHT_TTL_MS
  ) {
    return {
      success: false,
      error: 'יש פעולה אחרת רצה על הקליפ הזה. רענן ונסה שוב.',
      rateLimited: true,
    };
  }

  await prisma.scene.update({
    where: { id: sceneId },
    data: { clipInFlightAt: new Date() },
  });

  try {
    const projectId = scene.script.project.id;

    // V7: PixVerse is the sole lipsync route. PixVerse uploads bytes
    // via multipart, so we pass local /uploads paths and skip the
    // toPublicUrl conversion entirely — the provider doesn't depend
    // on the cloudflared tunnel being up.
    const lipsyncProvider = getLipSyncProvider();
    const videoPublicUrl = scene.clipUrl;
    const audioPublicUrl = scene.voiceUrl;

    const startedAt = Date.now();
    const lipsyncOnlyDurationSec = scene.clipDurationSeconds ?? scene.durationSeconds ?? 5;
    const callId = await recordApiCallStart({
      provider: lipsyncProvider.name,
      operation: 'lipsync',
      model: 'pixverse-lip-sync',
      units: 1,
      estimatedCostUsd: attributePixVerseLipSyncCost({
        durationSeconds: lipsyncOnlyDurationSec,
      }).estimatedCostUsd,
      userId,
      projectId,
      sceneId,
      metadata: { durationSeconds: lipsyncOnlyDurationSec, retryMode: 'lipsync_only' },
    });

    let lsResult;
    try {
      lsResult = await lipsyncProvider.generate({
        videoUrl: videoPublicUrl,
        audioUrl: audioPublicUrl,
        durationSeconds: scene.clipDurationSeconds ?? scene.durationSeconds,
        sceneId,
        // Best-effort routing hint — we don't recompute scene routing
        // here, the provider can degrade gracefully.
        faceVisibility: 'clear_front_facing' as never,
      });
      const retryAttribution = attributePixVerseLipSyncCost({
        durationSeconds: lipsyncOnlyDurationSec,
      });
      await recordApiCallComplete(callId, {
        success: true,
        model: lsResult.modelUsed,
        costUsd: retryAttribution.costUsd,
        estimatedCostUsd: retryAttribution.estimatedCostUsd,
        actualCostUsd: retryAttribution.actualCostUsd,
        units: 1,
        durationMs: Date.now() - startedAt,
        metadata: {
          ...retryAttribution.metadata,
          providerJobId: lsResult.providerJobId,
          source: retryAttribution.source,
          retryMode: 'lipsync_only',
        },
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      await recordApiCallComplete(callId, {
        success: false,
        errorMessage: errMsg,
        durationMs: Date.now() - startedAt,
      });
      throw err;
    }

    // Persist the new clip bytes back as scene.clipUrl + charge credits.
    const storage = await getStorage();
    const filename = `${scene.id}-${Date.now()}.mp4`;
    const { url } = await storage.putBytes({
      folder: `clips/${projectId}`,
      filename,
      data: lsResult.videoBytes,
      contentType: 'video/mp4',
    });

    await prisma.$transaction([
      prisma.scene.update({
        where: { id: sceneId },
        data: {
          clipUrl: url,
          clipProvider: lipsyncProvider.name,
          clipGeneratedAt: new Date(),
          clipDurationSeconds: lsResult.durationSeconds,
          clipGenerationCount: { increment: 1 },
        },
      }),
      ...buildCreditMutationOps(prisma, {
        userId,
        amount: -COST_PER_LIPSYNC_ONLY,
        reason: 'spent:lipsync_only',
        ref: sceneId,
        metadata: {
          provider: lipsyncProvider.name,
          videoUrl: videoPublicUrl,
          audioUrl: audioPublicUrl,
        },
      }),
    ]);
    // V14.2-A — drop cached User row after lipsync-only credit spend.
    invalidateUserCacheAfterCreditMutation(userId);

    return {
      success: true,
      clipUrl: url,
      durationSeconds: lsResult.durationSeconds,
    };
  } catch (err) {
    const errMsg = (err as Error).message;
    if (err instanceof LipSyncTimeoutErrorAbstract) {
      return { success: false, error: `Lipsync timeout: ${errMsg}`, timedOut: true, failedStage: 'lipsync' };
    }
    if (err instanceof LipSyncConfigError) {
      return { success: false, error: errMsg, configError: true, failedStage: 'lipsync' };
    }
    if (err instanceof LipSyncProviderError) {
      return { success: false, error: `Lipsync provider error: ${errMsg}`, failedStage: 'lipsync' };
    }
    return { success: false, error: `Lipsync-only failed: ${errMsg}`, failedStage: 'lipsync' };
  } finally {
    await prisma.scene
      .update({ where: { id: sceneId }, data: { clipInFlightAt: null } })
      .catch(() => {/* best effort */});
  }
}
