# Review checklist — per-path guardrails for the `/code-review` protocol

These are the **semantic review guardrails** ported from the retired
`.coderabbit.yaml` (CodeRabbit was retired 2026-06-09; see ADR-0014). The Claude
`/code-review` protocol (CLAUDE.md §3) applies the relevant items below when a PR
touches the matching path. **When you intentionally change one of these invariants,
amend the referenced ADR/PRD in the SAME PR** — that turns a flag into an approval.
Mechanical secret scanning is enforced separately in CI (`.github/workflows/gitleaks.yml`).

## Deploy infrastructure (ADR-0013 / ADR-0014)

- **`packages/db/prisma/schema.prisma`** — `generator client` `binaryTargets` MUST
  contain all of `native`, `rhel-openssl-3.0.x` (Vercel/AL2023), `debian-openssl-3.0.x`
  (Render/Debian 12). Removing any → runtime `couldn't find a query engine binary`.
  Blocking unless the same PR amends ADR-0013.
- **`apps/web/next.config.ts`** — must keep (a) `outputFileTracingRoot` →
  `path.join(__dirname, '../..')`; (b) the webpack `extensionAlias` `.js → .ts/.tsx`;
  (c) every `serverExternalPackages` entry. Any removal → Vercel lambda `Cannot find
module`. Blocking unless ADR-0013 amended.
- **`apps/web/package.json`** — the hoisted transitive externals (svgo, svgson,
  @node-rs/argon2, bullmq, ioredis, replicate, @sentry/profiling-node, @prisma/client,
  sharp) stay in `dependencies` even though apps/web source never imports them, and
  stay version-synced with the workspace package that consumes them. Removing/​skewing
  → runtime `Cannot find module`. Blocking unless ADR-0013 amended.
- **`render.yaml`** — each Node service `buildCommand` delegates to the root scripts
  (`pnpm render:install` + `render:build:api|parse`); flag any reintroduced inline
  build/install chain.

## Data boundary / RLS (ADR-0002 / ADR-0014, PRD §8.2)

- **`packages/db/prisma/sql/*.sql`** — every policy reads
  `current_setting('app.current_user_id', true)::uuid` (fails closed). Flag: any new
  table without a policy; any `USING (true)`; any grant to `app_user` beyond
  least-privilege; `app_user` must stay `NOBYPASSRLS`. **Membership/tenant predicates
  go through a `SECURITY DEFINER` helper (`app_is_shop_member`/`app_is_admin`),
  never an inline `EXISTS(memberships …)` inside a `memberships` policy** (42P17
  self-recursion). Helpers: `search_path`-pinned, GUC-scoped, `EXECUTE` to `app_user`
  only. Helper defs precede their policy callers (clean-apply ordering).
- **`packages/db/src/client.ts`** — review the `withUser` (app_user, RLS-enforcing)
  vs `withSystem` (superuser, RLS-bypass, bootstrap-only) boundary. Flag any
  `withSystem` on an authenticated/user-data path; any query that should be `withUser`
  but isn't; any `app.current_user_id` set from untrusted input. Don't "fix" the
  `$queryRawUnsafe` raw-SQL pattern to `$queryRaw` (transaction-pooler collision).
- **Storage (`packages/db/src/storage/supabase.ts`, upload actions)** — the
  `project-assets` bucket is **private**; access control is at the app layer (custom
  GUC auth means Storage RLS can't see the session user). Reads/writes only via
  **ownership-checked, short-lived server-signed URLs** issued after `getProject`/
  `getAsset` under `withUser`. Flag: making the bucket public; unbounded signed-URL
  TTL; a signed URL issued without the ownership check; an upload action that drops
  the **server-side** 50 MB + MIME-allowlist cap (the client cap is UX, not the
  boundary).

## Auth / edge (PRD §10.20)

- **`apps/web/middleware.ts`** — source of truth for the security headers (CSP,
  HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy),
  the per-IP auth rate limiter, and the CSRF double-submit bootstrap. Flag: CSP
  weakening (new `'unsafe-*'`, broad `*`, new external origin) without justification;
  dropping/loosening HSTS or frame-deny; the rate limiter failing **open** or being
  removed from auth routes.
- **`apps/web/app/**/route.ts`** and **`apps/web/lib/actions/\*.ts`** — every
authenticated/user-data path runs DB access inside `withUser`(never`withSystem`);
**every state-changing handler/Server Action is CSRF-protected** (double-submit).
Flag a new `withSystem` call or a missing CSRF/auth check.
- **`packages/auth/src/csrf*.ts`** — CSPRNG tokens, constant-time compare,
  session-bound; no state-changing route silently exempted.
- **`packages/auth/src/password.ts`** — argon2id with sane params (no downgrade /
  reduced cost); constant-time verify; never log a plaintext password or full hash.
- **`packages/auth/src/otp.ts`** — CSPRNG codes, bounded expiry, constant-time
  compare, send rate-limited (5/email/hour), never logged.

## Crypto (ADR-0014)

- `PII_ENCRYPTION_KEY` never rotates without a re-encrypt migration;
  `app_email_lookup_hash` HMAC keying is fixed (rotating orphans the email index).

## Path filters (don't review)

`pnpm-lock.yaml`, `*.lock`, `dist/**`, `.next/**`, lighthouse baseline HTML,
`docs/deployment/screenshots/**`.
