import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';

export const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
});

export const RENDER_QUEUE_NAME = 'render';

export interface RenderJobPayload {
  renderJobId: string;
}

export const renderQueue = new Queue<RenderJobPayload>(RENDER_QUEUE_NAME, {
  connection,
});

// Maintenance queue — recurring jobs that aren't tied to a single user
// action. Currently used for the Kling stuck-task sweep (hourly).
export const MAINTENANCE_QUEUE_NAME = 'maintenance';
export type MaintenancePayload =
  | { kind: 'kling_sweep' };

export const maintenanceQueue = new Queue<MaintenancePayload>(
  MAINTENANCE_QUEUE_NAME,
  { connection },
);

// Idempotently install the recurring jobs. Safe to call on every worker
// start — BullMQ dedupes by jobId.
export async function ensureMaintenanceSchedules(): Promise<void> {
  await maintenanceQueue.add(
    'kling_sweep',
    { kind: 'kling_sweep' },
    {
      repeat: { every: 60 * 60 * 1000 }, // 1 hour
      jobId: 'recurring:kling_sweep',
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  );
}
