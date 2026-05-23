// @alphawolf/observability — cross-cutting observability helpers shared by every
// service that ships telemetry to a third-party vendor.
//
// The module graph here MUST stay edge-runtime-safe (no `node:`-prefixed imports
// anywhere) because apps/web imports it from the Sentry edge config. Today the
// only dependency is a TYPE-ONLY import of @sentry/core, which TypeScript erases
// at compile time — the emitted JS is pure ECMAScript (regexes, Sets, functions).
export { scrubSentryEvent } from './sentry-scrub.js';
