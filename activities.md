# Alpha Wolf Wrap Studio — Project Activities Log

Append-only event log for the build. Every architectural decision, story completion, and meaningful working session gets a new entry at the top. Do not edit prior entries — corrections are new entries that reference the original.

Companion to the Obsidian vault at `/docs/vault/`. The in-app per-project activities log (PRD section 4.10, story GH-013) is a separate concept — this file is the project-level dev log.

---

## 2026-05-19 — Archer + Claude ([infra] dev RLS enforcement via app_user)

- **Context**: The Phase 1 auth PR shipped RLS policies but ran every Prisma query — authenticated and bootstrap alike — through the Supabase `postgres` superuser, which bypasses RLS. So in dev, RLS policies attached but never actually enforced. This unblocks Step 4 (vehicle templates) from landing code that assumes RLS works in dev when it didn't. Discharges the dev half of the prior entry's "Production RLS hardening" followup.
- **Decision**: `@alphawolf/db` now uses **two physical connections**. `withUser` (authenticated request paths) runs on the non-superuser `app_user` role via `DATABASE_URL_APP` (NOBYPASSRLS) so RLS enforces. `withSystem` (signup, OTP, login, audit writes) keeps the superuser `DATABASE_URL`, which bypasses RLS — required because those bootstrap paths run before a user is authenticated and `prisma/sql/auth_rls.sql` deliberately defines no INSERT policy. Implements ADR-0002's session-variable pattern; no new ADR.
  - **Why two connections, not one**: pointing the single shared client at `app_user` would have broken signup/login/OTP outright — under `nobypassrls` with no `app.current_user_id`, the bootstrap INSERTs are denied and SELECTs fail closed. `auth_rls.sql` already documents that bootstrap "runs as the system role (BYPASSRLS)"; this just makes the implementation match. `auth_rls.sql` was not modified.
- **Decision**: `getPrisma()` defaults its `datasourceUrl` to `DATABASE_URL_APP`, falling back to `DATABASE_URL` with a once-per-process `console.warn('[db] RLS bypass — running as superuser. Set DATABASE_URL_APP before production.')`. The warning is load-bearing: it fires on first DB touch of any path (including signup) so a contributor who forgets `DATABASE_URL_APP` can't silently lose RLS enforcement.
- **Decision**: First real-DB integration test — `packages/db/tests/rls.integration.test.ts` — proves cross-tenant isolation: with `app.current_user_id` pinned to user A, `withUser(A, db => db.user.findMany())` returns only A's row, never B's. Lives in a dedicated Vitest `integration` project (new `vitest.workspace.ts`), excluded from the default `vitest run` so an unreachable dev DB never fails CI. Run via `pnpm --filter @alphawolf/db test:integration`.
- **Artifacts produced**: `packages/db/src/client.ts` (two-connection split + `getSystemPrisma()` + RLS-bypass warning), `packages/db/vitest.workspace.ts` (unit + integration projects), `packages/db/tests/rls.integration.test.ts`, `test:integration` script, `DATABASE_URL_APP` in `.env.example` and `turbo.json` `globalEnv`.
- **Hard scope**: Production secret management (Phase 4 staging deploy), a full testcontainers harness, and a CI integration-test job are explicitly NOT in this PR — parked as follow-ons. `auth_rls.sql`, `password.ts`, `otp.ts`, signup logic, and `apps/web` untouched.
- **Followups**:
  - **CI integration job**: wire `pnpm --filter @alphawolf/db test:integration` into CI against an ephemeral/seeded test DB (needs a test-DB bootstrap + `DATABASE_URL_APP` secret). Separate PR.
  - **Production RLS hardening (remaining)**: provision the `app_user` password and `DATABASE_URL_APP` in the Phase 4 staging/prod secret store; confirm the production runtime connection is `app_user`, not the superuser.

## 2026-05-19 — Archer + Claude (Phase 1 auth: GH-001 + GH-002 + GH-020)

