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
    const p = spawn('ffmpeg', args);
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
export async function readUrlAsBuffer(url: string): Promise<Buffer> {
  if (url.startsWith('/')) {
    const filePath = path.join(process.cwd(), 'public', url.replace(/^\/+/, ''));
    return fs.readFile(filePath);
  }
  const res = await fetch(url);
  if (!res.ok) throw new MuxError(`Failed to fetch ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
