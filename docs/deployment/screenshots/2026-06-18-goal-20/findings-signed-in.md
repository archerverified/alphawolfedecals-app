# Goal 20 signed-in journey: findings (observe-only, NO fixes this pass)

Captured 2026-06-18 by Claude Code + Playwright MCP, driving the LIVE prod app
(https://alphawolfedecals-app-web.vercel.app) as a disposable test customer and
test shop. This list seeds the later Archer-approved fix-it goal. Zero app or
code changes were made. Severity scale: High / Medium / Low.

## New findings (this signed-in run)

### F1. PostHog client config + feature flags blocked by CSP (site-wide) — Medium
Every authenticated and public page logs the same console errors. The Content
Security Policy `connect-src` / `script-src` allowlist only includes
`https://us.i.posthog.com`, but the PostHog browser SDK also calls:
- `https://us-assets.i.posthog.com/array/<key>/config.js` (script, blocked by `script-src`)
- `https://us-assets.i.posthog.com/array/<key>/config` (blocked by `connect-src`)
- `https://us.posthog.com/flags/?...` (blocked by `connect-src`)
Result: PostHog remote config and feature flags fail to load in the browser on
every page. Pageview/autocapture to `us.i.posthog.com` may still work, but any
flag-gated behavior or remote config is silently degraded. This is a
green-build / broken-runtime class issue (the exact thing console+network watching
is meant to catch). Suggested fix: add `https://us-assets.i.posthog.com` to both
`script-src` and `connect-src`, and `https://us.posthog.com` to `connect-src`
(or route the SDK through a same-origin reverse proxy).

### F2. Vercel Web Analytics script 404 (site-wide) — Low
`GET /_vercel/insights/script.js` returns 404 with `Content-Type: text/html`, so
the browser refuses to execute it (MIME mismatch) on every page. Vercel Web
Analytics is effectively not loading. Suggested fix: enable Vercel Web Analytics
on the project, or remove the injected `<script>` if analytics is PostHog-only.

### F3. Post-verification accounts are not auto-signed-in — Medium (UX)
After the OTP verify step the account is created and `active`, but no session is
established. The post-verify customer path (Welcome "You're verified" to "Choose
your vehicle" to vehicle detail to "Start design") then bounces to `/signin` the
moment the first auth-gated action (project creation) runs, which reads as a
dead-end and loses the just-expressed intent. Same on the shop side: the shop
account reached `/welcome/shop` ("Your shop is live") yet its `last_login_at`
stayed null. New users must manually sign in after verifying. Suggested fix:
establish the session as part of a successful verification.

### F4. Brand logo trips the print-DPI quality gate — Low
The canonical Alpha Wolf logo from the design system (`assets/logo.png`,
2399 px wide) computes about 32 DPI across the largest panel; the gate warns that
150+ is needed for a sharp print and suggests a larger file or a vector. The gate
works correctly, but the AW-provided brand asset is itself flagged. Suggested fix:
ship a higher-resolution or vector (SVG) brand logo for customer use.

### F5. Shop order channel is email-only and currently suppressed — Medium
The signed-in shop side is a "Your shop is live, printer/media setup coming next"
welcome with no in-app order dashboard yet (consistent with the deferred print
paneling engine). The only shop order channel is email. In the Resend log, the
shop order email to `wraps@1stimpression.co` shows status **suppressed** and a
customer order email shows **delivery_delayed**. If `wraps@1stimpression.co` is on
the suppression list, new orders may never reach the shop. Suggested fix: clear the
suppression on `wraps@1stimpression.co` and add an in-app shop order view before
relying on email as the production handoff.

### F6. Driver-side export render shows faint ghosting — Low
On the spec-pack PDF (page 2, "Your design — every view"), the Driver-side render
has a faint duplicated lower edge / overlap. Cosmetic only; the hero and other
three views are clean.

## Folded-in Cowork public-surface findings (carried forward)

### F7. Support address domain mismatch — Medium
Public Support is a `mailto:support@alphawolfdecals.com`, a different domain than
the Resend sending domain. Confirmed this run: all transactional mail (verification
codes, order notifications) sends FROM `wraps@1stimpression.co`. Confirm the
`support@alphawolfdecals.com` inbox actually exists and is monitored, or replies
from customers will go unseen.

### F8. Signup password-strength meter color on a cyan/black brand — Low
The strength meter renders red for weak passwords, which clashes with the
cyan/black brand. (A strong password showed "Excellent" this run; the concern is
the red weak-state on-brand.) Suggested fix: re-tone the weak state to brand colors.

### F9. Auth routes rate-limit hard (429) under bursts — Low (known)
`/signin`, `/signup`, and `/find-a-shop` return 429 under rapid navigation
(seen in the Cowork public run). Pacing a few seconds apart avoids it. Expected
protective behavior; noted so automated runs pace themselves.

## Observations (not defects)

- Pre-existing extra prod account `daa067fc` (customer, created 2026-06-14, logged
  in 2026-06-18 04:36) was found during audit. It is NOT one of this run's test
  accounts and was left untouched. Flagging for Archer: prod now has 4 base users
  (was 3 at the Goal 16 baseline); this 4th account may be a manual test to review.
- `rate_limits` rows keyed by IP/route were created by the run's navigation; they
  are ephemeral and self-expire (not purged, not user-scoped).
- Pre-existing Supabase advisory (RLS disabled on `rate_limits` and
  `_prisma_migrations`) is a known Goal 10 carryover and was NOT re-flagged or
  changed here.

## What worked well (positive signal)

- The full pipeline ran clean on real fal: 3 on-brand concept directions
  ("Cyan on Black", "Full Strike", "Shadow Line"), 12/12 renders, one iteration
  ("Brighter colors"), one free un-watermarked final. NO app 5xx in console or
  network during the entire generation (only the PostHog/Vercel issues above and
  benign Sentry envelope beacon aborts).
- The export-pack PDF is faithful to the brief: right vehicle (2024 BMW X3), the
  real logo composited (Front Door, never AI-redrawn), AI hero on page 1, all four
  views on page 2, colors with roles + film SKU, zone note, style prompt, material,
  tint (TX-legal), and extras all carried through, with full provenance metadata
  (fal model, run id, prompt v5, provenance URL) and a QR back to the project.
- Total real fal spend for the full pipeline: $0.7417 (initial $0.5154 +
  iteration $0.1063 + final $0.1200).
