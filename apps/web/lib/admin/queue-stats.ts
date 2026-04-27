import { renderQueue } from '@/lib/queue';

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export async function getQueueCounts(): Promise<QueueCounts> {
  const counts = await renderQueue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
    'paused',
  );
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: counts.paused ?? 0,
  };
}

export interface FailedJobSummary {
  id: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  data: unknown;
}

export async function getRecentFailedJobs(limit = 10): Promise<FailedJobSummary[]> {
  const jobs = await renderQueue.getJobs(['failed'], 0, limit - 1, false);
  return jobs.map((j) => ({
    id: String(j.id),
    name: j.name,
    failedReason: j.failedReason ?? 'unknown',
    attemptsMade: j.attemptsMade,
    timestamp: j.timestamp,
    data: j.data,
  }));
}

export interface ActiveJobSummary {
  id: string;
  name: string;
  progress: number | object;
  timestamp: number;
}

export async function getActiveJobs(limit = 10): Promise<ActiveJobSummary[]> {
  const jobs = await renderQueue.getJobs(['active'], 0, limit - 1, false);
  return jobs.map((j) => ({
    id: String(j.id),
    name: j.name,
    progress: j.progress as number,
    timestamp: j.timestamp,
  }));
}
