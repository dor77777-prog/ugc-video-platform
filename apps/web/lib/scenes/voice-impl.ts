// Shared voice-generation core. Both the per-scene server action
// (`useActionState`) and the parallel-friendly Route Handler (the batch
// "Generate all voices" loop) call into this. Mirrors the pattern in
// generate-impl.ts (scene image generation).

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { findVoicePreset } from '@/lib/voice/voice-presets';
import {
  generateHebrewVoiceover,
  VoiceConfigError,
  VoiceTimeoutError,
} from '@/lib/voice/elevenlabs';
import { getStorage } from '@/lib/storage';
import { recordApiCallStart, recordApiCallComplete } from '@/lib/usage/log';
import { logStage, flushSceneLogBuffer } from '@/lib/logging/log';
import { priceElevenLabsTts } from '@/lib/usage/pricing';
import { attributeElevenLabsTtsCost } from '@/lib/usage/cost-attribution';
import {
  buildCreditMutationOps,
  invalidateUserCacheAfterCreditMutation,
} from '@/lib/usage/credits';
import { checkRateLimit, RateLimitedError } from '@/lib/usage/rate-limit';
import { checkSpendCap, SpendCapExceededError } from '@/lib/usage/spend-cap';
import { PER_OPERATION_CREDITS, FIRST_REGEN_FREE } from '@/lib/plans';
import { charactersToWords, chunkCaptions } from '@ugc-video/shared';

const COST_PER_VOICE = PER_OPERATION_CREDITS.voice; // 1 credit (gen or regen)

export interface GenerateVoiceResult {
  success: boolean;
  error?: string;
  needsCredits?: boolean;
  needsVoiceSelection?: boolean; // project hasn't picked a voiceId yet
  configError?: boolean;
  timedOut?: boolean;
  rateLimited?: boolean;
  spendCapExceeded?: boolean;
  freeRegen?: boolean;
  voiceUrl?: string;
  durationSeconds?: number;
}

export async function generateSceneVoiceImpl(
  sceneId: string,
  userId: string,
): Promise<GenerateVoiceResult> {
  const scene = await prisma.scene.findUnique({
    where: { id: sceneId },
    include: {
      script: {
        include: {
          project: {
            select: { id: true, productData: true, userId: true },
          },
        },
      },
    },
  });
  if (!scene) return { success: false, error: 'הסצנה לא נמצאה' };
  if (scene.script.project.userId !== userId) return { success: false, error: 'אין הרשאה' };

  // ── In-flight guard ────────────────────────────────────────────────────
  // Refuse to start a duplicate voice gen if one is still running. ElevenLabs
  // calls are short (3-5s typical) so we use a tighter TTL than clip.
  const VOICE_IN_FLIGHT_TTL_MS = 2 * 60 * 1000;
  const sceneAny = scene as unknown as { voiceInFlightAt?: Date | null };
  if (
    sceneAny.voiceInFlightAt &&
    Date.now() - sceneAny.voiceInFlightAt.getTime() < VOICE_IN_FLIGHT_TTL_MS
  ) {
    return {
      success: false,
      error: 'יצירת voice-over כבר רצה לסצנה הזו. רענן ועקוב אחרי הספינר.',
      rateLimited: true,
    };
  }

  // Pre-flight: rate-limit + daily spend cap.
  try {
    await checkRateLimit(userId, 'tts');
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

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditsBalance: true },
  });
  if (!dbUser) return { success: false, error: 'משתמש לא נמצא' };
  if (dbUser.creditsBalance < COST_PER_VOICE) {
    return { success: false, error: 'אין מספיק קרדיטים', needsCredits: true };
  }

  // Mark in-flight + transition to generating_voice. Clearing
  // lastErrorCode/Message means the wizard's error panel disappears
  // as soon as a regen fires; the next failure repopulates it.
  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      voiceInFlightAt: new Date(),
      status: 'generating_voice',
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  try {
    return await generateSceneVoiceImplInner(sceneId, userId, scene);
  } finally {
    await prisma.scene
      .update({ where: { id: sceneId }, data: { voiceInFlightAt: null } })
      .catch(() => {/* best effort */});
    // V13 PR7.2 — flush the per-scene log buffer.
    await flushSceneLogBuffer(sceneId, prisma);
  }
}

