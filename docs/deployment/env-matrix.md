# Environment variable matrix — Alpha Wolf Wrap Studio

> **Documentation only. Never paste real values here.**
>
> Source of truth for which env vars exist, where they're needed, what generates them,
> and who is responsible for rotation. See ADR-0012 §Secret management for the
> overall policy.

## How to read this table

- **Scope**: which service(s) consume this var
- **Environments**: which Vercel/Render environments require it (P = production, V = preview, D = development/local)
- **Source**: where the value comes from
- **Rotation**: what happens when rotated and how to do it
- **Owner**: who performs rotation

`NEXT_PUBLIC_*` variables are embedded in the browser bundle. Never use `NEXT_PUBLIC_*`
for secrets that must stay server-side (keys, DSNs, connection strings).

---

## Database and Supabase

| Env var                         | Scope                                                         | Envs    | Source                                                                     | Notes                                                                                                                                                                                                                                  | Rotation                                                                                                                    | Owner  |
| ------------------------------- | ------------------------------------------------------------- | ------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------ |
| `DATABASE_URL`                  | apps/api, services/parse, apps/web (migrations only)          | P, D    | Supabase Dashboard → Settings → Database → Reset database password         | Superuser. Transaction pooler port 6543. Format: `postgresql://postgres.<ref>:<pass>@<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`. NEVER use on authenticated request paths — use `DATABASE_URL_APP`. | Reset password in Supabase dashboard; update Render + Vercel env vars + `.env.local`.                                       | Archer |
| `DATABASE_URL_APP`              | apps/api, services/parse, apps/web (withUser runtime queries) | P, D    | `ALTER ROLE app_user WITH PASSWORD '...' LOGIN` in Supabase SQL editor     | Non-superuser app_user, RLS enforces. Same pooler URL as `DATABASE_URL` but `app_user.<ref>` prefix. FAIL-CLOSED: if unset, `withUser` falls back to `DATABASE_URL` with a loud warning (logs `[db] RLS bypass warning`).              | Regenerate: `openssl rand -hex 32`; run `ALTER ROLE app_user WITH PASSWORD '<new>'`; update Render + Vercel + `.env.local`. | Archer |
| `DIRECT_URL`                    | apps/web (prisma migrate only)                                | P, D    | Same creds as `DATABASE_URL` but session pooler port 5432                  | Format: `postgresql://postgres.<ref>:<pass>@<region>.pooler.supabase.com:5432/postgres`. Used by `prisma migrate dev` (transaction pooler can't run migration DDL). Not needed at runtime on Vercel/Render.                            | Same as `DATABASE_URL`.                                                                                                     | Archer |
| `SUPABASE_URL`                  | apps/web (server), services/parse                             | P, V, D | Supabase Dashboard → Settings → API → Project URL                          | `https://<ref>.supabase.co`. Not a secret but keep consistent. Current: `https://dxwnzxlmggpdjyoxdybh.supabase.co`.                                                                                                                    | None (changes only if project is re-created).                                                                               | Archer |
| `SUPABASE_SERVICE_ROLE_KEY`     | apps/web (server-side Storage), services/parse                | P, V, D | Supabase Dashboard → Settings → API Keys → **Secret keys** → `sb_secret_…` | ⚠️ Use the `sb_secret_…` format — legacy JWT fails Storage with "signature verification failed" on this project (legacy JWT keys are disabled). Server-only. NEVER pass to a `NEXT_PUBLIC_*` var or client bundle.                     | Re-issue in Supabase API settings; update Vercel + Render + `.env.local`.                                                   | Archer |
| `NEXT_PUBLIC_SUPABASE_URL`      | apps/web (browser)                                            | P, V, D | Same as `SUPABASE_URL`                                                     | Safe to expose to client. Required if the browser ever needs to call Supabase Storage directly (Phase 2+).                                                                                                                             | None.                                                                                                                       | Archer |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | apps/web (browser)                                            | P, V, D | Supabase Dashboard → Settings → API → **publishable** key                  | Safe to expose to client (RLS-enforced anon role). Required if the browser calls Supabase Storage or client SDK directly.                                                                                                              | Re-issue in Supabase API settings; update Vercel env vars.                                                                  | Archer |

---

## Auth and PII

| Env var              | Scope                              | Envs    | Source                    | Notes                                                                                                                                                                                                                    | Rotation                                                                                                                                                                  | Owner  |
| -------------------- | ---------------------------------- | ------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `AUTH_SECRET`        | apps/web, apps/api                 | P, V, D | `openssl rand -base64 32` | Auth.js JWT signing key. Rotating forces ALL active sessions to expire. 32+ bytes.                                                                                                                                       | Generate new value; update Vercel + Render; warn users sessions will expire.                                                                                              | Archer |
| `PII_ENCRYPTION_KEY` | apps/web, apps/api, services/parse | P, D    | `openssl rand -base64 32` | 32-byte symmetric key for pgcrypto `app_encrypt_pii` / `app_decrypt_pii`. **NEVER rotate without a planned migration that re-encrypts every PII column.** Rotating without migration leaves all existing PII unreadable. | Write a migration that decrypts old → re-encrypts with new key in a single transaction; deploy migration before switching env var; test decryption; roll back plan ready. | Archer |

---

## Email

| Env var                | Scope    | Envs         | Source                | Notes                                                                                                                                                                                                                                                                                                                                                                                                       | Rotation                                                                                                                              | Owner  |
| ---------------------- | -------- | ------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `RESEND_API_KEY`       | apps/web | P, V, D      | resend.com → API Keys | Old key is immediately revoked when replaced.                                                                                                                                                                                                                                                                                                                                                               | Re-issue in Resend dashboard; update Vercel + `.env.local`.                                                                           | Archer |
| `RESEND_FROM_EMAIL`    | apps/web | P, V, D      | Set manually          | **Live (Goal 11):** `wraps@1stimpression.co`. The `1stimpression.co` domain is VERIFIED in Resend (SPF/DKIM/DMARC green) and delivers to any external recipient. (History: was the `onboarding@resend.dev` sandbox sender, which only delivered to the account owner — that limitation is gone.) If Archer later gains `alphawolfdecals.com` access, verify it in Resend and switch the from-address there. | Update Vercel + `.env.local`. **Do NOT set `AUTH_EMAIL_TRANSPORT` in prod** (see that row — it is ignored in real production anyway). | Archer |
| `AUTH_EMAIL_TRANSPORT` | apps/web | D (optional) | Set to `console`      | Bypass Resend in local dev; OTP prints to terminal AND ring buffer. **Never set in production** — and as of Goal 11 it is a no-op there anyway: in real production (`VERCEL_ENV==='production'`) the code IGNORES `console` and forces live Resend, logging the misconfig to the console + Sentry (`packages/auth/src/email.ts` `consoleTransportActive`, `apps/web/instrumentation.ts`).                   | Remove from env to restore the console transport in dev.                                                                              | Archer |

---

## AI and inference

| Env var               | Scope                                     | Envs    | Source                           | Notes                                                                                                                                                              | Rotation                                                              | Owner  |
| --------------------- | ----------------------------------------- | ------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------ |
| `ANTHROPIC_API_KEY`   | apps/web (Phase 2), services/ai (Phase 2) | P, V, D | console.anthropic.com → API Keys | Phase 2 prep — not used in Phase 1 runtime. Set a placeholder or leave unset in Phase 1. Cap budget at $50/month for Phase 2 dev.                                  | Re-issue in Anthropic console; update Vercel + Render + `.env.local`. | Archer |
| `REPLICATE_API_TOKEN` | services/parse                            | P, D    | replicate.com → API tokens       | rembg background removal (`cjwbw/rembg`). If unset, rembg degrades to the un-removed image (parse still succeeds). Phase 4: add spend monitor + monthly cap alert. | Re-issue in Replicate dashboard; update Render + `.env.local`.        | Archer |

---

## Queue

| Env var                    | Scope                           | Envs    | Source                                                    | Notes                                                                                                                                                                                                           | Rotation                                                                                     | Owner  |
| -------------------------- | ------------------------------- | ------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| `UPSTASH_REDIS_URL`        | apps/web (enqueue), apps/api    | P, D    | upstash.com → database → Details → Connect → **TCP** tab  | Full `rediss://default:<TOKEN>@<host>:6379` string. TCP only — BullMQ uses ioredis which needs TCP, NOT the REST API. **Absent ⇒ queue runs inline in-process** (how CI + Playwright stay green without Redis). | Reset token at upstash.com → database → Details → Reset Token; update Render + `.env.local`. | Archer |
| `REDIS_URL`                | services/parse                  | P, D    | Same Upstash TCP URL as `UPSTASH_REDIS_URL`               | The parse worker reads `REDIS_URL` specifically (distinct var name — see ADR-0009). Must be set on the Render parse worker service for BullMQ to activate. Absent ⇒ inline mode.                                | Same as `UPSTASH_REDIS_URL`.                                                                 | Archer |
| `UPSTASH_REDIS_REST_URL`   | apps/web (Edge routes, Phase 2) | P, V, D | upstash.com → database → Details → Connect → **REST** tab | Optional in Phase 1. For Edge runtime callers (`@upstash/redis` SDK, `@upstash/ratelimit`). Format: `https://<host>.upstash.io`.                                                                                | Reset token same as above; update Vercel.                                                    | Archer |
| `UPSTASH_REDIS_REST_TOKEN` | apps/web (Edge routes, Phase 2) | P, V, D | Same REST tab — token field                               | Required alongside `UPSTASH_REDIS_REST_URL`.                                                                                                                                                                    | Same reset procedure.                                                                        | Archer |

---

## Observability

| Env var                  | Scope                                            | Envs    | Source                                                                               | Notes                                                                                                                                                                  | Rotation                                                                                                | Owner  |
| ------------------------ | ------------------------------------------------ | ------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------ |
| `SENTRY_DSN`             | apps/web (server/edge), apps/api, services/parse | P, V, D | Sentry → Project Settings → Client Keys (DSN)                                        | Backends + Next.js server/edge. When unset: Sentry stays disabled (CI-safe). **Every Sentry init must have `sendDefaultPii: false` + `beforeSend: scrubSentryEvent`.** | Re-issue in Sentry (old DSN stops accepting events immediately). Update Vercel + Render + `.env.local`. | Archer |
| `NEXT_PUBLIC_SENTRY_DSN` | apps/web (browser)                               | P, V, D | Same DSN value as `SENTRY_DSN`                                                       | Must be `NEXT_PUBLIC_*` to reach the browser bundle. Usually the same value. When unset: client-side Sentry disabled.                                                  | Same as `SENTRY_DSN`.                                                                                   | Archer |
| `SENTRY_AUTH_TOKEN`      | apps/web (build time only)                       | P, V    | Sentry → User Auth Tokens → Create New Token (scope: `project:releases`, `org:read`) | Source-map upload during `next build`. When absent: source-map upload silently skipped. CI builds without it are unaffected.                                           | Re-issue in Sentry user settings; update Vercel (scope: Production + Preview).                          | Archer |
| `SENTRY_ORG`             | apps/web (build time only)                       | P, V    | Sentry org slug                                                                      | Default `alphawolfdecals` (baked into `next.config.ts`). Override only if org slug changes.                                                                            | Update Vercel.                                                                                          | Archer |
| `SENTRY_PROJECT`         | apps/web (build time only)                       | P, V    | Sentry project slug                                                                  | Default `node` (baked into `next.config.ts`).                                                                                                                          | Update Vercel.                                                                                          | Archer |
| `SENTRY_ENVIRONMENT`     | apps/api, services/parse, services/ai            | P, D    | Set to `production` on Render; `development` locally                                 | Passed to `Sentry.init({ environment })`. Differentiates environments within one Sentry project.                                                                       | Update Render env var.                                                                                  | Archer |
| `POSTHOG_API_KEY`        | services/ai                                      | P, D    | PostHog → Project → Project Settings → API Key                                       | `services/ai` only (Phase 1). Client disabled when absent. Note: the dead `POSTHOG_KEY` var in older `.env.example` versions should be removed (issue #60).            | Re-issue in PostHog; update Render + `.env.local`.                                                      | Archer |
| `POSTHOG_HOST`           | services/ai                                      | P, D    | PostHog cloud URL                                                                    | Default: `https://us.i.posthog.com`. EU projects: `https://eu.i.posthog.com`.                                                                                          | Update Render.                                                                                          | Archer |

---

## Vercel-injected (not set by Archer)

| Env var                 | Scope    | Notes                                                                                                                                                                                                                                                 |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VERCEL_URL`            | apps/web | Vercel auto-injects: the deployment URL (e.g., `alpha-wolf-wrap-studio-abc123.vercel.app`). Not available in `NEXT_PUBLIC_*` by default — use `VERCEL_URL` server-side only. For client-side absolute URLs, use `NEXT_PUBLIC_APP_URL` (set manually). |
| `VERCEL_GIT_COMMIT_SHA` | apps/web | Git SHA at build time. Used by `/api/(public)/health` to return `{ commit }`. Available in both Node and Edge runtimes.                                                                                                                               |
| `VERCEL_ENV`            | apps/web | `production`, `preview`, or `development`. Used by `@vercel/analytics` and `@vercel/speed-insights` to no-op outside Vercel.                                                                                                                          |

---

## Local dev only (never in Vercel/Render)

| Env var                        | Notes                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_EMAIL_TRANSPORT=console` | Skip Resend; print OTP to stdout + ring buffer. **Local dev only — ignored in real production (`VERCEL_ENV=production`), which forces live Resend.** |
| `AUTH_EMAIL_TRANSPORT` (unset) | Live Resend delivery (`RESEND_FROM_EMAIL` = `wraps@1stimpression.co`).                                                                               |

---

## `.env.example` update checklist

When adding a new env var to the codebase, update:

1. This file (env-matrix.md) — one row in the relevant table
2. `/apps/web/.env.example` or the root `.env.example` — key only, no value, with a comment
3. The `/docs/vault/70-quick-reference.md` environment variables section
4. The relevant host's env-var doc (`vercel-env.md` or `render-env.md`)
