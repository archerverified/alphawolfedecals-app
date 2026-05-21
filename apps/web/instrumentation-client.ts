// Sentry init for the browser. Uses the PUBLIC DSN (must be exposed to the client
// bundle as NEXT_PUBLIC_SENTRY_DSN); disabled when unset. Also wires navigation
// instrumentation for the App Router.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enableLogs: true,
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
