# Post-launch hardening — smoke test, Lighthouse baseline, tech-debt issues

Paste-ready prompt for a **fresh** Claude Code session (Sonnet is fine — orchestration only, no deep reasoning). Runs after both Vercel and Render are deployed.

---

## Pre-flight (on your Mac, in the repo root)

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App
find .git -name "*.lock" -print -delete
find .git -name "*.lock"
git checkout main
git pull --ff-only
git status --short
```

Confirm:
- Vercel deployment is READY at https://alphawolfedecals-app-web.vercel.app
- All three Render services (alphawolf-api, alphawolf-parse, alphawolf-ai) are LIVE per the Render dashboard
- Vercel has `API_URL`, `PARSE_URL`, `AI_URL` env vars set to the Render `.onrender.com` URLs

---

## Prompt to paste into a fresh Claude Code session

```
Execute post-launch hardening for the Phase 1 production deploy. Five tasks: smoke test the live URL, Lighthouse baseline, file four follow-up GH issues from the Vercel build log warnings, capture demo screenshots, update activities.md. Single batched commit at the end. No feature code, no scope expansion.

## Resume context
- Phase 1 is LIVE on Vercel at https://alphawolfedecals-app-web.vercel.app (deployment dpl_HhUcsRE468R4P3SsgmzYv6vFEgnq, commit e2b4a6a, region sfo1).
- Backend services are LIVE on Render: alphawolf-api, alphawolf-parse, alphawolf-ai (Oregon free tier per ADR-0012).
- Vercel has API_URL, PARSE_URL, AI_URL pointing at the Render services.
- The Vercel build log surfaced four non-blocking warnings that should be tracked as follow-up issues so they don't drift.

