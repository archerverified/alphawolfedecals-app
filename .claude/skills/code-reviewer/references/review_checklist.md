# Code Review Checklist

The scanner catches the easy stuff. This checklist catches what regex can't.

Walk it top-to-bottom for a fresh PR review. For small diffs, scan headings and skip irrelevant sections. Don't pad reports with checklist items that don't apply — silent skip is fine.

## Table of contents

1. [Correctness](#1-correctness)
2. [Security](#2-security)
3. [Error handling](#3-error-handling)
4. [Performance](#4-performance)
5. [Data integrity](#5-data-integrity)
6. [API design](#6-api-design)
7. [Frontend / UI](#7-frontend--ui)
8. [Testing](#8-testing)
9. [Maintainability](#9-maintainability)
10. [Operational concerns](#10-operational-concerns)

---

## 1. Correctness

The most expensive bugs are the ones where the code does the wrong thing silently.

- **Off-by-one boundaries** — pagination, slice indices, time ranges. Does the last element get included? Is the cursor exclusive or inclusive?
- **Null/undefined paths** — every `obj.field.nested` lookup is a potential `Cannot read property 'nested' of undefined`. Map through the call chain.
- **Empty array / empty string** — `.reduce()` without initial value throws on empty array. `[0]` on empty string returns undefined. Does the code handle the zero case?
- **Negative numbers** — for prices, quantities, indices. Does it accept them silently when it shouldn't?
- **Timezone confusion** — naive datetimes, mixing UTC and local, DST transitions. If the code stores or compares dates, find the seam.
- **Floating point comparisons** — `0.1 + 0.2 !== 0.3`. For currency use integer cents/satoshis or a decimal library.
- **Race conditions** — two requests writing to the same row. Same user clicking submit twice. Check for locks, idempotency keys, or optimistic concurrency.
- **Off-spec inputs** — what happens with `null`, `undefined`, empty object, wrong type, mixed casing, leading/trailing whitespace, emoji, RTL text, very long string?

## 2. Security

Threat model: assume the request is malicious until proven otherwise.

- **Authentication on every protected route** — not just the UI gating it. Anyone can call your API directly.
- **Authorization separate from authentication** — being logged in ≠ being allowed to read/write this specific record. Check `user_id === resource.owner_id` (or your equivalent).
- **Input validation at the boundary** — every external input parsed with Zod / Pydantic / similar before it touches business logic. Trust nothing from `req.body`, query params, URL params, cookies, or headers.
- **Output encoding** — anything rendered to HTML escapes by default (React does this); anything to SQL uses parameters; anything to a shell uses argv arrays.
- **Secrets in env vars, never source** — and never in client bundles. Anything with `NEXT_PUBLIC_` is public. Anything passed through props can be inspected.
- **Rate limiting on expensive / abusable endpoints** — auth, password reset, OTP, email send, file upload, search. If it costs you money per call, rate-limit it.
- **CORS / CSP / cookies** — `SameSite=Lax` minimum for session cookies. CORS allowlist explicit, not `*`. CSP at least `default-src 'self'`.
- **File uploads** — content-type validation server-side (not just extension), size limit, virus scan if user-uploaded files are served to other users, store outside web root or behind signed URLs.
- **Redirects** — open redirect to attacker-controlled URLs. Validate the host of any `?redirect=` param.
- **Mass assignment** — `User.update({ ...req.body })` lets the user set `is_admin: true`. Pick allowed fields explicitly.

## 3. Error handling

- **Every async call has a failure path** — even if the path is "log and return null", it should exist.
- **No silent swallows** — `catch (e) { /* nothing */ }` is almost always wrong. At minimum, log.
- **User-facing errors don't leak internals** — no stack traces in production responses. No DB error messages. No file paths. Generic "Something went wrong" + an error ID for support.
- **Retries are bounded and idempotent** — exponential backoff, max attempts, only retry on known-transient failures (network, 5xx, rate limit).
- **Timeouts on every external call** — `fetch`, `requests`, DB queries, subprocess. Without a timeout, one slow upstream hangs your entire process.
- **Transactions roll back on error** — if step 2 of 3 fails, step 1 must roll back. Half-finished state is worse than no state.

## 4. Performance

- **N+1 queries** — loading a list of N items then making N additional queries inside the loop. Use joins, `IN` clauses, or batch loaders.
- **Pagination on every list endpoint** — `LIMIT 1000` is not pagination. Use cursor or page-based pagination with sensible defaults.
- **Indexes match query patterns** — `WHERE` columns, `ORDER BY` columns, `JOIN` columns. If the table is > 10k rows and the query is slow, the index is missing or wrong.
- **No work in render** — React components shouldn't sort/filter large arrays inline on every render. Use `useMemo` or move the work upstream.
- **No work in the request hot path** — sending email, generating PDFs, third-party API calls. Push to a queue, respond fast.
- **Cache invalidation is correct** — caching the wrong thing is worse than no cache. Confirm: what's the cache key? When does it expire? What invalidates it on writes?

## 5. Data integrity

- **DB constraints match invariants** — `NOT NULL`, `UNIQUE`, foreign keys, check constraints. If "every user has exactly one primary email" is a business rule, enforce it in the schema.
- **Migrations are reversible** — every `up` has a `down`. Always.
- **Migrations are safe to run on production** — no `ALTER TABLE` that locks a large table during peak hours. Use online schema changes.
- **No data loss in destructive operations** — `DELETE` and `DROP` reviewed extra carefully. Soft-delete if the row might ever need to come back.
- **Sensitive fields encrypted at rest** — PII, credentials, tokens. At minimum, hash passwords (bcrypt/argon2, never MD5/SHA1).

## 6. API design

- **Status codes match outcomes** — 200 for success, 201 for created, 204 for empty success, 400 for client error, 401 for unauthenticated, 403 for unauthorized, 404 for not found, 409 for conflict, 422 for validation, 429 for rate limit, 500 for server error.
- **Error responses are structured** — `{ error: { code, message, field? } }`, not a string or HTML.
- **Idempotency for POST/PUT** — if the client retries on network failure, will it create duplicates? Use idempotency keys for charge endpoints, etc.
- **Versioning strategy is documented** — `/api/v1/` in URL, or `Accept-Version` header, or whatever. Just have one.
- **Pagination is consistent** — same param names (`limit`, `cursor`, `page`) across all endpoints.

## 7. Frontend / UI

- **Loading states** — what does the user see between request start and response? Spinner, skeleton, optimistic update?
- **Error states** — what does the user see when the request fails? "Try again" button? Recovery path?
- **Empty states** — first-time user with no data. New users shouldn't see broken-looking empty grids.
- **Form validation on submit AND on blur** — clear error messages, near the offending field, not just at the top.
- **Keyboard accessible** — every interactive element reachable by Tab, activatable by Enter/Space, with visible focus ring.
- **Mobile responsive** — does the layout work at 375px wide? Tap targets at least 44×44px?
- **No layout shift on data load** — reserve space for content. Use skeletons that match final dimensions.
- **No memory leaks** — every `addEventListener` has a `removeEventListener` in cleanup. Every subscription has an unsubscribe.

## 8. Testing

- **Critical paths have integration tests** — auth, payment, signup, the thing that touches money or user accounts.
- **Tests are deterministic** — no `Math.random`, no `Date.now()` without freezing, no `setTimeout`-based waits.
- **Tests test behavior, not implementation** — refactoring the internals shouldn't break tests. Test inputs → outputs.
- **Edge cases covered** — empty, null, max length, boundary values, error path.
- **No skipped tests committed** — `.only`, `.skip`, `xit` are PR blockers.

## 9. Maintainability

- **Names describe intent, not implementation** — `getUserById` not `dbCall1`. `isActive` not `flag`.
- **Functions do one thing** — if you can't summarize what it does in one sentence, it's doing too much.
- **No commented-out code** — if you might need it again, that's what git is for.
- **Types are precise** — `string` is better than `any`; `'admin' | 'user'` is better than `string`.
- **No magic numbers** — `if (retries > 3)` → `const MAX_RETRIES = 3`.
- **Comments explain why, not what** — `// retry up to 3 times` is noise. `// retry because upstream API has transient 503s during their deploys` is useful.

## 10. Operational concerns

- **Structured logging** — `logger.info({ event: 'user.signup', userId, source })` not `console.log("user signed up: " + email)`. Searchable, parseable, no PII in plaintext.
- **Metrics for important things** — counters for events, gauges for state, histograms for latencies. Tie to alerts.
- **Health checks** — `/health` returns 200 if the service is up. `/ready` checks downstream deps.
- **Graceful shutdown** — handle SIGTERM, finish in-flight requests, drain queues, close DB pools.
- **Feature flags for risky changes** — don't ship a big new auth flow to 100% of users on Friday at 5pm.
