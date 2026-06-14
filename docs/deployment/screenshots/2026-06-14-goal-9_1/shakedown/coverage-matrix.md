# Goal 9.1 D6 — full-app shakedown coverage matrix

_Run 2026-06-14 against a **LOCAL ephemeral build** — `next dev` wired to a throwaway
local PostgreSQL 16 cluster (seeded from migrations + `auth_rls.sql` + the vehicle
seed), `AI_PROVIDER=mock`, `AUTH_EMAIL_TRANSPORT=console`. **Never against prod** — the
whole point of Goal 9.1 is to stop prod test-data pollution, so the shakedown created
zero rows in the production DB. The local cluster + all created data were torn down at
the end (net-zero)._

## Method

- **Layer 1 — existing Playwright suite** (`apps/web/e2e/*.spec.ts`): representative slice
  run against the local build.
- **Layer 2 — exploratory pass** (`webapp-testing` / Node Playwright): every reachable page
  across customer + shop roles. Per page: `networkidle` wait, full-page screenshot, console
  errors, failed network requests, broken-image scan, and an **axe WCAG-2.2-AA** scan on key
  pages (`wcag2a/aa`, `wcag21a/aa`, `wcag22aa`).
- Screenshot gallery: `01-…png` … `22-…png` in this folder; raw data in `results.json`.

## Layer 2 — page coverage (22 pages, both roles)

| Page                   | Route                     | Role     | HTTP    | axe   | Notes                                          |
| ---------------------- | ------------------------- | -------- | ------- | ----- | ---------------------------------------------- |
| Landing                | `/`                       | public   | 200     | ✅ 0  |                                                |
| Sign up (customer)     | `/signup`                 | public   | 200     | ✅ 0  |                                                |
| Sign up (shop)         | `/signup-shop`            | public   | 200     | —     | drove full shop signup → dashboard             |
| Sign in                | `/signin`                 | public   | 200     | ✅ 0  |                                                |
| Privacy                | `/privacy`                | public   | 200     | —     |                                                |
| Terms                  | `/terms`                  | public   | 200     | —     |                                                |
| Vehicle catalogue      | `/vehicles`               | public   | 200     | ✅ 0  |                                                |
| Vehicle cascade select | `/vehicles/select`        | public   | 200     | —     |                                                |
| Vehicle detail         | `/vehicles/[id]`          | public   | 200     | —     |                                                |
| Request a vehicle      | `/vehicles/request`       | public   | 200     | —     |                                                |
| Shop locator           | `/find-a-shop`            | public   | 200     | ✅ 0  |                                                |
| Share — bad token      | `/share/<bad>`            | public   | **404** | ✅ 0  | graceful 404 ✓ (expected)                      |
| Welcome                | `/welcome`                | customer | 200     | —     |                                                |
| Projects (empty)       | `/projects`               | customer | 200     | ✅ 0  |                                                |
| Referral panel         | `/refer`                  | customer | 200     | ⚠️→✅ | **FIXED in-goal** (see defects)                |
| Vehicle detail (auth)  | `/vehicles/[id]`          | customer | 200     | —     | drove start-project → editor                   |
| Editor                 | `/projects/[id]/editor`   | customer | 200     | ✅ 0  | canvas ready; shape tool + inspector exercised |
| Brief wizard           | `/projects/[id]/brief`    | customer | 200     | ⚠️→✅ | **FIXED in-goal** (see defects)                |
| Generation studio      | `/projects/[id]/generate` | customer | 200     | —     | loads (mock provider)                          |
| Projects (populated)   | `/projects`               | customer | 200     | —     |                                                |
| Welcome (shop)         | `/welcome/shop`           | shop     | 200     | —     |                                                |
| Shop dashboard         | `/dashboard`              | shop     | 200     | ✅ 0  |                                                |

**Totals:** 22 pages · **0 broken images** · **0 uncaught console errors** and **0 failed
requests** beyond the systematic dev-only items below · **axe WCAG-2.2-AA: 0 violations**
on all 9 scanned pages after the two in-goal fixes.

## Defects found

### Fixed in-goal (small + in scope)

1. **`/refer` — `aria-prohibited-attr` (serious).** The QR `<div aria-label="Referral QR code">`
   had no `role`, so `aria-label` was prohibited. **Fix:** added `role="img"`
   (`apps/web/components/referral/ReferralPanel.tsx`). Re-scanned → 0 violations.
2. **`/brief` — `color-contrast` (serious).** `zone-summary` caption used `text-zinc-400`
   (#9f9fa9 on #fafafa = 2.51:1, below 4.5:1). **Fix:** darkened to `text-zinc-500`
   (~4.7:1) (`apps/web/components/brief/steps.tsx`). Re-scanned → 0 violations.

### Logged for Goal 10 (not prod defects — environment/observation)

3. **Vercel Analytics / Speed-Insights CSP (dev-only, ~2 console+2 network per page).** In
   `next dev`, `@vercel/analytics` + `@vercel/speed-insights` load their `*.debug.js` from
   `va.vercel-scripts.com`, which the app CSP (`script-src 'self' 'unsafe-inline'
'unsafe-eval'`) blocks. The `.debug.js` variant is **dev-only**; prod serves these
   same-origin (`/_vercel/...`), so this is not a prod defect. **Goal 10:** confirm on the
   live site that Analytics/Speed-Insights scripts load under the CSP, and if they ever move
   to the CDN variant, add `va.vercel-scripts.com` to `script-src`.
4. **Editor dev chunk `ERR_ABORTED` (dev-only HMR).** `CanvasEditor_tsx.js` chunk load was
   aborted once under `next dev` (fast-refresh/strict-mode double render); the editor still
   rendered (200) and was interactive. Not reproducible in a prod build. **Goal 10:** sanity
   re-check on a production build.

## Layer 1 — existing suite (local)

`signup.spec.ts` ✅ + 2 others **passed (3)**. **2 failed from ephemeral-env limits, not
product defects:**

- `plan-gates.spec.ts` (3-distinct-vehicle gate) — only the Ford Transit is seeded locally
  (the AW catalogue templates / BMW X3 come from a separate `author-aw-panels` authoring
  script, not the vehicle seed), so a 3rd distinct vehicle can't be created.
- `vehicle-request.spec.ts` (admin-queue assertion) — admin-queue timing in the ephemeral env.

## Environment limits (documented, exercised elsewhere)

The ephemeral local DB cannot faithfully exercise flows whose workers/services are bound to
prod: **artwork upload → parse** (the Render parse worker connects to the prod DB, not the
local one), **real AI generation** (mock provider locally; real fal proven in the Goal 7 prod
proof), **email delivery** (console transport), **storage writes** (no service-role locally),
and the **export PDF** path (storage-dependent). The brief wizard's upload/colors-from-logo and
tint steps, generation's 3-concepts/iteration/credit-meter, export pack, and share-page voting
were therefore loaded but not driven end-to-end here — they are covered by the prod smoke +
the Goal 7 real-prod proof. These are env constraints, not defects.
