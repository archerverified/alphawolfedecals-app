// IMPORTANT: ./instrument must be the first import so Sentry instruments the rest.
import './instrument.js';
import * as Sentry from '@sentry/node';
import express from 'express';
import { startEmailRetryWorker } from './queue/email-worker.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api' });
});

// Dev/verification-only: an intentional error to confirm Sentry reporting works.
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug-sentry', () => {
    throw new Error('Sentry test error (api)');
  });
}

// Sentry's Express error handler — after all controllers, before any other error
// middleware. No-op when Sentry is uninitialised (no DSN).
Sentry.setupExpressErrorHandler(app);

const port = Number(process.env.PORT ?? 4000);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`[api] listening on :${port}`);
  });

  // Drain the order-notification retry queue (Goal 3c). No-op without a Redis URL.
  // Failures here must not crash the API process — log + report to Sentry.
  startEmailRetryWorker().catch((err: unknown) => {
    console.error('[email] failed to start retry worker:', err);
    Sentry.captureException(err);
  });
}

export { app };
