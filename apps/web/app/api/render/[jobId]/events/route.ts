// V14.4 — Server-Sent Events stream for a render job's status.
//
// Replaces the client's `setInterval(fetch /api/render/[jobId]/status, 2.5s)`
// loop with a long-lived SSE connection that pushes status changes the
// moment they hit the DB. Saves DB CPU + Vercel function invocations,
// and updates the UI within ~2s of the worker advancing the job.
//
// Architecture:
//   - Route opens a ReadableStream and emits `data: {json}\n\n` events.
//   - Server-side, we poll the DB every 2s. When the status / progress
//     changes from the last sent value (or when finalVideoUrl appears),
//     we push a new event. Terminal statuses (completed / failed /
//     cancelled) trigger a final event + the stream closes.
//   - We hold each connection up to ~55s before closing cleanly so
//     EventSource can reconnect (auto). On Vercel Hobby the function
//     ceiling is 60s; we leave a 5s safety margin for the close
//     handshake + flush.
//   - The client uses `new EventSource(...)` which auto-reconnects on
//     close; the long render loop stays current with sub-3s latency
//     for the entire duration without a manual setInterval.
//
// Why poll the DB on the server vs subscribe to BullMQ events: the worker
// runs on Railway (separate process from the Vercel function). Cross-host
// event subscription would need Redis pubsub plumbing on both sides;
// server-side DB polling is simpler, hits the existing SLOW_QUERY logger,
// and the V14.1c index on RenderJob.status keeps the query fast.

import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';

// Each SSE connection caps at 55s. Vercel Hobby max function duration is
// 60s; we leave 5s for the close + flush so the function exits cleanly.
const CONNECTION_MAX_MS = 55_000;
// Poll the DB this often. 1.5s is fast enough that the user feels
// "live" (vs the prior 2.5s polling) without hammering the DB.
const POLL_INTERVAL_MS = 1_500;

// Max function duration on Vercel Hobby. Required for streaming
// responses that exceed the default 10s.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type RenderJobSnapshot = {
  id: string;
  status: string;
  progressPercent: number | null;
  errorMessage: string | null;
  finalVideoUrl: string | null;
  updatedAt: string;
};

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  // V26.SEC — Auth + ownership enforcement BEFORE opening the SSE
  // stream. Pre-V26.SEC anyone with a leaked jobId could subscribe to
  // its status updates in real time. Now we resolve the requester's
  // app user and confirm they own the job before piping any data.
  const { dbUser } = await getOrCreateAppUser();
  const owner = await prisma.renderJob.findUnique({
    where: { id: jobId },
    select: { userId: true },
  });
  if (!owner) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  if (owner.userId !== dbUser.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      let lastSnapshot: RenderJobSnapshot | null = null;
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const send = (snapshot: RenderJobSnapshot, eventName?: string) => {
        if (closed) return;
        const lines: string[] = [];
        if (eventName) lines.push(`event: ${eventName}`);
        lines.push(`data: ${JSON.stringify(snapshot)}`);
        try {
          controller.enqueue(encoder.encode(lines.join('\n') + '\n\n'));
        } catch {
          closed = true;
        }
      };

      // Initial snapshot — fire immediately so the client has something
      // before the first poll tick.
      try {
        const job = await prisma.renderJob.findUnique({
          where: { id: jobId },
          select: {
            id: true,
            status: true,
            progressPercent: true,
            errorMessage: true,
            finalVideoUrl: true,
            updatedAt: true,
          },
        });
        if (!job) {
          // 404 inside SSE: send an error event + close. Client handles
          // by surfacing the missing-job error on the videos page.
          send(
            {
              id: jobId,
              status: 'not_found',
              progressPercent: null,
              errorMessage: 'Job not found',
              finalVideoUrl: null,
              updatedAt: new Date().toISOString(),
            },
            'error',
          );
          close();
          return;
        }
        const snapshot: RenderJobSnapshot = {
          id: job.id,
          status: job.status,
          progressPercent: job.progressPercent,
          errorMessage: job.errorMessage,
          finalVideoUrl: job.finalVideoUrl,
          updatedAt: job.updatedAt.toISOString(),
        };
        lastSnapshot = snapshot;
        send(snapshot);
        if (TERMINAL_STATUSES.has(snapshot.status)) {
          // Already terminal — close immediately.
          close();
          return;
        }
      } catch (err) {
        send(
          {
            id: jobId,
            status: 'error',
            progressPercent: null,
            errorMessage: err instanceof Error ? err.message : String(err),
            finalVideoUrl: null,
            updatedAt: new Date().toISOString(),
          },
          'error',
        );
        close();
        return;
      }

      // Polling loop. Exits on:
      //   - terminal status reached
      //   - connection budget exhausted (client will reconnect)
      //   - controller closed (client disconnected)
      const tick = async () => {
        if (closed) return;
        if (Date.now() - startedAt >= CONNECTION_MAX_MS) {
          // Hit the per-connection ceiling; close cleanly so EventSource
          // reconnects with a fresh function invocation.
          close();
          return;
        }
        try {
          const job = await prisma.renderJob.findUnique({
            where: { id: jobId },
            select: {
              id: true,
              status: true,
              progressPercent: true,
              errorMessage: true,
              finalVideoUrl: true,
              updatedAt: true,
            },
          });
          if (!job) {
            send(
              {
                id: jobId,
                status: 'not_found',
                progressPercent: null,
                errorMessage: 'Job not found',
                finalVideoUrl: null,
                updatedAt: new Date().toISOString(),
              },
              'error',
            );
            close();
            return;
          }
          const snapshot: RenderJobSnapshot = {
            id: job.id,
            status: job.status,
            progressPercent: job.progressPercent,
            errorMessage: job.errorMessage,
            finalVideoUrl: job.finalVideoUrl,
            updatedAt: job.updatedAt.toISOString(),
          };
          // Only push when something changed — keeps the stream chatter
          // bounded to actual state transitions.
          const changed =
            !lastSnapshot ||
            lastSnapshot.status !== snapshot.status ||
            lastSnapshot.progressPercent !== snapshot.progressPercent ||
            lastSnapshot.finalVideoUrl !== snapshot.finalVideoUrl ||
            lastSnapshot.errorMessage !== snapshot.errorMessage;
          if (changed) {
            send(snapshot);
            lastSnapshot = snapshot;
          }
          if (TERMINAL_STATUSES.has(snapshot.status)) {
            close();
            return;
          }
        } catch (err) {
          send(
            {
              id: jobId,
              status: 'error',
              progressPercent: null,
              errorMessage: err instanceof Error ? err.message : String(err),
              finalVideoUrl: null,
              updatedAt: new Date().toISOString(),
            },
            'error',
          );
          close();
          return;
        }
        // Schedule next tick.
        setTimeout(tick, POLL_INTERVAL_MS);
      };
      setTimeout(tick, POLL_INTERVAL_MS);
    },
    cancel() {
      // Client closed the connection (tab closed / EventSource.close).
      // The async tick checks `closed` before pushing so this is enough.
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable Vercel buffering so events flush as they're written.
      'X-Accel-Buffering': 'no',
    },
  });
}
