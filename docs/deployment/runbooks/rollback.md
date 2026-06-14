# Runbook: Rolling Back a Bad Deploy

**Stack:** Vercel (apps/web, region sfo1, **Hobby plan**) + Render (alphawolf-api, alphawolf-parse, alphawolf-ai — Oregon) + Supabase Postgres (project `dxwnzxlmggpdjyoxdybh`, us-west-1) + Upstash Redis.
**Audience:** operator (Archer) + on-call agent.
**Scope:** get prod back to a known-good state fast, verify it, avoid the traps specific to this stack. Authored Goal 10 D2 (2026-06-14).

> **Golden rule:** the web tier (Vercel) rolls back **instantly and independently** of the DB. The DB does **not** roll back by reverting code — it rolls back only via a forward (expand/contract) migration. Never try to "undo" a migration to fix a bad web deploy: roll the web tier back to the previous READY deployment, which is still schema-compatible because of the expand/contract discipline below.

## 0. Decide what actually broke (60-second triage)

| Signal                                                                                   | Likely layer        | Go to |
| ---------------------------------------------------------------------------------------- | ------------------- | ----- |
| 5xx / blank pages / broken UI on `alphawolfedecals-app-web.vercel.app`, schema unchanged | Vercel web deploy   | §1    |
| Errors only on generation / parse / queue; web pages fine                                | Render service      | §4    |
| `column does not exist` / RLS / decrypt errors right after a migration                   | DB migration        | §2    |
| Everything down, DB unreachable, app idle >7 days                                        | Supabase auto-pause | §5    |

Pull the real deploy state before acting — **never trust the CLI summary** (CLAUDE.md §6): a <2s deploy with empty build logs is a preflight reject (region/config), not billing; `errorMessage` populated = billing; 30–120s with logs = a real build failure.

## 1. Roll back a bad Vercel deploy (instant)

Vercel keeps every previous build immutable. Rolling back = re-pointing the production alias at a previous **READY** deployment. **No rebuild, no DB change, ~seconds.** As of this writing two READY production rollback candidates exist (the current + the prior prod deploy).

### 1a. Dashboard (fastest)

1. Vercel → project `alphawolfedecals-app-web` → **Deployments**.
2. Find the last known-good **Production** deployment (state = Ready, the one before the bad promote). Confirm its commit SHA matches a green `main`.
3. **⋯ → "Promote to Production"** (older builds) or **"Instant Rollback"** banner on the bad deploy.
4. Confirm. The production domain serves the old build immediately.

### 1b. CLI

```bash
vercel ls alphawolfedecals-app-web --prod          # find good vs bad
vercel rollback                                    # instant: to the previous prod deploy
vercel rollback <deployment-url-or-id>             # or to a specific known-good one
vercel inspect <production-domain>                 # verify which deploy the alias serves
```

### 1c. Hobby-plan caveats (this project)

- **60s function ceiling, daily-only crons.** Rolling back to a build that predates the `maxDuration ≤ 60` fix (#145) or the daily-cron fix (#155) will preflight-reject. Only roll back to deployments at/after those fixes. Current cron is daily `0 9 * * *` — sub-daily crons silently kill the whole deploy on Hobby.
- Instant rollback does NOT rebuild, so it sidesteps these — but a _redeploy_ of an old commit re-applies the limits.

### 1d. Bad ENV var, not bad code

"Missing env var while it already exists" = empty/stale value (CLAUDE.md §6). Edit in-place in Vercel → Settings → Environment Variables, then push a fresh commit (env edits alone don't redeploy). Do **not** rotate `PII_ENCRYPTION_KEY` (§3) or `AUTH_SECRET` (logs every user out) as a "fix."

## 2. Database migration rollback posture (Prisma + Supabase)

**We do not run `prisma migrate down`.** This stack uses **expand/contract** so a web rollback (§1) is always schema-compatible.

- **Expand first:** new columns/tables are additive + nullable/defaulted; new code reads them, old code ignores them.
- **Contract later, separately:** drops/renames happen in a _later_ migration, only after no running deploy references them.
- If a migration itself is the problem: **forward-fix, don't reverse** — author a corrective migration (`prisma migrate dev` → review → `prisma migrate deploy`). Out-of-band migrations applied via Supabase MCP `apply_migration` need their `_prisma_migrations` row inserted with the SHA-256 checksum so `migrate deploy` skips cleanly (CLAUDE.md §6). Never point `--shadow-database-url` at the real DB (it wipes it). RLS/auth/DB-split changes get the §3 second security review.
- **`PII_ENCRYPTION_KEY` never rotates** without a planned re-encryption migration (CLAUDE.md §2). A rollback must never change it — old ciphertext becomes undecryptable and every PII read breaks.

## 3. The DB-split footgun to re-check after ANY rollback

After rolling back code OR env, **verify `DATABASE_URL_APP` is present on all surfaces** (Vercel + both Render services). Missing → `withUser()` silently falls back to the superuser connection and **RLS is bypassed** (`packages/db/src/client.ts`). Confirm `connection_limit=1` is still on the app connection string. A rollback to an older deploy can resurrect a stale/blank env value — check it.

## 4. Render service rollback

1. Render dashboard → affected service → **Events / Deploys**.
2. Last successful deploy → **"Rollback to this deploy"** (or Manual Deploy → previous commit).
3. Render free tier sleeps after inactivity — first request may cold-start (~30–60s); expected.
4. Keep Render in lockstep with the DB schema via the same expand/contract rule.

## 5. Supabase auto-pause gotcha (free tier)

Free tier **auto-pauses after 7 days idle** → app + every DB call fails (looks like a total outage, is just paused).

- **Resume:** `restore_project` (Supabase MCP) — standing permission granted (CLAUDE.md §6).
- After resume: re-run §3, and confirm pgcrypto is still pinned on the `app_user` search_path (`public, extensions, pg_temp`) or `withUser` PII decryption fails with `pgp_sym_decrypt(...) does not exist`.

## 6. Verify the rollback worked

### 6a. Health probe (instant, first)

```bash
curl -s https://alphawolfedecals-app-web.vercel.app/health
# → { "status": "ok", "commit": "<SHA>" }
```

`commit` MUST equal the SHA you rolled back to — the authoritative "which build is live" check, and the readiness gate for any post-deploy admin call (see the 404-quirk note).

### 6b. Smoke workflow (full confidence)

The prod smoke (`.github/workflows/smoke.yml`) auto-runs on every Vercel Production `deployment_status=success`. An instant rollback may NOT re-emit that event, so trigger it manually: GitHub → Actions → **MVP smoke** → **Run workflow** (workflow*dispatch). Runs `mvp-flow` + `brief-wizard` + `aw-template` as the seeded `SMOKE*\*`accounts.`cancel-in-progress: true`on group`smoke-production`— don't fire two back-to-back. The 3 specs self-clean; the daily`sweep-generation` cron (09:00 UTC) backstops leaks.

### 6c. Observability

- Sentry: 0 new errors after the rollback settles.
- Supabase advisors: unchanged from baseline.
- If DB-touching: sign in as a real account (not just smoke) to confirm RLS/data.

## 7. Post-incident

- New entry at the **TOP** of `activities.md` (append-only): what broke, SHA rolled back to, root cause, follow-up.
- Never force-push to main, never delete files (CLAUDE.md §4).
- If the rollback exposed a missing guard/gate, file it as a hardening item rather than hot-patching prod.
