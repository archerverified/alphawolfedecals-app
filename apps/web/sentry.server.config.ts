// Sentry init for the Next.js Node.js server runtime. Loaded by instrumentation.ts.
// DSN from env; when unset (CI, local without secrets) Sentry stays disabled.
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@alphawolf/observability';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enableLogs: true,
  tracesSampleRate: 1.0,
  // Never ship default PII to a third-party vendor; scrub residual PII too.
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
  environment: process.env.NODE_ENV,
});
