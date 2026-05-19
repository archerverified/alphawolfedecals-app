# ADR-0002: Monorepo layout, CI, Auth.js + RLS pattern, and Express/BullMQ/Upstash stack

- **Status**: Accepted
- **Date**: 2026-05-18
- **Deciders**: Archer
- **Related stories**: All Phase 1 stories (infrastructure prerequisite)
- **Supersedes**: n/a

## Context

ADR-0001 locked the _technology_ stack for v1 (Next.js + Node + Postgres +
Python AI services). Several follow-ups were deferred to the first Claude Code
PR: the actual monorepo layout, CI structure, the framework choice between
Express and Hono, the auth library wiring, and how multi-tenant isolation is
enforced inside Postgres. Without these committed in one place, contributors
(human and AI) will drift package boundaries, CI shape, and auth wiring on a
per-PR basis. We make all four decisions together because they're tightly
coupled: the workspace topology determines what CI matrices over, which
determines how auth + RLS are wired into both the API tier and the worker
services.

## Decision

### 1. Monorepo layout

We use **pnpm workspaces** orchestrated by **Turborepo**, with this top-level
structure:

```
apps/
  web/                 # Next.js 15 App Router
  api/                 # Express + TypeScript strict
services/
  parse/               # Node + Express worker (see ADR-0003)
  ai/                  # Python 3.12 + FastAPI
  paneling/            # Python 3.12 + FastAPI
packages/
  db/                  # Prisma schema + migrations + seeds
  ui/                  # Shared shadcn components + design tokens
  canvas/              # Konva editor primitives (shared web ↔ RN in Phase 6)
  auth/                # Auth.js wrapper + session/RLS helpers
```

Packages publish via TypeScript source directly (`"main": "./src/index.ts"`,
no build step) and are transpiled by the consuming app. Apps and services
emit JavaScript via their own `tsc` step.

Adding a new top-level package or service requires a superseding or
supplementary ADR (per ADR-0000's follow-up).

### 2. CI structure

**GitHub Actions** runs on every pull request to `main` and every push to
`main`, in two parallel jobs:

- `node`: pnpm install (frozen lockfile) → `pnpm turbo run lint typecheck test`
- `python`: matrixed over `services/{ai,paneling}` → uv sync → ruff check + format
  check → pytest

Merge is blocked on both jobs green. Conventional commits are enforced on
developer commits via a husky `commit-msg` hook running `commitlint` against
`@commitlint/config-conventional`. PR title formatting is not CI-enforced so
that infrastructure PRs with `[infra]` prefixes are permitted.

### 3. Auth.js + RLS via `app.current_user_id`

Authentication is **Auth.js** (credentials + email-OTP providers, per
ADR-0001), wrapped behind the `@alphawolf/auth` package so the underlying
provider is replaceable.

Multi-tenant isolation is enforced **inside Postgres** via row-level security.
Every table that holds tenant data has RLS enabled and a policy that compares
the row's owning ID against the Postgres session variable
`app.current_user_id`. The variable is set **per request** by a Prisma
`$extends` middleware (registered in `@alphawolf/db`'s client factory) that
runs `SELECT set_config('app.current_user_id', $1, true)` before each query.
The `true` flag scopes the setting to the current transaction so it cannot
leak across connection-pool reuse.

Policies read the variable with
`current_setting('app.current_user_id', true)::uuid`. The trailing `true`
returns `NULL` instead of erroring when unset, so policies fail closed.

This places the security boundary at the database, not in application code:
an API bug that forgets a `WHERE userId = …` clause cannot leak rows.

### 4. API tier: Express + BullMQ + Upstash Redis

The choice deferred in ADR-0001 between Express and Hono is **Express 5**.
Reasoning: the Node ecosystem's middleware (Auth.js adapters, Sentry
instrumentation, multer for uploads) is overwhelmingly Express-shaped; Hono's
edge-runtime advantages don't apply to our Fly.io / long-lived-process
deployment. Express 5 ships modern async error handling, which removes the
historical pain point.

Background jobs use **BullMQ** with a single **Upstash Redis** instance
(connection URL via `UPSTASH_REDIS_URL`). Queue names are declared centrally
in `apps/api/src/queue/queues.ts` (`parse`, `ai`, `paneling`). Workers in
`services/*` subscribe to the matching names. Step 5 populates payload
schemas and the parse worker stack.

## Alternatives considered

- **Nx instead of Turborepo**: more capable graph + remote cache, but heavier
  conventions and slower onboarding. Turborepo's leaner `turbo.json` is enough
  for a four-person team.
- **Single-package repo**: rejected — Phase 6 React Native client needs to
  share `packages/canvas` and `packages/db` types; the boundary has to exist
  from day one or it never will.
- **Hono on Node**: faster cold start and cleaner middleware types, but the
  Auth.js, Sentry, and OpenTelemetry adapters target Express. Net loss for
  v1.
- **RLS via app-level WHERE clauses**: appears simpler but one missed clause
  leaks tenants. Database-level enforcement is the only defensible default.
- **JWT claims read directly by RLS** (no session variable): viable on
  Supabase, but couples policy SQL to Supabase's `auth.uid()` helper.
  Session-variable pattern keeps policies portable and works identically for
  Prisma-managed and Supabase-managed code paths.
- **Redis Cluster or self-hosted Redis on Fly.io**: cheaper at scale, but
  Upstash's per-request pricing matches our Phase 1 traffic shape and removes
  a process to operate.

## Consequences

**Positive**

- A new contributor (or Claude Code in a fresh session) reads ADR-0001 +
  ADR-0002 and has everything needed to know where code goes and how requests
  flow.
- RLS at the database closes the highest-impact security failure mode (tenant
  leak via a missed `WHERE`).
- Turborepo task graph + remote cache means CI stays fast as the repo grows;
  Vitest-per-package lets a one-file change run one test suite, not all of
  them.
- Express's middleware ecosystem unblocks Auth.js, Sentry, OpenTelemetry, and
  multer wiring without bespoke shims.

**Negative**

- Session-variable RLS requires every Prisma call to flow through the
  `@alphawolf/db` client factory. Direct `new PrismaClient()` instantiation
  in feature code becomes a security bug. We mitigate with an ESLint rule
  (added in the auth feature PR) banning `@prisma/client` imports outside
  `packages/db`.
- Express 5 is recent. We accept the small risk of edge-case bugs in
  exchange for shedding the Express-4 async-error patches.
- Upstash's per-request pricing model is excellent at low volume but needs a
  watch when AI generations spike (Phase 2).

**Follow-ups**

- The auth feature PR adds the Prisma `$extends` middleware, the ESLint rule
  banning bare `@prisma/client` imports, and the first RLS policies on the
  initial set of tables.
- Add a CI check that fails when a new top-level package or service is
  introduced without an accompanying ADR (carried over from ADR-0000).
- Observability stack (Sentry / PostHog / OpenTelemetry → Honeycomb or
  Grafana Cloud) is wired in a separate ADR + PR once Phase 1 features land.

## References

- /docs/adr/0001-locked-stack.md
- /prd.md §8.5
- [Auth.js](https://authjs.dev)
- [BullMQ](https://docs.bullmq.io)
- [Upstash Redis](https://upstash.com/docs/redis)
- [Postgres RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)
