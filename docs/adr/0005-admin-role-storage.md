# ADR-0005: Internal-admin role via a `users.is_admin` flag

- **Status**: Accepted
- **Date**: 2026-05-19
- **Deciders**: Archer
- **Related stories**: GH-004 (admin vehicle template CRUD), GH-003, GH-017
- **Supersedes**: n/a

## Context

GH-004 introduces the first privileged surface: the `/admin/vehicles` template
CRUD routes and the vehicle RLS write policies. Both need to answer "is this user
an internal Alpha Wolf admin?".

The existing identity model has no admin concept. `users.account_type` is
`customer | shop_user` and is **permanent** — a `BEFORE UPDATE` trigger
(`users_block_account_type_change`, ADR-0004) rejects any change, and the enum is
deliberately closed. So "admin" cannot be a third `account_type`: that would
break the permanence invariant and conflate _what kind of account this is_
(billing/feature surface) with _is this person staff_ (an internal grant that can
be given and revoked). They are orthogonal — an Alpha Wolf employee could also
hold a customer account.

Three storage options were on the table:

1. `is_admin BOOLEAN DEFAULT FALSE` on `users`.
2. A separate `system_role` enum column on `users`.
3. A separate `admins` table joined to `users`.

## Decision

Add **`is_admin BOOLEAN NOT NULL DEFAULT false`** to `users`.

- It is a grant orthogonal to `account_type`, so it is not subject to the
  permanence trigger (which only guards `account_type`) and can be set/revoked.
- The vehicle RLS policies read it through a `SECURITY DEFINER` helper,
  `app_is_admin()`, which returns `is_admin` for the current
  `app.current_user_id` (fails closed to `false` when unset). `SECURITY DEFINER`
  lets the policy read the flag without depending on the `users` self-select
  policy, and only ever discloses a boolean about the session user.
- The app gate (`requireAdmin()` in `apps/web/lib/admin/guard.ts`) reads the
  flag fresh from the user's own row each request via the RLS-scoped
  `getOwnUser`, and 404s (not 403s) non-admins so the route's existence is hidden
  (GH-004 AC). A pure, unit-tested `isAdminUser()` requires `is_admin === true`
  **and** `status === 'active'`.
- Provisioning is out-of-band: `pnpm --filter @alphawolf/db db:make-admin <email>`
  for humans, and a dev-only `POST /api/dev/make-admin` (404 in production, like
  the dev-otp peek route) for E2E. Both run on the system role (`withSystem`).

## Alternatives considered

- **`system_role` enum column** (e.g. `none | admin | superadmin`): cleaner if we
  expect a hierarchy of internal roles soon. Rejected for v1 — we have exactly
  one internal role today (Alpha Wolf admin), and a boolean is the smallest thing
  that works. Promoting to an enum later is a single additive migration + a swap
  of the `app_is_admin()` body; no policy or call-site shape changes.
- **Separate `admins` table**: most flexible for a future where staff carry
  per-area permissions (template editor vs. billing vs. support) or an audit
  trail of grants. Rejected as over-built for one boolean — it adds a join to
  every RLS admin check and an FK to manage, with no v1 payoff. Revisit when
  staff roles actually fan out (the in-app per-shop roles already live in
  `memberships`; a future internal-roles table would mirror that shape).

## Consequences

**Positive**

- Smallest possible change; no new table, no new enum, no churn to the permanent
  `account_type` invariant.
- One reusable predicate (`app_is_admin()`) backs every vehicle write policy and
  the request-queue policies; the app gate reuses the same flag.
- Admin status is read live (not baked into the JWT), so promote/demote takes
  effect on the next request.

**Negative**

- A boolean can't express multiple internal roles; the day we need
  template-editor vs. billing-admin separation we migrate to an enum or an
  internal-roles table (noted above as a clean path).
- `requireAdmin()` costs one extra DB round-trip per admin request (acceptable —
  admin traffic is low and the freshness is worth it).

## References

- /docs/adr/0002-monorepo-and-runtime-platform.md (RLS session-variable pattern)
- /docs/adr/0004 (auth: PII encryption, account_type permanence trigger)
- /packages/db/prisma/sql/auth_rls.sql (`app_is_admin()` + vehicle policies)
- /docs/vehicle-database-spec.md §2 (write = admin only)
