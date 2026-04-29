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

import { prisma } from '@/lib/db';
import {
  klingProvider,
  buildKlingMotionPrompt,
} from '@/lib/animation/kling';
import {
  getActiveLipSyncProvider,
  getLipSyncProviderByName,
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
  getPlanConfig,
  FIRST_REGEN_FREE,
  PER_OPERATION_CREDITS,
} from '@/lib/plans';
import { toPublicUrl, PublicUrlError } from '@/lib/animation/public-url';
import {
  analyzeSceneForMotion,
  type MotionAnalysis,
} from '@/lib/animation/motion-analysis';
import { getActiveTalkingSceneProvider } from '@/lib/animation/talking-scene';
import { muxVoiceOntoVideo, readUrlAsBuffer, MuxError } from '@/lib/scenes/mux-audio';
import { getStorage } from '@/lib/storage';
import { recordApiCall, recordApiCallStart, recordApiCallComplete } from '@/lib/usage/log';
import {
  priceKling,
  klingPricingKeyForModel,
  priceOpenAiText,
  priceLipSync,
} from '@/lib/usage/pricing';
import { buildCreditMutationOps } from '@/lib/usage/credits';
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
    data: { clipInFlightAt: new Date() },
  });
  try {
    return await generateSceneClipImplInner(sceneId, userId, scene);
  } finally {
    await prisma.scene
      .update({ where: { id: sceneId }, data: { clipInFlightAt: null } })
      .catch(() => {/* best effort */});
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
  if (
    explicitRequiresLipSync == null &&
    routing.requiresLipSync &&
    scene.sceneOrder > lipSyncMaxSceneOrder
  ) {
    console.log(
      `[clip] scene=${sceneId} order=${scene.sceneOrder} mode=${videoMode.mode} — ` +
        `auto-routed as ${routing.sceneGenerationType} but lipsync cap ` +
        `(mode=${videoMode.maxLipSyncScenes}, plan=${planLipSyncCap}, ` +
        `effective=${effectiveLipSyncCap}) forces silent path. ` +
        `User can override via the LipSync toggle.`,
    );
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

  // ── Talking-scene fast path (Kling AI Avatar v2 / advanced-lipsync) ────
  // For scenes routed as talking_head/selfie_talking/mirror_selfie_talking,
  // we can hand the image + audio DIRECTLY to a provider that does both
  // motion + lip sync in one call (Kling Avatar v2 etc.). This avoids
  // the i2v→lipsync chain that produces "patch on a frozen face"
  // artifacts and runs in roughly half the wall-clock time.
  //
  // Selection: KLING_TALKING_SCENE_PROVIDER env. When it equals
  // "lipsync_v1" (or is unset and routing is non-talking) we fall
  // through to the legacy i2v + optional lipsync flow below.
  const talkingProviderName = (process.env.KLING_TALKING_SCENE_PROVIDER ?? 'ai_avatar_v2_pro').toLowerCase();
  const useDirectTalking =
    routing.requiresLipSync &&
    !!scene.voiceUrl &&
    talkingProviderName !== 'lipsync_v1';

  if (useDirectTalking) {
    let imagePublicUrl: string;
    let audioPublicUrl: string;
    try {
      imagePublicUrl = toPublicUrl(scene.imageUrl!);
      audioPublicUrl = toPublicUrl(scene.voiceUrl!);
    } catch (err) {
      if (err instanceof PublicUrlError) {
        // Fall through to the legacy i2v path — that one still works
        // with local URLs because Kling i2v reads bytes inline.
        console.warn(
          `[clip] talking-scene fast path needs PUBLIC_BASE_URL — falling back to i2v: ${err.message}`,
        );
      } else {
        throw err;
      }
    }

    if (typeof imagePublicUrl! === 'string' && typeof audioPublicUrl! === 'string') {
      const provider = getActiveTalkingSceneProvider();
      const startedAt = Date.now();
      const callId = await recordApiCallStart({
        provider: 'kling',
        operation: provider.name, // e.g. "kling-avatar-v2-pro"
        model: provider.name,
        units: 1,
        userId,
        projectId,
      });
      try {
        const result = await provider.generate({
          imageUrl: imagePublicUrl!,
          audioUrl: audioPublicUrl!,
          durationSeconds: pickClipDuration(
            scene.voiceDurationSeconds,
            scene.durationSeconds,
            true,
          ),
          sceneId,
          aspectRatio: '9:16',
        });
        await recordApiCallComplete(callId, {
          success: true,
          model: result.modelUsed,
          // No solid pricing yet for Avatar v2 — log a placeholder of
          // i2v_v3_omni (similar tier). Refine when we have real
          // numbers in /admin/costs.
          costUsd: priceKling('i2v_v3_omni_5s'),
          units: 1,
          durationMs: Date.now() - startedAt,
        });

        // Persist the final clip and bookkeeping. Avatar v2 returns
        // video WITH audio embedded — no ffmpeg mux needed.
        const storage = await getStorage();
        const filename = `${scene.id}-${Date.now()}.mp4`;
        const { url } = await storage.putBytes({
          folder: `clips/${projectId}`,
          filename,
          data: result.videoBytes,
          contentType: 'video/mp4',
        });

        const previousCount = scene.clipGenerationCount ?? 0;
        // V6 policy: clips are NOT first-regen-free (Kling cost too high).
        // The flag is read from FIRST_REGEN_FREE so flipping policy is a
        // one-line change. Provider-failure refunds still apply elsewhere.
        const clipOpKey = needsLipSync ? 'clip_lipsync' : 'clip_broll';
        const isFirstRegen = previousCount === 1 && FIRST_REGEN_FREE[clipOpKey];
        const charge = isFirstRegen ? 0 : creditCost;

        await prisma.$transaction([
          prisma.scene.update({
            where: { id: sceneId },
            data: {
              clipUrl: url,
              clipProvider: provider.name,
              clipGeneratedAt: new Date(),
              clipDurationSeconds: result.durationSeconds,
              clipGenerationCount: { increment: 1 },
            },
          }),
          ...buildCreditMutationOps(prisma, {
            userId,
            amount: -charge,
            reason: isFirstRegen ? 'first_regen_free:scene_clip' : 'spent:scene_clip',
            ref: sceneId,
            metadata: {
              previousCount,
              routing,
              talkingProvider: provider.name,
              modelUsed: result.modelUsed,
            },
          }),
          prisma.asset.create({
            data: {
              projectId,
              type: 'avatar_video',
              provider: provider.name,
              url,
              durationSeconds: result.durationSeconds,
              metadata: {
                sceneId: scene.id,
                sceneOrder: scene.sceneOrder,
                routing,
                stage: 'direct_talking_scene',
                modelUsed: result.modelUsed,
                providerJobId: result.providerJobId,
              },
            },
          }),
        ]);

        return {
          success: true,
          clipUrl: url,
          durationSeconds: result.durationSeconds,
          freeRegen: isFirstRegen,
        };
      } catch (err) {
        const errMsg = (err as Error).message;
        await recordApiCallComplete(callId, {
          success: false,
          errorMessage: errMsg,
          durationMs: Date.now() - startedAt,
        });
        // Don't crash — fall through to the legacy i2v path so the
        // user still gets *something*.
        console.warn(
          `[clip] talking-scene provider "${provider.name}" failed; falling back to i2v: ${errMsg}`,
        );
      }
    }
  }

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
    console.log(
      `[clip] scene=${sceneId} motion-analysis CACHE HIT (image unchanged) — skipping gpt-4o-mini call`,
    );
  } else {
    const motionAnalysisCallId = await recordApiCallStart({
      provider: 'openai',
      operation: 'motion_analysis',
      model: process.env.OPENAI_MOTION_VISION_MODEL ?? 'gpt-4o-mini',
      userId,
      projectId,
    });
    const motionAnalysisStartedAt = Date.now();
    try {
      motionAnalysis = await analyzeSceneForMotion({
        imageUrl: scene.imageUrl!,
        visualBrief: scene.visualPromptEnglish,
        isTalkingHead: routing.requiresLipSync,
        sceneGenerationType: routing.sceneGenerationType,
      });
      await recordApiCallComplete(motionAnalysisCallId, {
        success: true,
        model: process.env.OPENAI_MOTION_VISION_MODEL ?? 'gpt-4o-mini',
        costUsd: priceOpenAiText(
          process.env.OPENAI_MOTION_VISION_MODEL ?? 'gpt-4o-mini',
          motionAnalysis.usage.inputTokens,
          motionAnalysis.usage.outputTokens,
        ),
        inputTokens: motionAnalysis.usage.inputTokens,
        outputTokens: motionAnalysis.usage.outputTokens,
        durationMs: Date.now() - motionAnalysisStartedAt,
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
      await recordApiCallComplete(motionAnalysisCallId, {
        success: false,
        errorMessage: (err as Error).message,
        durationMs: Date.now() - motionAnalysisStartedAt,
      });
      motionAnalysis = null;
    }
  }

  const motionPrompt = buildKlingMotionPrompt({
    cameraDirection: scene.cameraDirection,
    performanceNote: scene.performanceNote,
    sceneType: scene.sceneType,
    requiresLipSync: routing.requiresLipSync,
    sceneGenerationType: routing.sceneGenerationType,
    motionAnalysis,
    // V4 product-first metadata. Read straight off the Scene row
    // (LLM-committed values when present, else null fallback).
    primarySubject: (scene as { primarySubject?: string | null }).primarySubject ?? null,
    mustShowProduct: (scene as { mustShowProduct?: boolean | null }).mustShowProduct ?? null,
    productVisibilityPriority:
      (scene as { productVisibilityPriority?: string | null }).productVisibilityPriority ?? null,
    cameraFocus: (scene as { cameraFocus?: string | null }).cameraFocus ?? null,
    showFace: (scene as { showFace?: boolean | null }).showFace ?? null,
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
  console.log(
    `[clip] scene=${sceneId} type=${routing.sceneGenerationType} ` +
      `lipsync=${routing.requiresLipSync} productRef=${!!productRefUrl} ` +
      `motionAnalysis=${!!motionAnalysis}`,
  );

  // ── Stage 1 — silent image-to-video ────────────────────────────────────
  // Match the Kling clip length to the voice duration so the audio mux
  // doesn't have to lean on tpad (visual freeze) for normal-length
  // scripts. Anything > 5s of voice → 10s clip.
  const clipDuration = pickClipDuration(
    scene.voiceDurationSeconds,
    scene.durationSeconds, // honor the script's planned scene length
    routing.requiresLipSync,
  );
  let i2vResult;
  const i2vStartedAt = Date.now();
  // Two-phase log: row appears in /admin/costs as "in_progress" the
  // moment we start, with createdAt = now. Closes when we know the result.
  const i2vCallId = await recordApiCallStart({
    provider: 'kling',
    operation: 'i2v',
    model: process.env.KLING_IMAGE_TO_VIDEO_MODEL ?? 'kling-v3-omni',
    units: 1,
    userId,
    projectId,
  });
  try {
    i2vResult = await klingProvider.generateImageToVideo({
      imageUrl: scene.imageUrl!, // null-checked in outer function before in-flight set
      prompt: motionPrompt.positive,
      negativePrompt: motionPrompt.negative,
      referenceImageUrls: productRefUrl ? [productRefUrl] : undefined,
      durationSeconds: clipDuration,
      aspectRatio: '9:16',
      sceneId,
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    await recordApiCallComplete(i2vCallId, {
      success: false,
      errorMessage: errMsg,
      durationMs: Date.now() - i2vStartedAt,
    });
    return classifyClipError(err, 'motion');
  }

  await recordApiCallComplete(i2vCallId, {
    success: true,
    model: i2vResult.modelUsed,
    costUsd: priceKling(klingPricingKeyForModel(i2vResult.modelUsed)),
    units: 1,
    durationMs: Date.now() - i2vStartedAt,
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
    console.log(
      `[clip] scene=${sceneId} order=${scene.sceneOrder} — entering lipsync ` +
        `stage (provider=${process.env.LIPSYNC_PROVIDER ?? 'kling'} model=` +
        `${process.env.KLING_LIPSYNC_MODEL ?? 'kling-lip-sync-v1'})`,
    );
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
          provider: 'kling',
          operation: 'lipsync',
          model: process.env.KLING_LIPSYNC_MODEL ?? 'kling-lip-sync-v1',
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
      // Provider abstraction — kling/pixverse/sync/elevenlabs/mock —
      // selected via:
      //   1. project.productData.lipsyncProvider  (per-project override)
      //   2. LIPSYNC_PROVIDER env  (global default)
      //   3. fall back to "kling"
      // A/B comparison still runs through the same abstraction via
      // /api/dev/lipsync-bakeoff (resolves by name explicitly).
      const projectData = scene.script.project.productData as Record<string, unknown> | null;
      const projectOverride =
        projectData && typeof projectData.lipsyncProvider === 'string'
          ? (projectData.lipsyncProvider as string)
          : null;
      const lipsyncProvider = projectOverride
        ? getLipSyncProviderByName(projectOverride)
        : getActiveLipSyncProvider();
      const lipsyncStartedAt = Date.now();
      const lipsyncCallId = await recordApiCallStart({
        provider: lipsyncProvider.name,
        operation: 'lipsync',
        model: process.env.KLING_LIPSYNC_MODEL ?? 'kling-lip-sync-v1',
        units: 1,
        userId,
        projectId,
      });
      try {
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
        await recordApiCallComplete(lipsyncCallId, {
          success: true,
          model: lsResult.modelUsed,
          // Route to the right provider's cost function. Previously
          // hardcoded to priceKling, which under-reported PixVerse +
          // Sync.so calls in /admin/costs.
          costUsd: priceLipSync(lsResult.providerName, finalDuration),
          units: 1,
          durationMs: Date.now() - lipsyncStartedAt,
        });
      } catch (err) {
        const errMsg = (err as Error).message;
        await recordApiCallComplete(lipsyncCallId, {
          success: false,
          errorMessage: errMsg,
          durationMs: Date.now() - lipsyncStartedAt,
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
  if (lipSyncSkipReason && scene.voiceUrl) {
    try {
      const voiceBytes = await readUrlAsBuffer(scene.voiceUrl);
      finalVideoBytes = await muxVoiceOntoVideo({
        silentVideoBytes: finalVideoBytes,
        voiceMp3Bytes: voiceBytes,
      });
      audioMuxed = true;
    } catch (err) {
      // Mux failure isn't catastrophic — we still save the silent clip.
      // The (deprecated) per-scene composer mux still picks it up if
      // someone wants to recover, and the user can regen.
      const errMsg = err instanceof MuxError ? err.message : (err as Error).message;
      await recordApiCall({
        provider: 'ffmpeg',
        operation: 'mux',
        model: 'ffmpeg-local',
        costUsd: 0,
        success: false,
        errorMessage: `audio mux failed: ${errMsg}`,
        userId,
        projectId,
      });
    }
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

  // V6 policy: clips are NOT first-regen-free (Kling cost too high).
  // The previousCount-aware branch is preserved + gated on
  // FIRST_REGEN_FREE so policy flips with one constant change. Provider-
  // failure refunds still apply via the catch blocks above.
  const previousCount = scene.clipGenerationCount ?? 0;
  const clipOpKey = needsLipSync ? 'clip_lipsync' : 'clip_broll';
  const isFirstRegen = previousCount === 1 && FIRST_REGEN_FREE[clipOpKey];
  const charge = isFirstRegen ? 0 : creditCost;

  await prisma.$transaction([
    prisma.scene.update({
      where: { id: sceneId },
      data: {
        clipUrl: url,
        clipProvider: 'kling',
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
      },
    }),
    ...buildCreditMutationOps(prisma, {
      userId,
      amount: -charge,
      reason: isFirstRegen ? 'first_regen_free:scene_clip' : 'spent:scene_clip',
      ref: sceneId,
      metadata: {
        previousCount,
        routing,
        i2vModel: i2vResult.modelUsed,
        audioMuxed,
        lipSyncSkipReason,
      },
    }),
    prisma.asset.create({
      data: {
        projectId,
        type: 'avatar_video',
        provider: 'kling',
        url,
        durationSeconds: finalDuration,
        metadata: {
          sceneId: scene.id,
          sceneOrder: scene.sceneOrder,
          routing,
          audioMuxed,
          stageA: {
            provider: 'kling',
            model: i2vResult.modelUsed,
            taskId: i2vResult.providerJobId,
            costUsd: priceKling(klingPricingKeyForModel(i2vResult.modelUsed)),
          },
          stageB:
            lipSyncTaskId != null
              ? {
                  provider: 'kling',
                  model: process.env.KLING_LIPSYNC_MODEL ?? 'kling-lip-sync-v1',
                  taskId: lipSyncTaskId,
                }
              : null,
          lipSyncSkipReason,
          motionPrompt: { positive: motionPrompt.positive, negative: motionPrompt.negative },
        },
      },
    }),
  ]);

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

    // Pick the provider FIRST — different providers need URLs in
    // different shapes:
    //   - Kling / Sync.so: fetch the URL server-side → need a real
    //     public HTTPS URL (toPublicUrl + cloudflared tunnel).
    //   - PixVerse: uploads bytes via multipart → can resolve local
    //     /uploads paths from disk directly. Skip toPublicUrl so the
    //     provider doesn't depend on the tunnel being up.
    const projectData = scene.script.project.productData as Record<string, unknown> | null;
    const projectOverride =
      projectData && typeof projectData.lipsyncProvider === 'string'
        ? (projectData.lipsyncProvider as string)
        : null;
    const lipsyncProvider = projectOverride
      ? getLipSyncProviderByName(projectOverride)
      : getActiveLipSyncProvider();
    const providerNeedsPublicUrls =
      lipsyncProvider.name === 'kling' || lipsyncProvider.name === 'sync';

    let videoPublicUrl: string;
    let audioPublicUrl: string;
    if (providerNeedsPublicUrls) {
      try {
        videoPublicUrl = toPublicUrl(scene.clipUrl);
        audioPublicUrl = toPublicUrl(scene.voiceUrl);
      } catch (err) {
        if (err instanceof PublicUrlError) {
          return {
            success: false,
            error: `${err.message}. הפעל את cloudflared tunnel והגדר PUBLIC_BASE_URL.`,
            configError: true,
          };
        }
        throw err;
      }
    } else {
      // PixVerse / mock: pass local paths directly. The provider's
      // resolveToBytes handles disk I/O.
      videoPublicUrl = scene.clipUrl;
      audioPublicUrl = scene.voiceUrl;
    }

    const startedAt = Date.now();
    const callId = await recordApiCallStart({
      provider: lipsyncProvider.name,
      operation: 'lipsync',
      model: process.env.KLING_LIPSYNC_MODEL ?? 'lipsync-v1',
      units: 1,
      userId,
      projectId,
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
      await recordApiCallComplete(callId, {
        success: true,
        model: lsResult.modelUsed,
        costUsd: priceLipSync(lsResult.providerName, scene.clipDurationSeconds ?? 5),
        units: 1,
        durationMs: Date.now() - startedAt,
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