async function loadSceneForVoice(sceneId: string) {
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
type VoiceSceneType = NonNullable<Awaited<ReturnType<typeof loadSceneForVoice>>>;

async function generateSceneVoiceImplInner(
  sceneId: string,
  userId: string,
  scene: VoiceSceneType,
): Promise<GenerateVoiceResult> {
  const project = scene.script.project;
  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const voicePresetId = typeof data.voiceId === 'string' ? data.voiceId : null;
  const preset = findVoicePreset(voicePresetId);
  if (!preset) {
    return {
      success: false,
      error: 'עדיין לא נבחר קול לפרויקט. בחר קול בראש העמוד לפני שמייצרים voice-over.',
      needsVoiceSelection: true,
    };
  }

  // Use the TTS-optimized text if the LLM supplied one (numbers spelled
  // out etc). Otherwise the spoken text. Either is in Hebrew.
  const text = (scene.textHebrewTts ?? scene.textHebrew).trim();
  if (!text) {
    return { success: false, error: 'טקסט הסצנה ריק — אין מה להקריא.' };
  }

  const voiceLog = logStage('voice', sceneId);
  let result;
  const ttsStartedAt = Date.now();
  voiceLog.info('calling elevenlabs', {
    voiceId: preset.voiceId,
    chars: text.length,
    withTimestamps: true,
  });
  const ttsCallId = await recordApiCallStart({
    provider: 'elevenlabs',
    operation: 'tts',
    model: 'eleven_v3',
    units: text.length,
    estimatedCostUsd: priceElevenLabsTts('eleven_v3', text.length),
    userId,
    projectId: project.id,
    sceneId,
    metadata: { characters: text.length, voiceId: preset.voiceId },
  });
  try {
    result = await generateHebrewVoiceover({
      text,
      voiceId: preset.voiceId,
      performanceNote: scene.performanceNote ?? null,
      // Hard-pin to eleven_v3 — only model in the ElevenLabs lineup that
      // actually supports Hebrew. Passing it here (not via env) defeats
      // Next.js dev-server env caching that previously kept us silently
      // on the multilingual_v2 default = gibberish output.
      modelId: 'eleven_v3',
      // V10 captions — request the with-timestamps endpoint so we get
      // per-character alignment back. Same billed cost; the chunker
      // converts characters → words → phrase chunks below. If
      // ElevenLabs ever fails to return alignment we still get usable
      // audio + duration; captions for that scene get skipped at
      // render time (we never fall back to proportional estimation).
      withTimestamps: true,
    });
  } catch (err) {
    const errMsg = (err as Error).message;
    const durationMs = Date.now() - ttsStartedAt;
    await recordApiCallComplete(ttsCallId, {
      success: false,
      errorMessage: errMsg,
      durationMs,
    });
    const writeFailure = async (code: string) => {
      await prisma.scene
        .update({
          where: { id: sceneId },
          data: { status: 'failed', lastErrorCode: code, lastErrorMessage: errMsg },
        })
        .catch(() => {/* best effort */});
    };
    if (err instanceof VoiceConfigError) {
      voiceLog.error('config error', { errMsg, durationMs });
      await writeFailure('voice.config');
      return { success: false, error: err.message, configError: true };
    }
    if (err instanceof VoiceTimeoutError) {
      voiceLog.error('timed out', { durationMs });
      await writeFailure('voice.elevenlabs_timeout');
      return {
        success: false,
        error: 'ElevenLabs לא הגיב בזמן. נסה שוב.',
        timedOut: true,
      };
    }
    voiceLog.error('failed', { errMsg, durationMs });
    // Detect character-limit responses by message; ElevenLabs surfaces
    // them as 401 with a specific body. Fall back to generic on misses.
    const code = /character.{0,8}limit|quota/i.test(errMsg)
      ? 'voice.character_limit'
      : 'voice.config';
    await writeFailure(code);
    return { success: false, error: `יצירת הקול נכשלה: ${errMsg}` };
  }

  // V13.2 — actual cost comes from real character count; metadata
  // captures the audio bytes + alignment chars so /admin/scenes/[id]/debug
  // and the recent-calls table can drill down without re-fetching.
  const ttsAttribution = attributeElevenLabsTtsCost({
    model: result.model,
    characters: text.length,
  });
  await recordApiCallComplete(ttsCallId, {
    success: true,
    model: result.model,
    costUsd: ttsAttribution.costUsd,
    estimatedCostUsd: ttsAttribution.estimatedCostUsd,
    actualCostUsd: ttsAttribution.actualCostUsd,
    // Characters is the metered unit on ElevenLabs ($0.10/1K for v2/v3,
    // $0.05/1K for Flash/Turbo). Stored in `units` so the admin dashboard
    // can show it alongside cost as "X chars" per call.
    units: text.length,
    durationMs: Date.now() - ttsStartedAt,
    metadata: {
      ...ttsAttribution.metadata,
      audioBytes: result.audioBytes.byteLength,
      alignmentChars: result.characterTimings?.length ?? 0,
      durationSeconds: result.durationSeconds,
      source: ttsAttribution.source,
    },
  });

  voiceLog.info('elevenlabs returned', {
    model: result.model,
    audioBytes: result.audioBytes.byteLength,
    alignmentChars: result.characterTimings?.length ?? 0,
    durationSeconds: result.durationSeconds,
    durationMs: Date.now() - ttsStartedAt,
  });

  // Persist MP3 to storage.
  const storage = await getStorage();
  const filename = `${scene.id}-${Date.now()}.mp3`;
  const { url } = await storage.putBytes({
    folder: `voice/${project.id}`,
    filename,
    data: result.audioBytes,
    contentType: 'audio/mpeg',
  });
  voiceLog.info('persisted', { url });

  // V6: voice keeps first-regen-free policy via FIRST_REGEN_FREE map.
  // (image + voice keep this UX; clips dropped it for margin reasons.)
  const prevVoiceCount = scene.voiceGenerationCount ?? 0;
  const isFirstRegen = prevVoiceCount === 1 && FIRST_REGEN_FREE.voice;
  const charge = isFirstRegen ? 0 : COST_PER_VOICE;

  // V10 captions — convert character timings into Hebrew word timings,
  // then phrase-level caption chunks. Stored on Scene so the worker
  // can build a global ASS file at render time without re-calling
  // ElevenLabs. When alignment is missing (rare) we leave both columns
  // null — the worker treats null as "skip captions for this scene"
  // rather than fall back to proportional timing.
  const wordTimings = result.characterTimings
    ? charactersToWords(result.characterTimings)
    : [];
  const captionChunks = wordTimings.length > 0 ? chunkCaptions(wordTimings) : [];

  await prisma.$transaction([
    prisma.scene.update({
      where: { id: sceneId },
      data: {
        voiceUrl: url,
        voiceProvider: 'elevenlabs',
        voiceGeneratedAt: new Date(),
        voiceDurationSeconds: result.durationSeconds,
        voiceGenerationCount: { increment: 1 },
        wordTimingsJson:
          wordTimings.length > 0
            ? (wordTimings as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        captionChunksJson:
          captionChunks.length > 0
            ? (captionChunks as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        captionsGeneratedAt: captionChunks.length > 0 ? new Date() : null,
        // V13 PR7.1 — voice stage succeeded; clear any prior error.
        status: 'voice_ready',
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    }),
    ...buildCreditMutationOps(prisma, {
      userId,
      amount: -charge,
      reason: isFirstRegen ? 'first_regen_free:scene_voice' : 'spent:scene_voice',
      ref: sceneId,
      metadata: { previousCount: prevVoiceCount, voicePresetId: preset.id, model: result.model },
    }),
    prisma.asset.create({
      data: {
        projectId: project.id,
        type: 'voice_audio',
        provider: 'elevenlabs',
        url,
        durationSeconds: result.durationSeconds,
        metadata: {
          sceneId: scene.id,
          sceneOrder: scene.sceneOrder,
          model: result.model,
          voicePresetId: preset.id,
          voiceSettings: { ...result.voiceSettings },
        } as object,
      },
    }),
  ]);
  // V14.2-A — drop cached User row so the new creditsBalance is fetched fresh.
  invalidateUserCacheAfterCreditMutation(userId);

  return {
    success: true,
    voiceUrl: url,
    durationSeconds: result.durationSeconds,
    freeRegen: isFirstRegen,
  };
}
