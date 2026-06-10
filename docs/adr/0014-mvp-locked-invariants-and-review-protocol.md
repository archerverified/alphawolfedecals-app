# ADR-0014: ADR-0013 amendment — MVP-build locked invariants + review-stack swap

- **Status**: Accepted
- **Date**: 2026-06-10
- **Deciders**: Archer, Claude (Goal 4 — MVP verification + investor handoff)
- **Related stories**: Goal 4; PR #101 (pre-launch hardening), PR #116 (RLS recursion fix)
- **Supersedes**: n/a (amends ADR-0013; extends ADR-0002)

## Context

ADR-0013 locked the three deploy-infrastructure invariants. The MVP build since then
(Goals 2–3) introduced **further load-bearing invariants** — in the data/security
layer, the crypto layer, and the notification contract — that are exactly as
"silently unwind it and prod breaks" as the deploy three, but were never written
down. Goal 4's verification surfaced one of them the hard way: a self-referential
RLS policy caused an infinite-recursion outage on the entire shop-order path
(PR #116). Separately, the review stack changed: **CodeRabbit was retired**
2026-06-09 (the org ran out of credits; Archer approved the swap to a Claude-driven
protocol), so the deploy/security guardrails that lived in `.coderabbit.yaml` need a
new home or they rot. This ADR records both: the locked invariants the MVP
introduced, and the review-stack swap with the guardrail port.

## Decision

### A. Locked invariants the MVP build introduced

These join ADR-0013's deploy three. **Changing any of them requires an amendment
ADR in the same PR** (the same bar ADR-0013 sets).

**Data boundary (extends ADR-0002, PRD §8.2)**

1. **Two-connection split.** `withUser(userId, fn)` runs on the non-superuser
   `app_user` connection (`DATABASE_URL_APP`) with RLS enforced — every
   customer/shop query. `withSystem(fn)` runs on the privileged connection
   (RLS-bypassing) only for unauthenticated bootstrap. **Never `withSystem` for a
   user-scoped query.** A missing/empty `DATABASE_URL_APP` silently falls back to
   the superuser connection and disables RLS — so `DATABASE_URL_APP` being set is a
   deploy invariant, not a convenience.
2. **`app_user` is `NOBYPASSRLS`** with least-privilege grants — _that_, not its
   login status, is the boundary. The bootstrap SQL writes `NOLOGIN`, but the **live
   pooled role is `LOGIN`** (it must authenticate through pgBouncer); never "fix" the
   live role back to `NOLOGIN`, and never grant `BYPASSRLS` or widen its grants. Its
   `search_path` is pinned to `"$user", public, extensions` (pgcrypto lives in
   `extensions` on Supabase — unpinned, PII decryption fails on the pooled connection).
3. **Orders RLS triple** — `orders_owner_all` (customer owns), `orders_shop_read`,
   `orders_shop_update` (shop members, membership-gated USING + WITH CHECK). The
   `orders_shop_update` **WITH CHECK** is the only thing stopping a hand-crafted
   UPDATE from re-routing an order to another shop (there is no `owner_shop_id`
   immutability trigger) — it must not be dropped.
4. **Membership checks in RLS go through a `SECURITY DEFINER` helper, never an
   inline `EXISTS(memberships …)` inside a `memberships`-table policy.** A
   self-reference makes Postgres re-enter the policy → `42P17` infinite recursion
   (the PR #116 outage). `app_is_shop_member(uuid)` / `app_is_admin()` are
   `SECURITY DEFINER`, `search_path`-pinned (`public, pg_temp`), GUC-scoped (they
   disclose only a boolean about the current session user), and their `EXECUTE` is
   **revoked from PUBLIC/anon/authenticated and granted to `app_user` only** (closes
   Supabase linter 0028/0029). Any new membership/tenant predicate uses this pattern.
   (The helper pin is `public, pg_temp` — distinct from the role/PII pin
   `public, extensions, pg_temp`; don't conflate them.)
5. **Every RLS policy fails closed** — reads
   `current_setting('app.current_user_id', true)::uuid` with the trailing `true`
   (NULL → no rows). No `USING (true)`. Every new table gets a policy.
6. **Storage access control is at the app layer, not Storage RLS.** Because the app
   uses custom-GUC auth, `auth.uid()` is never populated, so Supabase Storage RLS
   cannot see the session user. Therefore: the `project-assets` bucket is **private,
   closed by default**; every read/write goes through an **ownership-checked,
   short-lived (24 h) server-signed URL** issued only after `getProject`/`getAsset`
   under `withUser`; and the **server-side** 50 MB + MIME-allowlist cap (in
   `asset.ts` / `services/parse`) is the real boundary (the client cap is UX). Making
   the bucket public, unbounding the TTL, signing without the ownership check, or
   dropping the server-side cap re-breaks tenant isolation with no RLS safety net.

**Connection / pooler (extends ADR-0002, MEMORY pool tuning)** 7. **`connection_limit=1`** on the Prisma connection strings (classic engine,
env-only — no code change). The Supabase **transaction pooler** (pgBouncer,
port 6543) is the runtime connection; tagged-template `$queryRaw`/`$executeRaw`
create prepared statements that **collide across pooled connections**, so raw SQL
uses `$queryRawUnsafe`/`$executeRawUnsafe` + the `pgQuoteLiteral` escaper. Do
**not** "fix" these to `$queryRaw`. Migrations/seeds use the **direct** connection
(`DIRECT_URL`, port 5432).

**Crypto (PRD §8.2)** 8. **`PII_ENCRYPTION_KEY` never rotates without a planned migration that re-encrypts
every PII column.** **`app_email_lookup_hash` HMAC keying is fixed** — rotating it
orphans every email lookup (the unique index). **argon2id** parameters are not
downgraded.

**Edge / headers / CSRF (PRD §10.20)** 9. **`apps/web/middleware.ts` is the source of truth for the security headers**
(CSP, HSTS 2 yr, X-Frame DENY, X-Content-Type-Options, Referrer-Policy,
Permissions-Policy), the per-IP auth rate limiter, **and the CSRF double-submit
bootstrap**. **Every state-changing route / Server Action is CSRF-protected.** CSP
`'unsafe-inline'`/`'unsafe-eval'` are **accepted** constraints (Next 15 bootstrap +
Tailwind v4; Konva canvas) tracked for a Phase-2 nonce migration — do not "fix"
them under pressure; do not let the headers be dropped by a `next.config`
consolidation; do not let the rate limiter or CSRF check fail open on a
state-changing/auth route.

**Notification contract (Goal 3c)** 10. **Order email dispatch is best-effort and MUST NOT throw or roll back the status
transition.** The transition is the source of truth; a flaky Resend can never
block production.

**RLS-apply / migration (MEMORY)** 11. **RLS-only changes live in `packages/db/prisma/sql/auth_rls.sql`** and are applied
via `db:apply-sql` (idempotent psql) — they are **not** Prisma migrations; the
git-tracked SQL is their source of truth, and **helper functions must be defined
above the policies that reference them** (Postgres resolves policy function refs
at `CREATE POLICY` time → a clean apply otherwise fails `42883`). _(Operational
hygiene, not an invariant: after applying a **Prisma schema** migration
out-of-band via the Supabase MCP, insert the `_prisma_migrations` checksum row so
`prisma migrate deploy` skips it.)_

**License (Goal 1 verdict — RESTRICTIVE)** 12. **Never ingest a RESTRICTIVE-licensed source** (the Pro Vehicle Outlines / PVO
derivatives, or any source whose license the Goal 1 gate flagged RESTRICTIVE)
into the catalogue or `vehicle_panels` data. Panel/template data is authored
in-house or from explicitly licensed sources only. (The _consequence_ — the 3 AW
templates currently lack panel geometry, so the editor is non-functional on them —
is a launch blocker, tracked in Follow-ups, not itself an invariant.)

### B. Review-stack swap — CodeRabbit → Claude review protocol

CodeRabbit is **retired**. Every PR now follows the protocol in **CLAUDE.md §3**:
(1) the repo's `/code-review` run in a **fresh context** (not the context that wrote
the code) against the full diff; (2) CI green; (3) PRs touching RLS, auth, the DB
split, or deploy config get an **independent (advisor) review**; the output is
recorded in the PR description. The `.coderabbit.yaml` semantic guardrails are
**ported to `docs/review/review-checklist.md`** (the per-path review bar the
`/code-review` protocol applies), and its `gitleaks` secret-scanning is **moved to
CI** (`.github/workflows/gitleaks.yml`). Only after the port is `.coderabbit.yaml`
removed.

## Alternatives considered

- **Keep CodeRabbit.** Not possible — the org is out of credits, and the project
  standardized on the Claude protocol (CLAUDE.md §3).
- **Leave the invariants undocumented / only in `.coderabbit.yaml`.** Rejected — that
  is exactly what let the RLS recursion ship; and retiring CodeRabbit would delete
  the only written record.
- **Edit ADR-0013 in place.** Rejected — the project's rule is an _amendment ADR_, so
  the change history stays legible.

## Consequences

**Positive**

- The MVP's load-bearing invariants are written down with the _why_, so a future PR
  changes them on purpose, not by accident.
- Review continuity through the CodeRabbit retirement; deploy/security guardrails
  survive as a checklist + a CI secret scan.

**Negative**

- The _semantic_ guardrails (e.g. "flag a CSP weakening") now depend on the reviewer
  reading the checklist, not an always-on bot. Mitigated by the fresh-context
  `/code-review` + the mandatory advisor review on RLS/auth/deploy PRs.

**Follow-ups**

- **AW-template panel data (launch blocker #1)** — the 3 catalogue templates have no
  `vehicle_panels`, so the editor is non-functional on them; author panel geometry
  (in-house / licensed, per invariant 12). Plus: activate edge rate-limiting,
  root-cause the upload 500, and the rest of the handoff launch-blocker list
  (`dist/mvp-handoff/handoff.md` §6).

## References

- /docs/adr/0013-deploy-infrastructure-contract.md
- /docs/adr/0002-monorepo-and-runtime-platform.md
- /docs/review/review-checklist.md
- /CLAUDE.md §3 (review protocol)
- /dist/mvp-handoff/handoff.md (Goal 4 findings + launch blockers)
- /activities.md entry 2026-06-10 (Goal 4 closeout)
