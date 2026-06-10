# Production-Readiness Audit — alphawolfedecals-app-web.vercel.app — 2026-06-09 (Goal 4)

Skill: `production-readiness` (executed verbatim, four-phase). Chained after the
security audit (which **PASSED** with Med-level gaps — see `security-audit.md`).
Target: prod + source `goal/4-mvp-handoff` (origin/main `498c1b1`).

---

## Phase 1 — Site Profile

Interactive Next.js 15 app on a **Vercel platform subdomain** (`*.vercel.app` →
Vercel-managed TLS, so custom-domain / DNS / cert rows are **N/A**). Owned Postgres
(Supabase) + owned auth with signup/login/persistent state → full DB-hygiene + QA
matrix applies. **`website-security-audit` ran today (2026-06-09) and passed** with
documented Med gaps → §8 light-security overlap rows cite that run. **Prod holds
zero real data** (0 orders/shops/projects, 3 `pending_verification` users, 4
published vehicles) → backup/restore and "first real user" rows are FAIL-LATENT
with the trigger "before the first real signup".

---

## Phase 3 — Findings

| # | Item | Status | Severity | Evidence | Fix type |
|---|------|--------|----------|----------|----------|
| 1 | Per-page screen states (loading/empty/error/success) | **HUMAN-VERIFY** | Med | Editor has an autosave indicator + manual Save; routes for vehicles/dashboard/projects/editor exist. Per-page async-state coverage to be confirmed via the DELIVERABLE 1 screenshot walk-through | auto where a state is missing |
| 2 | DB schema constraints (NOT NULL / UNIQUE / FK) | **PASS** | – | Prisma migrations enforce constraints at DB level; RLS FORCED on all app tables | – |
| 3 | Cascade `ON DELETE` intentional | **HUMAN-VERIFY** | Low | FKs present (orders→projects/project_versions/vehicles); confirm each `ON DELETE` was chosen deliberately | read migration |
| 4 | Indexes on queried columns | **PASS (note)** | Low | Indexes present (several "unused" — expected at zero traffic). 7 FKs lack a covering index (Supabase INFO); tables are tiny | optional: add FK covering indexes pre-scale |
| 5 | Backup config + **verified restore** | **FAIL-LATENT** | High-when-data / Low-now | Supabase free-tier auto-backups; **no restore drill performed/dated**; 0 production rows today | **human**: run + date one restore drill **before the first real signup** |
| 6 | README stranger-test | **FAIL** | Med | **No root `README.md`** (extensive `docs/` + ADRs exist, but no setup/run entry point) | **human-write** |
| 7 | Branch hygiene | **SOFT-GAP** | Low | Many stale `feat/*` + `tmp/rebase-*` branches > 30 days; `main` is deployable | **human**: prune merged branches |
| 8 | Debug artifacts in shipped code | **PASS** | – | **0** `console.log`/`debugger`/`FIXME` in `apps/web/app`+`src` | – |
| 9 | Lockfile committed | **PASS** | – | `pnpm-lock.yaml` tracked | – |
| 10 | CI/CD wired to main | **PASS** | – | Vercel git integration auto-deploys `main` (ADR-0013); no manual `vercel deploy` | – |
| 11 | Build completes without warnings | **HUMAN-VERIFY** | Low | Not re-run this session; CI green per activities log. Will re-run in DELIVERABLE 3 | DELIVERABLE 3 |
| 12 | Rollback plan documented + tested | **HUMAN-VERIFY** | Med | Vercel instant-rollback (promote prior deploy) is available; needs a written runbook + one tested rollback | **human**: write + test once |
| 13 | Custom domain + HTTPS cert | **N/A** | – | Platform subdomain `*.vercel.app`; Vercel-managed TLS (HSTS 2 yr already set) | – |
| 14 | Health / status URL | **PASS** | – | `/health` → **200** live | – |
| 15 | Slow-3G / Lighthouse mobile | **HUMAN-VERIFY** | Med | To run in DELIVERABLE 3 (Lighthouse re-baseline on `/`, `/vehicles`, `/vehicles/[id]`) | DELIVERABLE 3 |
| 16 | Real-device + cross-browser QA | **HUMAN-VERIFY** | Med | Only Archer can hold the phone / open Safari | **human** |
| 17 | Fresh-signup E2E (incl. email delivery) | **PARTIAL → 0.5 / human** | Med | The 0.5 smoke covers signin→browse→editor→submit on prod; **fresh signup + OTP email delivery** depends on GH-016 (Resend domain verified 2026-06-09 — verify a real send end-to-end) | DELIVERABLE 0.5 + human-verify |
| 18 | Forgot-password E2E | **HUMAN-VERIFY** | Med | No `/reset` / `/forgot` route in the app tree — confirm whether a reset flow exists (auth is password + OTP); if shipped, verify the email arrives & link is single-use | **human** |
| 19 | Empty-DB / empty-state experience | **HUMAN-VERIFY** | Low | A brand-new user lands on `/projects` empty state — confirm no broken layout. Captured in DELIVERABLE 1 | verify |
| 20 | No test/dummy data in prod | **PASS (note)** | Low | 3 `pending_verification` users (never completed signup — harmless); 0 orders/projects | optional cleanup |
| 21 | Terms of Service + Privacy Policy | **FAIL** | Med | **No `/terms` or `/privacy` route** in the app tree; the site collects PII (auth, contact) | **human-copy** (legal — draft, Archer approves) |
| 22 | Cookie consent (EU) | **HUMAN-VERIFY** | Low | CSRF/session cookies are essential (no banner needed); PostHog analytics may need consent for EU reach | **human** (if EU traffic) |
| 23 | Uptime monitor | **FAIL-LATENT** | Med | Inherits security audit #19 — `/health` is ready to be wired | **human** |
| 24 | Maintenance cadence | **FAIL-LATENT** | Low | No recurring reminder to review error logs / deps / feedback | **human** (calendar) |
| 25 | Dependabot / Renovate | **FAIL** | Med | Not enabled → the 2 moderate CVEs (and future ones) rot silently | **human**: enable on the repo |

