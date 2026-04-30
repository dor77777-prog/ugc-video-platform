import { env } from './env';
import { Worker } from 'bullmq';
import {
  connection,
  RENDER_QUEUE_NAME,
  MAINTENANCE_QUEUE_NAME,
  ensureMaintenanceSchedules,
  type RenderJobPayload,
  type MaintenancePayload,
} from './queue';
import { processRenderJob } from './processors/render-processor';
import { runKlingSweep } from './processors/kling-sweep';

console.log('[worker] starting…');
// V14 PR9.3 marker — printed at every container boot. If Railway builds
// from the wrong commit, this string is the proof: it shows the SHA of
// the source the running container was COMPILED from. Railway sets
// RAILWAY_GIT_COMMIT_SHA for every build automatically.
const builtFromSha = process.env.RAILWAY_GIT_COMMIT_SHA ?? '(unknown — RAILWAY_GIT_COMMIT_SHA not set)';
console.log(`[worker] BUILD_MARKER=V14-PR9.3 builtFromSha=${builtFromSha}`);
console.log(`[worker] redis: ${env.redisUrl}`);
console.log(`[worker] concurrency: ${env.workerConcurrency}`);

const worker = new Worker<RenderJobPayload>(
  RENDER_QUEUE_NAME,
  async (job) => processRenderJob(job),
  { connection, concurrency: env.workerConcurrency },
);

// Maintenance worker — recurring background sweeps. Concurrency 1 since
// these are infrequent and we don't want them stomping on each other.
const maintenanceWorker = new Worker<MaintenancePayload>(
  MAINTENANCE_QUEUE_NAME,
  async (job) => {
    if (job.data.kind === 'kling_sweep') {
      return runKlingSweep();
    }
    throw new Error(`unknown maintenance kind: ${(job.data as { kind: string }).kind}`);
  },
  { connection, concurrency: 1 },
);

worker.on('ready', () => {
  console.log(`[worker] ready, listening on queue "${RENDER_QUEUE_NAME}"`);
});
maintenanceWorker.on('ready', () => {
  console.log(`[worker] ready, listening on queue "${MAINTENANCE_QUEUE_NAME}"`);
});

worker.on('completed', (job, result) => {
  console.log(`[worker] job ${job.id} completed →`, result);
});
worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed: ${err.message}`);
});
maintenanceWorker.on('completed', (job, result) => {
  console.log(`[worker] maintenance ${job.name} completed →`, result);
});
maintenanceWorker.on('failed', (job, err) => {
  console.error(`[worker] maintenance ${job?.name} failed: ${err.message}`);
});

// Install recurring schedules right after both workers come online.
ensureMaintenanceSchedules().catch((err) => {
  console.error('[worker] failed to install maintenance schedules:', err);
});

const shutdown = async () => {
  console.log('[worker] shutting down…');
  await worker.close();
  await maintenanceWorker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
