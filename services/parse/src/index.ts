// IMPORTANT: ./instrument must be the first import so Sentry instruments the rest.
import './instrument.js';
import * as Sentry from '@sentry/node';

// @alphawolf/parse — asset parse worker (GH-005).
//
// Two roles:
//   1. A library: apps/web imports { enqueue } from '@alphawolf/parse' to submit
//      parse jobs (inline when REDIS_URL is unset, BullMQ when set).
//   2. A standalone service: `pnpm --filter @alphawolf/parse dev` runs this file,
//      which exposes a /health endpoint and boots the BullMQ worker when REDIS_URL
//      is set, so a separate process drains the queue in production.
import express from 'express';
import { isQueueEnabled, startWorker } from './queue.js';

export { enqueue, isQueueEnabled, startWorker, closeQueue } from './queue.js';
export { processParseAsset } from './process.js';
export type { ParseAssetPayload, ParseAssetOptions, ParseOutcome } from './types.js';
export { classifyMime, isAllowedMime, MAX_FILE_SIZE_BYTES } from './mime.js';

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'parse', queue: isQueueEnabled() ? 'bullmq' : 'inline' });
});

// Dev/verification-only: an intentional error to confirm Sentry reporting works.
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug-sentry', () => {
    throw new Error('Sentry test error (parse)');
  });
}

// Sentry's Express error handler — after all controllers, before any other error
// middleware. No-op when Sentry is uninitialised (no DSN).
Sentry.setupExpressErrorHandler(app);

const port = Number(process.env.PORT ?? 4001);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`[parse] listening on :${port} (queue=${isQueueEnabled() ? 'bullmq' : 'inline'})`);
  });
  // Boot the worker only when Redis is configured; inline mode needs no worker.
  void startWorker().then((w) => {
    if (w) console.log('[parse] BullMQ worker started');
  });
}

export { app };
