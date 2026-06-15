# Goal 11 — verification coverage (D8)

_2026-06-15. Pre-launch cleanup verification. No prod data was created by this
pass (the deployed smoke self-cleans; nothing was run against prod with a fresh
account)._

## Why the DEPLOYED smoke is the authoritative E2E for this goal

The two behavioural fixes here are **production-only phenomena** that a local
build cannot reproduce, so the deployed prod smoke — not a local webapp-testing
build — is the correct verification:

- **D2 (SameSite cookie):** `SameSite=strict` only drops the cookie on the
  HTTPS POST→redirect→GET sequence. Local dev is plain HTTP with the
  non-`__Secure-` cookie, so the bug never manifests locally.
- **D4 (cold-prod teardown timeout):** the afterEach starvation only happens when
  the test body runs slowly against a cold production deploy. A local build is
  fast and never exhausts the budget.

The deployed smoke (`mvp-flow` + `brief-wizard` + `aw-template`) exercises exactly
the surfaces this goal touches: **auth sign-in, project create → editor entry
(D2's session path), the brief wizard, and the AW catalogue browse.**

## Unit / integration suites (re-run after the D6 dep bump)

Full CI-equivalent on a clean reinstall (`rm -rf node_modules && pnpm install
--frozen-lockfile` → single `ioredis@5.11.1`), then
`pnpm turbo run lint typecheck test --force`:

- **33/33 turbo tasks green, 0 cached.** web **180** tests pass.
- D1: `packages/auth/tests/email.test.ts` — **12** tests incl. the new
  prod-forces-live-send guard; `signup.test.ts` — **17** (delete-on-failure path).
- D2: `packages/auth/tests/auth-config.test.ts` — **2** new tests pin both cookies
  to `lax` (mutation-checked: they fail on `strict`).
- D6: `services/parse` (20) + `apps/api` typecheck/tests green with bullmq 5.78 +
  ioredis 5.11 deduped.

## Deployed prod smoke (D4 verification)

The smoke (`mvp-flow` + `brief-wizard` + `aw-template`) was chronically red; it
took three test-side fixes **plus** one prod hotfix:

- **#173** extended the shared afterEach teardown budget.
- **#175** bounded every self-clean step so a cold `/projects` can't hang the afterEach.
- **#185** raised the upload "Parse complete" ceilings 120s→180s (+ test budgets)
  above the ~2.5-min Render cold-start, so the first upload succeeds instead of
  failing → retry-ballooning past the 30-min job wall.
- **#186 — the deeper blocker:** the sharp 0.35 prod 500 (below) was 500ing
  `/vehicles` + `/signin`, which reddened the smoke's catalogue + signin steps.

Final smoke on the all-fixes deploy (`939833d`): run #27563086822 — **GREEN, 5 passed (1.8m)**.
(Earlier dispatched/auto-triggered runs were cancelled by deploy-churn concurrency
or hit the 30-min wall while the sharp 500 + cold-start were still unfixed —
"cancelled" ≠ failed.)

## D1 — real email delivery

- The **code backstop** (console-transport ignored in real prod + startup Sentry
  alarm + regression tests) is merged (#171) and verified by the auth suite.
- **External-inbox delivery** to `awtraveling@gmail.com` was confirmed
  `delivered` by the Cowork session's live Resend MCP on 2026-06-15 (per the goal
  brief). In THIS Claude Code session the Resend MCP API key is invalid (every
  read returns `400 API key is invalid`), so I could not independently re-pull the
  send log — **flagged for Archer**: re-confirm in the Resend dashboard, or fix
  the MCP key, before relying on it again.

## Endpoints (D7) — live checks 2026-06-15

- `GET /health` → `200 {"status":"ok","commit":…}` (Edge liveness; no DB).
- `GET /vehicles` → was **500 for ~12h** (sharp 0.35 load failure — the D6
  regression, Sentry NODE-E) → **200 again** after the sharp hotfix #186 (verified
  on commit bcbe5bc, 3/3 curls). DB-backed readiness probe — see
  `docs/deployment/health-monitoring.md`. The UptimeRobot monitor was DOWN on this
  and should auto-recover.

## D3 — forgot-password

- Repo-wide grep for `forgot` / `reset password` / `reset-password` in
  `apps/web` (excluding e2e) → **no matches**. The sign-in form
  (`SignInForm.tsx`) has only "No account? Create one." No dead-end link exists;
  launch-without-reset (Archer decision) needs no code change.

## Baseline checks (closeout DoD)

- **Supabase advisors (security):** unchanged from the Goal-10 baseline — 3 INFO
  `rls_enabled_no_policy` (`_prisma_migrations`, `rate_limits` = intended
  superuser-only deny-all; `concept_votes` from Goal 9) + 1 WARN `pg_trgm` in
  `public` (accepted). No new advisories — this goal made zero DB/schema/migration
  changes.
- **Sentry:** NODE-B (`/signin` "unexpected response") resolved-with-reason;
  NODE-E (sharp linux-x64 load) resolved by hotfix #186. No new errors introduced
  by the Goal-11 deploys beyond NODE-E, which this goal both caused (D6) and fixed
  (#186).
