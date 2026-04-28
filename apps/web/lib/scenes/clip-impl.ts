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
import { toPublicUrl, PublicUrlError } from '@/lib/animation/public-url';
import {
  analyzeSceneForMotion,
  type MotionAnalysis,
} from '@/lib/animation/motion-analysis';
import { getActiveTalkingSceneProvider } from '@/lib/animation/talking-scene';
import { muxVoiceOntoVideo, readUrlAsBuffer, MuxError } from '@/lib/scenes/mux-audio';
import { getStorage } from '@/lib/storage';
import { recordApiCall, recordApiCallStart, recordApiCallComplete } from '@/lib/usage/log';
import { priceKling, klingPricingKeyForModel, priceOpenAiText } from '@/lib/usage/pricing';
import { buildCreditMutationOps } from '@/lib/usage/credits';
import { checkRateLimit, RateLimitedError } from '@/lib/usage/rate-limit';
import { checkSpendCap, SpendCapExceededError } from '@/lib/usage/spend-cap';

const COST_PER_CLIP = 1; // 1 credit per scene clip

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
  // Snap to nearest valid Kling duration.
  const allowed: import('@/lib/animation/types').ClipDurationSeconds[] = requiresLipSync
    ? [3, 4, 5, 6] // talking-head ceiling
    : [3, 4, 5, 6, 7, 8, 9, 10];
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
    select: { creditsBalance: true },
  });
  if (!dbUser) return { success: false, error: 'משתמש לא נמצא' };
  if (dbUser.creditsBalance < COST_PER_CLIP) {
    return { success: false, error: 'אין מספיק קרדיטים', needsCredits: true };
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
        const isFirstRegen = previousCount === 1;
        const charge = isFirstRegen ? 0 : COST_PER_CLIP;

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

  // ── Stage 0 — vision-grounded motion analysis ──────────────────────────
  // Look at the actual rendered scene image and ask gpt-4o-mini what
  // should plausibly move. Without this, Kling gets a generic "hands
  // move with intent" prompt regardless of what's in the frame, and
  // ends up animating only the avatar's blinks. With it, Kling gets
  // ground-truth motion: "the right hand tilts the HydroPure bottle,
  // water flows into the glass, the avatar's gaze follows the pour".
  // ~$0.001-0.005 per scene, ~3-5s latency.
  let motionAnalysis: MotionAnalysis | null = null;
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

  const motionPrompt = buildKlingMotionPrompt({
    cameraDirection: scene.cameraDirection,
    performanceNote: scene.performanceNote,
    sceneType: scene.sceneType,
    requiresLipSync: routing.requiresLipSync,
    sceneGenerationType: routing.sceneGenerationType,
    motionAnalysis,
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
      prompt: motionPrompt,
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
      // Provider abstraction — kling/sync/elevenlabs/mock — selected by
      // LIPSYNC_PROVIDER env. A/B comparison runs through the same
      // abstraction via /api/dev/lipsync-bakeoff.
      const lipsyncProvider = getActiveLipSyncProvider();
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
          costUsd: priceKling('lipsync_5s'), // approximation — Sync etc. priced separately
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

  // First-regen-free: previousCount === 1 means the user already had a
  // clip on this scene (the first successful gen) and is now regenerating
  // for the first time — give it free. Subsequent regens are paid.
  const previousCount = scene.clipGenerationCount ?? 0;
  const isFirstRegen = previousCount === 1;
  const charge = isFirstRegen ? 0 : COST_PER_CLIP;

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
          motionPrompt,
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
