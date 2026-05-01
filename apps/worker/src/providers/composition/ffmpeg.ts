// Local ffmpeg composition provider — replaces the original Creatomate
// plan. Free, no API key, runs on the worker host.
//
// IMPORTANT (2026-04-28): per-scene audio is NOT muxed here anymore.
// Each scene's clipUrl arrives with voice audio already embedded:
//   - lip-sync scenes: Kling LipSync produced video+audio in one file
//   - b-roll scenes:   clip-impl ran a local ffmpeg mux (silent video +
//                      ElevenLabs MP3) right after Kling i2v
// So this provider's job is purely concat + burn captions + (optional)
// background music. No per-scene audio handling.
//
// Pipeline:
//   1. Download all per-scene clip URLs (each has audio) to a temp dir.
//   2. ffmpeg concat-demuxer → single MP4 with continuous audio track.
//   3. Overlay burned-in RTL Hebrew captions per scene.
//   4. (Optional) mix in a background music track at -18 dB.
//   5. Move the final MP4 into apps/web/public/uploads/finals/{projectId}/.
//
// Captions: ASS subtitles with `\an2` and right-to-left ordering. ffmpeg's
// libass renders Hebrew correctly when given a UTF-8 ASS file. We emit a
// single .ass file with one event per scene timed to the cumulative
// duration.

import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  buildAssFromChunks,
  type CaptionChunk,
  type CaptionPresetId,
  type CaptionsMode,
  type WordTiming,
} from '@ugc-video/shared';
import {
  CompositionProvider,
  CompositionInput,
  CompositionOutput,
} from './interface';

interface FfmpegSceneInput {
  clipUrl: string;
  caption: string;
  /** Total scene length (clip duration). The caption window is bounded
   * by voiceDurationSeconds — captions don't linger past the speech. */
  durationSeconds: number;
  voiceDurationSeconds?: number | null;
  /** V26.13 — scene-relative caption chunks. When provided AND the
   *  composer-side ASS rebuild path is taken, these are offset by the
   *  ffprobe-measured cumulative duration of preceding normalized
   *  clips (instead of DB-stored durations which can drift). */
  captionChunks?: CaptionChunk[];
  /** V26.13 — scene-relative word timings. Same offset rule as
   *  captionChunks; used by the `word_pop` preset. */
  wordTimings?: WordTiming[];
  /** Stable scene identifier for telemetry. */
  sceneId?: string;
}

export interface FfmpegCompositionInput extends CompositionInput {
  // Per-scene caption + duration so we can build the ASS file. The legacy
  // CompositionInput uses `captions[]` and per-scene `voiceUrls[]`/`brollUrls[]`;
  // we only need the per-scene clip URLs and durations from the worker now.
  scenes?: FfmpegSceneInput[];
  // Where to write the final mp4 (relative to apps/web/public/uploads/).
  finalsDir?: string;
  /** Optional background music URL (local /uploads/... or remote). When
   * set, ffmpeg loops + trims the track to match the final video and
   * mixes it under the voice at the configured low volume. */
  musicUrl?: string | null;
  /** Linear gain to apply to the music track. Default 0.08. Hard-clamped
   * to [0.04, 0.20] downstream — Hebrew voice MUST stay dominant. */
  musicVolume?: number;
  /** Length of the closing fade-out in milliseconds. Default 2000. The
   * fade ALWAYS lands exactly on the end of the final video; setting
   * this to 0 disables it. */
  musicFadeOutDurationMs?: number;
  /** Length of an optional opening fade-in in milliseconds. Default 300. */
  musicFadeInDurationMs?: number;
  /** V14 PR9 — start the music from this offset (in seconds) into the
   * track instead of from the beginning. Used by the user-driven
   * MusicPicker to pick which part of the track plays. Default 0.
   * Hard-clamped to [0, 600] downstream. */
  musicStartOffsetSec?: number;
  /** When false (default), captions are NOT burned in. The ASS file is
   * still built (cheap) but the ffmpeg pass skips the subtitles filter. */
  enableCaptions?: boolean;
  /** V10 — pre-built ASS subtitle file content. When provided we burn
   * THIS file instead of the legacy proportional captions built from
   * `scenes`. Built by `packages/shared/src/captions/ass-builder.ts`
   * upstream. Null/undefined → legacy path. V26.13 — when ANY scene
   * carries `captionChunks`, the composer rebuilds the ASS itself
   * post-normalize using ffprobe-measured durations and this field
   * is treated as a fallback only. */
  captionsAssContent?: string | null;
  /** V26.13 — caption preset id for the in-composer ASS rebuild. */
  captionsPresetId?: CaptionPresetId;
  /** V26.13 — caption mode (phrase / word_highlight). */
  captionsModeOverride?: CaptionsMode;
  /** V26.13 — vertical bias when lipsync or product-low scenes exist. */
  captionsMarginBoostPx?: number;
  /** V26.13 — UGC lead-in: caption appears N ms before the word is
   *  spoken. Default 100ms. */
  captionsLeadMs?: number;
}

