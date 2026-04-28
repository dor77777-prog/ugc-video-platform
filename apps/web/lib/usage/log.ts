// API-call logging — supports both single-call (record after completion)
// and two-phase (record at start with status="in_progress", update at
// finish). Two-phase lets the admin dashboard show LIVE in-flight calls
// with elapsed timer + auto-flip to success/failed when they finish.

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

// Single-shot record — used when the call already finished and you have
// the final cost / duration / success / error. Sets status to
// "success" or "failed" automatically and stamps completedAt = now.
export async function recordApiCall(input: RecordApiCallInput) {
  try {
    const success = input.success ?? true;
    const now = new Date();
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
        success,
        status: success ? 'success' : 'failed',
        completedAt: now,
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

// Two-phase: call this BEFORE submitting to the provider so the row
// shows up live in /admin/costs as "in progress". Returns the row id
// (or null on logging failure — never throws).
export interface StartApiCallInput {
  provider: string;
  operation: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  units?: number;
  userId?: string | null;
  projectId?: string | null;
}
export async function recordApiCallStart(input: StartApiCallInput): Promise<string | null> {
  try {
    const row = await prisma.apiCall.create({
      data: {
        provider: input.provider,
        operation: input.operation,
        model: input.model ?? null,
        // Cost / duration / success unknown yet — defaults are fine until
        // recordApiCallComplete fills them in.
        costUsd: 0,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        units: input.units ?? null,
        durationMs: null,
        success: true, // legacy default; meaningful only after status flips
        status: 'in_progress',
        completedAt: null,
        userId: input.userId ?? null,
        projectId: input.projectId ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.error('[usage] failed to start api call:', (err as Error).message);
    return null;
  }
}

export interface CompleteApiCallInput {
  success: boolean;
  costUsd?: number;
  units?: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
  /** Override model if the upstream chose a different one than expected. */
  model?: string;
}
export async function recordApiCallComplete(
  rowId: string | null,
  input: CompleteApiCallInput,
): Promise<void> {
  if (!rowId) return; // start failed earlier — just no-op
  try {
    await prisma.apiCall.update({
      where: { id: rowId },
      data: {
        success: input.success,
        status: input.success ? 'success' : 'failed',
        costUsd: input.costUsd ?? 0,
        units: input.units ?? undefined,
        durationMs: input.durationMs ?? undefined,
        inputTokens: input.inputTokens ?? undefined,
        outputTokens: input.outputTokens ?? undefined,
        errorMessage: input.errorMessage ?? null,
        model: input.model ?? undefined,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    console.error('[usage] failed to complete api call:', (err as Error).message);
  }
}
