// Queue adapter seam (ADR-0009). ONE function — enqueue() — decides at call time:
//   * REDIS_URL set   -> push a BullMQ job; the worker process (startWorker) runs it
//   * REDIS_URL unset -> run processParseAsset INLINE in the caller's process
// This keeps CI + Playwright green with zero external infra, while local dev with
// Upstash exercises the real BullMQ path. apps/web imports enqueue() from here.
//
// bullmq/ioredis are imported DYNAMICALLY so the inline path never loads them
// (keeps them out of the Next.js server bundle when REDIS_URL is absent).

import type { Queue as BullQueue, Worker as BullWorker } from 'bullmq';
import type IORedisClient from 'ioredis';
import { PARSE_QUEUE_NAME, type ParseAssetPayload } from './types.js';
import { processParseAsset } from './process.js';

export function isQueueEnabled(): boolean {
  return Boolean(process.env.REDIS_URL);
}

// Job retention tuned for the Upstash free tier (256 MB, 500k commands/month):
// drop completed jobs aggressively and cap failed-job retention so months of
// "parse_complete" records can't accumulate in hot Redis (ADR-0009 archival).
const JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 100 },
  removeOnFail: { age: 24 * 3_600, count: 500 },
};

let queue: BullQueue | null = null;
let connection: IORedisClient | null = null;

async function getConnection(): Promise<IORedisClient> {
  if (!connection) {
    const { default: IORedis } = await import('ioredis');
    // maxRetriesPerRequest:null is REQUIRED by BullMQ. rediss:// in the URL gives
    // TLS automatically (Upstash). Lazy connect so importing this module is cheap.
    connection = new IORedis(process.env.REDIS_URL as string, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
  }
  return connection;
}

// Goal 15 D8 (D13-1): an EVICTING Redis silently DROPS queued parse jobs — they
// vanish from Redis, so BullMQ's retry/attempts never fire (eviction isn't a job
// failure). BullMQ requires `noeviction`. On worker boot, verify the policy; try
// to pin it; if the host forbids CONFIG SET (Upstash free tier is fixed), warn
// LOUDLY so the reliability risk is visible instead of silent.
async function ensureNoEviction(conn: IORedisClient): Promise<void> {
  try {
    const res = (await conn.config('GET', 'maxmemory-policy')) as unknown;
    const policy = Array.isArray(res) ? (res[1] as string | undefined) : undefined;
    if (!policy || policy === 'noeviction') return;
    try {
      await conn.config('SET', 'maxmemory-policy', 'noeviction');
      console.warn(`[parse] redis maxmemory-policy was "${policy}" — pinned to noeviction`);
    } catch {
      console.error(
        `[parse] REDIS maxmemory-policy is "${policy}", NOT noeviction — queued parse jobs can ` +
          'be silently dropped. Pin the Redis/Upstash DB to noeviction or use a dedicated ' +
          'instance (Goal 15 D8 / ADR-0009).',
      );
    }
  } catch {
    // CONFIG GET unavailable (some managed Redis restrict it) — never block boot.
  }
}

async function getQueue(): Promise<BullQueue> {
  if (!queue) {
    const { Queue } = await import('bullmq');
    queue = new Queue(PARSE_QUEUE_NAME, { connection: await getConnection() });
  }
  return queue;
}

export async function enqueue(
  payload: ParseAssetPayload,
): Promise<{ mode: 'queued' | 'inline'; jobId?: string }> {
  if (isQueueEnabled()) {
    const q = await getQueue();
    const job = await q.add(PARSE_QUEUE_NAME, payload, JOB_OPTS);
    return { mode: 'queued', jobId: job.id ? String(job.id) : undefined };
  }
  await processParseAsset(payload);
  return { mode: 'inline' };
}

// Boots the BullMQ worker. No-op when REDIS_URL is unset (inline mode handles
// everything in-process). Called from index.ts when running as a standalone service.
export async function startWorker(): Promise<BullWorker | null> {
  if (!isQueueEnabled()) return null;
  const { Worker } = await import('bullmq');
  const conn = await getConnection();
  await ensureNoEviction(conn);
  const worker = new Worker<ParseAssetPayload>(
    PARSE_QUEUE_NAME,
    async (job) => {
      await processParseAsset(job.data);
    },
    {
      connection: conn,
      concurrency: 2,
      // Longer drain delay = fewer idle blocking-pop commands against the free-tier
      // command budget when the queue is empty (ADR-0009 budget tuning).
      drainDelay: 30,
    },
  );
  worker.on('failed', (job, err) => {
    console.error(`[parse] job ${job?.id ?? '?'} failed: ${err.message}`);
  });
  worker.on('completed', (job) => {
    console.log(`[parse] job ${job.id} completed`);
  });
  return worker;
}

// Test/teardown helper.
export async function closeQueue(): Promise<void> {
  await queue?.close();
  await connection?.quit();
  queue = null;
  connection = null;
}
