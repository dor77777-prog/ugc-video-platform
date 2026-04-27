import { prisma } from '@/lib/db';

export interface RecordApiCallInput {
  provider: 'openai' | 'elevenlabs' | 'kling' | 'runway' | 'creatomate' | string;
  operation: 'script_gen' | 'image_gen' | 'tts' | 'video_gen' | 'compose' | string;
  model?: string;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  units?: number;
  durationMs?: number;
  success?: boolean;
  errorMessage?: string;
  userId?: string | null;
  projectId?: string | null;
}

// Fire-and-forget logger. We never let logging failures take down the user-
// facing action (try/catch + console.error). Returns the row when written.
export async function recordApiCall(input: RecordApiCallInput) {
  try {
    return await prisma.apiCall.create({
      data: {
        provider: input.provider,
        operation: input.operation,
        model: input.model ?? null,
        costUsd: input.costUsd,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        units: input.units ?? null,
        durationMs: input.durationMs ?? null,
        success: input.success ?? true,
        errorMessage: input.errorMessage ?? null,
        userId: input.userId ?? null,
        projectId: input.projectId ?? null,
      },
    });
  } catch (err) {
    console.error('[usage] failed to record api call:', (err as Error).message);
    return null;
  }
}