---

## Summary

**Shipped & solid:** DB constraints + RLS; lockfile; CI/CD to main; `/health` 200;
zero debug artifacts; no large binaries; clean security posture (cited).

**Real open gaps (before PUBLIC launch — none block the investor demo):**
- **README** (#6), **ToS + Privacy routes** (#21), **enable Dependabot** (#25),
  **rollback runbook + one tested rollback** (#12), **uptime monitor** (#23),
  **Lighthouse re-baseline** (#15 → DELIVERABLE 3).

**Gated / latent (trigger stated):**
- **Backup restore drill** (#5) — *before the first real signup.*
- Maintenance-cadence reminder (#24) — *at launch.*

**Human-verify pending (exact instruction):**
- Per-page screen states (#1, via DELIVERABLE 1), build warnings (#11, DELIVERABLE 3),
  real-device + cross-browser QA (#16), fresh-signup + OTP delivery (#17, GH-016),
  forgot-password flow (#18).

**Do-NOT-touch:** inherits the security audit's list (CSP enforce-state,
`withSystem` bootstrap, `$queryRawUnsafe` pooler pattern, ADR-0013 invariants).

**Verdict:** **Functionally launch-ready for an investor demo.** The MVP works
end-to-end on prod; the open items are the standard pre-**public**-launch hardening
set (legal pages, README, dep automation, monitoring, restore drill) — none of
which blocks the demo, and all of which belong in the handoff doc's
"known gaps / launch blockers" section (DELIVERABLE 2).

---

## Appendix — Advisor verdicts
See `_advisor-verdicts.md` (clean-context Opus subagent reviews, recorded verbatim).
