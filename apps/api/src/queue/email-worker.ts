// Email retry worker — consumer side (Goal 3c). Drains the `email` BullMQ queue
// that apps/web's notification dispatch enqueues failed sends onto, and retries
// them via @alphawolf/auth's sendEmail (the one Resend client). Mirrors the parse
// worker (services/parse/src/queue.ts): bullmq/ioredis/@alphawolf/auth are
// imported DYNAMICALLY inside startEmailRetryWorker so importing this module for
// the pure processor (tests, typecheck) never loads them.
//
// Boots from apps/api's index.ts. No-op when no Redis URL is configured.

import type { Worker as BullWorker } from 'bullmq';
import type IORedisClient from 'ioredis';
import { EMAIL_QUEUE_NAME, type EmailRetryJob } from '@alphawolf/notifications';

export type EmailSender = (message: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<void>;

// Pure processor — re-send the rendered message. Throws on failure so BullMQ
// applies the queue's retry/backoff policy (set by the producer).
export async function processEmailJob(data: EmailRetryJob, send: EmailSender): Promise<void> {
  await send({ to: data.to, subject: data.subject, html: data.html, text: data.text });
}

// Same instance as apps/api's other queues + the apps/web producer; accept either
// env name (.env.example: UPSTASH_REDIS_URL and REDIS_URL hold the same value).
function redisUrl(): string | undefined {
  return process.env.UPSTASH_REDIS_URL ?? process.env.REDIS_URL;
}

export function isEmailWorkerEnabled(): boolean {
  return Boolean(redisUrl());
}

let connection: IORedisClient | null = null;

async function getConnection(): Promise<IORedisClient> {
  if (!connection) {
    const { default: IORedis } = await import('ioredis');
    connection = new IORedis(redisUrl() as string, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
  }
  return connection;
}

export async function startEmailRetryWorker(): Promise<BullWorker | null> {
  if (!isEmailWorkerEnabled()) return null;
  const [{ Worker }, { sendEmail }] = await Promise.all([
    import('bullmq'),
    import('@alphawolf/auth/server'),
  ]);

  const worker = new Worker<EmailRetryJob>(
    EMAIL_QUEUE_NAME,
    async (job) => {
      await processEmailJob(job.data, sendEmail);
    },
    {
      connection: await getConnection(),
      concurrency: 5,
      // Match parse's tuning: a long drain delay keeps idle blocking-pops cheap
      // against the Upstash free-tier command budget when the queue is empty.
      drainDelay: 30,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[email] retry job ${job?.id ?? '?'} failed: ${err.message}`);
  });
  worker.on('completed', (job) => {
    console.log(`[email] retry job ${job.id} delivered`);
  });
  return worker;
}
