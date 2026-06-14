# Alpha Wolf Wrap Studio — Launch Go/No-Go Checklist

**Compiled Goal 10 (2026-06-14).** The single go-live gate. Builds on
`docs/phase-1-readiness-checklist.md` (pre-kickoff accounts/secrets) and
`docs/claude-code-prompts/post-launch-hardening.md` (post-deploy hardening) — this
is the launch DECISION layer on top of them. Each row is an explicit gate.

## CURRENT CALL: ⛔ NO-GO — 3 blockers (2 need Archer, 1 is deferred Goal-8 work)

The security + ops axes are GREEN. Launch is blocked by legal copy, password
recovery, and the catalogue-template editor gap. None are security holes; all are
known and scoped.

---

## A. BLOCKING GATES

### A1. Security (D1) — ✅ PASS

| Gate                                                                           | Status | Evidence                                                                                                                              |
| ------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| RLS enabled on `rate_limits` + `_prisma_migrations` (deny-all, superuser-only) | ✅     | applied + verified `relrowsecurity=true`; regression test added                                                                       |
| `concept_votes` sealed (RLS + grants revoked)                                  | ✅     | by design (withSystem-only); INFO advisory only                                                                                       |
| Supabase advisors at/under baseline                                            | ✅     | RLS-disabled vector CLOSED; `function_search_path` WARN cleared; remaining = 3 INFO (intended) + 1 WARN (pg_trgm-in-public, accepted) |
| `transfer_token` = share-view only, never project-claim (GH-012)               | ✅     | confirmed + regression test (`share-rls.integration`)                                                                                 |
| CSP/headers strict, Vercel-Analytics-compatible, no unsafe-\* creep            | ✅     | live == middleware.ts; ADR-0014 accepted unsafe-inline/eval                                                                           |
| Secrets: gitleaks clean, no service-role/anon-key client exposure              | ✅     | gitleaks in CI; no browser Supabase client                                                                                            |
| Next.js past 2025 CVEs                                                         | ✅     | lockfile pins 15.5.18                                                                                                                 |
| Independent 2nd security review                                                | ✅     | fresh-context audit PASS, no CRITICAL/HIGH — `audits/2026-06-14-goal-10/security-audit.md`                                            |

### A2. Production-readiness (D2) — 🟡 OPS GREEN / FUNCTIONAL BLOCKED

| Gate                                                                 | Status          | Evidence                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Latest prod deploy READY                                             | ✅              | Vercel API, main HEAD                                                                                                                                                                                                               |
| Rollback plan documented + path verified                             | ✅              | `runbooks/rollback.md`; 2 instant-rollback candidates                                                                                                                                                                               |
| Backup-restore drill performed                                       | ✅              | pg_dump→restore→row-count round-trip EXACT (`scripts/backup-restore-drill.sh`)                                                                                                                                                      |
| Env-var completeness (UPSTASH, RESEND_FROM_EMAIL, CRON, AI, DB, PII) | ✅              | `vercel env ls production` — all present                                                                                                                                                                                            |
| Post-deploy 404-quirk root-caused + mitigated                        | ✅              | cold-start (not pinning); `not-found.tsx` body + `/health` readiness gate                                                                                                                                                           |
| Sentry 0 new errors from Goal 10                                     | ✅              | 2 pre-existing 0-user non-customer issues, triaged                                                                                                                                                                                  |
| Error boundaries on every screen                                     | ✅              | added `error.tsx`/`global-error.tsx`/`not-found.tsx` (was white-screen-of-death)                                                                                                                                                    |
| UptimeRobot monitor on `/health`                                     | 🔶 HUMAN-VERIFY | `/health` live; confirm the monitor exists in the UptimeRobot dashboard                                                                                                                                                             |
| **Forgot-password recovery flow**                                    | ⛔ **BLOCKER**  | backend OTP capability exists; NO user-facing reset route — locked-out users can't recover. Needs Archer product decision + build.                                                                                                  |
| **Editor works on the catalogue templates**                          | ⛔ **BLOCKER**  | only the Ford Transit has `vehicle_panels`; the BMW X3 + Contender catalogue templates open a non-functional editor (Goal-4 blocker #1; Goal-8 paneling deferred). Author panels OR limit the launch catalogue to paneled vehicles. |

### A3. Legal (D4) — ⛔ BLOCKED (Archer copy)

| Gate                                                 | Status          | Evidence                                                                                    |
| ---------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------- |
| `/terms` + `/privacy` reachable                      | ✅              | SiteFooter on landing/public/dashboard                                                      |
| **Final Terms of Service copy**                      | ⛔ **BLOCKER**  | placeholder `[[PLACEHOLDER — pending Archer legal copy]]`, noindex — Archer to supply       |
| **Final Privacy Policy copy** (+ data-deletion path) | ⛔ **BLOCKER**  | placeholder; must describe collection/storage/encryption/retention/deletion                 |
| Tint disclaimer wording sign-off                     | 🔶 HUMAN-VERIFY | present + flagged (`TintStep.tsx`); Archer to confirm wording                               |
| Cookie consent                                       | ✅ DECISION     | not required (functional cookies + first-party analytics only); re-evaluate on EU marketing |

## B. NON-BLOCKING (ship-at-launch / fast-follow)

| Item                                                            | Status                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Anti-abuse (referral disposable+ring, daily spend monitor) (D3) | ✅ shipped + tested                                                                                          |
| Performance: CLS PASS, no regression (D5)                       | ✅ ; LCP cold-start-bound — warm re-measure pre-launch                                                       |
| SEO posture ready (D6)                                          | ✅ ; **launch step:** set `APP_ALLOW_INDEXING=true` on Vercel + redeploy → opens indexing, restores SEO ~100 |
| Slow-3G skeletons on list pages (D2 #3)                         | 🔶 fast-follow                                                                                               |
| Silent error-swallow in search/generation poll (D2 #6)          | 🔶 fast-follow                                                                                               |
| Dependabot #162 (22-pkg group)                                  | 🔶 fails CI — isolate the breaking bump; dev-toolchain CVEs only, not prod-exploitable                       |
| pg_trgm → extensions schema                                     | 🔶 post-launch migration (shop-locator GIN index)                                                            |

## C. LAUNCH-DAY SEQUENCE (once A blockers clear)

1. Land Archer's Terms + Privacy copy; remove the placeholder banners.
2. Resolve the catalogue-panels blocker (author panels OR trim the launch catalogue).
3. Ship the forgot-password flow.
4. Confirm UptimeRobot monitor on `/health`.
5. Warm-LCP re-measure (Lighthouse) — confirm steady-state CWV.
6. Set `APP_ALLOW_INDEXING=true` on Vercel + redeploy → indexing opens.
7. Trigger the prod smoke (`workflow_dispatch`) → green.
8. Verify `/health` reports the launch SHA; Sentry 0 new; advisors unchanged.

## D. STANDING OPS (post-launch-hardening.md)

RESEND*FROM_EMAIL set ✅ · UPSTASH*\* set ✅ · backup-restore drill done ✅ · Dependabot enabled ✅ · gitleaks in CI ✅ · maintenance cron (daily sweep + spend monitor) live ✅.
