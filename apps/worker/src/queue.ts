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
