// Adapter that wraps the legacy 2-step pipeline (Kling v3-omni i2v →
// Kling LipSync v1) as a TalkingSceneProvider, so the bakeoff endpoint
// can A/B-test it against Avatar v2 / Advanced LipSync on identical
// inputs (image + audio). The two i2v + lipsync steps run sequentially.
//
// We use an OpenAI-equivalent of "compose two providers" — first run
// the existing klingProvider.generateImageToVideo on the image (with a
// silent-talking-head motion prompt) to get a base video, then run the
// existing klingLipSyncProvider.generate on (base video URL + audio URL).
// This is exactly what the production talking-head path used to do; we
// just wrap it so the comparison is apples-to-apples.

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

import { klingProvider } from '../kling';
import { klingLipSyncProvider } from '../lipsync/kling';
import {
  TalkingSceneProvider,
  TalkingSceneInput,
  TalkingSceneSubmitResult,
  TalkingSceneStatusResult,
  TalkingSceneFinalResult,
  TalkingSceneError,
} from './types';

class LipSyncV1Adapter implements TalkingSceneProvider {
  readonly name = 'lipsync_v1';

  async submit(_input: TalkingSceneInput): Promise<TalkingSceneSubmitResult> {
    throw new TalkingSceneError(
      'lipsync_v1 adapter does not support split submit/getStatus — use generate() (it runs i2v + lipsync internally).',
      this.name,
    );
  }
  async getStatus(_id: string): Promise<TalkingSceneStatusResult> {
    throw new TalkingSceneError('lipsync_v1 adapter does not support getStatus', this.name);
  }

  async generate(input: TalkingSceneInput): Promise<TalkingSceneFinalResult> {
    // Stage A: image → silent talking-head motion video (via kling-v3-omni).
    const motion = await klingProvider.generateImageToVideo({
      imageUrl: input.imageUrl,
      prompt:
        'silent talking-head performance, the person looks at the phone camera and appears to speak naturally without audio, mid-sentence expression, mouth moves subtly as if forming words, natural blinks, micro eyebrow engagement',
      durationSeconds: 5,
      aspectRatio: input.aspectRatio ?? '9:16',
      sceneId: input.sceneId,
    });

    // We need a PUBLIC URL for the silent video so Kling LipSync v1 can
    // fetch it. The motion result has `videoUrl` (Kling's CDN) which is
    // already publicly fetchable — we use it directly to avoid an extra
    // hop through our own storage.
    const lipsync = await klingLipSyncProvider.generate({
      videoUrl: motion.videoUrl,
      audioUrl: input.audioUrl,
      durationSeconds: input.durationSeconds,
      sceneId: input.sceneId,
    });

    return {
      providerJobId: `${motion.providerJobId}+${lipsync.providerJobId}`,
      videoBytes: lipsync.videoBytes,
      videoUrl: lipsync.videoUrl,
      durationSeconds: input.durationSeconds,
      modelUsed: `${motion.modelUsed} → ${lipsync.modelUsed}`,
      providerName: this.name,
    };
  }
}

export const lipSyncV1Adapter: TalkingSceneProvider = new LipSyncV1Adapter();

// Mute the unused-imports warning — these helpers are reserved for a
// future variant that pre-downloads the motion video instead of
// passing Kling's expiring URL straight to lipsync.
void fs;
void path;
void os;
void spawn;