## Read first
- /docs/deployment/phase-1-demo-script.md (golden-path flow you'll smoke-test)
- /apps/web/e2e/deploy-smoke.spec.ts (existing smoke test built in Step 6)
- /activities.md (last 2 entries for context + format match)

## Skills to activate
- `webapp-testing` — Playwright smoke + screenshot capture
- `web-performance-optimization` — Lighthouse + Core Web Vitals
- `code-reviewer` — sanity-check the issue body content vs the actual build log warnings

## Scope (in order)

### 1. Smoke test the live Vercel URL
```bash
export DEPLOY_URL=https://alphawolfedecals-app-web.vercel.app
pnpm --filter @alphawolf/web exec playwright install --with-deps chromium
pnpm --filter @alphawolf/web exec playwright test deploy-smoke
```
- If all assertions pass: continue.
- If any assertion fails: STOP and report the failing line + screenshot path. Do not improvise fixes — the failure may indicate a real production bug that needs triage, not a test flake.

### 2. Lighthouse baseline
```bash
# Install lighthouse if not present locally
which lighthouse || npm i -g lighthouse

lighthouse https://alphawolfedecals-app-web.vercel.app \
  --output=json --output=html \
  --output-path=./docs/deployment/lighthouse-baseline-$(date +%Y%m%d) \
  --chrome-flags="--headless"
```
- Capture LCP, CLS, INP, TBT, FCP, TTFB from the JSON.
- Acceptance from ADR-0012: LCP < 2.5s, no CLS regression vs static placeholder, INP < 200ms on /projects.
- If any acceptance miss: note in activities.md as a Phase 4 follow-up; do NOT block this session on perf tuning.
- Commit BOTH the .json AND the .html — the html report is useful for sharing in PRs.

### 3. Capture demo screenshots
```bash
mkdir -p docs/deployment/screenshots
```
Drive Playwright through the demo script and screenshot each step into `docs/deployment/screenshots/`. Use ONE script (not the smoke test — keep them separate so this can be re-run for new versions without changing the smoke gate).

> **Reachability (verified 2026-05-25 against prod, commit `7ab8ad7` — current
> prod, which has advanced past the `e2b4a6a` referenced in this doc's Resume
> context above).** Only the
> public surfaces are capturable on production today. The authenticated editor
> flow needs features that don't exist yet, so those PNGs are **Phase 2
> dependencies** — NOT Phase 4 perf follow-ups. The screenshot spec's
> authenticated block self-skips on prod and will capture 05–09 only against a
> dev/preview env with dev-otp enabled. Don't re-discover this every run.

Steps to capture, one PNG per step:
- 01-landing.png — `/` — **Phase 1 reachable**
- 02-signin.png — `/signin` — **Phase 1 reachable**
- 03-vehicle-browse.png — `/vehicles/select` — **Phase 1 reachable** (the doc previously said `/vehicles`, which **404s** on prod; `/vehicles/select` is the real browse route)
- 04-vehicle-detail.png — `/vehicles/[Transit-250-id]` — **BLOCKED: Phase 1 bug** — `/vehicles/[id]` returns **HTTP 500** on prod (server digest `997428904`; `getPublishedDetail`/`withSystem` path throws while the search API works). Needs triage before this can be captured.
- 05-projects-empty.png — `/projects` (after sign-up) — **Phase 2 dependent** — pending production OTP enabled on prod (currently 307 → `/signin`)
- 06-editor-empty.png — editor for a new Transit 250 project — **Phase 2 dependent** — pending prod OTP + authenticated project (editor route is `/projects/[id]/editor`; bare `/editor` **404s**)
- 07-editor-with-asset.png — editor after upload + place on driver-side panel — **Phase 2 dependent** (authenticated editor)
- 08-editor-oob-cue.png — element dragged outside wrap-safe path, red cue visible — **Phase 2 dependent** (authenticated editor)
- 09-undo-redo.png — undo state captured — **Phase 2 dependent** (authenticated editor)

Save the script as `apps/web/e2e/demo-screenshots.spec.ts`. Use a real test sign-up flow (the smoke test already shows how) — generate a `demo+<timestamp>@example.com` user; clean up at the end. Do NOT capture any image containing a real secret or real customer data.

### 4. File four follow-up GH issues from the Vercel build log
Each surfaced by the Vercel deploy of commit e2b4a6a. Use `gh issue create` with single-quoted heredoc bodies (the established pattern from issues #40-#65).

```bash
gh label create "performance" --color "fbbf24" 2>/dev/null || true

gh issue create \
  --title "Tech-debt: split @alphawolf/parse barrel — enqueue (client) vs server (Node-only)" \
  --label "tech-debt,architecture" \
  --body-file - <<'EOF'
**Context:** Vercel build (commit e2b4a6a) warns "Critical dependency: the request of a dependency is an expression" because `apps/web/lib/actions/asset.ts` imports from `@alphawolf/parse` whose barrel re-exports the full Express server. webpack externalizes express but still parses the import graph, producing the noisy warning.

**Scope:**
- Split `@alphawolf/parse` package exports: `@alphawolf/parse` exports `enqueue` + types only; `@alphawolf/parse/server` exports the Express `startWorker`.
- Update `apps/web/lib/actions/asset.ts` to import from `@alphawolf/parse` (no `/server`).
- Update `services/parse/src/index.ts` to import from its own `./server` file.

**Done definition:** Vercel build no longer warns about express critical dependency; bundle size for `apps/web` web routes drops measurably.

Surfaced by: Vercel deploy log on commit e2b4a6a (first successful production deploy).
EOF

gh issue create \
  --title "Edge runtime: rate-limit middleware imports @upstash/redis nodejs.mjs variant instead of edge" \
  --label "tech-debt,observability" \
  --body-file - <<'EOF'
**Context:** Vercel build (commit e2b4a6a) warns `@upstash/redis/nodejs.mjs: process.version not supported in Edge Runtime` because `apps/web/middleware.ts` dynamically imports `@upstash/redis` without specifying the edge entry. The Edge runtime doesn't have `process.version`; the warning indicates webpack picked the Node variant despite middleware running on Edge.

**Scope:**
- In `apps/web/middleware.ts`, change the dynamic import from `import('@upstash/redis')` to the explicit edge entry. Inspect `node_modules/@upstash/redis/package.json` `exports` field for the correct path (v1.38: likely `@upstash/redis` with the package auto-detecting; if auto-detect fails, may need explicit subpath).
- Verify middleware still rate-limits correctly on a deployed preview after the change.

**Done definition:** Vercel build no longer warns about `@upstash/redis` in Edge Runtime; rate limiting still functional.

Surfaced by: Vercel deploy log on commit e2b4a6a.
EOF

gh issue create \
  --title "Observability: add apps/web/app/global-error.tsx for Sentry React render error capture" \
  --label "observability,tech-debt" \
  --body-file - <<'EOF'
**Context:** Sentry warns at build time: "It seems like you don't have a global error handler set up. It is recommended that you add a 'global-error.js' file with Sentry instrumentation so that React rendering errors are reported to Sentry."

Without this, React render errors in client components escape Sentry's capture net.

**Scope:**
- Add `apps/web/app/global-error.tsx` per https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#react-render-errors-in-app-router.
- Should be a minimal client-component error boundary that calls `Sentry.captureException(error)` and renders a fallback UI.
- Verify by throwing in a client component and confirming the error reaches Sentry with the scrubber applied (per ADR-0011 — should strip cookies/headers/PII).

**Done definition:** Sentry build warning gone; manual React render error reaches Sentry with PII scrubbed.

Surfaced by: Vercel build log on commit e2b4a6a.
EOF

gh issue create \
  --title "Tech-debt: align packageManager pnpm version (declared 9.12.3, local + lockfile generated by pnpm 10)" \
  --label "tech-debt" \
  --body-file - <<'EOF'
**Context:** Vercel build (commit e2b4a6a) warns: `Detected pnpm-lock.yaml version 9 generated by pnpm@10.x with package.json#packageManager pnpm@9.12.3`. Vercel respected the declared `packageManager` field (9.12.3), but the lockfile was generated by a newer pnpm. They're compatible today but will drift.

**Scope:**
- Run `pnpm --version` locally; let's call the result `X.Y.Z`.
- Update the root `package.json` `packageManager` field from `pnpm@9.12.3` to `pnpm@X.Y.Z` (exact version, no caret).
- Re-run `pnpm install --frozen-lockfile` to confirm the lockfile is stable.
- Push; Vercel rebuild should no longer emit the warning.

**Done definition:** `packageManager` field matches the pnpm that generated the lockfile; Vercel build no longer warns.

Surfaced by: Vercel deploy log on commit e2b4a6a.
EOF

gh issue list --label tech-debt --state open --limit 20
```
Confirm all four issues are open before continuing.

### 5. Update activities.md
Append a new entry at the top:
```
## YYYY-MM-DD — Archer + Claude (Phase 1 LIVE — post-launch hardening)

- **Context**: After the prisma-postinstall hotfix unblocked Vercel, both Vercel (apps/web) and Render (alphawolf-api/parse/ai) are deployed. This session is post-launch hardening — smoke test against the live URL, Lighthouse baseline, four follow-up issues from Vercel build warnings, demo screenshots.
- **Smoke test**: `pnpm --filter @alphawolf/web exec playwright test deploy-smoke` against `https://alphawolfedecals-app-web.vercel.app` — [PASS / FAIL with details].
- **Lighthouse baseline** (captured to `/docs/deployment/lighthouse-baseline-YYYYMMDD.{json,html}`): LCP <num>s, CLS <num>, INP <num>ms, TBT <num>ms. [Meets / misses ADR-0012 acceptance].
- **Demo screenshots**: 9 PNGs captured to `/docs/deployment/screenshots/` per the demo script.
- **Follow-up issues opened**: #X (express barrel split), #Y (@upstash/redis edge entry), #Z (Sentry global-error.tsx), #W (pnpm version alignment). All non-blocking; Phase 4 candidates.
- **Status**: Phase 1 demo-ready. Next: Phase 2 kickoff (GH-006/007 AI generation) OR Phase 4 launch prep (custom domain + marketing surface) — Archer's call.
```

## Done definition
- `deploy-smoke.spec.ts` passes against the live Vercel URL
- `lighthouse-baseline-YYYYMMDD.{json,html}` committed under `/docs/deployment/`
- 9 demo screenshots committed under `/docs/deployment/screenshots/`
- `apps/web/e2e/demo-screenshots.spec.ts` committed (reusable for future versions)
- 4 new follow-up issues open (the four from Step 4)
- `/activities.md` has the new entry with actual numbers filled in
- Single commit titled `chore: post-launch hardening (smoke test + lighthouse + demo screenshots + 4 follow-up issues)`
- Pushed to main; no CI gate beyond the existing required contexts (this is docs + tests, no app code)

## Hard constraints
- **No app code changes.** Tests, scripts, docs, and screenshots only.
- **No feature work.** The four new issues are tracked, not fixed in this session.
- **Smoke-test failures stop the session.** Real production bugs need human triage, not improvised fixes.
- **Never paste real Vercel/Render/Supabase/Upstash/Sentry tokens or DSNs into commit messages, issue bodies, test fixtures, or screenshots.** If a screenshot would capture a token (e.g., signed URL in an address bar), mask or retake the screenshot from a path that doesn't show it.
- **Demo screenshots use a synthetic test account.** Generate `demo+<timestamp>@example.com`, complete the flow, clean up at the end. Never capture a real user's data.
- **Lock-file pattern**: if any git command reports stale `.lock`, sweep with `find .git -name "*.lock" -print -delete` and retry.

## Commit message
```
chore: post-launch hardening (smoke test + lighthouse + demo screenshots + 4 follow-up issues)

After the e2b4a6a hotfix unblocked Vercel and Render Blueprint
import completed, runs the post-launch hardening pass:

- Playwright deploy-smoke.spec.ts against the live Vercel URL — [PASS]
- Lighthouse baseline captured to docs/deployment/lighthouse-baseline-YYYYMMDD.{json,html}
- 9 demo screenshots captured via apps/web/e2e/demo-screenshots.spec.ts
- 4 follow-up GH issues opened from Vercel build warnings:
  - express barrel split (#X)
  - @upstash/redis edge entry (#Y)
  - Sentry global-error.tsx (#Z)
  - pnpm packageManager version alignment (#W)
- /activities.md updated with Phase 1 LIVE + post-launch summary
```
```