- **Decision**: PII (name, email, phone, company name, website, address) is encrypted at rest via pgcrypto column encryption. The symmetric key is injected per-transaction via the Postgres GUC `app.pii_key`, alongside `app.current_user_id`, by `@alphawolf/db`'s `withUser` / `withSystem` helpers. SQL-side helpers `app_encrypt_pii`, `app_decrypt_pii`, and `app_email_lookup_hash` read the key — the key never crosses the wire as a query parameter. See ADR-0004 §1.
- **Decision**: Email lookup is deterministic via HMAC-SHA256 (`email_lower_hash`, unique-indexed) so login can find a user by email without exposing plaintext to indexes or replication slots.
- **Decision**: `account_type` permanence is enforced by a `BEFORE UPDATE` trigger (`users_block_account_type_change`) rather than a check constraint, so the rule applies even for the superuser connection used by migrations. Trigger raises with `errcode = 'check_violation'`.
- **Decision**: RLS policies attached to `users`, `shops`, `memberships`, `otp_codes`, `auth_events`. All read `current_setting('app.current_user_id', true)::uuid` and fail closed when unset. A non-superuser `app_user` role is created in `prisma/sql/auth_rls.sql`; production `DATABASE_URL` must switch to this role before launch — superuser bypasses RLS in dev (tracked as Phase 4 followup).
- **Decision**: `@alphawolf/db` exposes `withUser(userId, fn)` and `withSystem(fn)` transaction helpers. The Prisma `$extends` middleware shape can't naturally wrap every query in a transaction without infinite recursion; the explicit-helper pattern is what the Prisma docs recommend for RLS session-var setups. Repos like `users.createUser` use `withSystem` for unauthenticated bootstrap paths (signup, OTP issuance, password reset).
- **Decision**: ESLint `no-restricted-imports` rule bans bare `@prisma/client` imports outside `packages/db`. ADR-0002 followup discharged.
- **Decision**: Auth.js v5 with JWT session strategy (not DB adapter). 30-day `maxAge`, 1-day `updateAge`, cookie is httpOnly + Secure + SameSite=strict with `__Secure-` / `__Host-` prefixes in production. Argon2id at `m=64 MiB, t=3, p=4` per OWASP. ADR-0004 §5.
- **Decision**: Rate limit + lockout state lives in Postgres (`rate_limits` table) for Phase 1, not Upstash Redis. Auth flows are low-volume and we don't have Upstash provisioned. The repo surface is key-scoped strings so a Phase 2 Redis swap is an adapter change with no schema churn. ADR-0004 §2.
- **Decision**: Lockout policy implemented: 5 failed logins per IP per 15 min → IP lockout (15 min in Phase 1, exponential backoff is a Phase 2 refinement once we have lockout history data); 10 failed logins per account → 1-hour account lockout. All auth events (`signup`, `login`, `login_failed`, `otp_*`, `account_locked`, `ip_locked`) written to `auth_events`.
- **Decision**: Pending shop signup data (company name, phone, website, address) is held in an in-process Map between signup and OTP verify. 30-minute TTL, lost on restart. If lost, the user re-enters company info via the shop setup wizard (GH-009). Acceptable for Phase 1; a dedicated `pending_shop_signups` table is over-engineered for a 30-min window. ADR-0004 §3.
- **Decision**: Dev-only `GET /api/auth/dev-otp?email=…` endpoint returns the most-recent OTP for a given email from an in-process ring buffer. Hard-gated on `NODE_ENV !== 'production'`. Required for Playwright E2E because the Resend sandbox sender only delivers to the Resend account owner. ADR-0004 §4.
- **Decision**: OTP codes are stored as argon2id hashes (cheaper parameters: `m=16 MiB, t=2, p=1` — short-lived, low-entropy). Plaintext never lands in the DB. Prior open codes for the same (user, purpose) are consumed when a new code is issued, so a fresh code invalidates the previous one.
- **Decision**: CSRF for the bespoke signup/verify/resend server actions uses the double-submit-cookie pattern with a separate `alphawolf.csrf-form` cookie + hidden form field, comparison via `timingSafeEqual`. Auth.js continues to handle CSRF for its own sign-in endpoints.
- **Artifacts produced**: Prisma schema (`users`, `shops`, `memberships`, `otp_codes`, `auth_events`, `rate_limits`), `prisma/sql/auth_rls.sql` (pgcrypto extension, helper functions, app_user role, RLS policies, permanence trigger), `@alphawolf/db` (client + crypto + repos), `@alphawolf/auth` (password / otp / lockout / email / signup / login / csrf / Auth.js wrappers), `apps/web` (signup pages, verify page, welcome pages, server actions, dev-otp peek route, Auth.js handler), Vitest suite (59 tests, 93.4% statement coverage on `@alphawolf/auth`), Playwright spec (`apps/web/e2e/signup.spec.ts`) for both account types' happy paths plus wrong-code retry, ESLint rule banning `@prisma/client` outside `packages/db`, ADR-0004.
- **Hard scope**: Vehicle template, asset upload, editor work explicitly NOT in this PR — those are Steps 4–5.
- **Followups**:
  - **Production RLS hardening**: switch `DATABASE_URL` to the `app_user` non-superuser role (created in `auth_rls.sql`) before public launch. Currently dev uses the Supabase `postgres` superuser, which bypasses RLS in practice. Tracked in Phase 4 hardening pass.
  - **Domain + Resend verification**: verify `alphawolfwrap.com` in Resend; switch `RESEND_FROM_EMAIL` to `no-reply@alphawolfwrap.com`; align SPF/DKIM/DMARC. Lifts the dev OTP peek endpoint's role to legacy. Track in GH-016.
  - **Rate-limit migration**: when Upstash is provisioned and auth volume justifies it, swap the `rate_limits` repo for a Redis adapter. No schema churn required.
  - **PII key rotation runbook**: pgcrypto symmetric key cannot be rotated without a planned migration that decrypts every row with the old key and re-encrypts with the new one. Phase 4.
  - **Integration tests against real DB**: the test suite is unit-only with mocked `@alphawolf/db`. Integration tests (testcontainers or local Supabase) per the task spec are a follow-on PR once we standardize the test-DB bootstrap.

