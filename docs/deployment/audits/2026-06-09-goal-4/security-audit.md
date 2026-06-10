# Security Audit — alphawolfedecals-app-web.vercel.app — 2026-06-09 (Goal 4)

Skill: `website-security-audit` (executed verbatim, four-phase). Target: prod
`https://alphawolfedecals-app-web.vercel.app` + source `goal/4-mvp-handoff`
(origin/main `498c1b1`). Recon performed live this session (curl headers, prod
endpoint probes, Supabase MCP DB introspection, source read, `pnpm audit`).

> **Tooling note (no silent swap):** the prompt's `advisor()` tool is not present
> in this Claude Code session. Per Archer's directive, every advisor checkpoint is
> a **fresh-context Opus subagent** given a clean briefing (the diff/findings + the
> question only — never the working transcript). Its verdicts are recorded verbatim
> in the Appendix.

---

## Phase 1 — Site Profile

**Next.js 15 App Router on Vercel** (functions `sfo1`, edge `iad1`), Turborepo
pnpm monorepo. **Owned Postgres** on Supabase (`dxwnzxlmggpdjyoxdybh`, us-west-1)
via Prisma over the **transaction pooler** (`$queryRawUnsafe`-only — tagged
templates collide on pgBouncer). **Owned custom auth** (`@alphawolf/auth`:
argon2id passwords, OTP via Resend, double-submit CSRF, per-IP + per-account
lockout). **RLS on all 14 app tables (FORCED)** with a **two-connection split**
(`withUser`→`app_user` RLS-enforced / `withSystem`→superuser bootstrap only).
Storage: two Supabase buckets (`vehicle-templates` public, `project-assets`
private — both 50 MB + MIME-capped). Sentry (server+edge) + PostHog. Resend
email (domain verified 2026-06-09). **Stack profile: "Next.js on Vercel + owned
DB + owned auth" → the full checklist applies.** Prod currently holds **zero real
data** (0 orders/shops/projects, 3 `pending_verification` users, 4 published
vehicles) — a pre-launch MVP.

---

## Phase 3 — Findings

