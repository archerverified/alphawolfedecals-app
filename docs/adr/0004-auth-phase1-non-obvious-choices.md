# ADR-0004: Phase 1 auth — pgcrypto via session GUC, Postgres-backed rate limits, in-memory pending shop signup, dev OTP peek

- **Status**: Accepted
- **Date**: 2026-05-19
- **Deciders**: Archer
- **Related stories**: GH-001, GH-002, GH-020
- **Supersedes**: n/a

## Context

ADR-0001 and ADR-0002 locked the stack and the Auth.js + RLS pattern. The
Phase 1 auth PR (GH-001 / GH-002 / GH-020) made four further decisions
that are not derivable from those ADRs or the PRD, and that a future reader
should be able to find without re-deriving them.

## Decisions

### 1. pgcrypto symmetric key bound to the transaction via a session GUC

PII (name, email, phone, company name, etc.) is stored encrypted at the
column level using `pgcrypto`'s `pgp_sym_encrypt`. The key is supplied per
transaction via the session GUC `app.pii_key`, set alongside
`app.current_user_id` by the `@alphawolf/db` transaction middleware.

Helper SQL functions `app_encrypt_pii(text) → bytea` and
`app_decrypt_pii(bytea) → text` read the key with
`current_setting('app.pii_key', false)`, which fails loudly when unset
(no implicit "decrypt with null key" path).

The alternative — passing the key as a query parameter on every encrypt /
decrypt call — leaks it into `pg_stat_statements`, into logical-replication
WAL records, and into Sentry's query breadcrumbs. The GUC isolates the key
to the connection's memory for the duration of one transaction.

**Email lookup** uses `app_email_lookup_hash(text) → bytea`
(HMAC-SHA256 over `lower(email)` with the same key), stored in the
`users.email_lower_hash` unique-indexed column. This gives O(1) lookup by
email without exposing plaintext to indexes or logs.

The `users.password_hash` column stays as plain text — Argon2id output is
already irreversible, so encrypting it adds no security.

### 2. Postgres-backed rate limits (Phase 1) instead of Upstash Redis

ADR-0002 names Upstash Redis as the platform for BullMQ jobs. Rate-limit
state could live there too, but Upstash isn't provisioned yet and the
Phase 1 traffic shape (low-volume auth flows) doesn't need Redis-tier
latency. We added a `rate_limits` table and key-scoped sliding-window
logic in `packages/db/src/repos/rate-limit.ts`.

The data is keyed strings (`ip:<addr>:login`, `account:<id>:login`), no
foreign keys, so a Phase 2 migration to Redis is a straightforward
adapter swap with no schema dependency.

### 3. In-memory pending shop data between signup and OTP verification

Shop signup (GH-002) collects company name + phone + optional website /
address before email verification, but the user does not exist as a
verified account yet — so the shop row can't be created until the OTP
passes. The schema has no neutral place to park unverified shop data, so
during signup we stash it in an in-process `Map<userId, ShopFields>` with
a 30-minute TTL.

If the process restarts between signup submit and OTP entry, the pending
data is lost. The verify path still activates the user; first login after
that lands them on the shop setup screen (GH-009) where they can re-enter
the company info. Acceptable for Phase 1 — the alternative (a
`pending_shop_signups` table that exists for one feature) is over-engineered
for a 30-minute window.

### 4. Dev-only OTP peek endpoint for E2E

Resend's `onboarding@resend.dev` sender (Phase 1 constraint, see
[`/activities.md`](/activities.md)) only delivers to the Resend account
owner's mailbox, so Playwright cannot read OTPs from email during E2E
testing. The `apps/web/app/api/auth/dev-otp/route.ts` endpoint returns the
most recently-issued OTP for a given email from an in-process ring buffer
in `@alphawolf/auth/email.ts`.

The route returns 404 unconditionally when `NODE_ENV === 'production'`.
Phase 4 readiness verifies this gate.

### 5. JWT session strategy (not the database adapter)

Auth.js v5 is configured with `session.strategy = 'jwt'`. Sessions live in
an httpOnly + Secure + SameSite=strict cookie signed with `AUTH_SECRET`.
The DB session adapter would add a round-trip to every authenticated
request without giving us any Phase 1 capability we don't already have
(server-side revocation isn't required until GH-019, GDPR account
deletion).

`maxAge` is 30 days (PRD §4.1); `updateAge` is 1 day so the cookie's
expiration extends on activity without writing on every request.

## Consequences

**Positive**

- PII at rest is encrypted with a key that never lands in logs or
  replication payloads.
- Auth flows have no Redis dependency for Phase 1 — easier local dev,
  fewer failure modes.
- The shop-signup transient-state compromise costs no schema churn.
- E2E tests run hands-off against any Supabase dev project.

**Negative**

- The pgcrypto symmetric key cannot be rotated without a migration that
  decrypts every row with the old key and re-encrypts with the new one.
  Tracked as a Phase 4 followup.
- If the API process restarts mid-shop-signup, the user re-enters company
  info on first login. Documented in the signup UI copy.
- The Postgres rate limit is per-database, not per-region. Acceptable
  until we run multi-region (post-v1).

**Follow-ups**

- Production switchover: set `DATABASE_URL` to use the `app_user`
  non-superuser role (created in `prisma/sql/auth_rls.sql`) so RLS is
  actually enforced on the runtime connection. Track in Phase 4.
- Verify `alphawolfwrap.com` in Resend and switch `RESEND_FROM_EMAIL` so
  OTPs deliver to arbitrary addresses (this lifts the dev-only peek
  endpoint's role to legacy). Track in GH-016.
- Migrate rate-limit state to Upstash Redis when (a) BullMQ is wired and
  (b) auth traffic justifies the latency win.

## References

- [`/prd.md`](/prd.md) §10.1, §10.2, §10.20
- [`/docs/adr/0001-locked-stack.md`](/docs/adr/0001-locked-stack.md)
- [`/docs/adr/0002-monorepo-and-runtime-platform.md`](/docs/adr/0002-monorepo-and-runtime-platform.md)
- [pgcrypto symmetric encryption](https://www.postgresql.org/docs/16/pgcrypto.html#PGCRYPTO-PGP-SYM-ENCRYPT)
- [Auth.js v5 sessions](https://authjs.dev/concepts/session-strategies)
- [OWASP password storage cheat sheet (Argon2id)](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
