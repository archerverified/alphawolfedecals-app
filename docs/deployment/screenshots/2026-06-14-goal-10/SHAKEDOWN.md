# Launch-Readiness Shakedown — Goal 10 D8 — 2026-06-14

`webapp-testing` (JS Playwright + chromium) against a **LOCAL ephemeral build** —
`next dev` on a throwaway local Postgres (schema + RLS + `app_user`), **mock AI,
console OTP, dummy Supabase env**. NEVER prod; net-zero (local DB dropped + local
env removed at teardown — see §Teardown). Gallery: the PNGs in this directory.

## Net-zero constraint (why the full design→export flow is not re-run here)

The authenticated **design → generate → editor → export** flow needs (a) the AW
vehicle catalogue, whose seed requires **license-restricted SVG inputs**
(`AW_SEED_SOURCE_DIR`, deliberately outside the repo — not available to the agent),
and (b) **Supabase Storage** (asset upload, generation images, export pack), which
is the production storage — exercising it would not be net-zero. That flow is
covered by **Goal 7's documented real prod-proof run**
(`docs/deployment/screenshots/2026-06-12-goal-7/` — full journey, $0.70 spend, export
PDF) and the **15 Playwright e2e specs** (`apps/web/e2e/*`). D8 here verifies
everything that IS net-zero-testable, with emphasis on the Goal-10 surfaces.

## Coverage matrix

| Page / surface            | Render | axe WCAG-2.2-AA | Notes                                                                                                       |
| ------------------------- | ------ | --------------- | ----------------------------------------------------------------------------------------------------------- |
| `/` landing               | ✅ 200 | ✅ 0            | + Goal-10 footer                                                                                            |
| `/vehicles`               | ✅ 200 | ✅ 0            | empty-state (no catalogue seed locally)                                                                     |
| `/signin`                 | ✅ 200 | ✅ 0            |                                                                                                             |
| `/signup` (customer)      | ✅ 200 | ✅ 0            | signup creates account + issues OTP (dev-otp verified)                                                      |
| `/signup-shop` (shop)     | ✅ 200 | ✅ 0            | shop-role entry                                                                                             |
| `/find-a-shop` (locator)  | ✅ 200 | ✅ 0            | static directory + maps fallback (0 opted-in shops)                                                         |
| `/terms`                  | ✅ 200 | ✅ 0            | `[[PLACEHOLDER]]` marker renders (D4)                                                                       |
| `/privacy`                | ✅ 200 | ✅ 0            | placeholder marker renders (D4)                                                                             |
| 404 (unknown route)       | ✅ 404 | n/a             | **Goal-10 `not-found.tsx`** renders a real body                                                             |
| Footer legal links        | ✅     | —               | `footer a[href=/terms]` + `/privacy` **navigate** (Playwright `waitForURL` confirmed) — D4 reachability fix |
| `/robots.txt`             | ✅ 200 | —               | `Disallow: /` (env-gate fence; flips via `APP_ALLOW_INDEXING`) — D6                                         |
| `/sitemap.xml`            | ✅ 200 | —               | valid XML (`/`, `/vehicles`); +vehicle pages when catalogue seeded — D6                                     |
| Auth: customer signup→OTP | ✅     | —               | account + OTP issued via console/dev-otp; full verified-session pages gated (see net-zero)                  |

Roles exercised: **customer** (signup) + **shop** (signup-shop entry). Both render clean.

## Findings

- **No defects.** Every page returns its expected status, **axe = 0 violations** on all 8 scanned pages (the 2 Goal-9.1 axe fixes held; no new violations), the custom 404 + error boundaries are in place, and the footer legal links navigate.
- **Benign (dev-only):** 2 console errors per page — `va.vercel-scripts.com/.../script.debug.js` blocked by CSP. This is the `.debug.js` variant `@vercel/analytics` loads **only in `next dev`**; prod serves the minified same-origin script and the live CSP allows it (confirmed in the D2 security audit). Same item the Goal-9.1 shakedown flagged. Not a launch issue.
- **Goal-10 deliverables verified live:** error-boundary `not-found.tsx` (real 404 body), footer + legal-page reachability (D4), legal placeholder marker (D4), robots env-gate + sitemap (D6), CWV-relevant pages render with no layout shift (D5 CLS 0).

## Final customer flow (the journey, end-to-end)

1. **Land** on `/` → clear CTAs ("I'm a customer" / "I run a wrap shop") + a footer with Terms/Privacy/Support. _(verified)_
2. **Browse** `/vehicles` → pick an accurate wrap-safe template. _(verified render; catalogue depth is a launch blocker — only the Transit is paneled)_
3. **Sign up** → OTP to email (console in dev) → verified account, 5 signup credits. _(account + OTP issuance verified locally; full verify-session via e2e/Goal-7 proof)_
4. **Guided brief** → style, colors, logo upload, tint step (with the legal disclaimer). _(brief UI; upload + later steps storage-gated → Goal-7 proof)_
5. **Generate** → 3 AI concept directions on the customer's actual vehicle views (1 credit; $5/day global cap). _(Goal-7 prod proof: real run, 3 concepts ~90s)_
6. **Iterate** → chip/free-text tweak → **lock a free export-quality final**. _(Goal-7 proof)_
7. **Editor** → the locked design with the real logo composited in. _(Goal-7 proof)_
8. **Export** → print-ready spec-pack PDF (fal provenance) to hand to a wrap shop. _(Goal-7 proof: 4-page PDF, 409 KB)_
9. **Share / refer / locate** → share a concept for voting, refer a friend (give-2/get-2, now disposable/ring-guarded — D3), or find a shop via the locator. _(share + locator render verified; referral proven live in Goal 9.1)_

## Teardown (net-zero)

`next dev` stopped; local DB `aw_shakedown` dropped; `apps/web/.env.local` + the
local driver removed. The live prod DB was never touched by D8 (3 users, unchanged).
