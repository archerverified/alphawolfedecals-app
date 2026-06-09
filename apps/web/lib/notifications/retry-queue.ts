// Email retry queue — producer side (Goal 3c). Mirrors @alphawolf/parse's queue
// adapter (services/parse/src/queue.ts): bullmq/ioredis are imported DYNAMICALLY
// so they never load (and never bloat the Next server bundle) when Redis is
// unconfigured. enqueueEmailRetry() is best-effort: when no Redis URL is present
// (CI, local, preview without secrets) it is a no-op — the dispatch layer has
// already logged the failure to Sentry, so a dropped retry is visible, not silent.
//
// The worker that drains this queue lives in apps/api (src/queue/email-worker.ts),
// alongside the other long-running BullMQ workers.

import type { Queue as BullQueue } from 'bullmq';
import type IORedisClient from 'ioredis';
import { EMAIL_QUEUE_NAME, type EmailRetryJob } from '@alphawolf/notifications';

// Retry harder than parse (5 attempts vs 3) since a transient Resend/DNS blip can
// span minutes; exponential backoff from 10s. Retention tuned for the Upstash
// free tier (drop completed fast, keep failures a day for triage).
export const EMAIL_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: { age: 3_600, count: 100 },
  removeOnFail: { age: 24 * 3_600, count: 500 },
};

// Same value across the stack (.env.example): parse reads REDIS_URL, apps/api
// reads UPSTASH_REDIS_URL — accept either so a single configured var works.
function redisUrl(): string | undefined {
  return process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_URL;
}

export function isRetryQueueEnabled(): boolean {
  return Boolean(redisUrl());
}

let queue: BullQueue | null = null;
let connection: IORedisClient | null = null;

async function getConnection(): Promise<IORedisClient> {
  if (!connection) {
    const { default: IORedis } = await import('ioredis');
    // maxRetriesPerRequest:null is REQUIRED by BullMQ; rediss:// gives TLS (Upstash).
    connection = new IORedis(redisUrl() as string, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
  }
  return connection;
}

async function getQueue(): Promise<BullQueue> {
  if (!queue) {
    const { Queue } = await import('bullmq');
    queue = new Queue(EMAIL_QUEUE_NAME, { connection: await getConnection() });
  }
  return queue;
}

export async function enqueueEmailRetry(job: EmailRetryJob): Promise<void> {
  if (!isRetryQueueEnabled()) return;
  const q = await getQueue();
  await q.add(EMAIL_QUEUE_NAME, job, EMAIL_JOB_OPTS);
}
