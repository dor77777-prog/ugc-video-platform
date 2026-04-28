import type { Job } from 'bullmq';
import { RenderJobStatus, AssetType } from '@prisma/client';
import { prisma } from '../db';
import type { RenderJobPayload } from '../queue';
import { ffmpegCompositionProvider } from '../providers/composition/ffmpeg';

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
  console.log(`[render] starting job ${renderJobId}`);

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
    const productData = (renderJob.project.productData as Record<string, unknown> | null) ?? {};

    // Music is OFF by default — the auto-default track sounded bad and
    // burned a free-music library hasn't been curated yet. The toggle
    // in Step 1 (productData.backgroundMusic) is preserved so a future
    // music picker can wire in. For now, render is voice-only.
    // TODO(music-library): add curated tracks under apps/web/public/music/
    //   and a picker in Step 1, then re-enable here.
    const musicUrl: string | null = null;

    // Captions are OFF by default — burned ASS overlay didn't look good
    // for Hebrew at our typeface/size. The toggle in Step 1 (productData.captions)
    // can re-enable per project once the styling is acceptable. For now,
    // viewers hear the voice — the ad still works without captions.
    // TODO(captions): word-by-word sync via ElevenLabs character timestamps
    //   + better RTL bidi + outline + fade-in/out.
    const enableCaptions = productData.captions === true; // default false

    const composition = await ffmpegCompositionProvider.compose({
      avatarVideoUrl: '', // unused in the new flow
      voiceUrls: scenes.map((s) => s.voiceUrl ?? ''),
      brollUrls: scenes.map((s) => s.clipUrl ?? ''),
      captions: scenes.map((s) => s.onScreenCaptionHebrew || s.textHebrew),
      aspectRatio: '9:16',
      musicUrl,
      enableCaptions,
      scenes: scenes.map((s) => ({
        clipUrl: s.clipUrl!,
        caption: enableCaptions ? (s.onScreenCaptionHebrew || s.textHebrew || '').trim() : '',
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

    // Done.
    await prisma.renderJob.update({
      where: { id: renderJobId },
      data: {
        status: RenderJobStatus.completed,
        progressPercent: 100,
        finalVideoUrl: composition.finalVideoUrl,
        completedAt: new Date(),
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
