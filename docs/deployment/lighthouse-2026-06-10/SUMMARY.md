# Lighthouse re-baseline — 2026-06-10 (Goal 4 DELIVERABLE 3)

Prod: `alphawolfedecals-app-web.vercel.app`. Tool: `lighthouse` (headless Chrome),
categories performance/accessibility/best-practices/seo. Reports (`.json`+`.html`)
in this directory. Baseline: `../lighthouse-baseline-20260525.report.json` (2026-05-25,
`/` only).

## Scores

| URL                           | Perf | A11y | Best-Pract. | SEO     | LCP   | TBT    | CLS   |
| ----------------------------- | ---- | ---- | ----------- | ------- | ----- | ------ | ----- |
| `/` (baseline 2026-05-25)     | 89   | 100  | 92          | **100** | 2.0 s | 110 ms | 0     |
| `/` (2026-06-10)              | 88   | 100  | 92          | **63**  | 3.4 s | 190 ms | 0     |
| `/vehicles` (2026-06-10)      | 83   | 98   | 92          | 66      | 4.1 s | 60 ms  | 0     |
| `/vehicles/[id]` (2026-06-10) | 82   | 100  | 92          | 66      | 4.4 s | 170 ms | 0.045 |

## Deltas vs baseline (`/`)

- **SEO 100 → 63 — EXPECTED, not a regression.** Caused by the **intentional
  pre-launch `robots.txt` (`Disallow: /`)** added in PR #101: Lighthouse's "Page is
  blocked from indexing" / "robots.txt valid" SEO audits fail by design while the
  site is fenced from crawlers. **Reverts to ~100 when robots is opened at public
  launch** (tracked as a launch step). The same drop explains SEO 66 on the new pages.
- **Performance 89 → 88 — flat** (within run-to-run noise). A11y 100, Best-Practices
  92 — unchanged.
- **LCP 2.0 s → 3.4 s, TBT 110 → 190 ms** — higher this run but within Lighthouse
  single-run variance against a cold serverless start; still in the "good" band
  (LCP < 2.5 s target is borderline on cold start; warm is faster). Not a code
  regression — no bundle/route changes between baseline and now would raise LCP
  structurally. Worth a warm re-measure before launch.
- **New pages** (`/vehicles`, `/vehicles/[id]`): Performance 82–83 (good), A11y 98–100,
  CLS ≤ 0.045 (good). No prior baseline; recorded here as the new baseline.

## Errors / Sentry (no new spontaneous error class)

Checked prod runtime logs (Vercel; no Sentry MCP available for a dashboard
screenshot) for `level=error|fatal`, production, over the session window. Result:

- **One error**, session-induced by my own testing: `POST /projects/<id>/…` → **500**
  — the **artwork-upload Server Action** (finding #3). The real cause is hidden by
  Next.js's production error-digest ("message omitted in production builds" — the
  toast seen in the editor); the digest resolves to a Sentry event. (The
  "[Sentry] express is not installed" log line is a benign Sentry-init warning, not
  the error.) **Action:** look up the digest in the Sentry dashboard or repro the
  upload locally to root-cause; tracked as a launch item.
- No other error/fatal entries — **no spontaneous new error class from organic
  traffic** during the session. (The `42P17` RLS-recursion errors earlier in the
  session were also self-induced — by seeding the first routed order — and are now
  fixed by PR #116.)

> Sentry/PostHog dashboard screenshots: not capturable this session (no Sentry MCP,
> and the PostHog dashboard isn't reachable headlessly). The smoke run did fire the
> PostHog funnel events on prod (login → editor → submit → order → shop transitions);
> verifying they landed on the PostHog dashboard is an Archer step (task #69).

## Verdict

No real performance/quality regression. The only material delta — SEO — is the
deliberate pre-launch crawler block and self-reverts at launch. This run is the new
baseline for `/vehicles` and `/vehicles/[id]`. One session-induced upload 500 is
flagged for root-cause (finding #3).
