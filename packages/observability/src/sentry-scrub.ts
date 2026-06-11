// Type-only import — erased at compile time, so no Sentry runtime code (and no
// `node:` deps) enters this module's emitted graph. Sentry v9 removed the old
// `@sentry/types` package; in v10 the event shapes live in @sentry/core, which
// every SDK (@sentry/node, @sentry/nextjs) re-exports.
import type { Event, EventHint } from '@sentry/core';

// Query-string credentials we redact wherever a URL appears (request URL or any
// breadcrumb URL). The first pattern covers the common token param names; the
// second is a belt-and-suspenders pass for Supabase signed-URL `?token=` values
// (whose JWT-shaped value can contain characters the first alternation list
// would otherwise stop at).
const TOKEN_QUERY_RE = /([?&](?:token|access_token|api_key|key|signature)=)[^&#]*/gi;
const SIGNED_URL_RE = /([?&]token=)[^&#]+/gi;

// Email addresses redacted from message-like fields (event.message, exception
// values, breadcrumb messages). Third-party APIs embed PII in error strings —
// e.g. Resend's testing-mode 403 includes the recipient's email address — and
// those strings arrive here verbatim via thrown Errors.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function redactEmails(text: string | undefined): string | undefined {
  if (!text) return text;
  return text.replace(EMAIL_RE, '[email]');
}

// Request headers dropped entirely — these carry credentials or session state
// that must never leave the encryption boundary. Compared case-insensitively.
const HEADERS_TO_DROP = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'x-api-key',
  'proxy-authorization',
]);

function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(TOKEN_QUERY_RE, '$1[redacted]').replace(SIGNED_URL_RE, '$1[redacted]');
}

function scrubHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return headers;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = HEADERS_TO_DROP.has(key.toLowerCase()) ? '[redacted]' : value;
  }
  return out;
}

/**
 * Strips PII and credentials from a Sentry event before it's sent.
 * Use as the `beforeSend` option on every Sentry.init() call in the monorepo.
 * Pair with `sendDefaultPii: false` (the Sentry SDK default we explicitly opt into).
 *
 * Drops/redacts:
 *  - event.user.email, event.user.ip_address, event.user.username (keeps only `id`)
 *  - event.request.cookies (whole object)
 *  - sensitive request headers (Authorization, Cookie, X-CSRF-Token, etc.)
 *  - query-string tokens in event.request.url and every breadcrumb URL
 *  - Supabase signed-URL ?token= values everywhere they appear
 *  - email addresses in event.message, exception values, and breadcrumb messages
 *
 * Generic over the event type so it is assignable to every SDK's `beforeSend`
 * hook, whose signature is `(event: ErrorEvent, hint: EventHint) => ErrorEvent`.
 * It mutates in place and returns the same event — we never drop events here.
 */
export function scrubSentryEvent<T extends Event>(event: T, _hint?: EventHint): T {
  // user identifiers — keep only the opaque DB id, never email/ip/username
  if (event.user) {
    event.user = { id: event.user.id };
  }

  if (event.request) {
    event.request.cookies = undefined;
    event.request.headers = scrubHeaders(event.request.headers);
    event.request.url = redactUrl(event.request.url);
    if (event.request.query_string) {
      event.request.query_string = '[redacted]';
    }
  }

  // message-like fields — third-party error strings can embed addresses
  if (event.message) {
    event.message = redactEmails(event.message);
  }
  if (event.exception?.values) {
    for (const value of event.exception.values) {
      value.value = redactEmails(value.value);
    }
  }

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      message: redactEmails(crumb.message),
      data: crumb.data
        ? Object.fromEntries(
            Object.entries(crumb.data).map(([key, value]) => [
              key,
              key === 'url' || key === 'to' || key === 'from' ? redactUrl(String(value)) : value,
            ]),
          )
        : crumb.data,
    }));
  }

  return event;
}