---

## 2026-05-18 — Archer + Claude (monorepo skeleton + CI)

- **Decision**: Adopted pnpm workspaces + Turborepo as the monorepo orchestration. Top-level layout locked: `apps/{web,api}`, `services/{parse,ai,paneling}`, `packages/{db,ui,canvas,auth}`. Adding a new top-level package or service now requires a superseding/supplementary ADR.
- **Decision**: GitHub Actions CI runs `lint + typecheck + test` for Node (`pnpm turbo run …`) and matrixed `ruff + pytest` for Python services on every PR. Merge to `main` is blocked on green. Conventional commits enforced via husky `commit-msg` + commitlint; PR title is not CI-enforced so `[infra]` prefixes are permitted.
- **Decision**: API tier is Express 5 (deferred Express/Hono pick from ADR-0001). Background jobs use BullMQ on Upstash Redis; queue names (`parse`, `ai`, `paneling`) declared centrally in `apps/api/src/queue/queues.ts`.
- **Decision**: Multi-tenant isolation enforced at the database via Postgres RLS, with the user ID propagated through the Postgres session variable `app.current_user_id`. Set by Prisma `$extends` middleware per request (transaction-scoped via `set_config(…, true)`); policies read it via `current_setting('app.current_user_id', true)::uuid` (fails closed when unset). All Prisma calls must flow through the `@alphawolf/db` client factory — bare `@prisma/client` imports will be linter-blocked in the auth feature PR.
- **Decision**: `services/parse` is a Node worker (not Python), running Sharp + svgo + Inkscape CLI + pdf2svg CLI + rembg via the Replicate API. AI orchestration and print paneling remain Python per ADR-0001. This amends ADR-0001's Python-only stance on backend services.
- **Decision**: Python services standardize on **uv** (`uv sync --frozen`, `uv run`) for env + dependency management. pyproject.toml + uv.lock are the canonical files.
- **Artifacts produced**: `apps/web` (Next.js 15 + React 19 + Tailwind v4 + shadcn/ui scaffolding + Playwright + Vitest), `apps/api` (Express 5 + BullMQ queue wiring), `services/parse` (Node stub, `/health` only), `services/ai` + `services/paneling` (FastAPI stubs, `/health` only), `packages/db` (empty Prisma schema), `packages/ui` (shadcn target package + `cn()` helper), `packages/canvas` + `packages/auth` (empty placeholders), root tooling (pnpm-workspace, turbo, tsconfig.base, ESLint flat config, Prettier, commitlint, husky, lint-staged), `.github/{pull_request_template.md, workflows/ci.yml}`, `CODEOWNERS`, `.env.example` (all keys from the readiness checklist, no values), ADR-0002, ADR-0003.
- **Hard scope**: No GH-001…GH-022 implementation in this PR. Structure and tooling only.
- **Followups**: Auth feature PR adds Prisma `$extends` middleware, ESLint rule banning bare `@prisma/client` imports, and the first RLS policies. Deployment ADR (later) records the Docker base image with Inkscape + pdf2svg preinstalled. Observability stack (Sentry / PostHog / OpenTelemetry) wired in its own ADR + PR.

