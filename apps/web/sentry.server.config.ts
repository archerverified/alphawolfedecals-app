// Sentry init for the Next.js Node.js server runtime. Loaded by instrumentation.ts.
// DSN from env; when unset (CI, local without secrets) Sentry stays disabled.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enableLogs: true,
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
});
