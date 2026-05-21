// @alphawolf/parse — asset parse worker (GH-005).
//
// Two roles:
//   1. A library: apps/web imports { enqueue } from '@alphawolf/parse' to submit
//      parse jobs (inline when REDIS_URL is unset, BullMQ when set).
//   2. A standalone service: `pnpm --filter @alphawolf/parse dev` runs this file,
//      which exposes a /health endpoint and boots the BullMQ worker when REDIS_URL
//      is set, so a separate process drains the queue in production.

import express from 'express';
import { isQueueEnabled, startWorker } from './queue';

export { enqueue, isQueueEnabled, startWorker, closeQueue } from './queue';
export { processParseAsset } from './process';
export type { ParseAssetPayload, ParseAssetOptions, ParseOutcome } from './types';
export { classifyMime, isAllowedMime, MAX_FILE_SIZE_BYTES } from './mime';

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'parse', queue: isQueueEnabled() ? 'bullmq' : 'inline' });
});

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
