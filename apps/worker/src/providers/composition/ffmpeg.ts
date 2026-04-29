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
  /** When false (default), captions are NOT burned in. The ASS file is
   * still built (cheap) but the ffmpeg pass skips the subtitles filter. */
  enableCaptions?: boolean;
  /** V10 — pre-built ASS subtitle file content. When provided we burn
   * THIS file instead of the legacy proportional captions built from
   * `scenes`. Built by `packages/shared/src/captions/ass-builder.ts`
   * upstream. Null/undefined → legacy path. */
  captionsAssContent?: string | null;
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

      // 3. Run a SINGLE ffmpeg pass that concatenates + re-encodes +
      //    optionally burns captions and mixes music.
      //
      // Why not the previous two-pass concat-demuxer + re-encode?
      // The concat demuxer with `-c copy` requires every input clip to
      // have byte-identical codec parameters (SAR, framerate, GOP,
      // profile, audio sample rate, pixel format). When even ONE clip
      // differs — e.g. mux-audio's tpad reset the timebase, or AAC
      // picked a different profile — the demuxer produces a corrupted
      // boundary that plays back as "freeze on the bad frame, then
      // half-second loop for the rest of the video". The second pass
      // then re-encodes the corruption verbatim.
      //
      // The concat FILTER (not demuxer) decodes every input first and
      // operates on raw frames, so codec/SAR/framerate mismatches are
      // resolved by the per-stream normalization filters below
      // (fps=30, setsar=1, format=yuv420p, aresample=44100). One pass,
      // one re-encode, no corrupted boundaries.
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

      // Build the filter graph dynamically.
      //   - One -i per scene clip + optional music input at the end.
      //   - Per-input normalization (vN: fps + setsar + yuv420p; aN:
      //     aresample + stereo) so concat sees uniform streams.
      //   - concat=n=N:v=1:a=1[vcat][acat] does the actual stitching.
      //   - Optional captions filter on [vcat] → [vout].
      //   - Optional music mix on [acat] + music input → [aout].
      const N = localPaths.length;
      const filterParts: string[] = [];
      const concatPairs: string[] = [];
      for (let i = 0; i < N; i++) {
        // 9:16 UGC clips from Kling are 720×1280 / 30fps / yuv420p, but
        // we don't trust that — explicit normalization is cheap (~1ms
        // per frame on libx264 at preset=fast) and the safety net is
        // worth it.
        filterParts.push(`[${i}:v]fps=30,setsar=1,format=yuv420p[v${i}]`);
        filterParts.push(`[${i}:a]aresample=44100,aformat=channel_layouts=stereo[a${i}]`);
        concatPairs.push(`[v${i}][a${i}]`);
      }
      filterParts.push(`${concatPairs.join('')}concat=n=${N}:v=1:a=1[vcat][acat]`);

      let videoOut = '[vcat]';
      let audioOut = '[acat]';

      if (escAss) {
        filterParts.push(`${videoOut}${escAss}[vout]`);
        videoOut = '[vout]';
      }

      // ── Music mix ──────────────────────────────────────────────────────
      // Pipeline (when music is enabled):
      //   1. -stream_loop -1 on the music input → ffmpeg replays the
      //      track infinitely, so a 60s loopable bed covers a 90s ad
      //      without abrupt cuts.
      //   2. atrim/asetpts trim the (already-looped) stream to EXACTLY
      //      the final-video duration so music never plays past the
      //      visual end. We compute totalDuration from the per-scene
      //      durations the worker passes us.
      //   3. volume= applies the low-volume gain (default 0.08).
      //   4. afade=in:0:0.3 + afade=out:(end-2):2 give the user-required
      //      gentle fade-in and the mandatory 2s closing fade-out.
      //   5. amix mixes the processed music under the concatenated voice
      //      track. duration=first locks the output length to [acat]
      //      (= total scene duration) so the music never extends the
      //      final video by a silent tail.
      const totalDurationSec = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
      const musicVolume = clampMusicVolume(input.musicVolume);
      const fadeInSec = Math.max(0, (input.musicFadeInDurationMs ?? 300) / 1000);
      const fadeOutSec = Math.max(0, (input.musicFadeOutDurationMs ?? 2000) / 1000);
      const fadeOutStartSec = Math.max(0, totalDurationSec - fadeOutSec);

      if (musicLocalPath) {
        // Music input lives at index N (after all the scene clips).
        const musicFilters: string[] = [
          // Trim to the final-video duration. atrim wants seconds; we
          // pass enough precision to never cut a frame short.
          `atrim=duration=${totalDurationSec.toFixed(3)}`,
          // After atrim the timestamps need to be reset or amix gets
          // confused about the input timeline.
          'asetpts=N/SR/TB',
          // Resample + force stereo so it matches [acat] for amix.
          'aresample=44100',
          'aformat=channel_layouts=stereo',
          // Volume gain — the low default keeps Hebrew voice dominant.
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
        filterParts.push(`[${N}:a]${musicFilters.join(',')}[bg]`);
        filterParts.push(
          `${audioOut}[bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`,
        );
        audioOut = '[aout]';
      }

      const args: string[] = ['-y'];
      for (const p of localPaths) {
        args.push('-i', p);
      }
      if (musicLocalPath) {
        // Looping + a generous probesize keep ffmpeg from giving up
        // when a short ~1MB MP3 has to span a 30s render.
        args.push('-stream_loop', '-1', '-i', musicLocalPath);
      }
      args.push('-filter_complex', filterParts.join(';'));
      args.push('-map', videoOut, '-map', audioOut);
      args.push(
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '20',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
      );
      // -shortest is only needed when music is mixed in (music loops
      // forever; we want to cut at the voice track end). Without music
      // the concat filter already controls the duration via [acat].
      if (musicLocalPath) args.push('-shortest');
      args.push(finalLocal);

      await runFfmpeg(args);

      // 5. Move into apps/web/public/uploads/finals/<projectId>/...
      // We compute the destination path off the env that the web app uses
      // for storage. The worker shares the same apps/web/public dir on
      // disk in dev. In prod, this would push to S3 instead.
      const finalsDir = input.finalsDir ?? path.join(
        process.env.PUBLIC_UPLOADS_DIR ??
          path.join(process.cwd(), '..', 'web', 'public', 'uploads'),
        'finals',
      );
      await fs.mkdir(finalsDir, { recursive: true });
      const finalName = `${Date.now()}.mp4`;
      const finalPath = path.join(finalsDir, finalName);
      await fs.copyFile(finalLocal, finalPath);

      const totalDuration = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
      return {
        finalVideoUrl: `/uploads/finals/${finalName}`,
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

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('close', (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1000)}`));
    });
    proc.on('error', reject);
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

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds * 100) % 100);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs
    .toString()
    .padStart(2, '0')}`;
}
