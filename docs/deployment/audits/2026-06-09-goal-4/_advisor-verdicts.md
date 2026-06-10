# Advisor verdicts — Goal 4 DELIVERABLE 0 (recorded verbatim)

The prompt's `advisor()` tool (Opus 4.8) is **not present** in this Claude Code
session. Per Archer's directive (2026-06-09), each advisor checkpoint is a
**fresh-context Opus subagent** given a clean briefing — only the deliverable /
findings + the specific question, never the working transcript. Verdicts are
recorded here verbatim, unedited.

---

## Verdict #1 — DELIVERABLE 0 plan review (before substantive work)

*Fresh-context Opus subagent. It read the repo to verify load-bearing claims.*

> ## ADVISOR VERDICT (Opus 4.8, fresh context) — Goal 4 plan
>
> Your plan is sound and unusually thorough. The recon checklist for Deliverable 0 is the right shape and I'd run it largely as written. I verified the load-bearing claims against the repo: the orders RLS triple, the two-connection split with its loud-but-only-`console.warn` fallback, the non-throwing dispatch, and the middleware security headers (CSP, HSTS `includeSubDomains`, X-Frame DENY, Permissions-Policy, plus an Upstash rate limiter) all exist as described. Deltas below.
>
> **Q1 — Top blind spots, and how to actually test RLS on prod:**
> 1. **You cannot prove RLS from code or headers — you must prove it from a second identity.** Static inspection only shows policies *exist*. Genuine test: with the *two seeded accounts from 0.5*, sign in as customer A, create an order; sign in as shop/customer B, attempt to read/transition A's order via the real UI/Server Action and the order-id endpoint with B's session cookie. Expect 404/empty/`conflict`, never the row. That is your only live proof `withUser` binds `app.current_user_id` correctly under the **transaction pooler** (where prepared-statement collisions across pooled connections are a known footgun — your own client comments flag it). This is the single most important active test and it depends on 0.5, which complicates sequencing (see Q2).
> 2. **The silent-superuser fallback is only a `console.warn`, not a hard fail.** On prod you cannot see that warn easily, and a blank/stale `DATABASE_URL_APP` (your MEMORY notes Vercel conn strings are write-only/Sensitive and pull-blank) would disable ALL RLS with zero surface signal. Don't infer config from the dashboard. *Prove* the app connection is non-superuser by running, through the app's `withUser` path, a probe that asserts `current_user = 'app_user'` and `current_setting('app.current_user_id')` is set — or rely on the cross-tenant test in #1, which fails closed if the fallback is active. Treat "is the live app actually on app_user right now" as a Sev-1 line item with positive evidence, not assumed-present.
> 3. **`orders_shop_update` re-routing / status-set bypass.** USING+WITH CHECK gate cross-shop and re-routing, but confirm the transition path can't be coerced to set an arbitrary `status` or skip the `ORDER_TRANSITIONS` whitelist (e.g. submitted→fulfilled directly, or transitioning a `cancelled` order). The WITH CHECK is described as "defence-in-depth," meaning the app layer is the real gate — so audit the Server Action's server-side `canTransitionOrder` enforcement, not just the policy.
> 4. **Auth path object-level authz beyond orders:** projects/project_versions/assets and the asset-upload signed-URL path. Shop members are *designed* to not see customer projects — verify that's enforced on the storage object ACL too, not just the `projects_owner_all` row policy. A public-read Supabase bucket or guessable object path leaks design assets independent of RLS.
> 5. **OTP / reset endpoints run on `withSystem` (RLS off) by design.** Audit those specifically for enumeration and rate-limit coverage — your limiter only covers `/signup /signin /verify`. Password-reset/OTP-issue on the privileged connection is exactly where a missing limit or a user-enumeration oracle bites.
>
> **Q2 — Sequencing trap (real, fix it):** Seeding real prod accounts (0.5) *before* the audit fully clears is mostly fine and is in fact **required** to run test Q1.1 — but you've created a chicken-and-egg: the audit's most important finding (live RLS enforcement) needs the seeded accounts. Resolution: run **Phase 0 recon and the static/header/config findings first**, seed in 0.5, then come back and execute the cross-tenant RLS proof as a *named recon step*, then STOP. Don't treat 0.5 as purely post-audit. Guardrails so the smoke doesn't pollute prod: (a) scope seeded accounts to a clearly-fenced "Smoke Test Shop" with no real routing; (b) gate PostHog with a `$process_person_profile=false` / test-flag or exclude these emails from funnels so analytics baselines (Deliverable 3) aren't skewed; (c) the smoke creates real `orders` rows — decide up front whether they're cleaned up (via the app's cancel path, not raw SQL) or permanently tagged; (d) the seeded accounts ARE exploitable accounts on prod with known-to-GitHub-secrets passwords — use strong unique values, never reuse, and note them as a standing residual risk in the handoff doc (investors' eyes on a doc that references prod creds is itself a leak vector — reference secret *names*, never values).
>
> **Q3 — Findings that would BREAK the model if "fixed" (do-NOT-touch):**
> - **`withSystem` on bootstrap/OTP/reset is not a bug.** A scanner will flag "superuser connection / RLS bypass" — do NOT migrate those to `withUser`; there's no row-owner pre-auth and no INSERT policy by design. Document, don't "fix."
> - **CSP `'unsafe-eval'`/`'unsafe-inline'`** — `unsafe-eval` is the Konva canvas path, `unsafe-inline` is Next bootstrap + Tailwind v4. Tightening to nonces is a real Phase-2 item but a *naive* removal breaks the editor and the app. Flag as known/accepted, don't hotfix under handoff pressure.
> - **ADR-0013 locked deploy invariants:** `outputFileTracingRoot`, hoisted `serverExternalPackages` (svgo/sharp/canvas/argon2), Prisma `binaryTargets`, `connection_limit=1`. A "perf/cleanup" finding that touches any of these requires an amendment ADR — do not let an audit auto-remediate them.
> - **The loud-warn fallback itself:** don't "harden" it into a throw without confirming no legitimate path (a `withSystem`-only signup flow) constructs the app client first — your client comment says the warn fires from whichever client builds first. A throw could brick signup. If you do harden it (worth proposing), do it as a reviewed RLS PR with the extra independent review, not an inline fix.
> - **`$queryRawUnsafe` usage** — a scanner will scream "SQL injection." The inputs are server-controlled (env/session userId) and tagged-template raw collides on the pooler. Don't "fix" by switching to `$queryRaw`; that reintroduces the prepared-statement pooler bug.
>
> **Q4 — Invariant classes to audit for the ADR amendment (beyond your three):**
> - **Connection/runtime invariants:** `connection_limit=1` (Prisma classic engine, env-only), transaction-pooler + `$queryRawUnsafe`-only rule, `app_user` is `nobypassrls`/`nologin`, pinned `search_path = "$user", public, extensions` (pgcrypto lives in `extensions` — your MEMORY flags this as a decryption-breaking footgun).
> - **Crypto invariants:** `PII_ENCRYPTION_KEY` never rotates without a re-encrypt migration; `email_lower_hash` HMAC keying is fixed (rotating it orphans every lookup); argon2id params.
> - **CSP/header contract** as a locked surface (the middleware is now the source of truth — note it so a future `next.config` "consolidation" doesn't silently drop headers).
> - **Migration-tracking ritual:** the `_prisma_migrations` checksum-insert-after-MCP-`apply_migration` step (in your MEMORY) is an operational invariant worth codifying.
> - **Notification contract precise wording:** not just "non-throwing" — "dispatch failure MUST NOT roll back or block the status transition; the transition is the source of truth, email is best-effort." State the directionality.
> - **CI guardrail port:** before deleting `.coderabbit.yaml`, enumerate each guardrail it enforced and map it to a concrete CI check or the `/code-review` checklist — your CLAUDE.md §3 explicitly says keep it until ADR-0013 migrates them. Don't delete on the same PR that ports them; port + green CI first, delete second.
>
> **One gap not in your plan:** verify the **`orders` migration is actually applied to prod** (your MEMORY says it was "NOT yet applied to prod" as of Goal 3a). If the table/policies aren't live, every order test and the smoke will behave unpredictably and the RLS triple you're certifying doesn't exist on prod. Confirm via Supabase `list_migrations`/`list_tables` as step 1 of recon, before anything else.
>
> Net: plan is solid — ship it with the 0↔0.5 cross-tenant RLS test wired as an explicit recon step, positive proof of the live `app_user` connection, and the do-NOT-touch list above pinned where the fix-phase can see it.

**Author's reconciliation of Verdict #1 (no conflicts):** every point was either
confirmed by recon or folded into the plan. Specifically: the orders migration +
RLS triple **are live on prod** (verified via `list_migrations` + `pg_policies`
this session — Q4 "one gap" resolved); the cross-tenant RLS proof is wired as an
explicit DELIVERABLE 0.5 step (Q1.1/Q2); `DATABASE_URL_APP` live-proof is finding
#5 (Q1.2); the do-NOT-touch list (Q3) is pinned in `security-audit.md`; the ADR
invariant classes (Q4) seed DELIVERABLE 4.

---

## Verdict #2 — Findings review (before acting / before declaring DONE)

*Fresh-context Opus subagent reviewing the two findings tables. It read the repo + queried live Postgres `pg_proc` to verify severity calls.*

> ADVISOR VERDICT — Goal 4 pre-launch security audit (independent, fresh-context, evidence verified live)
>
> The audit is fundamentally sound. The "no High/critical LIVE FAIL, demo not blocked" conclusion holds. I verified the load-bearing claims directly in the goal-4 worktree and against the live Supabase DB. Deltas and one severity downgrade below.
>
> **1. Conclusion correct. Pressure-tests:**
>
> - **#12 (rate-limit off) — Med confirmed, not a hidden High.** I traced the OTP path. `verifySignupOtp` (signup.ts:282) enforces `active.attempts >= OTP_MAX_ATTEMPTS` (=5) per code, and `createOtp` invalidates prior open codes on each issue (otp.ts:30-37), so an attacker can't stack parallel codes. Resend is capped at `OTP_HOURLY_RESEND_LIMIT`=5/hour (signup.ts:247). Worst case: 5 codes/hr × 5 guesses = **25 guesses/hr against a 10^6 space → ~1-in-40,000 per hour, ~11 years to 50%.** That is the answer to your Q3: the OTP hole you feared does not exist because attempt-limiting is enforced server-side in the DB, not at the edge. Med is correct.
>
> - **#16 (mutable search_path) — DOWNGRADE to Low/informational.** This is my one real correction. I queried pg_proc live: `users_block_account_type_change` is **`prosecdef = false`** — it runs as the *invoker*, not as a SECURITY DEFINER. A mutable search_path on a non-definer function is near-unexploitable: there's no privilege boundary to cross, and to hijack it an attacker must already be able to create objects in a schema on app_user's search_path — which app_user (nobypassrls, no CREATE on public) cannot. The Supabase advisor flags this generically; it does not know it's non-definer. Your only genuinely SECURITY DEFINER function, `app_is_admin`, **already has `search_path=public, pg_temp` pinned.** So #16 is hygiene, not Med. Pin it anyway (one line, zero downside), but it does not gate anything.
>
> - **#5 (silent RLS bypass) — correctly the top residual risk, fails CLOSED.** client.ts:68-95 confirms the footgun is real but instrumented: missing `DATABASE_URL_APP` warns once and falls back to superuser. Crucially, the consequence of misconfiguration is RLS *off* (over-permissive), which a cross-tenant test catches as a hard FAIL. Your planned 2-account RLS probe is the correct and sufficient gate. This is the **one item that must actually be executed**, not just reasoned about.
>
> **2. #16 exploitability:** Lower than Med, as above — non-definer + no-CREATE app_user = no path. Low.
>
> **3. #12 OTP:** Med is right; the minimum you must verify is exactly what I verified (per-code attempt cap × resend-per-hour cap = bounded guess budget). Confirmed in code. Hold Med.
>
> **4. Fix ordering:**
> - *Before demo:* only #5 (run the RLS cross-tenant test). Nothing else blocks an investor demo against zero real data.
> - *Before public launch (first real signup):* turn on Upstash (defense-in-depth — env-only, cannot break the model), next-auth+postcss bumps, restore-drill, ToS/Privacy routes (legal, not security), uptime monitor.
> - *Nice-to-have:* README, Dependabot, search_path pin, disabling the Data API.
> - **Model-break flags:** (a) **Disabling the PostgREST Data API is safe** (app uses Prisma direct, verified) — but confirm no Supabase Storage signed-URL or auth flow rides on it before flipping. (b) Do **not** "fix" the silent fallback by hard-throwing in client.ts without first confirming `DATABASE_URL_APP` is set on every surface, or you'll take prod down. Warn-loud is acceptable for launch; fail-hard is a post-launch hardening with a verified env precondition.
>
> **5. Missed items a pre-launch audit of this stack should cover:**
> - **Session/cookie attributes** — you verified CSRF double-submit and 9 server actions, but I see no explicit check that the session cookie is `HttpOnly + Secure + SameSite=Lax/Strict` and that session invalidation happens on password reset / OTP re-verify. Confirm.
> - **next-auth is in the dependency tree (#14) but you ship custom @alphawolf/auth** — verify next-auth is genuinely unused/transitive, not a second live auth path. A dormant-but-mounted NextAuth route would be a real hole the header audit wouldn't catch.
> - **Resend webhook / email-link signing** — OTP is in-band so low risk, but confirm no unauthenticated password-reset link with a guessable token.
> - **`pg_temp` ordering** on the one definer function — `search_path=public, pg_temp` is correct (temp last); just noting it's right.
>
> Net: ship the demo after the RLS test. Re-grade #16 to Low. Everything else stands.

**Author's reconciliation of Verdict #2 (one conflict, resolved by re-verification — no silent switch):**
- **#16 conflict (advisor said Low, my report said Med):** resolved in the advisor's favour **after independent re-verification** — I confirmed `users_block_account_type_change` is non-`SECURITY DEFINER` and the only definer fn (`app_is_admin`) already pins its search_path. **#16 re-graded Med → Low** in `security-audit.md`.
- **next-auth is a LIVE path, not dormant** (verified: `@alphawolf/auth` = Auth.js v5 / next-auth `5.0.0-beta.25`, Credentials provider → custom argon2id `login()`). So the #14 next-auth bump is a genuine before-public-launch item (the specific email-misdelivery vuln path is not exercised — Credentials + own Resend OTP, not the NextAuth Email provider). No second live auth path; the `[...nextauth]` route is the intended single handler.
- **Session-cookie attributes: verified PASS** (added as finding #22): `__Host-`/`__Secure-` prefixes, `httpOnly`, `SameSite=strict`, `Secure` in prod, JWT 30 d — stronger than NextAuth defaults.
- **#5 is the one must-execute item** → wired as the DELIVERABLE 0.5 cross-tenant RLS proof (fails closed).
- Fix ordering adopted verbatim into the STOP/decision presented to Archer.