| # | Item | Status | Severity | Evidence | Fix type |
|---|------|--------|----------|----------|----------|
| 1 | Security headers (6 + CSP) | **PASS** | – | Live curl: CSP, HSTS `max-age=63072000; includeSubDomains`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. **Byte-identical to `middleware.ts`** (config↔live parity = true PASS) | – |
| 2 | CSP `script-src 'unsafe-inline' 'unsafe-eval'` | **SOFT-GAP (accepted)** | Med (Phase 2) | Next 15 bootstrap + Tailwind v4 runtime styles need `unsafe-inline`; Konva canvas needs `unsafe-eval`. Documented in `middleware.ts`; nonce migration is a tracked Phase-2 item | **do-NOT-touch** under handoff pressure; Phase-2 SSR-nonce |
| 3 | RLS tenant isolation (14 tables FORCED) | **PASS** | – | `pg_class.relrowsecurity=relforcerowsecurity=true` on every app table. Orders triple verified live: `orders_owner_all` (ALL, owner=uid), `orders_shop_read` (SELECT, membership), `orders_shop_update` (UPDATE, USING **and** WITH CHECK = membership — blocks cross-shop + re-routing). `app_user` role = `super=f, bypassrls=f` | – (live cross-tenant proof scheduled in DELIVERABLE 0.5) |
| 4 | Two-connection DB split | **PASS** | – | `client.ts`: `withUser`→`getPrisma()`→`DATABASE_URL_APP` (app_user) + `set_config('app.current_user_id', …, is_local=true)`; `withSystem`→superuser, bootstrap-only, `current_user_id` unset. `$executeRawUnsafe`+`pgQuoteLiteral` is the pooler-correct pattern | **do-NOT-touch** |
| 5 | Silent superuser fallback (missing `DATABASE_URL_APP`) | **HUMAN-VERIFY** | High *if* misconfigured | `getPrisma()` falls back to superuser `DATABASE_URL` with only a one-time `console.warn` if `DATABASE_URL_APP` is empty → RLS silently off for authed paths | **human-verify** `DATABASE_URL_APP` is set+non-empty on Vercel prod. The 0.5 cross-tenant test fails **closed** if this is wrong — that is the live proof |
| 6 | Secrets in client-shipped code | **PASS** | – | `grep` for `service_role`/`sk-`/`sk_live`/`AKIA`/`BEGIN PRIVATE KEY`/`eyJ…` across `apps/web` + `packages` → **0 hits**. Service-role key is server-only (`storage/supabase.ts`) | – |
| 7 | Dev backdoor endpoints | **PASS** | – | `/api/dev/make-admin` + `/api/auth/dev-otp` hard-gated `NODE_ENV==='production'`→404. **Live probe: both 404** (also confirms `NODE_ENV=production` live) | – |
| 8 | Object-level authz / IDOR | **PASS** | – | All 9 server actions enforce `requireUser`/`requireShopUser`/`requireAdmin` **per-action** + ownership (`getProject` is RLS-scoped → null for non-owners) + RLS. Admin actions re-check `requireAdmin` (not just layout gate) | – |
| 9 | File upload (web-shell vector) | **PASS** | – | Private bucket; browser→signed-URL direct upload (ownership-checked, 24 h TTL); filename UUID-namespaced + sanitized; **bucket-level 50 MB + MIME allowlist** (verified via `storage.buckets`); rasters re-encoded by `sharp`; SVGs pass the strict validator + SVGO (strips `<script>`) and are served via `<img>` (no script execution) | – |
| 10 | XSS | **PASS** | – | **0** `dangerouslySetInnerHTML`/`innerHTML` in shipped web; React auto-escaping intact | – |
| 11 | CSRF | **PASS** | – | Double-submit cookie (`httpOnly`, `sameSite=strict`, `secure` in prod) bootstrapped in middleware; `verifyCsrf` on every form action + Next built-in Server-Action origin check | – |
| 12 | Auth rate-limiting (edge) | **FAIL** | **Med** | Upstash per-IP limiter (`/signup`,`/signin`,`/verify`, 10/min) is **NOT live on prod** — 12 rapid `/signin` all returned 200, no 429 → `UPSTASH_*` env unset → middleware silently no-ops. **Mitigated** by the DB lockout in `login.ts` (5 fails/IP/15 min + 10/account) which is the real credential-stuffing guard | **human-infra**: set `UPSTASH_REDIS_REST_URL/TOKEN` on Vercel + redeploy, **or** accept DB-lockout-only and document |
| 13 | OTP-verify throttling | **SOFT-GAP** | Med | `/verify` is covered only by the (currently inactive) Upstash limiter; `otp_codes` has `expires_at` + `consumed_at` (single-use) but no live edge throttle on verification attempts | **human-infra** (same fix as #12) |
| 14 | Dependency CVEs | **FAIL** | Med (0 high/crit) | `pnpm audit`: **next-auth** `5.0.0-beta.25` email-misdelivery ([GHSA-5jpx-9hw9-2fx4](https://github.com/advisories/GHSA-5jpx-9hw9-2fx4)) — **next-auth is the LIVE session layer** (`@alphawolf/auth` = Auth.js v5, Credentials provider → argon2id `login()`); the specific email-misdelivery path is **not exercised** (Credentials + own Resend OTP, not the NextAuth Email provider), but the dep is live. **postcss** `<8.5.10` build-time CSS XSS ([GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)) — build-time only | **auto** (safe bumps): next-auth ≥ beta.30, postcss ≥ 8.5.10 |
| 15 | `app_is_admin()` SECURITY DEFINER exposed via PostgREST | **SOFT-GAP** | Low | Supabase advisor WARN: callable by `anon`/`authenticated` via `/rest/v1/rpc/app_is_admin`. **But** `/rest/v1` requires an apikey (live probe: 401 on orders/users/rpc) and the fn returns `false` with no `app.current_user_id` → RLS-neutralized. App uses Prisma direct, not PostgREST | **human-dashboard**: disable the unused Data API (removes this + the anon surface entirely) or `REVOKE EXECUTE` |
| 16 | `function_search_path_mutable` (`users_block_account_type_change`) | **SOFT-GAP** | **Low** *(re-graded from Med per advisor #2)* | Live `pg_proc`: the fn is **`prosecdef=false` (NON-definer)** → no privilege boundary to cross; near-unexploitable since `app_user` (nobypassrls) cannot CREATE in `public`. The only SECURITY DEFINER fn (`app_is_admin`) **already pins** `search_path=public, pg_temp` | **DB** (hygiene): `ALTER FUNCTION … SET search_path = ''` — zero-downside, gates nothing |
| 17 | `pg_trgm` extension in `public` schema | **SOFT-GAP** | Low | Supabase advisor WARN | **DB**: move to `extensions` schema |
| 18 | Error monitoring (Sentry) | **PASS** | – | `sentry.server.config.ts` + `sentry.edge.config.ts` present; `packages/observability/src/sentry-scrub.ts` redacts PII | verify receiving in DELIVERABLE 3 |
| 19 | Uptime monitoring | **FAIL-LATENT** | Med | No external uptime monitor evident on the prod URL (`/health` exists + returns 200, ready to be wired) | **human**: UptimeRobot/BetterStack on `/health` |
| 20 | robots.txt / security.txt | **SOFT-GAP** | Low | `/robots.txt`, `/sitemap.xml`, `/.well-known/security.txt` all 404 → pre-launch site is crawlable | **auto**: add `robots.txt` (disallow pre-launch) + optional `security.txt` |
| 21 | `Access-Control-Allow-Origin: *` on homepage | **PASS (note)** | Low | Present only on the prerendered public marketing HTML; **absent** on data/auth routes (`/vehicles`, APIs `private/no-store`; `/dashboard`,`/projects` 307-redirect when unauthenticated) | – |
| 22 | Session cookie attributes | **PASS** | – | `auth-config.ts`: session-token cookie uses the **`__Host-`/`__Secure-` prefix** + `httpOnly`, `SameSite=strict`, `Secure` (prod), JWT 30 d. CSRF cookie likewise. Stronger than NextAuth's default `SameSite=lax` | – |

---

## Summary

**Shipped & solid (no action):** security headers + config↔live parity; RLS triple
verified live + all tables FORCED; two-connection split implemented correctly;
zero secrets in client code; dev backdoors gated (404 live); per-action authz +
IDOR protection; hardened upload path; no XSS sinks; CSRF double-submit;
**hardened session cookies (`__Host-`/`__Secure-`, SameSite=strict)**; DB-backed
auth lockout (OTP brute-force bounded to ~25 guesses/hr — advisor-verified in code);
Sentry + PII scrub; `/health` 200.

**Real open gaps (before PUBLIC launch — none block the investor demo):**
1. **Human-verify `DATABASE_URL_APP` is set on Vercel prod** (#5) — the single must-execute item; **proven closed by the DELIVERABLE 0.5 cross-tenant RLS test** (fails closed if RLS is bypassed).
2. **Activate edge rate-limiting** (#12/#13) — set `UPSTASH_*` on Vercel + redeploy, or formally accept DB-lockout-only. *(auth — advisor-gated to fix; env-only, cannot break the model)*
3. **Bump 2 moderate deps** (#14) — next-auth ≥ beta.30, postcss ≥ 8.5.10. *(safe)*
4. **Add an uptime monitor** on `/health` (#19). *(human)*

**Soft gaps (Low):** CSP nonce migration (Phase 2); disable unused PostgREST Data
API (#15 — safe, verify no Storage signed-URL rides on it first); pin
`users_block_account_type_change` search_path (#16, hygiene); move `pg_trgm` schema
(#17); add `robots.txt` (#20).

**Do-NOT-touch (would break the model / violate ADR-0013):**
- CSP `'unsafe-inline'`/`'unsafe-eval'` — Konva canvas + Next/Tailwind need them.
- `withSystem` on signup/OTP/reset bootstrap paths — no row-owner pre-auth by design.
- `$executeRawUnsafe` + `pgQuoteLiteral` — the only pooler-safe raw shape.
- ADR-0013 locked deploy invariants (`outputFileTracingRoot`, hoisted externals, Prisma `binaryTargets`, `connection_limit=1`).

**HUMAN-VERIFY:** `DATABASE_URL_APP` set on Vercel prod (#5); Sentry receiving events (#18, covered by DELIVERABLE 3).

**Verdict:** **No High/critical LIVE FAIL.** The MVP's security posture is strong and
well-documented. All actionable pre-public-launch items are Med and mostly
human/infra (rate-limit activation, dep bumps, search_path pin, uptime monitor).
**The investor demo is not blocked on security.**

---

## Appendix A — Supabase advisors (raw)

**Security (4 WARN, 0 ERROR):** `function_search_path_mutable`
(`users_block_account_type_change`); `extension_in_public` (`pg_trgm`);
`anon_security_definer_function_executable` + `authenticated_…` (`app_is_admin()`
via PostgREST). All triaged above (#15–#17).

**Performance (INFO/WARN, non-security):** 7 unindexed FKs (tiny tables);
`auth_rls_initplan` re-evaluates `current_setting()` per row on ~20 policies
(scale optimization — wrap in `(select …)`); many unused indexes (expected
pre-traffic); `multiple_permissive_policies` on `orders` (the **intentional**
OR'd owner+shop access). None blocks launch; noted for DELIVERABLE 3.

## Appendix B — Advisor verdict (fresh-context Opus subagent, plan review, verbatim)

> *(recorded per Archer's directive — clean-context second opinion on the DELIVERABLE 0 plan, before substantive work)*

See `_advisor-verdicts.md` in this directory (Verdict #1).

## Appendix C — Advisor review of findings

See `_advisor-verdicts.md` (Verdict #2) — independent review of this findings table.
