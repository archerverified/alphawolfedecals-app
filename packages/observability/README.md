# @alphawolf/observability

Cross-cutting observability helpers shared across the monorepo.

## `scrubSentryEvent`

A `beforeSend` hook for Sentry that strips PII and credentials from every event
before it leaves the process. **Every `Sentry.init()` in the monorepo must wire
it** and set `sendDefaultPii: false`:

```ts
import * as Sentry from '@sentry/node'; // or @sentry/nextjs
import { scrubSentryEvent } from '@alphawolf/observability';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
});
```

It removes `user.email` / `ip_address` / `username` (keeping only the opaque
`id`), drops `request.cookies` and sensitive request headers, and redacts
query-string tokens (including Supabase signed-URL `?token=` values) in the
request URL and every breadcrumb URL.

The module is **edge-runtime-safe**: its only dependency is a type-only import of
`@sentry/core`, which TypeScript erases at compile time. Keep it that way — never
add a `node:`-prefixed import to this package.

See `docs/vault/70-quick-reference.md` (Observability) and ADR-0011.
