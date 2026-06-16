# Goal 13 — axe WCAG 2.2 AA results

Tool: axe-core 4.10.2 injected into the live local build (real catalogue, real auth). Rule tags: `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`. Scanned the key reachable pages (public + authed).

| Page                | URL                     | Violations |
| ------------------- | ----------------------- | ---------- |
| Landing             | `/`                     | **0**      |
| Sign in             | `/signin`               | **0**      |
| Sign up             | `/signup`               | **0**      |
| Catalogue           | `/vehicles/select`      | **0**      |
| Vehicle detail (X3) | `/vehicles/{X3}`        | **0**      |
| Welcome             | `/welcome`              | **0**      |
| Editor              | `/projects/{id}/editor` | **0**      |
| Brief wizard        | `/projects/{id}/brief`  | **0**      |

**Result: axe-clean across all 8 key pages (0 WCAG 2.2 AA violations).** Consistent with the Goal 9.1 D6 shakedown a11y fixes (QR role, brief contrast). The editor is a Konva canvas — axe validates the surrounding DOM chrome (toolbar, inspector, controls), not the canvas pixels; manual review (design-review.md) covers the visual layer.

Raw JSON: captured to `/tmp/aw13-axe.json` during the run (not committed). Injection was CSP-proof via `page.evaluate` (the brief page blocks external `addScriptTag` under its `script-src` CSP — a non-issue once axe is evaluated in-context).
