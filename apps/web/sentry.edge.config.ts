// Sentry init for the Next.js Edge runtime (middleware, edge routes). Loaded by
// instrumentation.ts. DSN from env; disabled when unset.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enableLogs: true,
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
});
