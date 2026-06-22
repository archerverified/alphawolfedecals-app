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
import { storage } from '@alphawolf/db';
import { isQueueEnabled, startWorker } from './queue.js';

export { enqueue, isQueueEnabled, startWorker, closeQueue } from './queue.js';
export { processParseAsset } from './process.js';
export type { ParseAssetPayload, ParseAssetOptions, ParseOutcome } from './types.js';
export { classifyMime, isAllowedMime, MAX_FILE_SIZE_BYTES } from './mime.js';

const app = express();

// Goal 20 D3: result of the boot-time storage self-check, surfaced on /health so
// a misconfigured worker (pointed at the wrong Supabase project) is visibly
// unhealthy instead of silently failing every parse.
let storageHealth: 'ok' | 'unreachable' | 'unknown' = 'unknown';

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'parse',
    queue: isQueueEnabled() ? 'bullmq' : 'inline',
    storage: storageHealth,
  });
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
  // Goal 20 D3: verify the worker can actually see the project-assets bucket in
  // its configured Supabase project. A worker pointed at the wrong project (a
  // mismatched SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) otherwise consumes parse
  // jobs and marks each one 'failed' with "Bucket not found" while uploads land
  // fine in the correct project — a silent partial outage. Make that loud.
  void storage.checkAssetsBucketReachable().then((health) => {
    if (health.ok) {
      storageHealth = 'ok';
      console.log('[parse] storage self-check ok (project-assets reachable)');
      return;
    }
    // No storage env (local/CI inline mode) is expected; a real not_found/error
    // on a deployed worker is the misconfiguration we want to scream about.
    storageHealth = health.reason === 'unconfigured' ? 'unknown' : 'unreachable';
    const msg =
      `[parse] STORAGE SELF-CHECK FAILED (${health.reason}): ${health.message}. ` +
      'Parse downloads will fail until SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY point at the ' +
      'Supabase project that owns the project-assets bucket.';
    if (health.reason === 'unconfigured') {
      console.warn(msg);
    } else {
      console.error(msg);
      Sentry.captureMessage(msg, 'error');
    }
  });
  // Boot the worker only when Redis is configured; inline mode needs no worker.
  void startWorker().then((w) => {
    if (w) console.log('[parse] BullMQ worker started');
  });
}

export { app };