## 2026-05-18 — Archer + Claude (kickoff infrastructure)

- **ADRs**: Created ADR template at `/docs/adr/template.md`, ADR-0000 (record decisions using MADR), ADR-0001 (lock v1 stack to Next.js 15 + Node + Postgres + Python AI services).
- **Readiness checklist**: Created `/docs/phase-1-readiness-checklist.md` covering accounts, secrets, domain, repo hygiene, team cadence, vehicle DB pre-work, and legal stubs.
- **Status**: All planning artifacts now in repo. Phase 1 kickoff blocked only on running the readiness checklist.
- **Followups**: After readiness checklist passes, paste `/docs/claude-code-kickoff.md` prompt into Claude Code in the repo. First Claude Code session should produce ADR-0002 locking the monorepo skeleton + Auth.js setup.

## 2026-05-18 — Archer + Claude (PRD draft)

- **Decision**: Adopted Core MVP scope for v1 (Auth + vehicle selector + AI generation + print paneling + detailed export). Defer customer portal, installer mode, material estimator to v1.1/v2.
- **Decision**: Hybrid AI architecture — Claude Sonnet 4.6 for orchestration, Flux/Higgsfield for image generation. Router chooses per generation based on cost/quality.
- **Decision**: Two-sided user model (Customer + Shop) with project token handoff. Alpha Wolf is the default routing shop at launch.
- **Decision**: Proprietary vehicle template DB. Top 50 vehicles in v1. Build > license for moat.
- **Decision**: Next.js 15 + Node/Express + Postgres + Python AI microservice. Mobile via React Native in Phase 6.
- **Decision**: Pricing deferred; data model accommodates `subscription_status` + `plan_tier` from day one.
- **Decision**: Export PDF carries full metadata (vehicle, design, print production, project tracking) on cover sheet plus embedded as PDF/X structured data.
- **Followups**:
  - Phase 1 kickoff requires: codified design system (use `creative-design/ui-design-system` skill), data model spike, vehicle template schema review.
  - Need legal review of ToS for customer-uploaded brand assets before public launch (open question in PRD §12).
  - Decide AI cost transparency to customers — recommend absorb in v1.
- **Artifacts produced**: `prd.md` v1.0, `activities.md` (this file), `journey-and-architecture.html`.

## 2026-05-19 — Archer (Resend setup, dev mode)

- **Decision**: Using Resend's `onboarding@resend.dev` sender for Phase 1 dev. Only sends to archer@1stimpression.co.
- **Followup**: Before Phase 4 launch — verify alphawolfwrap.com in Resend, switch `RESEND_FROM_EMAIL` to `no-reply@alphawolfwrap.com`, update SPF/DKIM/DMARC. Track in GH-016.
