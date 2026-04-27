import type { Job } from 'bullmq';
import { RenderJobStatus, AssetType } from '@prisma/client';
import { prisma } from '../db';
import type { RenderJobPayload } from '../queue';
import { mockTtsProvider } from '../providers/tts/mock';
import { mockAvatarProvider } from '../providers/avatar/mock';
import { mockBrollProvider } from '../providers/broll/mock';
import { mockCompositionProvider } from '../providers/composition/mock';

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
    // Step 1 — extract assets
    await advance(renderJobId, RenderJobStatus.extracting_assets, 5, job);

    // Step 2 — voice (per scene)
    await advance(renderJobId, RenderJobStatus.generating_voice, 15, job);
    const voiceUrls: string[] = [];
    for (const scene of renderJob.script.scenes) {
      const result = await mockTtsProvider.generate({
        text: scene.textHebrewTts || scene.textHebrew,
        voiceId: 'mock-voice',
        language: 'he',
      });
      voiceUrls.push(result.audioUrl);
      await prisma.asset.create({
        data: {
          projectId: renderJob.projectId,
          renderJobId: renderJob.id,
          type: AssetType.voice_audio,
          provider: result.provider,
          url: result.audioUrl,
          durationSeconds: result.durationSeconds,
          metadata: { sceneId: scene.id, sceneOrder: scene.sceneOrder },
        },
      });
    }

    // Step 3 — avatar video
    await advance(renderJobId, RenderJobStatus.generating_avatar_video, 35, job);
    const avatarResult = await mockAvatarProvider.generate({
      avatarId: 'mock-avatar',
      audioUrl: voiceUrls[0] ?? 'mock://audio',
    });
    await prisma.asset.create({
      data: {
        projectId: renderJob.projectId,
        renderJobId: renderJob.id,
        type: AssetType.avatar_video,
        provider: avatarResult.provider,
        url: avatarResult.videoUrl,
        durationSeconds: avatarResult.durationSeconds,
      },
    });

    // Step 4 — b-roll (per scene)
    await advance(renderJobId, RenderJobStatus.generating_broll, 60, job);
    const brollUrls: string[] = [];
    for (const scene of renderJob.script.scenes) {
      const result = await mockBrollProvider.generate({
        prompt: scene.visualPromptEnglish,
        durationSeconds: scene.durationSeconds,
        aspectRatio: '9:16',
      });
      brollUrls.push(result.videoUrl);
      await prisma.asset.create({
        data: {
          projectId: renderJob.projectId,
          renderJobId: renderJob.id,
          type: AssetType.broll_video,
          provider: result.provider,
          url: result.videoUrl,
          durationSeconds: result.durationSeconds,
          metadata: { sceneId: scene.id, sceneOrder: scene.sceneOrder },
        },
      });
    }

    // Step 5 — composition
    await advance(renderJobId, RenderJobStatus.composing_video, 85, job);
    const composition = await mockCompositionProvider.compose({
      avatarVideoUrl: avatarResult.videoUrl,
      voiceUrls,
      brollUrls,
      captions: renderJob.script.scenes.map((s) => s.textHebrew),
      aspectRatio: '9:16',
    });

    // Step 6 — upload final
    await advance(renderJobId, RenderJobStatus.uploading_final, 95, job);
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

    // Done
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

    console.log(`[render] job ${renderJobId} completed`);
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
