// Sentry initialisation — MUST be imported first, before any other module, so the
// SDK can instrument them (see index.ts). Reads the DSN from SENTRY_DSN; when it's
// absent (CI, local without secrets) Sentry stays uninitialised and every Sentry
// call is a no-op — and the native @sentry/profiling-node module is never loaded.

import * as Sentry from '@sentry/node';
import { scrubSentryEvent } from '@alphawolf/observability';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  const { nodeProfilingIntegration } = await import('@sentry/profiling-node');
  Sentry.init({
    dsn,
    integrations: [nodeProfilingIntegration()],
    // Send structured logs to Sentry.
    enableLogs: true,
    // Tracing — capture 100% of transactions (tune down in high-traffic prod).
    tracesSampleRate: 1.0,
    // Profiling — evaluated once per init; trace lifecycle profiles active traces.
    profileSessionSampleRate: 1.0,
    profileLifecycle: 'trace',
    // Never ship default PII (cookies, IPs, headers) to a third-party vendor —
    // that would bypass the pgcrypto/PII encryption boundary. The scrubber
    // strips any residual PII from every event before it's sent.
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    environment: process.env.NODE_ENV,
  });
}
