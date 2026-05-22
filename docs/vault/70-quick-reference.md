---
title: Quick reference
type: reference
status: current
last_updated: 2026-05-22 (Step 6: production deploy section added)
tags:
  - reference
  - daily-driver
---

# Quick reference

> [!tip] What this file is
> Daily-driver lookup. Env vars, commands, paths, passwords-where. If you reach for the same command twice this week, it belongs here.

## Observability

> [!danger] The encryption boundary rule
> Third-party observability (Sentry) bypasses the pgcrypto/PII encryption boundary unless **every** init scrubs. Never `sendDefaultPii: true`.

**Sentry is opt-in.** It initialises only when a DSN is present:

- Backends + Next.js server/edge: `SENTRY_DSN`
- Browser: `NEXT_PUBLIC_SENTRY_DSN`

No DSN → no init → no events. CI and local-without-secrets stay completely silent (and the native `@sentry/profiling-node` module is never loaded).

**Every `Sentry.init` MUST:**

- set `sendDefaultPii: false` (override the SDK default we previously had wrong)
- pass `beforeSend: scrubSentryEvent` from `@alphawolf/observability`

```ts
import * as Sentry from '@sentry/node'; // or @sentry/nextjs
import { scrubSentryEvent } from '@alphawolf/observability';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
  environment: process.env.NODE_ENV,
});
```

`scrubSentryEvent` (`packages/observability/src/sentry-scrub.ts`) removes `user.email` / `ip_address` / `username` (keeps only the opaque `id`), drops `request.cookies` and sensitive request headers (`Authorization`, `Cookie`, `X-CSRF-Token`, …), and redacts query-string tokens — including Supabase signed-URL `?token=` values — in the request URL and every breadcrumb URL.

**Never add a new `Sentry.init` without the scrubber.** An ESLint guard (`eslint.config.mjs`, `no-restricted-syntax`) errors on `sendDefaultPii: true` and on any `Sentry.init` missing `beforeSend`.

**To capture a new field:** audit it for PII first. If it could carry user identifiers, add a scrub rule to `scrubSentryEvent` (and a test) _before_ merging.

**Session Replay is OFF** (`replaysSessionSampleRate`/`replaysOnErrorSampleRate` = `0.0`). It captures the DOM, which would defeat the scrubber. Re-enabling it is an ADR-0011 conversation (capture must be PII-aware).

