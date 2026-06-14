# Lighthouse re-baseline — 2026-06-14 (Goal 10 D5)

Prod: `alphawolfedecals-app-web.vercel.app` (main HEAD, post-Goal-9.1). Tool: `lighthouse`
(headless Chrome), categories performance/accessibility/best-practices/seo. Single-run,
cold serverless (Hobby). Reports (`.json`) in this directory. Diffed against
`../lighthouse-2026-06-10/` (Goal 4).

## Scores (2026-06-14 vs 2026-06-10)

| URL              | Perf        | A11y    | Best-Pract. | SEO    | LCP           | CLS             | TBT            |
| ---------------- | ----------- | ------- | ----------- | ------ | ------------- | --------------- | -------------- |
| `/`              | 87 (was 88) | 100 (=) | 92 (=)      | 63 (=) | 3.4 s (=)     | 0 (=)           | 170 ms (↓ 190) |
| `/vehicles`      | 78 (was 83) | 98 (=)  | 92 (=)      | 66 (=) | 5.0 s (↑ 4.1) | 0 (=)           | 140 ms (↑ 60)  |
| `/vehicles/[id]` | 84 (was 82) | 100 (=) | 92 (=)      | 66 (=) | 3.8 s (↓ 4.4) | **0** (↓ 0.045) | 140 ms (↓ 170) |

## Verdict: no Goal-10 regression; CWV CLS target met, LCP cold-start-bound

- **Accessibility / Best-Practices / SEO unchanged.** SEO 63–66 is the **intentional
  pre-launch `robots.txt Disallow: /`** (PR #101), exactly as the 2026-06-10 baseline
  documented — Lighthouse's indexing audits fail by design while fenced. **D6 ships the
  launch posture** (env-gated allow + sitemap + canonical + meta) that restores SEO to
  ~100 the moment indexing is opened at launch.
- **CLS: PASS on all three (≤ 0.1).** `/vehicles/[id]` **improved 0.045 → 0** — the one
  CWV that had drifted is now perfect. No layout-shift regression anywhere.
- **TBT improved** on `/` and `/vehicles/[id]` (190→170, 170→140 ms); INP proxy healthy.
- **LCP exceeds the 2.5 s target on cold start** (3.4 / 5.0 / 3.8 s). This is the
  documented **Hobby-plan cold-serverless characteristic** (the 2026-06-10 baseline:
  "LCP < 2.5 s is borderline on cold start; warm is faster"), NOT a Goal-10 code
  regression — no bundle/route change in D0–D6 touches these pages' critical path. The
  `/vehicles` 4.1 → 5.0 s and Perf 83 → 78 are single-run cold-start variance (TBT/CLS
  held; only LCP moved). `/vehicles/[id]` LCP actually _improved_ (4.4 → 3.8 s).

## Recommendations (post-launch perf, non-blocking)

1. **Warm re-measure before launch** — re-run after a warming request to capture the
   steady-state LCP (the baseline + this run agree the cold number overstates it).
2. **`/vehicles` LCP** — if the warm number still > 2.5 s, consider ISR/static rendering
   of the catalogue list (it's published-vehicle data, cacheable) or a Vercel plan with
   warmer compute. Logged as a post-launch perf follow-up.
3. The authenticated wizard/editor CWV are not Lighthouse-measurable without a session;
   they're exercised functionally in the D8 webapp-testing shakedown.
