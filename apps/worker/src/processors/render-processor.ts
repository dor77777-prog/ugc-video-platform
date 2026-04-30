import type { Job } from 'bullmq';
import { RenderJobStatus, AssetType, type Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { RenderJobPayload } from '../queue';
import { ffmpegCompositionProvider } from '../providers/composition/ffmpeg';
// The worker's tsconfig uses `Node` moduleResolution which doesn't read
// package.json `exports` subpaths — pull from the package root, which
// re-exports the music module from packages/shared/src/index.ts.
import {
  selectMusicTrack,
  resolveMusicVolume,
  findTrackById,
  listSafeFallbackTracks,
  type MusicProfile,
  buildAssFromChunks,
  type CaptionChunk,
  type CaptionsMode,
  type CaptionPresetId,
  type WordTiming,
  findCaptionPreset,
  DEFAULT_CAPTION_PRESET_ID,
} from '@ugc-video/shared';

// V3 render processor: composition-only.
//
// Step 5 of the wizard now generates per-scene voice (ElevenLabs) and per-
// scene clip (Kling i2v + lipsync) live, before the user enqueues a final
// render. By the time we get here, every Scene already has imageUrl,
// voiceUrl, and clipUrl set. The worker's only job is to concat those
// clips, burn RTL Hebrew captions, optionally mix in background music, and
// publish the final MP4 + Asset row.
//
// Old per-scene voice / avatar / b-roll stages are removed — they were
// never integrated end-to-end (mock providers only) and don't fit the
// new live-preview flow.

export async function processRenderJob(job: Job<RenderJobPayload>) {
  const { renderJobId } = job.data;
  // V14 PR9.3 marker — printed at every render start. The SHA suffix
  // shows the exact source commit Railway built from. If this SHA does
  // NOT match the latest commit on origin/main, Railway's GitHub
  // integration is stale and the fix is to disconnect+reconnect the
  // repo in Settings → Source.
  const sha = (process.env.RAILWAY_GIT_COMMIT_SHA ?? 'unknown').slice(0, 8);
  console.log(`[render] V14-PR9.3 sha=${sha} starting job ${renderJobId}`);

  const renderJob = await prisma.renderJob.findUnique({
    where: { id: renderJobId },
    include: {
      script: { include: { scenes: { orderBy: { sceneOrder: 'asc' } } } },
      project: true,
    },
  });

  if (!renderJob) {
    throw new Error(`RenderJob ${renderJobId} not found`);
  }

  try {
    // Step 1 — gather assets (verify all scenes have a clip).
    await advance(renderJobId, RenderJobStatus.extracting_assets, 10, job);
    const scenes = renderJob.script.scenes;
    const missingClip = scenes.filter((s) => !s.clipUrl);
    if (missingClip.length > 0) {
      throw new Error(
        `Scenes missing animated clips: ${missingClip
          .map((s) => `#${s.sceneOrder + 1}`)
          .join(', ')}`,
      );
    }

    // Step 2 — composition (concat + optional captions/music).
    await advance(renderJobId, RenderJobStatus.composing_video, 50, job);

    // ── Background music selection ──────────────────────────────────────
    // Honor the Step-1 toggle (`productData.backgroundMusic`). When on,
    // we let the LLM-emitted `music_profile` from the selected script
    // drive auto-selection of a local track from
    // apps/web/public/music/. The selector falls back to a safe
    // low-energy generic UGC bed if nothing scores strongly.
    //
    // The composer loops + trims the picked track to the final video
    // duration, applies a 300ms fade-in, mixes at low volume, and
    // closes with a 2s fade-out — see ffmpeg.ts.
    const productData =
      (renderJob.project.productData as Record<string, unknown> | null) ?? null;
    const userEnabledMusic = productData?.backgroundMusic === true;
    const productCategory =
      (productData?.productCategory as string | undefined) ??
      (productData?.category as string | undefined) ??
      null;
    const scriptRaw =
      (renderJob.script.rawJson as Record<string, unknown> | null) ?? null;
    const musicProfile =
      (scriptRaw?.musicProfile as MusicProfile | null) ?? null;
    const emotionalTrigger =
      ((scriptRaw?.creativeStrategy as Record<string, unknown> | null)
        ?.emotionalTrigger as string | undefined) ?? null;
    const durationMode: '15s' | '30s' =
      renderJob.script.estimatedDurationSeconds <= 22 ? '15s' : '30s';

    // V14 PR9 — user-overridden music selection. When the user picks a
    // track explicitly via /projects/[id]/videos MusicPicker, the
    // selection lives on productData.selectedMusicId + .musicStartOffsetSec.
    // The override skips selectMusicTrack() entirely so the user's pick
    // wins regardless of script musicProfile / category / emotional arc.
    const userPickedTrackId =
      typeof productData?.selectedMusicId === 'string'
        ? (productData.selectedMusicId as string)
        : null;
    const userPickedOffsetSec =
      typeof productData?.musicStartOffsetSec === 'number'
        ? Math.max(0, productData.musicStartOffsetSec as number)
        : 0;

    // V14 hotfix #2 — three-tier music resolution with explicit
    // logging at every branch. The user reported renders coming out
    // silent EVEN AT offset=0 with valid catalog tracks selected,
    // which the previous logic shouldn't have allowed. Adding
    // diagnostics + an ultimate fallback so a music render NEVER
    // ships silent when the toggle is on.
    //
    //   Tier 1 — user-pick: productData.selectedMusicId resolves via
    //            findTrackById to a valid catalog entry. Use it.
    //   Tier 2 — auto-select: selectMusicTrack picks based on script
    //            musicProfile + productCategory + duration mode.
    //   Tier 3 — safe fallback: listSafeFallbackTracks() returns
    //            general-UGC-safe tracks. Pick the first one. Beats
    //            shipping a render with no music when the user
    //            explicitly enabled it.
    const userPickedTrack = userPickedTrackId
      ? findTrackById(userPickedTrackId)
      : null;
    if (userPickedTrackId && !userPickedTrack) {
      console.warn(
        `[render-music] selectedMusicId="${userPickedTrackId}" NOT IN CATALOG — ` +
          `falling through to auto-select`,
      );
    }
    let musicSelection: ReturnType<typeof selectMusicTrack> = null;
    if (userPickedTrack) {
      console.log(
        `[render-music] tier-1 user-pick: ${userPickedTrack.id} ` +
          `(fileUrl=${userPickedTrack.fileUrl})`,
      );
      musicSelection = {
        track: userPickedTrack,
        score: 1,
        reason: 'user_override',
      } as ReturnType<typeof selectMusicTrack>;
    } else if (userEnabledMusic) {
      const auto = selectMusicTrack({
        productCategory,
        scriptFramework: renderJob.script.framework ?? null,
        emotionalTrigger,
        musicProfile,
        durationMode,
        userEnabledMusic,
      });
      if (auto) {
        console.log(
          `[render-music] tier-2 auto-select: ${auto.track.id} ` +
            `(score=${auto.score}, reason=${auto.reason})`,
        );
        musicSelection = auto;
      } else {
        // Tier 3 — safe fallback. Should be rare but never ship silent.
        const safe = listSafeFallbackTracks();
        const fallback = safe[0];
        if (fallback) {
          console.warn(
            `[render-music] tier-3 SAFE FALLBACK: ${fallback.id} ` +
              `(auto-select returned null; bg music toggle is ON so we MUST ship music)`,
          );
          musicSelection = {
            track: fallback,
            score: 0,
            reason: 'safe_fallback',
          } as ReturnType<typeof selectMusicTrack>;
        } else {
          console.error(
            `[render-music] no tracks available — listSafeFallbackTracks returned empty. ` +
              `Render will be silent. Investigate the catalog.`,
          );
        }
      }
    } else {
      console.log('[render-music] backgroundMusic toggle OFF — rendering voice-only');
    }
    const musicVolume = userEnabledMusic ? resolveMusicVolume(musicProfile) : 0.08;
    let musicUrl: string | null = musicSelection?.track.fileUrl ?? null;
    // The user's offset is only meaningful when their track resolves —
    // a stale pick that fell back to auto-select uses offset=0 (auto
    // tracks haven't been previewed; the user couldn't have chosen
    // a meaningful offset for them).
    let musicStartOffsetSec = userPickedTrack ? userPickedOffsetSec : 0;

    // V14 PR9.3 — runtime URL probe. Even if the catalog is up-to-date in
    // git, a deployed Worker might be running an older bundle whose
    // catalog still references a track that has since been deleted from
    // R2 (HTTP 404). Probing the URL with HEAD before composing means a
    // stale catalog never produces a silent render: we iterate through
    // safe-fallback tracks until one returns 200 OK.
    if (musicUrl && musicSelection) {
      const probeStart = Date.now();
      const head = await fetch(musicUrl, { method: 'HEAD' }).catch(
        (err) => ({ ok: false, status: 0, statusText: String(err) }) as Response,
      );
      if (!head.ok) {
        console.warn(
          `[render-music] picked track ${musicSelection.track.id} returned ` +
            `HTTP ${head.status} (${head.statusText}) on HEAD — probing fallbacks`,
        );
        const candidates = listSafeFallbackTracks().filter(
          (t) => t.id !== musicSelection!.track.id,
        );
        let healed = false;
        for (const cand of candidates) {
          const r = await fetch(cand.fileUrl, { method: 'HEAD' }).catch(
            () => ({ ok: false, status: 0 }) as Response,
          );
          if (r.ok) {
            console.log(
              `[render-music] healed via runtime probe: ${cand.id} ` +
                `(replaces stale ${musicSelection.track.id}, took ${Date.now() - probeStart}ms)`,
            );
            musicSelection = {
              track: cand,
              score: 0,
              reason: 'runtime_probe_heal',
            } as ReturnType<typeof selectMusicTrack>;
            musicUrl = cand.fileUrl;
            // Falling back from user pick → offset is meaningless on a
            // different track. Reset to 0.
            musicStartOffsetSec = 0;
            healed = true;
            break;
          }
        }
        if (!healed) {
          console.error(
            `[render-music] runtime probe found NO usable tracks — shipping silent. ` +
              `Investigate the R2 music catalog vs music-library.ts in the running bundle.`,
          );
          musicSelection = null;
          musicUrl = null;
        }
      }
    }

    if (musicSelection) {
      console.log(
        `[render] music selected: ${musicSelection.track.id} ` +
          `(score=${musicSelection.score}, ${musicSelection.reason}, ` +
          `offset=${musicStartOffsetSec.toFixed(2)}s)`,
      );
    } else if (userEnabledMusic) {
      console.log('[render] music enabled but no track matched — rendering voice-only');
    }

    // ── Captions (V10) ─────────────────────────────────────────────────
    // The Step-1 toggle (`productData.captions`) is the master switch.
    // When enabled, we build a global ASS file from the per-scene
    // word/caption chunks that voice-impl persisted (sourced from
    // ElevenLabs' with-timestamps endpoint — real per-character
    // alignment). If a scene is missing chunks (e.g. older voice gen,
    // or alignment failed) we EXCLUDE that scene from captions rather
    // than fall back to proportional timing — the previous V3
    // proportional captions were the bug we're explicitly removing.
    //
    // Mode: 'phrase' is the default and only wired mode for now.
    // 'word_highlight' is reserved (would change the chunker config
    // upstream + add per-word highlight overrides here).
    const captionsRequested = productData?.captions === true;
    const captionsModeFromEnv =
      (process.env.CAPTIONS_MODE as CaptionsMode | undefined) ?? 'phrase';
    const captionsMode: CaptionsMode = captionsRequested
      ? captionsModeFromEnv
      : 'off';

    let captionsAssContent: string | null = null;
    let captionWarnings: string[] = [];
    let totalCaptionChunks = 0;
    let perSceneCaptionCount: Array<{ sceneId: string; count: number }> = [];
    let timingSource: 'elevenlabs_timestamps' | 'forced_alignment' | 'none' = 'none';

    // V12 — read the user-selected caption style preset off the
    // project. Default to 'classic' when not set or invalid.
    const captionsPresetId =
      ((productData?.captionsPreset as CaptionPresetId | undefined) ??
        DEFAULT_CAPTION_PRESET_ID) as CaptionPresetId;
    const captionsPreset = findCaptionPreset(captionsPresetId);
    console.log(
      `[render] captions: enabled=${captionsRequested} presetId=${captionsPresetId} ` +
        `(productData.captionsPreset=${productData?.captionsPreset ?? 'undefined'}) ` +
        `presetLabel=${captionsPreset.labelHe} perWord=${captionsPreset.perWord}`,
    );

    if (captionsMode !== 'off') {
      const globalChunks: CaptionChunk[] = [];
      const globalWords: Array<
        WordTiming & { globalStartMs: number; globalEndMs: number; sceneId: string }
      > = [];
      let cumulativeMs = 0;
      for (const s of scenes) {
        const sceneClipDurationSec = s.clipDurationSeconds ?? s.durationSeconds ?? 5;
        const sceneClipDurationMs = Math.round(sceneClipDurationSec * 1000);
        const raw =
          (s as unknown as { captionChunksJson?: unknown }).captionChunksJson ?? null;
        const sceneChunks = parseCaptionChunks(raw);
        if (!sceneChunks || sceneChunks.length === 0) {
          captionWarnings.push(
            `scene ${s.sceneOrder + 1} (${s.id}): no caption chunks — skipping`,
          );
          perSceneCaptionCount.push({ sceneId: s.id, count: 0 });
        } else {
          // Validate + offset to global timeline.
          for (const c of sceneChunks) {
            if (c.endMs <= c.startMs) {
              captionWarnings.push(`scene ${s.sceneOrder + 1}: invalid chunk window — dropped`);
              continue;
            }
            const globalStartMs = cumulativeMs + Math.max(0, c.startMs);
            // Hard cap: never let a caption extend past the scene clip's
            // end on the global timeline (the audio probe was
            // occasionally a few ms longer than the rendered clip).
            const globalEndMs = Math.min(
              cumulativeMs + sceneClipDurationMs,
              cumulativeMs + Math.max(0, c.endMs),
            );
            if (globalEndMs <= globalStartMs) continue;
            globalChunks.push({
              ...c,
              sceneId: s.id,
              globalStartMs,
              globalEndMs,
            });
          }
          perSceneCaptionCount.push({ sceneId: s.id, count: sceneChunks.length });
        }

        // V12 — also collect per-word timings for the word_pop preset.
        // The same scene-relative → global offset rule applies.
        if (captionsPreset.perWord) {
          const rawWords =
            (s as unknown as { wordTimingsJson?: unknown }).wordTimingsJson ?? null;
          const sceneWords = parseWordTimings(rawWords);
          if (sceneWords) {
            for (const w of sceneWords) {
              if (w.endMs <= w.startMs) continue;
              const globalStartMs = cumulativeMs + Math.max(0, w.startMs);
              const globalEndMs = Math.min(
                cumulativeMs + sceneClipDurationMs,
                cumulativeMs + Math.max(0, w.endMs),
              );
              if (globalEndMs <= globalStartMs) continue;
              globalWords.push({
                word: w.word,
                startMs: w.startMs,
                endMs: w.endMs,
                globalStartMs,
                globalEndMs,
                sceneId: s.id,
              });
            }
          }
        }
        cumulativeMs += sceneClipDurationMs;
      }

      const hasUsableData = captionsPreset.perWord
        ? globalWords.length > 0
        : globalChunks.length > 0;
      if (hasUsableData) {
        timingSource = 'elevenlabs_timestamps';
        totalCaptionChunks = captionsPreset.perWord
          ? globalWords.length
          : globalChunks.length;
        // Bias higher when ANY scene wants the mouth visible
        // (lipsync) or focuses on a low-frame product. Coarse:
        // boost the bottom margin globally if the script has any
        // such scene.
        const lipSyncSceneExists = scenes.some(
          (s) =>
            (s as unknown as { requiresLipSync?: boolean | null }).requiresLipSync === true,
        );
        const productLowExists = scenes.some(
          (s) =>
            (s as unknown as { cameraFocus?: string | null }).cameraFocus === 'product',
        );
        const marginBoostPx = lipSyncSceneExists || productLowExists ? 40 : 0;
        captionsAssContent = buildAssFromChunks(globalChunks, {
          videoWidth: 1080,
          videoHeight: 1920,
          marginBoostPx,
          mode: captionsMode,
          presetId: captionsPresetId,
          wordTimings: captionsPreset.perWord ? globalWords : undefined,
        });
        console.log(
          `[render] ASS built — preset=${captionsPresetId} ` +
            `events=${captionsPreset.perWord ? globalWords.length : globalChunks.length} ` +
            `assBytes=${captionsAssContent.length} ` +
            `firstLineSnippet="${captionsAssContent.split('\n').find((l) => l.startsWith('Style:'))?.slice(0, 120) ?? '(no Style line)'}"`,
        );
      } else {
        captionsAssContent = null;
        captionWarnings.push(
          captionsPreset.perWord
            ? 'word_pop preset selected but no usable word timings across any scene — skipping'
            : 'captions enabled but no usable chunks across any scene — skipping',
        );
      }
    }

    const enableCaptions = !!captionsAssContent;

    const composition = await ffmpegCompositionProvider.compose({
      avatarVideoUrl: '', // unused in the new flow
      voiceUrls: scenes.map((s) => s.voiceUrl ?? ''),
      brollUrls: scenes.map((s) => s.clipUrl ?? ''),
      captions: scenes.map((s) => s.onScreenCaptionHebrew || s.textHebrew),
      aspectRatio: '9:16',
      musicUrl,
      musicVolume,
      musicStartOffsetSec,
      musicFadeOutDurationMs: 2000,
      musicFadeInDurationMs: 300,
      enableCaptions,
      captionsAssContent,
      scenes: scenes.map((s) => ({
        clipUrl: s.clipUrl!,
        // The legacy `caption` field is kept empty because the V10 ASS
        // file is built upstream from real word timings — feeding the
        // legacy proportional path would double-build captions.
        caption: '',
        voiceDurationSeconds: s.voiceDurationSeconds ?? null,
        durationSeconds: s.clipDurationSeconds ?? s.durationSeconds ?? 5,
      })),
    });

    // Step 3 — upload final + persist Asset.
    await advance(renderJobId, RenderJobStatus.uploading_final, 90, job);
    await prisma.asset.create({
      data: {
        projectId: renderJob.projectId,
        renderJobId: renderJob.id,
        type: AssetType.final_video,
        provider: composition.provider,
        url: composition.finalVideoUrl,
        durationSeconds: composition.durationSeconds,
      },
    });

    // Build a music debug payload so admin / forensics can see what was
    // picked, why, and at what volume — without re-running the selector.
    const finalDurationSec = composition.durationSeconds;
    const musicDebug: Record<string, unknown> = musicSelection
      ? {
          musicEnabled: true,
          selectedMusicTrackId: musicSelection.track.id,
          selectedMusicTitle: musicSelection.track.title,
          selectedMusicFileUrl: musicSelection.track.fileUrl,
          musicSource: musicSelection.track.source,
          musicLicense: musicSelection.track.license,
          attributionRequired: musicSelection.track.attributionRequired,
          musicVolume,
          musicFadeInDurationMs: 300,
          musicFadeOutDurationMs: 2000,
          musicTrimmedToDurationMs: Math.round(finalDurationSec * 1000),
          musicLooped: true,
          musicSelectionReason: musicSelection.reason,
          musicSelectionScore: musicSelection.score,
          musicProfile,
        }
      : {
          musicEnabled: userEnabledMusic,
          selectedMusicTrackId: null,
          musicSelectionReason: userEnabledMusic
            ? 'no track scored above threshold'
            : 'user disabled music',
        };

    const captionsDebug: Record<string, unknown> = {
      captionsEnabled: enableCaptions,
      captionsMode,
      captionsPresetId,
      captionsPresetLabel: captionsPreset.labelHe,
      perWord: captionsPreset.perWord,
      timingSource,
      totalCaptionChunks,
      perSceneCaptionCount,
      fontUsed: captionsPreset.fontFamily,
      warnings: captionWarnings,
    };

    // Done.
    await prisma.renderJob.update({
      where: { id: renderJobId },
      data: {
        status: RenderJobStatus.completed,
        progressPercent: 100,
        finalVideoUrl: composition.finalVideoUrl,
        completedAt: new Date(),
        providerPayloadJson: {
          music: musicDebug,
          captions: captionsDebug,
        } as Prisma.InputJsonValue,
      },
    });
    await job.updateProgress(100);

    console.log(`[render] job ${renderJobId} completed → ${composition.finalVideoUrl}`);
    return { finalVideoUrl: composition.finalVideoUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[render] job ${renderJobId} failed: ${message}`);
    await prisma.renderJob.update({
      where: { id: renderJobId },
      data: { status: RenderJobStatus.failed, errorMessage: message },
    });
    throw err;
  }
}

// Defensive parser for Scene.wordTimingsJson. Mirrors the chunk parser
// below — only used when the active preset is perWord.
function parseWordTimings(raw: unknown): WordTiming[] | null {
  if (!Array.isArray(raw)) return null;
  const out: WordTiming[] = [];
  for (const r of raw) {
    if (
      r &&
      typeof r === 'object' &&
      typeof (r as { word?: unknown }).word === 'string' &&
      typeof (r as { startMs?: unknown }).startMs === 'number' &&
      typeof (r as { endMs?: unknown }).endMs === 'number'
    ) {
      const o = r as { word: string; startMs: number; endMs: number };
      out.push({ word: o.word, startMs: o.startMs, endMs: o.endMs });
    }
  }
  return out.length > 0 ? out : null;
}

// Defensive parser for Scene.captionChunksJson — the column is JSONB
// and could be null / empty / malformed if a scene predates V10 or
// alignment failed. Returns null instead of throwing so the renderer
// silently skips captions for that scene.
function parseCaptionChunks(raw: unknown): CaptionChunk[] | null {
  if (!Array.isArray(raw)) return null;
  const out: CaptionChunk[] = [];
  for (const r of raw) {
    if (
      r &&
      typeof r === 'object' &&
      typeof (r as { text?: unknown }).text === 'string' &&
      typeof (r as { startMs?: unknown }).startMs === 'number' &&
      typeof (r as { endMs?: unknown }).endMs === 'number'
    ) {
      const obj = r as {
        text: string;
        startMs: number;
        endMs: number;
        lineCount?: number;
        wordCount?: number;
      };
      out.push({
        text: obj.text,
        startMs: obj.startMs,
        endMs: obj.endMs,
        lineCount: typeof obj.lineCount === 'number' ? obj.lineCount : 1,
        wordCount: typeof obj.wordCount === 'number' ? obj.wordCount : 0,
      });
    }
  }
  return out.length > 0 ? out : null;
}

async function advance(
  jobId: string,
  status: RenderJobStatus,
  progress: number,
  bullJob: Job,
) {
  await prisma.renderJob.update({
    where: { id: jobId },
    data: { status, progressPercent: progress },
  });
  await bullJob.updateProgress(progress);
  console.log(`[render] ${jobId} → ${status} (${progress}%)`);
}
