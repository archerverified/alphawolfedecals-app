// Sentry init for the Next.js Edge runtime (middleware, edge routes). Loaded by
// instrumentation.ts. DSN from env; disabled when unset.
import * as Sentry from '@sentry/nextjs';
// scrubSentryEvent is edge-runtime-safe — its only dependency is a type-only
// import erased at compile time, so no node: code enters the edge bundle.
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