**The scrubber module is edge-runtime-safe** — its only dependency is a type-only import of `@sentry/core`, erased at compile time. Keep it that way: no `node:`-prefixed imports anywhere in its module graph (it's imported by `apps/web/sentry.edge.config.ts`).

**Sampling rates** (`tracesSampleRate` / `profileSessionSampleRate`) are `1.0` for launch. Ratchet down before traffic ramps — quota management is a tracked follow-up, not a security concern.

### PostHog

- Scope today: `services/ai` only.
- The env var is **`POSTHOG_API_KEY`** (not `POSTHOG_KEY`). The client is constructed `disabled=not POSTHOG_API_KEY`, so no key → every `capture()` is a no-op.

See ADR-0011 (observability boundaries) for the full set of rules future surfaces inherit.

## Environment variables

| Variable                                              | Source                                                                                                     | Used by                                                                                     | Notes                                                                                                                                                                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                        | Supabase Dashboard → Settings → Database → Reset password                                                  | `prisma migrate`, `prisma db push`, `withSystem` Prisma client                              | Superuser. Transaction pooler port `6543`.                                                                                                                                                                   |
| `DATABASE_URL_APP`                                    | Custom hex password set via `ALTER ROLE app_user WITH PASSWORD '...' LOGIN` in Supabase SQL editor         | `withUser` Prisma client (runtime queries)                                                  | Non-superuser, RLS enforces. Same pooler URL as `DATABASE_URL`, different user prefix `app_user.<project>`.                                                                                                  |
| `DIRECT_URL`                                          | Same password as `DATABASE_URL`                                                                            | `prisma migrate dev` (when transaction pooler can't)                                        | Session pooler port `5432`, same `postgres.<project>` user.                                                                                                                                                  |
| `PII_ENCRYPTION_KEY`                                  | `openssl rand -base64 32` (project-bound)                                                                  | `applySessionConfig` → `app.pii_key` GUC → pgcrypto helpers                                 | NEVER rotate without a planned migration that re-encrypts every PII column.                                                                                                                                  |
| `AUTH_SECRET`                                         | `openssl rand -base64 32`                                                                                  | Auth.js for JWT signing                                                                     | Rotate forces all sessions to expire.                                                                                                                                                                        |
| `RESEND_API_KEY`                                      | resend.com → API Keys                                                                                      | OTP email delivery                                                                          | Dev sandbox = `onboarding@resend.dev`. Only delivers to Resend account owner email.                                                                                                                          |
| `RESEND_FROM_EMAIL`                                   | Domain-verified address (Phase 4) or `onboarding@resend.dev` (Phase 1 dev)                                 | All transactional email                                                                     | Switch to `no-reply@alphawolfwrap.com` after DNS verification.                                                                                                                                               |
| `AUTH_EMAIL_TRANSPORT`                                | Set to `console` to skip Resend (dev only)                                                                 | Email sender in `@alphawolf/auth/server`                                                    | Bypass for E2E tests; OTP prints to terminal AND ring buffer.                                                                                                                                                |
| `ANTHROPIC_API_KEY`                                   | console.anthropic.com → API Keys                                                                           | Phase 2 — AI orchestration                                                                  | Not used yet. Cap budget at $50/month for Phase 2 dev.                                                                                                                                                       |
| `UPSTASH_REDIS_URL`                                   | upstash.com → Redis database → **TCP** tab (full `rediss://default:<TOKEN>@<host>:6379` connection string) | BullMQ queue (parse worker, Step 5+)                                                        | TCP only. BullMQ uses ioredis under the hood and needs the TCP endpoint, not the REST API.                                                                                                                   |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | upstash.com → Redis database → **REST** tab (URL + token shown separately)                                 | Edge/serverless reads via `@upstash/redis` SDK (cache-warm helpers, Edge route handlers)    | Optional in Phase 1. Add when an Edge runtime caller needs Redis (the BullMQ workers run on Node, not Edge).                                                                                                 |
| `REDIS_URL`                                           | upstash.com → Redis database → **TCP** tab (`rediss://default:<TOKEN>@<host>:6379`)                        | **The parse queue actually reads THIS var** (`services/parse` `enqueue()` → BullMQ/ioredis) | Distinct from `UPSTASH_REDIS_URL`. **Absent ⇒ the queue runs INLINE in-process** (how CI + Playwright stay green with no Redis). TCP only, never the REST pair. Never echo the token.                        |
| `REPLICATE_API_TOKEN`                                 | replicate.com → API tokens                                                                                 | `rembg` background removal in `services/parse`                                              | If unset, rembg degrades to the un-removed image (parse still succeeds).                                                                                                                                     |
| `SUPABASE_URL`                                        | Supabase → Settings → API → Project URL                                                                    | `@alphawolf/db` storage client                                                              | `https://<ref>.supabase.co`. Not secret.                                                                                                                                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`                           | Supabase → Settings → **API Keys → Secret keys** → `sb_secret_…`                                           | Server-side Storage (uploads, signed URLs); bypasses Storage RLS, server-only               | ⚠️ Use the new **`sb_secret_…`** key. This project has **legacy JWT keys disabled**, so the legacy `service_role` JWT fails Storage with "signature verification failed" no matter how often you re-copy it. |
| `SUPABASE_ANON_KEY`                                   | Supabase → Settings → API → publishable key                                                                | Reserved (no runtime use yet)                                                               | Public; safe in client bundles when needed.                                                                                                                                                                  |
| `SUPABASE_STORAGE_BUCKET_TEMPLATES` / `_ASSETS`       | optional override                                                                                          | bucket names in `@alphawolf/db` storage helper                                              | Default `vehicle-templates` (public) / `project-assets` (private). Only set to override.                                                                                                                     |
| `SENTRY_DSN` / `POSTHOG_KEY`                          | Sentry / PostHog project settings                                                                          | Observability                                                                               | Wire in Step 6 (deploy) — feature-flagged off in dev.                                                                                                                                                        |

### Connection string shapes

```
# DATABASE_URL — superuser, transaction pooler
postgresql://postgres.<PROJECT_REF>:<POSTGRES_PASSWORD>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1

# DATABASE_URL_APP — app_user, transaction pooler (RLS-enforced)
postgresql://app_user.<PROJECT_REF>:<APP_USER_PASSWORD>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1

# DIRECT_URL — superuser, session pooler (for migrations)
postgresql://postgres.<PROJECT_REF>:<POSTGRES_PASSWORD>@<region>.pooler.supabase.com:5432/postgres
```

Current project ref: `dxwnzxlmggpdjyoxdybh`. Region: `aws-1-us-west-1`.

### Upstash Redis (BullMQ + cache)

Current database: `alphawolfedecals-app` — Free Tier — `certain-bass-131284.upstash.io:6379` — region `aws us-west-2` (Oregon) — TLS required (`rediss://`).

```
# UPSTASH_REDIS_URL — BullMQ + ioredis
rediss://default:<UPSTASH_TOKEN>@certain-bass-131284.upstash.io:6379

# UPSTASH_REDIS_REST_URL — @upstash/redis SDK (optional in Phase 1)
https://certain-bass-131284.upstash.io
```

Free-tier limits: 500k commands/month, 256 MB storage, 50 GB bandwidth. Plenty for Phase 1 — if the cache hit-rate measurement in Step 5 shows we're trending toward 60%+ of the command budget on the editor open path, revisit eviction policy before paid tier.

> [!warning] Where the TCP token comes from
> upstash.com → database → **Details → Connect → TCP** tab. Copy the full `rediss://...` URL (the token is embedded in the password field). Paste into `.env.local` as `UPSTASH_REDIS_URL`. **Never paste the token here or anywhere outside `.env.local` / your password manager** — if it lands in a transcript or git diff, rotate immediately via upstash.com → database → **Details → Reset Token**.

## Daily commands

### Dev loop

```bash
pnpm install                                    # always run after branch switch or package.json change
pnpm dev                                        # boots web (3000) + api (4000) + parse (4001)
pnpm turbo run lint typecheck test              # full local check before push
pnpm turbo run test --filter @alphawolf/auth    # single-package test
pnpm --filter @alphawolf/web test               # web unit tests (tests/** AND colocated components/**/*.test.tsx, e.g. editor/useAutosave.test.tsx)
```

### Database

```bash
pnpm --filter @alphawolf/db prisma:generate     # regenerate client (run after schema change)
pnpm --filter @alphawolf/db db:migrate          # apply migrations + RLS SQL
pnpm --filter @alphawolf/db db:push             # dev-only schema push (no migration history)
pnpm --filter @alphawolf/db db:seed             # load seeds/vehicles/*.json
pnpm --filter @alphawolf/db db:make-admin <email>   # toggle users.is_admin on a user
pnpm --filter @alphawolf/db test:integration    # RLS + DB-touching tests (uses real Supabase)
```

### Storage (Supabase Storage — GH-005)

```bash
pnpm --filter @alphawolf/db storage:provision        # create/update the two buckets (idempotent)
pnpm --filter @alphawolf/db storage:migrate-local    # one-shot: PR#37 local store -> bucket, gen thumbs, backfill areas, wipe local
```

> [!warning] Step 5 footguns
>
> - **Supabase service-role key**: this project has **legacy JWT keys disabled** — the legacy `service_role` JWT fails Storage ("signature verification failed"). Use the **`sb_secret_…`** key (Settings → API Keys → Secret keys). Symptom if wrong: `storage:provision` errors on `createBucket`.
> - **`inkscape` + `pdf2svg`** must be on `PATH` for AI/EPS/PDF→SVG parsing (`brew install inkscape pdf2svg`). Without them the parse worker doesn't crash — it sets `parse_status='queued_missing_cli'` and the editor shows "waiting on dependency". Raster + rembg work without them.
> - **`PII_ENCRYPTION_KEY` must appear exactly once** in `.env.local`. A duplicate (different values on two lines) is a latent footgun — pgcrypto decryption depends on which line the loader picks (dotenv keeps the first). If your editor has `.env.local` open with a stale buffer, it can re-introduce the duplicate on save; close/Revert that tab.
> - **`REDIS_URL` absent ⇒ inline parse** (no Redis needed). Present ⇒ run the standalone worker (`pnpm --filter @alphawolf/parse dev`) so a long Inkscape conversion never blocks a web request.

### Quick psql to verify connectivity

```bash
# Replace placeholders inline; strip ?pgbouncer=true&connection_limit=1 — psql doesn't recognize them
psql 'postgresql://app_user.dxwnzxlmggpdjyoxdybh:<PASSWORD>@aws-1-us-west-1.pooler.supabase.com:6543/postgres' \
  -c "SELECT current_user, current_setting('row_security');"
# Expect: app_user | on
```

### GitHub flow

```bash
gh pr create --fill --base main --title "<conventional commit>"
gh pr checks --watch                            # waits for CI
gh pr merge <N> --squash --delete-branch        # CI must be green (branch protection)
gh pr view <N> --web                            # open in browser
gh issue list --repo archerverified/alphawolfedecals-app --search "GH-" --limit 50
```

### Branch protection (verification)

```bash
gh api repos/archerverified/alphawolfedecals-app/branches/main/protection \
  --jq '.required_status_checks.contexts'
# Should print: ["Node — lint + typecheck + test","Python — lint + test (ai)","Python — lint + test (paneling)"]
```

## Where things live

| Concern                        | Path                                   |
| ------------------------------ | -------------------------------------- |
| PRD                            | `/prd.md`                              |
| ADRs                           | `/docs/adr/NNNN-<slug>.md`             |
| Vehicle database spec          | `/docs/vehicle-database-spec.md`       |
| Activities log (event log)     | `/activities.md`                       |
| Obsidian vault                 | `/docs/vault/`                         |
| Vault templates                | `/docs/vault/_templates/`              |
| Claude Code playbook (prompts) | `/docs/claude-code-prompts.md`         |
| Phase 1 readiness checklist    | `/docs/phase-1-readiness-checklist.md` |
| CI workflow                    | `/.github/workflows/ci.yml`            |
| PR template                    | `/.github/pull_request_template.md`    |
| Pre-commit hook                | `/.husky/pre-commit`                   |
| ESLint config                  | `/eslint.config.mjs`                   |
| Prisma schema                  | `/packages/db/prisma/schema.prisma`    |
| RLS policies SQL               | `/packages/db/prisma/sql/auth_rls.sql` |
| DB client + helpers            | `/packages/db/src/client.ts`           |
| DB repos                       | `/packages/db/src/repos/*.ts`          |
| Auth client surface            | `/packages/auth/src/index.ts`          |
| Auth server surface            | `/packages/auth/src/server.ts`         |
| Next.js config                 | `/apps/web/next.config.ts`             |
| CSRF middleware                | `/apps/web/middleware.ts`              |
| Issue seeder                   | `/scripts/seed-issues.py`              |

## Where passwords live (and how to recover them)

| Credential                    | Recovery                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `postgres` superuser password | Supabase Dashboard → Settings → Database → Reset database password (you must reset; can't view existing)                 |
| `app_user` password           | Set by you via `ALTER ROLE app_user WITH PASSWORD '...' LOGIN` in Supabase SQL editor; only your password manager has it |
| `PII_ENCRYPTION_KEY`          | Saved when first generated (`openssl rand -base64 32`); rotating breaks every encrypted PII column                       |
| `AUTH_SECRET`                 | Saved when generated; rotating force-expires all sessions                                                                |
| Resend API key                | resend.com → API Keys (can re-issue but old key dies)                                                                    |
| Anthropic API key             | console.anthropic.com → Settings → API Keys (can re-issue)                                                               |

> [!warning] Lost the `postgres` password?
> You can reset it via the Supabase dashboard. After reset, update **both** `DATABASE_URL` and `DIRECT_URL` in `.env.local` with the new password.

> [!warning] Lost the `app_user` password?
> No recovery. Regenerate with `openssl rand -hex 32`, re-run the `ALTER ROLE` SQL, update `DATABASE_URL_APP`.

## When tests/CI fail — quick diagnosis

| Symptom                                                            | Likely cause                                                                      | Fix                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Cannot find module 'argon2'`                                      | `pnpm install` not run after branch switch                                        | `pnpm install`                                                                         |
| `Cannot find module 'fs'` in client bundle                         | Server module imported from `@alphawolf/auth` instead of `@alphawolf/auth/server` | Fix the import                                                                         |
| `Cookies can only be modified in a Server Action or Route Handler` | Server Component trying to `cookies().set(...)`                                   | Move write to middleware or Server Action                                              |
| `UnhandledSchemeError: node:crypto` in middleware                  | Middleware imports `node:crypto`-using module                                     | Use Web Crypto inline, don't import from `@alphawolf/auth/server` in middleware        |
| `prepared statement "s0" already exists`                           | `$executeRaw` used on transaction pooler                                          | Switch to `$executeRawUnsafe` + `pgQuoteLiteral`                                       |
| `No native build was found for ... node=N`                         | Native module's prebuild matrix doesn't cover this Node                           | Switch to `@node-rs/*` N-API alternative                                               |
| `Module parse failed: Unexpected character '�'`                    | Webpack trying to bundle `.node` file                                             | Add to `serverExternalPackages` + webpack externals regex in `next.config.ts`          |
| `error TS2748: Cannot access ambient const enums`                  | Imported `const enum` from npm package under `isolatedModules`                    | Use numeric literal or omit (often there's a default)                                  |
| `error TS2345: number \| undefined is not assignable to number`    | `noUncheckedIndexedAccess` + array indexing                                       | Use `for...of` instead of `for (let i; ...)`                                           |
| `psql: error: invalid URI query parameter: "pgbouncer"`            | psql doesn't understand Prisma's pgbouncer param                                  | Strip `?pgbouncer=true&connection_limit=1` for psql tests                              |
| Required-status-check stuck                                        | Context names mismatch GitHub Actions reported names                              | `gh api .../branches/main/protection --method PUT` with exact `jobs.<id>.name` strings |
| `next-env.d.ts` ESLint error                                       | Auto-generated file being linted                                                  | Already ignored in `eslint.config.mjs` — pull latest                                   |
| `dev-otp` returns 404 in Playwright but signup succeeded           | Module instance split between Server Action and Route Handler (Next.js dev quirk) | PR #37 moved ring buffer to `globalThis` — pull latest                                 |

## Useful gh API one-liners

```bash
# List open PRs by label
gh pr list --label "phase-1" --state open

# Find the most recent merged PR
gh pr list --state merged --limit 1 --json number,title,mergedAt

# Show what closed when this PR merged
gh pr view <N> --json closingIssuesReferences --jq '.closingIssuesReferences[].number'

# All commits on main since a given date
gh api repos/archerverified/alphawolfedecals-app/commits --jq '.[] | select(.commit.author.date > "2026-05-19") | .commit.message' | head -20
```

## Useful SQL one-liners

```sql
-- Make a user admin (or run pnpm --filter @alphawolf/db db:make-admin <email>)
UPDATE users SET is_admin = TRUE WHERE email_lower_hash = encode(hmac(lower('user@example.com'), current_setting('app.pii_key'), 'sha256'), 'hex');

-- List all RLS policies
SELECT schemaname, tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname = 'public';

-- Check which extensions are installed
SELECT extname, extversion FROM pg_extension;

-- See current session settings (after withUser sets app.current_user_id)
SELECT current_setting('app.current_user_id', true), current_setting('app.pii_key', true);

-- Force RLS to fail closed (test scenario)
SET app.current_user_id = '';
SELECT * FROM users;  -- should return empty
```

## Production deploy

> [!info] Step 6 reference
> Full env var matrix, rotation procedures, and host setup instructions: `/docs/deployment/`.

| Resource                    | URL / Path                                                  |
| --------------------------- | ----------------------------------------------------------- |
| **Vercel project**          | Vercel Dashboard → alphawolf-wrap-studio                    |
| **Demo URL**                | _Fill in after first Vercel deploy_                         |
| **Render dashboard**        | render.com → alphawolf-api / alphawolf-parse / alphawolf-ai |
| **Render api health**       | `https://<render-api-url>/health`                           |
| **Render ai health**        | `https://<render-ai-url>/health`                            |
| **Sentry dashboard**        | sentry.io → alphawolfdecals / node project                  |
| **PostHog dashboard**       | posthog.com → alphawolfdecals project                       |
| **Upstash Redis dashboard** | upstash.com → alphawolfedecals-app database                 |

### Quick rollback (Vercel)

```bash
# Roll back to the previous production deployment (instant, no rebuild)
vercel rollback

# Roll back to a specific deployment URL
vercel rollback https://alpha-wolf-wrap-studio-<hash>.vercel.app

# Zero-downtime alias swap
vercel alias set <deployment-url> <your-domain>
```

### Env var matrix

Full matrix (source, rotation procedure, owner): `/docs/deployment/env-matrix.md`

Vercel-specific setup checklist: `/docs/deployment/vercel-env.md`

Render-specific setup checklist: `/docs/deployment/render-env.md`

### Demo script

Phase 1 two-minute demo walkthrough: `/docs/deployment/phase-1-demo-script.md`

### Cost projection (Phase 1 demo scale)

All-in ~$0–2/month. Cap = $50/month. See ADR-0012 §Cost projection for the full breakdown.

Upstash free tier: 500k commands/month, 256 MB. Projected usage: ~30k commands/month at demo scale.

Sentry free tier: 5k errors/month. Ratchet `tracesSampleRate` 1.0 → 0.1 before public launch (issue logged).

### ADR

See ADR-0012 for the full deployment architecture, region choices, cost projection, and rollback procedures.

---

## Update this file when...

- A new env var is introduced or renamed
- A new daily-driver command shows up
- A new common error pattern appears (add to the diagnosis table)
- A new file location moves
- A password rotation procedure changes

Bump `last_updated` in frontmatter every edit.
