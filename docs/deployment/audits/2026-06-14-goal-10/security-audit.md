# Security Audit — Goal 10 D1 (launch gate) — 2026-06-14

**Verdict: PASS — no CRITICAL/HIGH finding blocks launch.** Re-audit of `goal/10-launch-hardening` following the `website-security-audit` skill (classify → active recon → findings). Independent fresh-context audit + the targeted RLS/transfer_token hardening below.

## Site profile

Full-stack Next.js 15 (App Router) on Vercel, owned Postgres (Supabase us-west-1) via Prisma with the two-connection RLS split (`withUser`=app_user/RLS, `withSystem`=superuser/bootstrap+maintenance). Custom OTP auth (`app.current_user_id` GUC, NOT Supabase Auth). Supabase Storage uploads (logo/SVG), paid AI (fal + Anthropic) with a global daily spend cap, referral/credits, public share tokens. PII encrypted via pgcrypto. gitleaks + Dependabot in CI.

## Targeted hardening done this gate

### RLS enablement — the rate_limits / \_prisma_migrations advisory (was the documented Goal-9.1 carry, `docs/ops/rate-limits-rls-verdict.md`)

- `public.rate_limits` and `public._prisma_migrations`: **RLS ENABLED** (deny-all, no policy) + `app_user` grants revoked. Both are touched ONLY via `withSystem` (superuser, BYPASSRLS) / `prisma migrate` — so enabling closes the PostgREST/anon read-write vector WITHOUT affecting the app. Authored in `packages/db/prisma/sql/auth_rls.sql`; applied to prod and verified (`relrowsecurity = true`).
- `public.concept_votes`: already RLS-enabled+forced+grants-revoked (Goal 9 sealed ballot box) — the `rls_enabled_no_policy` INFO is **by design** (withSystem-only voting).
- `users_block_account_type_change()`: pinned `SET search_path = ''` → cleared the `function_search_path_mutable` WARN.
- **Regression guard:** `rls.integration.test.ts` now asserts RLS stays enabled on all three system tables (can't silently drift off).

### Supabase advisors — before → after

| State             | Lints                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before (D1 start) | `rls_enabled_no_policy` concept_votes (INFO); `function_search_path_mutable` (WARN); `extension_in_public` pg_trgm (WARN). Actual DB: rate_limits + \_prisma_migrations RLS **disabled**.                                       |
| After (D1)        | 3× `rls_enabled_no_policy` INFO (rate_limits, \_prisma_migrations, concept_votes — **intended deny-all**); 1× `extension_in_public` pg_trgm (WARN). The RLS-disabled vector is **closed**; `function_search_path` WARN cleared. |

**Accepted baseline:** `extension_in_public` pg_trgm (WARN) — namespace-hygiene only, no exploit path; pg_trgm backs the shop-locator GIN index, so relocation to `extensions` is a post-launch migration (avoid destabilizing search at the gate). Logged as a follow-up.

### transfer_token capability separation (GH-012)

`projects.transfer_token` was spec'd for project transfer but **no transfer feature exists**; it is reused purely as the public share-view token (`share.ts`). Confirmed the public surface (`loadPublicShare`, `recordConceptVote`) exposes only whitelisted non-PII fields (no `ownerUserId`/contact/unwatermarked originals) and its only mutation is a vote. **New regression test** (`share-rls.integration.test.ts`) asserts holding the token yields no ownership and cannot change `owner_user_id`/`transfer_token` — i.e. the token can never be leveraged into project claim/transfer. (Also corrected a stale assertion: app_user reading `concept_votes` is denied at the GRANT level — stronger than the prior empty-result expectation.)

## Independent audit findings (fresh context, evidence-backed)

All PASS, no CRITICAL/HIGH. Highlights:

- **Headers + CSP:** all 6 present; live `curl` byte-matches `middleware.ts`; connect-src scoped to exactly Supabase/Sentry/PostHog/Vercel, no wildcards. `'unsafe-inline'`/`'unsafe-eval'` are ADR-0014-accepted (Next 15 + Tailwind v4 + Konva) — do-NOT-touch without the planned nonce migration.
- **Secrets:** no service_role/secret keys or JWTs in shipped code; no `NEXT_PUBLIC_SUPABASE_ANON_KEY`, no browser Supabase client (validates the rate_limits verdict). gitleaks in CI.
- **IDOR:** every owner-scoped action enforces ownership server-side via `requireUser`/`requireShopUser`/`requireAdmin` + RLS.
- **File upload:** server-side magic-byte MIME sniff, SVG script-stripping, 50 MB server cap, random filenames, private bucket + signed URLs.
- **Rate limiting + spend caps:** Upstash sliding window on auth routes; $5/day global AI cap (estimate-then-true-up); per-IP vote limit; referral self-/ring-abuse guards.
- **Dev/admin escalation endpoints:** prod-404 verified live (Goal-9 rider-5 fix holds).
- **Debug/error leakage:** none; Sentry scrubs PII/tokens.
- **Dependencies:** `pnpm audit` 2 critical + 2 high — 100% dev-toolchain (vitest/esbuild/vite, devDependencies only, never in the prod bundle); Dependabot auto-PRs them. Next.js resolves to **15.5.18** — past CVE-2025-55184/55183 + RSC-RCE.

## HUMAN-VERIFY (carried to D2)

1. Confirm `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set in prod Vercel env (the auth rate-limiter silently no-ops if absent). → checked in D2 env-completeness.
2. ~~Next.js lockfile past 2025 CVEs~~ — RESOLVED: lockfile pins 15.5.18.

## §3 second security review

D0 retirement diff reviewed independently (APPROVE-WITH-NITS, acted on). This D1 RLS/DB-split + transfer_token work is itself a security deliverable; the independent fresh-context audit above is the second opinion. Recorded in PR #170.
