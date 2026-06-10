# Alpha Wolf Wrap Studio

Web app for designing vehicle wraps and routing finished designs to a wrap shop
for production. Customers browse a catalogue of vehicle templates, design a wrap
in an in-browser canvas editor, and submit it for production; wrap shops manage
the resulting orders through a production queue.

- **Production:** https://alphawolfedecals-app-web.vercel.app
- **Status:** MVP, pre-public-launch. See open launch blockers in
  [`docs/deployment/audits/2026-06-09-goal-4/`](docs/deployment/audits/2026-06-09-goal-4/).

> Project working rules (security boundaries, review protocol, closeout ritual)
> live in [`CLAUDE.md`](CLAUDE.md). Architecture decisions are in
> [`docs/adr/`](docs/adr/). The running dev log is [`activities.md`](activities.md).

## Stack

- **Web:** Next.js 15 (App Router, React 19), Tailwind v4 + shadcn/ui, Konva canvas.
- **Auth:** `@alphawolf/auth` — Auth.js v5 Credentials provider over argon2id
  passwords + OTP (email), CSRF double-submit, DB-backed login lockout.
- **Data:** Postgres (Supabase) via Prisma, with Postgres **row-level security**
  on every table and a **two-connection split** (see Security below).
- **Email:** Resend. **Errors:** Sentry. **Analytics:** PostHog.
  **Rate-limit:** Upstash Redis (edge).
- **Background work:** `apps/api` (email-retry + parse workers) on Render.
- **Monorepo:** pnpm + Turborepo. Node ≥ 22, pnpm ≥ 9.

## Repository layout

```
apps/
  web/        Next.js front end (the deployed site)
  api/        background workers (email retry, asset parse) — Render
packages/
  auth/       Auth.js v5 config, argon2id, OTP, CSRF, lockout
  canvas/     Konva-based wrap design editor
  db/         Prisma client, RLS session helpers, repos, storage, crypto
  notifications/  Resend email templates + non-throwing dispatch
  observability/  Sentry init + PII scrubbing
  ui/         shared shadcn/ui components
services/
  ai/ paneling/ parse/   SVG/asset processing services
docs/
  adr/        architecture decision records (ADR-0013 = locked deploy contract)
  vault/      diagrams + session notes
```

## Prerequisites

- Node ≥ 22, `pnpm` ≥ 9 (`corepack enable` to match the pinned `pnpm@9.12.3`).
- Access to a Postgres database (Supabase) and the project secrets below.
- `libpq` available locally for the env-aware DB scripts.

## Setup

```bash
pnpm install
pnpm --filter @alphawolf/db prisma:generate   # generate the Prisma client
cp .env.example .env.local                    # if present; otherwise see "Environment" below
pnpm dev                                       # turbo run dev (web on http://localhost:3000)
```

## Environment

Set these in `.env.local` (web) and the Render service env (workers). Never commit
secrets — `.env*` is gitignored.

| Var                                                   | Purpose                                                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                        | Privileged (superuser) Postgres connection — system/bootstrap paths only                                                                                                |
| `DATABASE_URL_APP`                                    | **`app_user` (non-superuser) connection — RLS-enforced.** If unset, the app silently falls back to `DATABASE_URL` and RLS is bypassed. Must be set in every environment |
| `DIRECT_URL`                                          | Direct (non-pooled) connection for migrations/seed scripts                                                                                                              |
| `PII_ENCRYPTION_KEY`                                  | pgcrypto key for PII columns. **Never rotate without a re-encryption migration**                                                                                        |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`          | Server-only Storage access (uploads, signed URLs). Service-role key never ships to the client                                                                           |
| `NEXT_PUBLIC_SUPABASE_URL`                            | Public Storage base URL (catalogue images)                                                                                                                              |
| `RESEND_API_KEY`                                      | Transactional email (OTP, order notifications)                                                                                                                          |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Edge rate-limiting (auth routes). Optional — see the runbook to activate                                                                                                |
| `NEXT_PUBLIC_POSTHOG_KEY`                             | PostHog analytics (publishable key)                                                                                                                                     |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`               | Error monitoring                                                                                                                                                        |

## Common commands

```bash
pnpm dev          # run all dev servers (turbo)
pnpm build        # build all packages/apps
pnpm test         # unit tests (vitest) across the workspace
pnpm typecheck    # tsc --noEmit across the workspace
pnpm lint         # eslint across the workspace
pnpm format       # prettier --write
```

End-to-end smoke (Playwright) lives in `apps/web/e2e/mvp-flow.spec.ts` and runs
against a deployment via `DEPLOY_URL=… pnpm --filter @alphawolf/web test:e2e`.

## Security model (read before touching the DB layer)

- **Two-connection split** (`packages/db/src/client.ts`): `withUser(userId, fn)`
  runs as `app_user` with **RLS enforced** — use it for every customer-facing
  query. `withSystem(fn)` runs as superuser with RLS **off** — only for
  unauthenticated bootstrap (signup/OTP). **Never** use `withSystem` for
  user-scoped queries.
- **RLS** is forced on every app table; the `orders` table additionally carries an
  owner/shop-read/shop-update policy triple for the customer↔shop split.
- The Supabase **transaction pooler** requires raw SQL via `$queryRawUnsafe` +
  `pgQuoteLiteral` (tagged templates create prepared statements that collide on
  the pooler). Do not "simplify" this to `$queryRaw`.
- ADR-0013 deploy invariants are **locked**; changes require an amendment ADR.

## Deployment

- **Web** → Vercel (region `sfo1`), auto-deploys on push to `main`.
- **Workers** → Render (Oregon), via `render.yaml`.
- DB migrations: `pnpm --filter @alphawolf/db db:migrate` (+ the `db:apply-sql`
  RLS step). See ADR-0013 and the deployment docs for the full contract.

## Contributing

Every PR runs the `/code-review` protocol in a fresh context + the required CI
checks; PRs touching RLS, auth, the DB split, or deploy config get an extra
independent review. See `CLAUDE.md` §3.
