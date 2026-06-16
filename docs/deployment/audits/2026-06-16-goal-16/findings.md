# Goal 16 — Launch-Readiness Audit — Findings & Evidence

Executor: Claude (Opus 4.8) in Claude Code, autonomous. Base: `origin/main` @ `1bb9d00` (Goal 15) — the live prod code. Worktree: `goal/16-launch-readiness`.
Environment: local build + LOCAL throwaway Postgres (`alphawolf_g16`, NEVER prod) + real-fal-capable + LIVE storage. Net-zero on the prod DB.

## D1 — Orchestrate / baselines (DONE)

- **State reconciled:** local `main` was 29 commits behind `origin/main`; `origin/main` @ 1bb9d00 = the complete product (Goals 10→15 merged) = the live prod deploy `dpl_99z9G…` (READY, target=production). Rollback candidate exists (Goal-14 `48303fd`, READY).
- **graphify:** 2851 nodes / 5068 edges, 97% extracted. God nodes = the security hubs `withUser`(81) / `withSystem`(75) / `requireUser`(47) / `requireAdmin`(29).
- **Supabase SECURITY advisors = documented baseline, 0 net-new:** 1 WARN `extension_in_public`(pg_trgm) + 3 INFO `rls_enabled_no_policy`(`_prisma_migrations`, `concept_votes`, `rate_limits` — deny-all = safe).
- **Supabase PERF advisors (baseline):** ~22 `auth_rls_initplan` WARN (RLS re-evaluates `auth/current_setting` per-row → wrap in `(select …)`), `multiple_permissive_policies` on `orders` (owner+shop overlap), 7 unindexed FKs, 6 unused indexes.
- **Local harness BUILT + VALIDATED** (the long-pole infra the G13/G15 carryovers requested): fresh `alphawolf_g16` DB → `extensions` schema + pgcrypto → `app_user` (LOGIN, NOBYPASSRLS) → 18 migrations → `auth_rls.sql` (23 tables, all RLS-enabled) → X3 catalogue (1 vehicle + 15 panels) copied read-only from prod (`COPY`, net-zero) → art read from public `vehicle-templates` bucket. Dev server smoke: landing/signup/signin/X3-detail all HTTP 200, 0 module errors.

## D2 — Security — PASS (13/13 checks, 0 High-severity FAIL) — LAUNCH-SAFE

Fresh-context security re-run (the first agent timed out). All verified live + in source:

- **Headers/CSP (PASS):** HSTS `max-age=63072000; includeSubDomains`, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, full CSP (`middleware.ts:34-77`). `script-src 'unsafe-inline' 'unsafe-eval'` is the accepted Next-bootstrap/Tailwind-v4/Konva trade-off (Phase-2 nonce deferred).
- **DB split (PASS):** every `withSystem` is bootstrap / system-maintenance / token-gated-public-no-PII; all customer reads `withUser` (RLS). `DATABASE_URL_APP`-missing→superuser fallback is guarded (`client.ts:68-95` warns once; optional hardening: throw in prod).
- **Dev/cron/admin guards (PASS):** `/api/dev/*` returns 404 in production + suffix-restricted + repo self-refuses; cron `CRON_SECRET` fail-closed; admin `requireAdmin()` → notFound.
- **Money rails (PASS):** `credit_ledger` INSERT/UPDATE/DELETE revoked from app_user; spend/refund only via `app_spend_credits`/`app_refund_credits` (SECURITY DEFINER, advisory-locked).
- **`concept_votes` deny-all (PASS):** does NOT break voting — written via the `withSystem` token-gated `recordConceptVote` path (`share.ts:223`), idempotent upsert.
- **transfer_token / GH-012 (PASS):** owner-scoped mint, "not secret", not a transfer-authority; future GH-012 must enforce.
- **Rate limiting (PASS):** PG-backed, fail-closed (DB error → action aborts). Auth lockout (IP + account), generation daily ceiling + global spend cap, export.
- **Secrets (PASS):** gitleaks CI on every PR/push; `.gitignore` covers `.env*` + `.mcp.json` (the latter remediated in `ae403cb`).
- Accepted residuals (not blockers): CSP unsafe-\* (Phase-2 nonce), warn-not-throw superuser fallback, PG (single-region) rate-limit pending Upstash.

## D3 — Production-readiness + storage sweep (storage sweep DONE)

