import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const RENDER_QUEUE_NAME = 'render';

export interface RenderJobPayload {
  renderJobId: string;
}

const globalForQueue = globalThis as unknown as {
  renderQueue?: Queue<RenderJobPayload>;
  redisConnection?: IORedis;
};

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection =
  globalForQueue.redisConnection ??
  new IORedis(redisUrl, { maxRetriesPerRequest: null });

export const renderQueue =
  globalForQueue.renderQueue ??
  new Queue<RenderJobPayload>(RENDER_QUEUE_NAME, { connection: redisConnection });

if (process.env.NODE_ENV !== 'production') {
  globalForQueue.renderQueue = renderQueue;
  globalForQueue.redisConnection = redisConnection;
}
