# Vercel environment variables — apps/web

> **Documentation only. Never paste real values here.**
>
> Step-by-step checklist for the first `apps/web` deploy to Vercel. Perform these
> steps in the Vercel Dashboard under Project → Settings → Environment Variables.
>
> For the full env var spec (rotation, source, ownership), see `env-matrix.md`.

## Prerequisites

1. Vercel project created (Dashboard → New Project → Import Git Repository →
   `archerverified/alphawolfedecals-app`).
2. Root Directory set to `apps/web` in the project settings.
3. Framework preset: **Next.js** (auto-detected).
4. Branch: **main** for production builds.

## Environment variables checklist

Add each variable below. For each: select the environments where it applies
(Production / Preview / Development), paste the value, and save.

### Database (server-only — never add to NEXT*PUBLIC*\*)

| Variable           | Environment(s)      | Value source                                                                                                      |
| ------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`     | Production, Preview | Supabase Dashboard → Settings → Database → Connection string (transaction pooler, port 6543)                      |
| `DATABASE_URL_APP` | Production, Preview | `postgresql://app_user.<ref>:<pass>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL`       | Production, Preview | Supabase session pooler (port 5432) — used only by prisma migrate (not at runtime, but Prisma expects it)         |

### Supabase Storage (server-only)

| Variable                    | Environment(s)                   | Value source                                                                              |
| --------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | Production, Preview, Development | Supabase → Settings → API → Project URL                                                   |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview, Development | Supabase → Settings → API Keys → Secret keys → `sb_secret_…` key (**not** the legacy JWT) |

### Supabase (browser — safe to expose)

| Variable                        | Environment(s)                   | Value source                                     |
| ------------------------------- | -------------------------------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Production, Preview, Development | Same as `SUPABASE_URL`                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development | Supabase → Settings → API Keys → Publishable key |

### Auth

| Variable             | Environment(s)      | Value source                                                           |
| -------------------- | ------------------- | ---------------------------------------------------------------------- |
| `AUTH_SECRET`        | Production, Preview | `openssl rand -base64 32`                                              |
| `PII_ENCRYPTION_KEY` | Production, Preview | The project's existing key — **NEVER rotate without a migration plan** |

### Email

| Variable            | Environment(s)      | Value source                                                                     |
| ------------------- | ------------------- | -------------------------------------------------------------------------------- |
| `RESEND_API_KEY`    | Production, Preview | resend.com → API Keys                                                            |
| `RESEND_FROM_EMAIL` | Production, Preview | `onboarding@resend.dev` (Phase 1 sandbox). Phase 4: `no-reply@alphawolfwrap.com` |

### Observability

| Variable                 | Environment(s)      | Value source                                                       |
| ------------------------ | ------------------- | ------------------------------------------------------------------ |
| `SENTRY_DSN`             | Production, Preview | Sentry → Project Settings → Client Keys (DSN)                      |
| `NEXT_PUBLIC_SENTRY_DSN` | Production, Preview | Same value as `SENTRY_DSN`                                         |
| `SENTRY_AUTH_TOKEN`      | Production, Preview | Sentry → User Auth Tokens (scopes: `project:releases`, `org:read`) |
| `SENTRY_ORG`             | Production, Preview | `alphawolfdecals` (or your Sentry org slug)                        |
| `SENTRY_PROJECT`         | Production, Preview | `node` (or your Sentry project slug)                               |

### AI (Phase 2 prep — set placeholder for Phase 1)

| Variable            | Environment(s)      | Value source                                        |
| ------------------- | ------------------- | --------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Production, Preview | Set a placeholder value in Phase 1; wire in Phase 2 |

### Queue (for Server Action that calls apps/api → BullMQ)

| Variable                   | Environment(s)      | Value source                              |
| -------------------------- | ------------------- | ----------------------------------------- |
| `UPSTASH_REDIS_REST_URL`   | Production, Preview | upstash.com → database → REST tab → URL   |
| `UPSTASH_REDIS_REST_TOKEN` | Production, Preview | upstash.com → database → REST tab → Token |

---

## Vercel-injected variables (do NOT set manually)

Vercel automatically injects these at build/runtime — do not add them manually:

- `VERCEL_URL` — current deployment URL
- `VERCEL_GIT_COMMIT_SHA` — git commit SHA at build time
- `VERCEL_ENV` — `production`, `preview`, or `development`
- `PORT` — not used (Next.js uses its own port management)

---

## Post-deploy verification

After the first successful deployment:

1. `curl -s https://<your-deployment>.vercel.app/health` should return:

   ```json
   { "status": "ok", "commit": "<git-sha>" }
   ```

2. `curl -sI https://<your-deployment>.vercel.app/ | grep -E 'X-Frame|Content-Security|Strict-Transport|X-Content-Type'`
   should show all four security headers present.

3. Sign in at `/signin` with the Resend account owner email
   (`archer@1stimpression.co`) — OTP will arrive in that inbox.

4. Check Sentry dashboard for a `production` environment tag on the first error or
   transaction.

---

## Connecting the GitHub repo (Archer-only step)

**This step cannot be done by Claude Code.** Archer connects the repo in the Vercel
dashboard:

1. Vercel Dashboard → New Project → Import Git Repository
2. Search for `archerverified/alphawolfedecals-app`
3. Configure:
   - Root Directory: `apps/web`
   - Framework: Next.js (auto-detected)
   - Build Command: `pnpm build` (or `pnpm --filter @alphawolf/web build`)
   - Install Command: `pnpm install`
4. Add env vars (checklist above)
5. Deploy

Vercel will automatically create preview deployments for every PR and production
deployments on push to `main`.
