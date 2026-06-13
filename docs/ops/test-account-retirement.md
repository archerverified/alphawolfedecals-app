# Test-account retirement policy (Goal 9 rider 5)

_Authored 2026-06-13. Owner: maintenance/ops. Companion to `packages/db/scripts/retire-test-accounts.ts`._

## Why this exists

Local E2E (Playwright), smoke, and proof runs execute against the **live shared
Supabase DB** (there is no separate dev DB — see `packages/db/prisma/sql/auth_rls.sql`
caveat). Every synthetic account they create therefore persists in production. By
2026-06-13 this had accumulated ~69 synthetic customers, and — separately — **8
`is_admin=true` customer accounts** (created 2026-06-12 during the Goal 7 proof run).

### Root cause of the elevated-flag leak

The 8 admin accounts were **not a breach**. The chain (all three required):

1. `POST /api/dev/make-admin` was gated only on `NODE_ENV === 'production'` (404 in
   prod) — it checks the **runtime**, not which DB it writes to.
2. Local/E2E runtime points at the **live shared DB**.
3. Unlike the sibling `/api/dev/drain-credits`, `make-admin` had **no target
   restriction** — it would promote any email.

So E2E specs (`vehicle-request`, `admin-vehicle`, `template-studio`) that call
`makeAdmin(request, email)` persisted `is_admin=true` onto synthetic accounts in
prod, and the e2e cleanup didn't retire them.

## The guard (prevents recurrence)

1. **`/api/dev/make-admin` is restricted to `@e2e.alphawolf.test`** (mirrors
   `drain-credits`) — the dev endpoint can never elevate a real customer.
2. **`users.setUserAdminByEmail(email, true)` refuses a NON-test email without an
   explicit `operatorOverride`.** Only the `db:make-admin` CLI passes the override
   (deliberate human provisioning of real staff). Synthetic test domains
   (`@e2e.alphawolf.test`, `@test.alphawolf.example`) elevate freely — E2E and the
   RLS integration tests need an admin — and those accounts are retired by the
   routine below. Revocation is always allowed.
3. **`createUser` rejects reserved synthetic domains in production runtime**
   (defense in depth, per the §3 security review): no real prod account can ever
   hold an email that the elevation guard trusts, so synthetic elevation no longer
   rests solely on the dev route's `NODE_ENV` gate. E2E/integration run with
   `NODE_ENV != production`, so they still create their test identities.

Net invariant: **the only `is_admin=true` accounts that can persist to prod are
either real staff (deliberate CLI) or synthetic test identities (retired).**

## The retirement routine

`packages/db/scripts/retire-test-accounts.ts` (`pnpm --filter @alphawolf/db
db:retire-test-accounts [--apply]`).

- **Deterministic cohort:** an account is "test" iff its decrypted email ends with
  a synthetic / RFC-reserved domain: `@e2e.alphawolf.test`, `@test.alphawolf.example`,
  `@example.com`, `@example-shop.test`. A real customer can never own these, so the
  allowlist **is** the safety guarantee — a real account never matches.
- **Dry run by default**; `--apply` deletes (cascade: projects → versions/assets/
  briefs/runs/jobs/images; user → credit_ledger/referral_attributions/otp/auth
  events; storage objects best-effort). Mirrors `db:cleanup-e2e`.
- **Tripwire:** any NON-test account that still carries `is_admin` is surfaced for
  human review and never auto-touched.
- **RLS-safe:** runs on `withSystem` (system maintenance, no user session).

### Standing rule

Prod E2E/proof runs retire every artifact they create (`db:cleanup-e2e` per run).
This routine is the periodic sweep that catches stragglers. Deleting real user data
requires this documented routine **plus** the §3 second security review.

### Execution status (2026-06-13)

- ✅ **0 admin-flagged accounts remain** (verified via Supabase — the Cowork
  revocation of the 8 held; the guard prevents recurrence).
- ⏳ Bulk retirement of the ~69 synthetic customers requires the prod env
  (`DATABASE_URL` + `PII_ENCRYPTION_KEY`, to decrypt + classify). Run
  `db:retire-test-accounts` (dry-run, review, then `--apply`) from an env that has
  those secrets. The routine + guard are merged and security-reviewed.