- **Readiness audit grade: READY-with-1-triage.** PASS: screen states (error.tsx/global-error/custom not-found), rollback candidate, env-validation (`client.ts` throws on missing `DATABASE_URL_APP`; warns on RLS-bypass footgun), UptimeRobot (2 monitors UP), post-deploy-404 quirk mitigated, vercel.json (daily cron, maxDuration ≤60, sfo1, ADR-0013 intact).
- **`ready-sentry-node9` [Med/triage]:** 1 unresolved Sentry issue NODE-9 — `/signin` Server-Component render error, 6 events, ~18h ago. Triage before GO (likely cold-start/RSC transient; `signin/page.tsx` is trivial).
- **STORAGE SWEEP — DONE (net-zero, guarded):** `project-assets` **55 → 4**.
  - Purged 13 reference-less ORPHANS via Storage API (12 Goal-7 `bakeoff/2026-06/` artifacts + 1 leaked `parsed.svg`).
  - Retired 11 `@e2e.alphawolf.test` accounts via `retire-test-accounts.ts --apply` (guards passed: 0 admin, 0 real-domain; 0 projects/storage — already self-cleaned).
  - Purged the `@alphawolf.test` smoke-keeper's leaked projects via `purgeTestProjects()` (the sanctioned PURGE-PROJ path): **19 projects + 38 storage objects** removed, account kept.
  - Remaining 4 objects are LEGITIMATE: the real `@gmail` user's project (2) + the deliberately-persistent seeded smoke routed-order fixture (`ownerShopId`-pinned, 2). `vehicle-templates` 58 untouched (read-only). Total prod projects now: 3 (operator + real + smoke fixture).
- **Smoke-leak root cause:** the purge IS wired (daily cron `sweep-generation` → `maintenance.sweepTestData()` → `purgeTestProjects`+retire+orphan-shop, cohort-scoped to `@alphawolf.test`, `ownerShopId IS NULL` guard). The 19-project pileup was **dev-sprint burst residue** (Goals 13–15 testing 06-15/06-16) outpacing the single daily 9am-UTC tick (Hobby forbids sub-daily crons — #155). Mitigated by design; residue cleaned. Minor hardening option: prod cron `purgeTestProjects({olderThanMinutes:0})`.

## D4 — Performance (audit agent grade B)

- **`perf-detail-lcp-cls-poor` [Med/FAIL]:** vehicle-detail LCP 5.4s mobile + CLS 0.14–0.173 from a raw, unsized hero `<img>`. Fix: size it (next/image or explicit width/height + aspect box).
- **`perf-catalogue-card-img` [Low]:** raw `<img>` on cross-origin Supabase assets bypasses next/image config.
- **`perf-catalogue-force-dynamic` [Low]:** public catalogue routes `force-dynamic` (no CDN cache).
- **`perf-editor-server-waterfall` [Low]:** 3 sequential awaits before the parallel block in the editor route.
- Editor/brief/export CWV = PENDING-LOCAL (covered by `editor-perf.spec.ts` + the local harness).

## D5 — Design / UX / a11y (audit grade Design A- / AI-Slop A-, held)

- **`des-g15-white-box-artifact` [High] — CARRYOVER A. ROOT CAUSE (confirmed visually + in code):** the per-view conditioning renders (`render-view-conditioning.ts` `OUTLINE_BACKDROP_STYLE = path{fill:#ffffff;…}`) are WHITE-filled line art (confirmed by fetching the live `views/<X3>/driver.png` + `front.png` — both flat white-fill). `run-pipeline.ts:466` feeds them as structure conditioning. A panel the image model leaves UNPAINTED shows the conditioning's white → the rear-door white box. NOT a compositor bug: `load-spec-pack-data.ts:114` composites the logo only onto logo-zone panels (the proof brief used one zone = front door), so the rear-door box is in the AI render itself.
- **`des-g15-style-inconsistent-views` [High] — CARRYOVER B. ROOT CAUSE:** pure per-view image-model output variance. Both driver+front conditioning are uniformly FLAT, yet the export front rendered PHOTOREAL and the sides FLAT cel-shaded — the model's nondeterminism over identical-style conditioning. Lever = the orchestrator prompt (the proven G15-D1 approach), not a deterministic code path.
- **Fix approach (generation layer, the controllable lever):** (1) `render-view-conditioning.ts` fill `#ffffff` → neutral grey so an unpainted panel reads as primer, not a stark white box (CODE landed in-goal; live re-render writes the read-only `vehicle-templates` bucket → gated deploy op, flagged not done here); (2) orchestrator prompt v2→v3 (versioned + hash-pinned): "render EVERY panel fully wrapped (no bare/white panels)" + "render ALL views in ONE consistent photographic style/fidelity." Verification = the single real-fal E2E; residual model variance → punch-list with the G15 proof images as the repro baseline.
- **Deterministic in-goal fixes (D8):** `des-contrast-zinc400-on-white` [Med] (text-zinc-400 captions 2.56:1 fail AA → darken), `des-no-favicon` [Low], `des-title-template-double` [Low], `des-offbrand-sky-admin-badge` [Low], `des-429-unstyled-page` [Low].
- **`des-a11y-authed-pending` [Med/PENDING-LOCAL]:** axe sweep of authed pages — run on the local harness (D5).

## Remaining human gates (OUT of scope per Archer) — for the GO/NO-GO

Final legal copy · dependency-triage (separate goal) · domain migration (separate goal) · the `APP_ALLOW_INDEXING` flip.
