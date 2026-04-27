import { env } from './env';
import { Worker } from 'bullmq';
import { connection, RENDER_QUEUE_NAME, type RenderJobPayload } from './queue';
import { processRenderJob } from './processors/render-processor';

console.log('[worker] starting…');
console.log(`[worker] redis: ${env.redisUrl}`);
console.log(`[worker] concurrency: ${env.workerConcurrency}`);

const worker = new Worker<RenderJobPayload>(
  RENDER_QUEUE_NAME,
  async (job) => processRenderJob(job),
  { connection, concurrency: env.workerConcurrency },
);

worker.on('ready', () => {
  console.log(`[worker] ready, listening on queue "${RENDER_QUEUE_NAME}"`);
});

worker.on('completed', (job, result) => {
  console.log(`[worker] job ${job.id} completed →`, result);
});

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed: ${err.message}`);
});

const shutdown = async () => {
  console.log('[worker] shutting down…');
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
