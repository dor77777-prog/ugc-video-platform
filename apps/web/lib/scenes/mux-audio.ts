// Mux a voice MP3 onto a silent video locally via ffmpeg.
//
// Architectural note: this runs right after Kling i2v for non-lipsync
// scenes so that scene.clipUrl is always a "ready to play" file with
// audio embedded. Previously, audio was layered in by the worker's
// final composer — but that meant clicking "play" on a single scene
// in the videos page played silent video. Now each scene's clip is
// independently watchable.
//
// For talking-head scenes, Kling LipSync produces a video that already
// contains the audio (since it lip-syncs to it), so we skip this step
// and save Kling's output directly.

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { parseBuffer as parseMediaBuffer } from 'music-metadata';

// Resolve the bundled ffmpeg binary once at module load. Vercel's
// serverless runtime doesn't have ffmpeg on PATH, so spawning literal
// 'ffmpeg' fails with ENOENT. ffmpeg-static ships one platform-specific
// binary inside node_modules.
//
// We deliberately do NOT use ffprobe-static here — it ships every
// platform's binary (335MB total) and pushes the function bundle past
// the 250MB Vercel limit. probeDurationSeconds() below uses the
// pure-JS music-metadata library instead.
const FFMPEG_BIN: string = ffmpegStatic ?? 'ffmpeg';

export class MuxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MuxError';
  }
}

export interface MuxInput {
  silentVideoBytes: Buffer;
  voiceMp3Bytes: Buffer;
}

export async function muxVoiceOntoVideo(input: MuxInput): Promise<Buffer> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tachles-mux-'));
  try {
    const videoPath = path.join(tmp, 'silent.mp4');
    const audioPath = path.join(tmp, 'voice.mp3');
    const outPath = path.join(tmp, 'out.mp4');

    await fs.writeFile(videoPath, input.silentVideoBytes);
    await fs.writeFile(audioPath, input.voiceMp3Bytes);

    // Audio-led duration: pad the video with its last frame ("tpad
    // stop_mode=clone") so it never runs OUT before the audio finishes.
    // -shortest then trims the result to the audio's length. Net effect:
    //   - voice shorter than video → cut at voice end (no silent tail)
    //   - voice longer  than video → video freezes on the last frame
    //                                until the voice finishes
    // This is a re-encode (tpad needs raw frames), so a few extra
    // seconds of CPU per scene — worth it to never cut off speech.
    await runFfmpeg([
      '-y',
      '-i',
      videoPath,
      '-i',
      audioPath,
      '-filter_complex',
      '[0:v]tpad=stop_mode=clone:stop_duration=99[v]',
      '-map',
      '[v]',
      '-map',
      '1:a:0',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest',
      '-movflags',
      '+faststart',
      outPath,
    ]);

    return await fs.readFile(outPath);
  } finally {
    try {
      await fs.rm(tmp, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

async function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG_BIN, args);
    let stderr = '';
    p.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    p.on('error', (err) => reject(new MuxError(`ffmpeg spawn failed: ${err.message}`)));
    p.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new MuxError(`ffmpeg exited with code ${code}. stderr tail: ${stderr.slice(-400)}`),
        );
    });
  });
}

// Read a local /uploads/... URL OR a remote URL into bytes. Used for
// pulling the voice MP3 from disk before muxing.
//
// V12.3 — production-safe: readPublicAsset handles disk (dev),
// Vercel HTTP fallback (where public/ is excluded from the function
// bundle), and absolute URLs (R2) all in one path.
export async function readUrlAsBuffer(url: string): Promise<Buffer> {
  const { readPublicAsset } = await import('@/lib/storage/read-public-asset');
  try {
    const { bytes } = await readPublicAsset(url);
    return bytes;
  } catch (err) {
    throw new MuxError(`Failed to fetch ${url}: ${(err as Error).message}`);
  }
}

// Measure a media file's actual duration in seconds. Used after Kling
// Lip-Sync to verify the output isn't truncated relative to the input
// voice MP3 — Kling occasionally returns a clip that's SHORTER than the
// voice, which manifests as "speech ends mid-word even though the system
// showed clip ≥ voice".
//
// Implementation: pure-JS via music-metadata (no native binary). We
// deliberately don't use ffprobe-static here because its bin/ tree
// (335MB across all platforms) blows past Vercel's function size limit.
// music-metadata supports MP3/MP4/M4A/WAV/etc — the formats we actually
// see in this pipeline.
export async function probeDurationSeconds(bytes: Buffer): Promise<number> {
  try {
    const meta = await parseMediaBuffer(bytes);
    const seconds = meta.format.duration;
    if (seconds === undefined || !Number.isFinite(seconds)) {
      throw new MuxError(
        `music-metadata returned non-numeric duration: "${seconds}"`,
      );
    }
    return seconds;
  } catch (err) {
    if (err instanceof MuxError) throw err;
    throw new MuxError(`music-metadata parse failed: ${(err as Error).message}`);
  }
}
