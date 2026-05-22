// Sentry init for the browser. Uses the PUBLIC DSN (must be exposed to the client
// bundle as NEXT_PUBLIC_SENTRY_DSN); disabled when unset. Also wires navigation
// instrumentation for the App Router.
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@alphawolf/observability';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enableLogs: true,
  tracesSampleRate: 1.0,
  // Session Replay is off: it captures the DOM, which would defeat the scrubber.
  // Re-enabling it is an ADR-0011 conversation (capture must be PII-aware).
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 0.0,
  // Never ship default PII to a third-party vendor; scrub residual PII too.
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
  environment: process.env.NODE_ENV,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