export const ffmpegCompositionProvider: CompositionProvider & {
  compose(input: FfmpegCompositionInput): Promise<CompositionOutput>;
} = {
  name: 'ffmpeg-local',
  async compose(input: FfmpegCompositionInput): Promise<CompositionOutput> {
    const scenes = input.scenes ?? [];
    if (scenes.length === 0) {
      throw new Error('ffmpegCompositionProvider: no scenes provided');
    }

    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tachles-ffmpeg-'));
    try {
      // 1. Localize every clip URL to a tmp file. Local /uploads URLs we
      //    read from disk; remote URLs go through fetch().
      const localPaths: string[] = [];
      for (let i = 0; i < scenes.length; i++) {
        const dest = path.join(tmpRoot, `scene-${String(i).padStart(2, '0')}.mp4`);
        await downloadToFile(scenes[i]!.clipUrl, dest);
        localPaths.push(dest);
      }

      // 2. Captions ASS file. V10: prefer the pre-built ASS string the
      //    caller produced from real ElevenLabs word timings. The
      //    legacy proportional builder (`buildAssFile`) is kept as a
      //    fallback only when no chunks are available — but in the V10
      //    pipeline we'd rather skip captions than ship an
      //    out-of-sync proportional approximation.
      const assPath = path.join(tmpRoot, 'captions.ass');
      const captionsAssContent =
        input.captionsAssContent && input.captionsAssContent.length > 0
          ? input.captionsAssContent
          : buildAssFile(scenes); // legacy fallback (rarely used post-V10)
      await fs.writeFile(assPath, captionsAssContent, 'utf8');

      // 3. Three-stage low-memory pipeline (replaces the old single-pass
      //    concat-FILTER, which OOM-killed on Railway with N parallel
      //    decoders + libass + amix in memory at once):
      //
      //      3a. Per-clip normalize  (one decoder + one encoder per call,
      //          run in series)  → identical libx264/main + aac codec
      //          params on every clip.
      //      3b. concat-demuxer + `-c copy`  (no re-encode, near-zero RAM).
      //          Safe here because step 3a guarantees byte-identical
      //          codec params — the historical concat-demuxer corruption
      //          (different SAR / GOP / AAC profile across inputs) cannot
      //          happen post-normalize.
      //      3c. Optional overlay pass for captions and/or music.
      //          Captions force a video re-encode (libass overlays raw
      //          frames). Music forces an audio re-encode (amix).
      //          Whichever isn't needed is stream-copied. When neither
      //          is enabled we skip 3c entirely and copy the concat
      //          output to `final.mp4`.
      //
      //    Peak memory: max(per-clip normalize, overlay pass) ≈
      //    one decoder + one encoder + libass + amix. The previous
      //    concat-FILTER held N decoders + libass + amix simultaneously,
      //    which is what Railway's cgroup OOM-killer was hitting.
      const finalLocal = path.join(tmpRoot, 'final.mp4');

      // Resolve a local music path if the URL is /uploads/... or /music/...
      let musicLocalPath: string | null = null;
      if (input.musicUrl) {
        try {
          const dest = path.join(tmpRoot, 'music.mp3');
          await downloadToFile(input.musicUrl, dest);
          musicLocalPath = dest;
        } catch (err) {
          console.warn(
            `[ffmpeg] music track ${input.musicUrl} not available — skipping bg music`,
            (err as Error).message,
          );
        }
      }

      const captionsEnabled = input.enableCaptions === true;
      const escAss = captionsEnabled
        ? `ass=${assPath.replace(/:/g, '\\:').replace(/'/g, "'\\''")}`
        : null;

      const N = localPaths.length;
      const totalDurationSec = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
      const musicVolume = clampMusicVolume(input.musicVolume);
      const fadeInSec = Math.max(0, (input.musicFadeInDurationMs ?? 300) / 1000);
      const fadeOutSec = Math.max(0, (input.musicFadeOutDurationMs ?? 2000) / 1000);
      const fadeOutStartSec = Math.max(0, totalDurationSec - fadeOutSec);
      const musicStartOffsetSec = Math.max(
        0,
        Math.min(600, input.musicStartOffsetSec ?? 0),
      );

      console.log(
        `[ffmpeg-compose] N=${N} totalDurationSec=${totalDurationSec.toFixed(2)} ` +
          `captions=${captionsEnabled} music=${!!musicLocalPath} ` +
          `pipeline=normalize→concat-demuxer${captionsEnabled || musicLocalPath ? '→overlay' : ''} ` +
          `tmpRoot=${tmpRoot}`,
      );

      // 3a. Per-clip normalize. Each clip is re-encoded with identical
      //     codec params so the concat-demuxer in 3b can stream-copy
      //     them. Running these sequentially keeps peak memory at one
      //     decoder + one encoder at a time.
      //
      //     Codec lock-in: libx264 main / level 3.1 / yuv420p, aac
      //     44.1kHz stereo 192k, fps=30 cfr. Mismatches across inputs
      //     (Kling lipsync vs ffmpeg-mux b-roll) get fully resolved here.
      const normalizedPaths: string[] = [];
      for (let i = 0; i < N; i++) {
        const norm = path.join(tmpRoot, `norm-${String(i).padStart(2, '0')}.mp4`);
        await runFfmpeg(
          [
            '-y',
            '-i', localPaths[i]!,
            '-vf', 'fps=30,setsar=1,format=yuv420p',
            '-af', 'aresample=44100,aformat=channel_layouts=stereo',
            '-r', '30',
            '-vsync', 'cfr',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '20',
            '-profile:v', 'main',
            '-level', '3.1',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ar', '44100',
            '-ac', '2',
            '-threads', '2',
            '-movflags', '+faststart',
            norm,
          ],
          `ffmpeg-norm-${i}`,
        );
        normalizedPaths.push(norm);
      }

      // V26.13 — probe each normalized clip for its actual duration.
      // The byte-level concat in 3b stitches these end-to-end, so the
      // final timeline is exactly sum(probedDurations). Captions
      // built from these offsets stay in lockstep with the audio
      // regardless of:
      //   - PixVerse stretching audio for lipsync animation
      //   - ffmpeg's mux tpad rounding to frame boundaries
      //   - fps=30 cfr re-timing in stage 3a above
      //   - Integer-rounded clipDurationSeconds in the DB
      const probedDurationsMs: number[] = [];
      for (let i = 0; i < normalizedPaths.length; i++) {
        try {
          const sec = await probeDurationSeconds(normalizedPaths[i]!);
          probedDurationsMs.push(Math.round(sec * 1000));
        } catch (err) {
          // Probe failure — fall back to the input scene's declared
          // duration. The captions for THIS scene's tail and all
          // subsequent scenes may drift, but the render still ships.
          const fallback = scenes[i]?.durationSeconds ?? 5;
          console.warn(
            `[ffmpeg] probe failed for norm-${i}, using declared ${fallback}s`,
            (err as Error).message,
          );
          probedDurationsMs.push(Math.round(fallback * 1000));
        }
      }
      console.log(
        `[ffmpeg] probed normalized durations (ms): ` +
          `[${probedDurationsMs.join(', ')}] sum=${probedDurationsMs.reduce((a, b) => a + b, 0)}`,
      );

      // V26.13 — if upstream passed scene-level chunks (the new path),
      // rebuild the ASS using probed durations. This REPLACES the
      // upstream-built `captionsAssContent` for accuracy.
      const hasSceneCaptionData = scenes.some(
        (s) =>
          (s.captionChunks && s.captionChunks.length > 0) ||
          (s.wordTimings && s.wordTimings.length > 0),
      );
      if (hasSceneCaptionData) {
        const presetId = input.captionsPresetId ?? 'classic';
        const captionsMode = input.captionsModeOverride ?? 'phrase';
        const marginBoostPx = input.captionsMarginBoostPx ?? 0;
        const leadMs = input.captionsLeadMs ?? 100;

        const globalChunks: CaptionChunk[] = [];
        const globalWords: Array<
          WordTiming & { globalStartMs: number; globalEndMs: number; sceneId?: string }
        > = [];
        let cumulativeMs = 0;
        for (let i = 0; i < scenes.length; i++) {
          const s = scenes[i]!;
          const sceneEndMs = cumulativeMs + (probedDurationsMs[i] ?? 0);
          for (const c of s.captionChunks ?? []) {
            if (c.endMs <= c.startMs) continue;
            const globalStartMs =
              cumulativeMs + Math.max(0, c.startMs - leadMs);
            const globalEndMs = Math.min(
              sceneEndMs,
              cumulativeMs + Math.max(0, c.endMs),
            );
            if (globalEndMs <= globalStartMs) continue;
            globalChunks.push({ ...c, sceneId: s.sceneId, globalStartMs, globalEndMs });
          }
          for (const w of s.wordTimings ?? []) {
            if (w.endMs <= w.startMs) continue;
            const globalStartMs =
              cumulativeMs + Math.max(0, w.startMs - leadMs);
            const globalEndMs = Math.min(
              sceneEndMs,
              cumulativeMs + Math.max(0, w.endMs),
            );
            if (globalEndMs <= globalStartMs) continue;
            globalWords.push({
              word: w.word,
              startMs: w.startMs,
              endMs: w.endMs,
              globalStartMs,
              globalEndMs,
              sceneId: s.sceneId,
            });
          }
          cumulativeMs = sceneEndMs;
        }
        const rebuiltAss = buildAssFromChunks(globalChunks, {
          videoWidth: 1080,
          videoHeight: 1920,
          marginBoostPx,
          mode: captionsMode,
          presetId,
          wordTimings: globalWords.length > 0 ? globalWords : undefined,
        });
        await fs.writeFile(assPath, rebuiltAss, 'utf8');
        console.log(
          `[ffmpeg] V26.13 rebuilt ASS post-normalize: ` +
            `${globalChunks.length} chunks + ${globalWords.length} words ` +
            `over ${cumulativeMs}ms. Replaces upstream captionsAssContent.`,
        );
      }

      // 3b. concat-demuxer + `-c copy`. Stream-copy only — RAM stays flat.
      const listPath = path.join(tmpRoot, 'concat.txt');
      const listBody = normalizedPaths
        .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
        .join('\n');
      await fs.writeFile(listPath, listBody, 'utf8');
      const concatPath = path.join(tmpRoot, 'concat.mp4');
      await runFfmpeg(
        [
          '-y',
          '-f', 'concat',
          '-safe', '0',
          '-i', listPath,
          '-c', 'copy',
          '-movflags', '+faststart',
          concatPath,
        ],
        'ffmpeg-concat',
      );

      // 3c. Overlay pass — only when captions or music are needed.
      //     Single decoder + single encoder + libass + amix. Whichever
      //     of audio/video doesn't need a re-encode is stream-copied.
      const needsOverlay = captionsEnabled || !!musicLocalPath;
      if (needsOverlay) {
        const args: string[] = ['-y', '-i', concatPath];
        if (musicLocalPath) {
          // -stream_loop -1 makes ffmpeg replay the music infinitely so
          // a 60s loopable bed covers any ad length without abrupt cuts.
          args.push('-stream_loop', '-1', '-i', musicLocalPath);
        }

        const filterParts: string[] = [];
        let videoMap = '0:v';
        let audioMap = '0:a';

        if (escAss) {
          filterParts.push(`[0:v]${escAss}[vout]`);
          videoMap = '[vout]';
        }

        if (musicLocalPath) {
          // Trim the looped music to the final video length, drop the
          // timestamps so amix sees a fresh timeline, force the same
          // sample rate / channel layout as the main audio, then
          // gain + fade.
          //
          // V14 PR9 — start-offset support. The earlier two-stage
          // implementation (atrim=start, then asetpts, then a second
          // atrim=duration) produced a SILENT track on offset>0 in
          // production — the `asetpts` reset between two atrims
          // confused the loop pipeline. Replaced with the combined
          // `atrim=start=X:end=X+totalDuration` form: a single trim
          // that selects the exact window from the looped stream.
          // Then asetpts, aresample, aformat, volume, fades. One atrim,
          // one PTS reset — much more stable.
          const musicTrimEnd = musicStartOffsetSec + totalDurationSec;
          const musicFilters: string[] = [
            musicStartOffsetSec > 0
              ? `atrim=start=${musicStartOffsetSec.toFixed(3)}:end=${musicTrimEnd.toFixed(3)}`
              : `atrim=duration=${totalDurationSec.toFixed(3)}`,
            'asetpts=N/SR/TB',
            'aresample=44100',
            'aformat=channel_layouts=stereo',
            `volume=${musicVolume.toFixed(4)}`,
          ];
          if (fadeInSec > 0) {
            musicFilters.push(`afade=t=in:st=0:d=${fadeInSec.toFixed(3)}`);
          }
          if (fadeOutSec > 0 && fadeOutStartSec > 0) {
            musicFilters.push(
              `afade=t=out:st=${fadeOutStartSec.toFixed(3)}:d=${fadeOutSec.toFixed(3)}`,
            );
          }
          filterParts.push(`[1:a]${musicFilters.join(',')}[bg]`);
          // duration=first locks output to the voice track length so
          // music never extends the final by a silent tail.
          filterParts.push(
            `[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`,
          );
          audioMap = '[aout]';
        }

        if (filterParts.length > 0) {
          args.push('-filter_complex', filterParts.join(';'));
        }
        args.push('-map', videoMap, '-map', audioMap);

        if (escAss) {
          args.push(
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-threads', '2',
          );
        } else {
          args.push('-c:v', 'copy');
        }
        if (musicLocalPath) {
          args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
        } else {
          args.push('-c:a', 'copy');
        }

        args.push('-movflags', '+faststart');
        args.push(finalLocal);

        await runFfmpeg(args, 'ffmpeg-overlay');
      } else {
        // No captions, no music — concat output IS the final.
        await fs.copyFile(concatPath, finalLocal);
      }

      // 5. Persist the final MP4 — R2 in production, local disk in dev.
      const finalName = `${Date.now()}.mp4`;
      const totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
      let finalVideoUrl: string;

      if (process.env.CLOUDFLARE_R2_BUCKET_NAME) {
        finalVideoUrl = await uploadToR2(finalLocal, `finals/${finalName}`, 'video/mp4');
      } else {
        const finalsDir = input.finalsDir ?? path.join(
          process.env.PUBLIC_UPLOADS_DIR ??
            path.join(process.cwd(), '..', 'web', 'public', 'uploads'),
          'finals',
        );
        await fs.mkdir(finalsDir, { recursive: true });
        await fs.copyFile(finalLocal, path.join(finalsDir, finalName));
        finalVideoUrl = `/uploads/finals/${finalName}`;
      }

      return {
        finalVideoUrl,
        durationSeconds: totalDuration,
        provider: 'ffmpeg-local',
      };
    } finally {
      // Best-effort cleanup of the tmp dir.
      try {
        await fs.rm(tmpRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  },
};

/* ---------- helpers ---------- */

async function downloadToFile(url: string, dest: string): Promise<void> {
  if (url.startsWith('/')) {
    // Local /uploads URL — read from public dir.
    const publicRoot =
      process.env.PUBLIC_UPLOADS_DIR ??
      path.join(process.cwd(), '..', 'web', 'public');
    const src = path.join(publicRoot, url.replace(/^\/+/, ''));
    await fs.copyFile(src, dest);
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
}

// Clamp the music gain so an LLM-suggested or hand-tuned value never
// drowns the Hebrew voice-over. The hard ceiling is 0.20; the typical
// safe range is 0.06–0.12. Linear gain (volume= filter), not dB.
function clampMusicVolume(v: number | undefined): number {
  const DEFAULT = 0.08;
  const MIN = 0.04;
  const MAX = 0.20;
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT;
  if (v < MIN) return MIN;
  if (v > MAX) return MAX;
  return v;
}

// V26.13 — ffprobe a local MP4 for its actual duration in seconds.
// Used post-normalize to compute accurate caption offsets that match
// the concatenated MP4 timeline (DB-stored clipDurationSeconds
// systematically drifts because it stores integer Kling output
// instead of the voice-padded mux output).
function probeDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe ${filePath} exit ${code}: ${stderr.slice(0, 200)}`));
        return;
      }
      const n = Number(stdout.trim());
      if (!Number.isFinite(n) || n <= 0) {
        reject(new Error(`ffprobe ${filePath} produced non-numeric duration: ${stdout.slice(0, 100)}`));
        return;
      }
      resolve(n);
    });
  });
}

function runFfmpeg(args: string[], label = 'ffmpeg'): Promise<void> {
  return new Promise((resolve, reject) => {
    const totalMb = Math.round(os.totalmem() / 1024 / 1024);
    const freeMbBefore = Math.round(os.freemem() / 1024 / 1024);
    const startedAt = Date.now();
    console.log(
      `[${label}] spawning ffmpeg argc=${args.length} ` +
        `mem.total=${totalMb}MB mem.free.before=${freeMbBefore}MB ` +
        `args.tail=${args.slice(-12).join(' ')}`,
    );

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let lastProgressLine = '';
    let stderrBuf = '';
    proc.stderr.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stderr += chunk;
      stderrBuf += chunk;
      // Stream complete lines so the LAST line before a SIGKILL still
      // makes it into the worker logs (without the line buffer above we
      // only see whatever happened to land in the final ~1KB tail).
      let nl;
      while ((nl = stderrBuf.indexOf('\n')) !== -1) {
        const line = stderrBuf.slice(0, nl).trimEnd();
        stderrBuf = stderrBuf.slice(nl + 1);
        if (!line) continue;
        if (line.startsWith('frame=')) {
          lastProgressLine = line; // overwrite — these come ~1/sec
        } else {
          console.log(`[${label}] ${line}`);
        }
      }
    });
    proc.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      const elapsedMs = Date.now() - startedAt;
      const freeMbAfter = Math.round(os.freemem() / 1024 / 1024);
      const tail = stderr.slice(-1500).replace(/\s+/g, ' ').trim();
      console.log(
        `[${label}] ffmpeg exit code=${code} signal=${signal ?? 'none'} ` +
          `elapsedMs=${elapsedMs} mem.free.after=${freeMbAfter}MB ` +
          `lastProgress="${lastProgressLine}"`,
      );
      if (code === 0) {
        resolve();
        return;
      }
      // signal=SIGKILL with no error text in stderr is the canonical
      // OOM-kill fingerprint on Railway / Docker — the kernel sends
      // SIGKILL to the cgroup oom victim and ffmpeg never gets to print.
      const oomLikely =
        signal === 'SIGKILL' && code === null &&
        (freeMbAfter < 80 || /killed/i.test(tail) === false);
      const hint = oomLikely
        ? ' (likely OOM-kill — increase Railway memory or lower libx264 memory pressure)'
        : '';
      reject(
        new Error(
          `ffmpeg exited code=${code} signal=${signal ?? 'none'}${hint} ` +
            `lastProgress="${lastProgressLine}" stderrTail=${tail}`,
        ),
      );
    });
    proc.on('error', (err) => {
      console.error(`[${label}] ffmpeg spawn error:`, err);
      reject(err);
    });
  });
}

// Build a minimal ASS subtitle file. RTL Hebrew works because libass
// respects the unicode bidi algorithm — we just need to emit UTF-8 text
// with \an2 (bottom-center) and a sensible default style.
function buildAssFile(scenes: FfmpegSceneInput[]): string {
  let cursor = 0;
  const events: string[] = [];
  for (const s of scenes) {
    const sceneStart = cursor;
    const sceneEnd = cursor + s.durationSeconds;
    cursor = sceneEnd;
    if (!s.caption) continue;

    // Caption window = the actual SPEECH window, not the full clip.
    // If voiceDurationSeconds is shorter than clipDuration, the caption
    // disappears with the speech instead of lingering during the
    // silent visual tail.
    const voiceLen = s.voiceDurationSeconds ?? s.durationSeconds;
    const captionEnd = Math.min(sceneEnd, sceneStart + voiceLen);

    // If the caption is short (≤6 words, the LLM-written
    // onScreenCaptionHebrew), show the whole line for the speech window.
    // If it's a long fallback (full textHebrew sentence), split into
    // 4-5-word chunks and time them progressively across the speech so
    // viewers see one phrase at a time instead of a wall of text.
    const captionText = (s.caption || '').replace(/\n/g, ' ').trim();
    const words = captionText.split(/\s+/).filter(Boolean);
    const isShortCaption = words.length <= 6;

    if (isShortCaption) {
      const text = sanitizeAssText(captionText);
      events.push(
        `Dialogue: 0,${formatAssTime(sceneStart)},${formatAssTime(captionEnd)},Default,,0,0,0,,${text}`,
      );
    } else {
      // Split into ~5-word chunks; time each chunk proportionally.
      const chunkSize = 5;
      const chunks: string[] = [];
      for (let i = 0; i < words.length; i += chunkSize) {
        chunks.push(words.slice(i, i + chunkSize).join(' '));
      }
      const totalSpeech = captionEnd - sceneStart;
      const perChunk = totalSpeech / chunks.length;
      for (let i = 0; i < chunks.length; i++) {
        const cStart = sceneStart + perChunk * i;
        const cEnd = sceneStart + perChunk * (i + 1);
        const text = sanitizeAssText(chunks[i]!);
        events.push(
          `Dialogue: 0,${formatAssTime(cStart)},${formatAssTime(cEnd)},Default,,0,0,0,,${text}`,
        );
      }
    }
  }

  return `[Script Info]
Title: tachles auto-captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Heebo,56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,2,40,40,140,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
}

function sanitizeAssText(text: string): string {
  return (text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\n/g, '\\N');
}

async function uploadToR2(localPath: string, key: string, contentType: string): Promise<string> {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? '';
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? '';
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? '';
  const publicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const body = await fs.readFile(localPath);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  return `${publicUrl}/${key}`;
}

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds * 100) % 100);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs
    .toString()
    .padStart(2, '0')}`;
}
