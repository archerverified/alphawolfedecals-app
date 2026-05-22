# Step 6 — Phase 1 demo + staging deploy

Paste-ready prompt for a **fresh** Claude Code session. Largest step in the playbook so far — touches deployment topology, secret management, DNS, observability config, and the demo storyline. Single PR titled `[Step 6] Phase 1 demo + staging deploy`. Sequenced internally so the prep work can be reviewed before any go-live action that Archer holds the button on.

---

## Pre-flight (do these BEFORE opening Claude Code)

Decisions locked (no Step 0 host question needed):

- **Host for apps/api + services/parse + services/ai** = **Render** (free tier, Oregon region matching Supabase + Upstash).
- **Vercel for apps/web** = standard free Hobby tier.
- **Domain** = Vercel-provided `.vercel.app` URL for Phase 1 demo. Custom domain (`alphawolfwrap.com` or alternative) becomes a Phase 4 follow-up issue.
- **`RESEND_FROM_EMAIL`** stays on `onboarding@resend.dev` sandbox for the demo (delivers only to the Resend account-owner email). Verified domain is a Phase 4 follow-up.

Account-level setup that Claude Code cannot do for you. Confirm each before starting the session.

- [ ] **Vercel** account created at vercel.com. Existing failed project `prj_Ht7ha9M6FjrqZqwR5UbQr71CE12a` must be deleted before the session imports cleanly (Settings → scroll to bottom → Delete Project → type name to confirm; or `vercel project rm <name>` via CLI).
- [ ] **Render** account created at render.com. New Workspace = `alphawolf` or similar. No services created yet — that's a manual step you do AFTER the session pushes the `render.yaml`.
- [ ] **Sentry** + **PostHog** + **Supabase** + **Upstash** projects exist (they do, from PR #39 + earlier).
- [ ] **Vercel CLI** installed locally (`npm i -g vercel`) and authenticated (`vercel login`).
- [ ] **`gh auth status`** still authenticated.
- [ ] **Working tree clean.** Lock sweep + status check:

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App
find .git -name "*.lock" -print -delete
find .git -name "*.lock"
git checkout main
git pull --ff-only
git status --short
git log --oneline -3
```

Expected: lock sweep prints any stale `.lock` files and deletes them; clean working tree; `main` matches `origin/main`; HEAD shows `#39`, `#38`, and the vault seed at the top.

---

## Prompt to paste into a fresh Claude Code session

```
Execute Step 6: Phase 1 demo + staging deploy.

You are designing and executing the first production-grade deployment of Alpha Wolf Wrap Studio. This is not a feature PR — it is a deploy-infrastructure PR + a demo-readiness PR bundled into one branch. Three deploy targets, one Postgres, one Redis, two observability vendors, one email vendor, one image-model vendor, and the existing Phase 1 feature surface (auth + vehicle templates + canvas editor + asset upload). Architectural choices made in this PR persist into Phase 2/3/4 — be deliberate.

## Resume context — important

- **Phase 1 is feature-complete on main.** Two PRs just merged: #38 (asset upload pipeline + base canvas editor, commit e0094c5) and #39 (PostHog + Sentry observability, commit 1cd01de). All required CI contexts are green on main.
- **Three Phase 1 polish issues are open as deferred work** (#46 frontend polish epic, #52 architecture follow-ups epic, #53/#54 ADRs, #55–#65 security/tech-debt singletons). DO NOT resolve any of those in this PR — Step 6 is deployment, not feature work. Reference by number where deployment makes the gap concrete.
- **The scrubber, the RLS boundary, and the `withUser`/`withSystem` discipline are load-bearing in production** — never bypass them in the deploy config (e.g. don't pass `SUPABASE_SERVICE_ROLE_KEY` to a Vercel client-side env var; don't ship `DATABASE_URL` to a context that should use `DATABASE_URL_APP`).
- **Archer holds every irreversible button.** You prepare; you do not auto-deploy. Specifically: you do not connect the GitHub repo to Vercel/Render via their dashboards (Archer does that in the UI), you do not add the production DNS records (Archer does at the registrar), you do not flip `NEXT_PUBLIC_SENTRY_DSN` to live in production env (Archer does after reviewing the deploy preview). Your work is documentation, configs, scripts, and verification — not credentials applied to live services without explicit confirmation.
- **Branch protection still enforced.** All required CI contexts must be green to merge. Push to a fresh branch `feat/step-6-demo-and-deploy`.

## Read first

- `~/.claude/plans/` — check for any deploy-related plan files from prior sessions
- /prd.md §1, §10 (Phase 1 scope + Phase 4 prep)
- /docs/adr/0001-locked-stack.md, /docs/adr/0002-monorepo-and-runtime-platform.md, /docs/adr/0007-supabase-storage-strategy.md, /docs/adr/0009-parse-queue-bullmq-upstash.md, /docs/adr/0011-observability-boundaries.md (if it landed — issue #54)
- /docs/vault/00-START-HERE.md (Critical Learnings, top-5 patterns)
- /docs/vault/70-quick-reference.md (env var catalog, Observability section, Upstash section)
- /activities.md (last 5 entries — what shipped, in what order, and the lessons baked in)
- /apps/web/next.config.ts (the externals + withSentryConfig wrap — production build depends on this)
- /apps/api/src/index.ts + /services/parse/src/index.ts + /services/ai/app/main.py (the three Node/Python services that need a host)
- /packages/db/src/client.ts (`withUser`/`withSystem`/`pgQuoteLiteral` — the production DB boundary)
- /packages/observability/src/sentry-scrub.ts (the scrubber — must be wired in every deployed runtime)
- /.github/workflows/ci.yml (existing CI; Step 6 may add a deploy-preview job)

## Skills and agents to activate

**Skills** (per-task expertise; layer deliberately):

*Architecture + decision layer:*
- `senior-architect` — deployment topology, secret-management strategy, service-boundary decisions. Write ADR-0012 (deployment architecture).
- `senior-backend` (installed in `.claude/skills/senior-backend`) — apps/api + services/parse + services/ai Render config, native-binary handling on Render's Node image (inkscape/pdf2svg installation strategy), free-tier spin-down trade-offs.
- `senior-frontend` (installed in `.claude/skills/senior-frontend`) — Vercel + Next.js 15 App Router production config, edge vs node runtime decisions, ISR/SSG/SSR per route, image optimization.
- `senior-data-engineer` — production Supabase connection limits, pgBouncer pool size, RLS performance under prod load.

*Implementation layer:*
- `vercel-deploy` (installed in `.claude/skills/vercel-deploy`, OpenAI-authored) — THE ACTION TOOL for `apps/web` deploys. Pattern: `vercel deploy [path] -y` with a 10-minute timeout. Use this when you need to actually trigger a Vercel deploy from the session (typically not in this PR — Archer triggers first-deploys via the Vercel dashboard after the PR merges).
- `workflow-automation` — BullMQ worker deployment + scaling on Upstash; Render/Fly worker process config.
- `supabase` — production storage bucket policies, signed-URL TTL verification, RLS in production.
- `supabase-postgres-best-practices` — production index review, connection pool sizing, query EXPLAIN sweep for the Phase 1 hot paths.
- `api-security-best-practices` — production security headers (CSP, HSTS, X-Frame-Options, COOP/COEP), rate limiting at the edge, CORS.
- `web-performance-optimization` — Lighthouse / Core Web Vitals baseline; first-load JS budget; image optimization; the 60fps editor benchmark against the deployed URL.
- `webapp-testing` — Playwright smoke suite against the deployed preview URL.
- `code-reviewer` — final security pass against the production config (look for: hardcoded secrets, dev defaults left on, debug routes left exposed, sensitive logs).

*Documentation layer:*
- `mermaid-diagrams` — production architecture diagram for ADR-0012 (deploy topology + data flow).

**Cross-task coordinators (agents — invoke via the Task tool):**

- `context-manager` (`.claude/agents/context-manager.md`) — production capacity planning. Apply to:
  1. Upstash Redis capacity (free-tier 256MB / 500k commands/month) vs. projected demo + early production traffic. Decide on TTL bumps, eviction policy, when to upgrade.
  2. Sentry quota (free-tier 5k errors/month + transactions). Set `tracesSampleRate` per environment.
  3. PostHog event budget (free-tier 1M events/month). Sample rate decisions for high-frequency events (gated by issue #59 already, but cross-check).
  4. Supabase project tier (free-tier 500MB DB + 1GB Storage + 2GB egress). Project current demo traffic against limits.
  5. Document the projections in ADR-0012 §Cost.

- `vercel-deployment-specialist` (`.claude/agents/vercel-deployment-specialist.md`) — JUDGMENT tool for the Vercel side. Invoke when designing:
  1. `vercel.json` — region pinning (the agent's defaults include `iad1`/`sfo1`; we want Oregon-aligned to match Render+Supabase+Upstash, so `pdx1` or `sfo1` — ask the agent which is the right call). Per-route `runtime: 'nodejs'` vs `'edge'` decisions. Function `maxDuration` for Server Actions that talk to the parse worker.
  2. ISR/SSR/SSG choice per route. Working hypothesis to validate with the agent: vehicle gallery = ISR with `revalidate: 3600`; editor = SSR (`dynamic = 'force-dynamic'`); public landing = SSG; project list = SSR (RLS-scoped per user).
  3. `next.config.ts` image optimization config (domains list including `supabase.co`, formats `['image/webp', 'image/avif']`, deviceSizes, cache TTL). Currently bare; the agent's playbook fills it.
  4. `@vercel/analytics` + `@vercel/speed-insights` wiring in `apps/web/app/layout.tsx` for Phase 1 Web Vitals visibility (complements Sentry — Speed Insights is RUM, Sentry is errors+traces).
  5. Rollback procedure documentation in ADR-0012 §Rollback (the agent has the canonical `vercel alias set` / `vercel rollback [deployment-url]` patterns plus the zero-downtime alias swap).
  6. Cold-start mitigation for Server Actions hitting Supabase (connection pooling guidance from the agent — informs the `DATABASE_URL_APP` pool size we set in the Render env vars and the pgBouncer-side defaults).

**Skill vs. agent split (do not violate):** the **skill** executes — invoke `vercel-deploy` ONLY when you need to actually `vercel deploy` from the session (which is not in this PR; Archer triggers first deploys from the Vercel dashboard after merge). The **agent** designs — invoke `vercel-deployment-specialist` for every Vercel-platform architectural decision in the scope below. If you find yourself reaching for one to do the other's job, you're in the wrong tool.

**Prompt engineering quality bar** — for every decision in this PR, you are using `prompt-engineering-patterns`-style discipline on your own work:
- State the constraint, then the decision, then the rationale (why this option vs the others), then the rollback path.
- Anti-patterns to refuse: "we'll figure it out in prod", "ship it and see", "this should work", "should be fine."
- Every secret in every deployed env is accounted for: source, rotation procedure, who-owns-rotation.

## Step 0 — host is already locked (no AskUserQuestion)

Host = **Render** (free tier, Oregon `us-west` region to match Supabase + Upstash). Vercel for `apps/web` (free Hobby tier). Vercel-provided `.vercel.app` URL for the demo; custom domain is a Phase 4 follow-up. ADR-0012 documents these decisions — do not re-litigate, do not ask, do not switch mid-scope.

Two pre-existing notes from Archer:
- A failed Vercel project `prj_Ht7ha9M6FjrqZqwR5UbQr71CE12a` has already been deleted by Archer. The session does NOT touch that project ID; it imports fresh.
- Both `vercel-deploy` (skill, `.claude/skills/vercel-deploy/`) and `vercel-deployment-specialist` (agent, `.claude/agents/vercel-deployment-specialist.md`) are present and complementary — use them per the activation guidance below, never as substitutes for each other.

## Scope (in order)

### 1. ADR-0012 — Production deployment architecture (REQUIRED, FIRST CODE WRITTEN)

File `/docs/adr/0012-production-deployment-architecture.md`. Use the existing ADR template. Required sections:

- **Context**: Phase 1 ships; the three Node/Python services + the Next.js app + the Postgres/Redis/object-store backing services need a deterministic production topology.
- **Decision**:
  - `apps/web` → Vercel (Next.js native; edge for middleware, node for server actions; preview deploy per PR).
  - `apps/api` + `services/parse` + `services/ai` → [chosen host from Step 0]. Each its own service.
  - Supabase Postgres + Storage (existing, project `dxwnzxlmggpdjyoxdybh`).
  - Upstash Redis (existing, `certain-bass-131284.upstash.io`).
  - Sentry (existing project), PostHog (existing project), Resend (existing account, domain to verify).
  - Replicate API (existing, for rembg).
- **Service boundaries**: which service is reachable from which (Vercel ↔ apps/api ↔ services/parse via Upstash; services/ai called by apps/web for Phase 2 prep, not Phase 1). Mermaid diagram via the `mermaid-diagrams` skill.
- **Environments**: `production` (main), `preview` (every PR), `development` (local). Env-var matrix per environment.
- **Secret management**: where each secret lives (Vercel project env vars + Render/Fly secrets; never committed). Rotation procedure per secret. Who-owns-rotation.
- **Observability boundaries**: Sentry DSN per environment (recommend separate Sentry environment, not separate project, to keep error grouping). PostHog API key per environment. ADR-0011 references.
- **Cost projection**: each vendor, projected monthly $ at the demo + first-customer scale. Run `context-manager` for the projections. Cap = $50/month for Phase 1 dev + demo.
- **Rollback**: how to roll back a bad deploy on Vercel (instant via the Deployments page; document). How to roll back on chosen host. How to roll back a destructive migration (we don't have any in Phase 1, but document the procedure for Phase 2 prep).
- **Consequences**: what this PR locks in vs. what's revisitable. Phase 4 (launch) will revisit hosting if traffic exceeds the chosen tier.

### 2. Vercel configuration (apps/web) — drive design via `vercel-deployment-specialist` agent

Before writing any Vercel config, invoke `vercel-deployment-specialist` with the questions from the activation guidance above (region pinning aligned to Oregon services, ISR/SSR/SSG per route, image optimization for Supabase Storage URLs, Speed Insights wiring, rollback playbook). Document the agent's recommendations inline in ADR-0012 §Vercel.

Then ship:

- `/apps/web/vercel.json` — populate per the agent's region + runtime + maxDuration recommendations. Omit only the keys where Vercel's defaults are correct.
- `/apps/web/next.config.ts` — fill `images: { ... }` per the agent's image-optimization playbook. Confirm `serverExternalPackages` + `withSentryConfig` still compose with whatever the agent adds. `SENTRY_AUTH_TOKEN` must be set in Vercel (env var, scope = `production` + `preview`); when unset, source-map upload is skipped silently (existing logic preserves this).
- `/apps/web/app/layout.tsx` — add `<Analytics />` and `<SpeedInsights />` from `@vercel/analytics/react` and `@vercel/speed-insights/next` per the agent's wiring. These are no-ops outside Vercel hosting, so they don't break local `pnpm dev`. Add the packages to `apps/web/package.json`.
- `/apps/web/app/(public)/health/route.ts` — a Vercel-pingable health endpoint returning `{ status: 'ok', commit: process.env.VERCEL_GIT_COMMIT_SHA }`. Used for monitoring and as the first verification of the deploy. `export const runtime = 'edge'` if the agent confirms an edge-runtime health endpoint is appropriate here; otherwise leave node default.
- Document the EXACT Vercel env vars needed in `/docs/deployment/vercel-env.md` (NEW directory `/docs/deployment/`). One row per var: name, source, environments (Production/Preview/Development), notes. NEVER paste real values.

### 3. apps/api + services/parse + services/ai (chosen host)

- New `/render.yaml` (or `/fly.toml` / Railway config — match the chosen host). One service per app:
  - `alphawolf-api` (Node, runs `apps/api`). HTTP service. Health: `/health`.
  - `alphawolf-parse` (Node, runs `services/parse`). Worker service (NOT HTTP) — the Express health endpoint exists but the primary process is the BullMQ worker. Some hosts (Render) need this as a "Background Worker" type.
  - `alphawolf-ai` (Python, runs `services/ai` via `uv run uvicorn`). HTTP service. Health: `/health`.
- Each service gets:
  - The minimum env vars per `/docs/deployment/<host>-env.md` (NEW). Do not duplicate the Vercel matrix; cross-reference.
  - Auto-deploy on push to `main` (preview deploys per PR if the host supports it).
  - Resource sizing: smallest tier that handles the demo workload. ADR-0012 §Cost references these.
- Sentry init in each service is already gated on `SENTRY_DSN` presence (PR #39). Verify by reading `apps/api/src/instrument.ts`, `services/parse/src/instrument.ts`. In production env vars, set `SENTRY_DSN` for the same Sentry project used in dev (verified) + `SENTRY_ENVIRONMENT=production`.
- PostHog init in `services/ai` is gated on `POSTHOG_API_KEY` presence. Set in prod env. Issue #59 (PostHog /health gate) tightens the noise floor — flag if it hasn't landed yet.

### 4. Production env-var matrix

Create `/docs/deployment/env-matrix.md`. One source of truth for what env vars exist in which environment.

Rows include: `DATABASE_URL`, `DATABASE_URL_APP`, `DIRECT_URL`, `PII_ENCRYPTION_KEY`, `AUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `AUTH_EMAIL_TRANSPORT`, `ANTHROPIC_API_KEY` (Phase 2 prep — set placeholder), `UPSTASH_REDIS_URL` (BullMQ TCP), `UPSTASH_REDIS_REST_URL` + `_TOKEN` (optional), `REPLICATE_API_TOKEN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ENVIRONMENT`, `POSTHOG_API_KEY`, `POSTHOG_HOST`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VERCEL_URL` (provided by Vercel).

Columns: env var, scope (Vercel-web / api / parse / ai), environments (prod / preview / dev), source (Supabase Dashboard / Upstash UI / generated via openssl / etc.), rotation procedure, owner.

This is a **document, not a `.env` file**. Never paste real values in this file. If a value is generated by a script (e.g. `PII_ENCRYPTION_KEY` via `openssl rand -base64 32`), include the command but never the output.

### 5. Resend — sandbox-only for the demo

- No domain owned yet. Skip the domain-verification work entirely.
- `RESEND_FROM_EMAIL` stays on `onboarding@resend.dev` (Resend sandbox). OTP emails will only deliver to the email address that owns the Resend account. Adequate for the Phase 1 demo where Archer is the demonstrator.
- Document this limitation in `/docs/deployment/env-matrix.md` notes column for `RESEND_FROM_EMAIL`.
- File the production-domain work as a Phase 4 follow-up issue (already on the Phase 4 list — "custom domain (alphawolfwrap.com or alternative)").

### 6. Security hardening for production

Use the `api-security-best-practices` skill.

- `/apps/web/middleware.ts` (existing CSRF middleware) — extend to set CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy headers. Use `next/headers` API. Verify no regression on the existing CSRF cookie flow.
- Rate limiting at the edge: install `@upstash/ratelimit` (or a workspace-local lightweight implementation) on signup, signin, OTP request, asset upload, and the parse-status polling endpoint. Limits per-IP. Use the existing Upstash Redis.
- Verify the production CSP doesn't break Konva or shadcn's Radix primitives. `script-src` may need `'unsafe-inline'` for Next.js's inline bootstrap; document the trade-off.
- Verify the existing `/api/dev/*` routes are NODE_ENV-gated. Spot-check by reading every `route.ts` in `apps/web/app/api/dev/`.
- Verify the existing `/debug-sentry` routes are NODE_ENV-gated. (They are per PR #39 — confirm.)

### 7. Performance baseline (web)

Use `web-performance-optimization`.

- Run Lighthouse against the deployed preview URL (after the first successful Vercel deploy, in the same session). Save the report to `/docs/deployment/lighthouse-baseline-<date>.json`. Capture LCP, CLS, INP, TBT, FCP, TTFB.
- Acceptance for Phase 1 demo: LCP < 2.5s on a real connection, no CLS regression vs the static placeholder pages, INP < 200ms on the project list. Document any miss in ADR-0012 §Consequences with a follow-up issue.
- First-load JS budget: check `apps/web` bundle. Hard cap = 250KB gzipped for the auth + landing routes (no Konva). The editor route can exceed because Konva is large; document.

### 8. E2E smoke test against the deployed preview

Use `webapp-testing`.

- Extend `/apps/web/e2e/` with `deploy-smoke.spec.ts`: hit the deployed URL (env var `DEPLOY_URL` for the test), sign up as a new test user (clean up after), browse a vehicle, create a project, upload a tiny SVG asset, place on canvas, save, reload, confirm state intact.
- This runs ONCE in the session against the first preview URL after Archer triggers the Vercel deploy. NOT added to required CI contexts (yet — issue #65 tracks that conversation).

### 9. Observability dashboards

- In Sentry: confirm the `production` environment tag appears on incoming events from the deployed stack (post-deploy verification).
- In PostHog: confirm the `services/ai` events tag with the correct environment.
- Document the dashboard URLs in `/docs/vault/70-quick-reference.md` under the existing Observability section.
- No code changes required here — config-only.

### 10. Demo readiness

- Demo script as `/docs/deployment/phase-1-demo-script.md`: a 2-minute walkthrough. Sign up as shop owner → browse Transit 250 → start project → upload logo → rembg toggle → place on driver-side panel → drag outside, see red OOB cue → undo → redo → save → reload → state intact. Include exact click coordinates / element selectors so the demo is reproducible.
- A small "first screenshot" pass: capture the landing page, the vehicle browser, the editor with a placed logo, the OOB cue. Save under `/docs/deployment/screenshots/`. Use the deployed preview URL.
- (Optional, recommend) Record a 90-second screen capture walking the demo script. Drop the file path into the activities.md entry; you don't have to commit the binary.

### 11. Vault + activities.md updates

- `/docs/vault/70-quick-reference.md`: new "Production deploy" section linking to `/docs/deployment/env-matrix.md`, the chosen-host config, the Sentry/PostHog dashboard URLs, the rollback procedure, and the demo URL. Update `last_updated` in frontmatter.
- `/docs/vault/00-START-HERE.md`: append the production deploy doc to the file index. Add a Critical Learning entry if anything surprised you during the deploy (e.g. "Konva server-side `canvas` peer requires X on host Y" or "Vercel edge runtime rejects @sentry/profiling-node — already externalized, document the constraint").
- `/activities.md`: one new entry at the top — "Step 6: Phase 1 demo + staging deploy" — with the host choice, the deploy URLs, the cost projection, the lighthouse baseline numbers, the demo URL, and any follow-up issues opened. Pattern matches prior entries; do not edit prior entries.

### 12. Follow-up issues to open (at the end of the session)

After the PR opens and CI passes, batch-open these as GH issues (same pattern as the 21-issue batch from PR #39 review):

- "Phase 4: custom domain (alphawolfwrap.com) — Vercel + Resend + apex+www CNAME + Sentry tunnel"
- "Phase 4: Replicate API spend monitoring + monthly cap alert ($X)"
- "Phase 4: autoscaling triggers for parse worker (BullMQ queue depth threshold)"
- "Phase 4: Sentry quota ratchet — drop tracesSampleRate from 1.0 to 0.1 in production after first 1k transactions"
- "Phase 4: blue/green deploys via Render preview environments (or Vercel-equivalent for non-web services)"
- "Phase 4: backup verification — Supabase point-in-time recovery rehearsal"
- "Phase 4: pen test scope definition before public launch"

## Tests

- Vitest: any new helper (e.g. a CSP header builder) gets a unit test.
- Playwright `deploy-smoke.spec.ts` against the deployed preview.
- Lighthouse against the deployed preview (manual/CLI, not CI).
- Integration tests still pass: `pnpm --filter @alphawolf/db test:integration`.
- Full `pnpm turbo run lint typecheck test` green.

## Done definition

- ADR-0012 committed and merged.
- `/docs/deployment/env-matrix.md` committed (no real values).
- `/docs/deployment/<host>-env.md` for the chosen host committed.
- Resend sandbox state documented in `env-matrix.md`; no `resend-dns.md` this PR (Phase 4 follow-up).
- `/docs/deployment/phase-1-demo-script.md` committed.
- Security headers wired in `apps/web/middleware.ts`; Lighthouse + a manual `curl -I` of the deployed URL confirms presence of CSP, HSTS, X-Frame-Options, X-Content-Type-Options.
- Rate limit middleware wired on signup/signin/OTP/asset-upload routes.
- `/apps/web/app/(public)/health/route.ts` returns `{ status: 'ok', commit: ... }` on the deployed URL.
- `pnpm turbo run lint typecheck test` green locally; full CI green on the branch.
- `pnpm --filter @alphawolf/web build` succeeds locally (proves prod externals + Sentry wrap still compose).
- All three required CI contexts pass on the branch.
- /activities.md updated with the Step 6 entry.
- /docs/vault/70-quick-reference.md "Production deploy" section added; `last_updated` bumped.
- /docs/vault/00-START-HERE.md index updated.
- 7 Phase 4 follow-up issues opened.
- Status comment on the PR summarizing the host choice, the deploy URL, the lighthouse baseline, and the cost projection.

## Hard constraints

- **Do not auto-deploy.** You produce configs, scripts, and docs. Archer connects the GitHub repo to Vercel/Render in the respective dashboards. Archer pastes DNS records at the registrar. Archer flips production env vars on first-deploy in the host UIs.
- **No production secrets in the repo.** `.env.example` may grow new keys, but no real values. `/docs/deployment/*.md` is documentation, never `.env`. If you find yourself wanting to commit a real DSN or token, stop and re-read this constraint.
- **No DNS changes from the session.** The session prepares record-by-record instructions; Archer applies them.
- **No bypassing the `withUser`/`withSystem` boundary in deploy config.** `DATABASE_URL_APP` is the runtime connection for every per-user query; `DATABASE_URL` is superuser for migrations only. Never paste `DATABASE_URL_APP` where the architecture says `DATABASE_URL` and vice versa.
- **No feature work.** This PR is deploy infrastructure + demo prep. No editor improvements, no shadcn additions, no new ADRs beyond 0012 (and 0011 if it hasn't landed yet — coordinate with issue #54).
- **No new shadcn components.** The 16 from PR #38 cover Phase 1.
- **Branch protection enforced.** Push to `feat/step-6-demo-and-deploy`. Required CI green to merge.
- **Lock-file pattern**: if any git command reports "Another git process seems to be running" / "Unable to create '.git/*.lock'", sweep with `find .git -name "*.lock" -print -delete` and retry. Do not improvise.
- **Never paste a real Sentry DSN, real token, real password, real API key into chat output, commit messages, ADR text, or any committed file**, including test fixtures. Use synthetic values (`sk_test_...`, `https://[redacted]@sentry.io/0`, `Bearer test`, `rediss://default:[redacted]@host:6379`).
- **If you discover Phase 1 functionality is broken in production** (a missing env var, a CSP that nukes the editor, a Sentry init that crashes the cold start), do NOT push a feature fix in this PR. Open a P0 issue, comment on the PR linking it, and pause for Archer's direction.

## Commit message for the merge

```

[Step 6] Phase 1 demo + staging deploy

- ADR-0012: production deployment architecture (host = <chosen>;
  Vercel for apps/web; <host> for apps/api + services/parse +
  services/ai; existing Supabase/Upstash/Sentry/PostHog/Resend/
  Replicate retained).
- Vercel config + production env-var matrix (docs only, no secrets).
- <Host> config files for the three Node/Python services.
- Security headers (CSP, HSTS, X-Frame-Options, etc.) in
  apps/web/middleware.ts; rate limits via @upstash/ratelimit on
  signup/signin/OTP/asset-upload.
- /apps/web/app/(public)/health/route.ts for deploy monitoring.
- Resend domain verification DNS records (Archer pastes at registrar).
- Phase 1 demo script + screenshots from the deployed preview.
- Lighthouse baseline: LCP <num>s, CLS <num>, INP <num>ms.
- 7 Phase 4 follow-up issues opened.
- Vault: production deploy section in 70-quick-reference.md; index
  updated in 00-START-HERE.md.

```

## Hand-off after this session

1. **Archer**: open Vercel dashboard → connect the GitHub repo → import → first preview deploys automatically against the PR branch.
2. **Archer**: open <chosen host> dashboard → create the three services per `/docs/deployment/<host>-env.md` → paste the env vars (NEVER from a public source) → first deploy.
3. **Archer**: (Phase 4 follow-up) buy domain → add Resend DNS records → verify domain. Not in scope for Step 6.
4. **Archer**: run the Playwright `deploy-smoke.spec.ts` against the first preview URL: `DEPLOY_URL=https://<preview>.vercel.app pnpm --filter @alphawolf/web exec playwright test deploy-smoke`. Drop the result in the PR thread.
5. **Archer**: capture the demo screenshots from the deployed preview. Optional 90s screen recording.
6. **Archer**: merge the PR. Production deploys.
7. **Next Claude Code session**: Phase 2 kickoff prompt (GH-006/007 AI generation). Archer requests when ready.
```
