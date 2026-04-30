// API-call logging — supports both single-call (record after completion)
// and two-phase (record at start with status="in_progress", update at
// finish). Two-phase lets the admin dashboard show LIVE in-flight calls
// with elapsed timer + auto-flip to success/failed when they finish.
//
// V13.2: every completion can carry estimatedCostUsd / actualCostUsd /
// usage metadata so /admin/costs can show "what we expected" vs "what
// the provider actually billed". costUsd = actualCostUsd ?? estimated.
// metadata is JSON for forward compat — provider-specific dimensions
// (Kling tokens, PixVerse credit_consumed, ElevenLabs character count,
// OpenAI usage block) live there. NEVER store auth headers / api keys.

import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

export interface RecordApiCallInput {
  provider: 'openai' | 'elevenlabs' | 'kling' | 'pixverse' | 'ffmpeg' | 'runway' | 'creatomate' | string;
  operation: 'script_gen' | 'image_gen' | 'tts' | 'i2v' | 'lipsync' | 'motion_analysis' | 'mux' | 'compose' | string;
  model?: string;
  costUsd: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  units?: number;
  durationMs?: number;
  success?: boolean;
  errorMessage?: string;
  userId?: string | null;
  projectId?: string | null;
  renderJobId?: string | null;
  sceneId?: string | null;
  metadata?: Record<string, unknown> | null;
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
        estimatedCostUsd: input.estimatedCostUsd ?? null,
        actualCostUsd: input.actualCostUsd ?? null,
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
        renderJobId: input.renderJobId ?? null,
        sceneId: input.sceneId ?? null,
        metadata:
          input.metadata != null
            ? (input.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
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
  estimatedCostUsd?: number;
  userId?: string | null;
  projectId?: string | null;
  renderJobId?: string | null;
  sceneId?: string | null;
  metadata?: Record<string, unknown> | null;
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
        estimatedCostUsd: input.estimatedCostUsd ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        units: input.units ?? null,
        durationMs: null,
        success: true, // legacy default; meaningful only after status flips
        status: 'in_progress',
        completedAt: null,
        userId: input.userId ?? null,
        projectId: input.projectId ?? null,
        renderJobId: input.renderJobId ?? null,
        sceneId: input.sceneId ?? null,
        metadata:
          input.metadata != null
            ? (input.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
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
  /** Final attributed cost. If unset, we mirror actualCostUsd ?? estimatedCostUsd ?? 0. */
  costUsd?: number;
  /** Static-formula estimate (the fallback when provider doesn't return usage). */
  estimatedCostUsd?: number;
  /** Provider-reported usage cost (preferred over estimate when available). */
  actualCostUsd?: number;
  units?: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
  /** Override model if the upstream chose a different one than expected. */
  model?: string;
  /** Safe raw usage payload (no secrets). Merged into existing metadata if any. */
  metadata?: Record<string, unknown> | null;
}
export async function recordApiCallComplete(
  rowId: string | null,
  input: CompleteApiCallInput,
): Promise<void> {
  if (!rowId) return; // start failed earlier — just no-op
  try {
    // Resolve costUsd: explicit > actual > estimate > 0.
    const finalCost =
      input.costUsd ??
      input.actualCostUsd ??
      input.estimatedCostUsd ??
      0;

    // Merge metadata so per-provider extras (token_count, credit_consumed,
    // request_id) accumulate from start → complete without overwriting.
    let mergedMeta: object | undefined = undefined;
    if (input.metadata != null) {
      const existing = await prisma.apiCall.findUnique({
        where: { id: rowId },
        select: { metadata: true },
      });
      mergedMeta = {
        ...((existing?.metadata as object | null) ?? {}),
        ...input.metadata,
      };
    }

    await prisma.apiCall.update({
      where: { id: rowId },
      data: {
        success: input.success,
        status: input.success ? 'success' : 'failed',
        costUsd: finalCost,
        estimatedCostUsd: input.estimatedCostUsd ?? undefined,
        actualCostUsd: input.actualCostUsd ?? undefined,
        units: input.units ?? undefined,
        durationMs: input.durationMs ?? undefined,
        inputTokens: input.inputTokens ?? undefined,
        outputTokens: input.outputTokens ?? undefined,
        errorMessage: input.errorMessage ?? null,
        model: input.model ?? undefined,
        completedAt: new Date(),
        ...(mergedMeta !== undefined ? { metadata: mergedMeta } : {}),
      },
    });
  } catch (err) {
    console.error('[usage] failed to complete api call:', (err as Error).message);
  }
}
