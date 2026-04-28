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
   * set, ffmpeg mixes the track at -18 dB under the voice track. */
  musicUrl?: string | null;
  /** When false (default), captions are NOT burned in. The ASS file is
   * still built (cheap) but the ffmpeg pass skips the subtitles filter. */
  enableCaptions?: boolean;
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

      // 2. Build a concat-demuxer list file.
      const listPath = path.join(tmpRoot, 'concat.txt');
      await fs.writeFile(
        listPath,
        localPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
        'utf8',
      );

      // 3. Build the ASS captions file.
      const assPath = path.join(tmpRoot, 'captions.ass');
      await fs.writeFile(assPath, buildAssFile(scenes), 'utf8');

      // 4. Run ffmpeg.
      const concatOnly = path.join(tmpRoot, 'concat.mp4');
      await runFfmpeg(
        [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listPath,
          '-c',
          'copy',
          concatOnly,
        ],
      );

      // Burn the captions in (re-encode required for subtitle filter).
      // If musicUrl is set + the file exists, mix it in at -18 dB under
      // the voice track. The voice stays the dominant audio; music only
      // adds atmosphere.
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

      // Build args dynamically: video filter only when captions on, music
      // mix only when track present. Skipping both → simple re-encode
      // (still needed because concat-copy is per-stream and we may have
      // mixed codecs across input clips). The only non-negotiable cost
      // is the AAC re-encode for the final container.
      const args: string[] = ['-y', '-i', concatOnly];
      if (musicLocalPath) {
        args.push('-stream_loop', '-1', '-i', musicLocalPath);
      }
      if (musicLocalPath) {
        args.push(
          '-filter_complex',
          // 0:a = voice (from concat), 1:a = music looped. Music -18 dB.
          '[1:a]volume=-18dB[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]',
          '-map', '0:v',
          '-map', '[aout]',
        );
      }
      if (escAss) {
        args.push('-vf', escAss);
      }
      args.push(
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '20',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
      );
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
