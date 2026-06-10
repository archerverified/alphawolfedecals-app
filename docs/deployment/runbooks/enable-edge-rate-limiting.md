# Runbook — Activate edge rate-limiting on production

**Owner:** Archer (Vercel console). **Why:** the per-IP edge rate limiter on the
auth routes (`/signup`, `/signin`, `/verify`) is implemented in
`apps/web/middleware.ts` but **silently no-ops in production** because its Upstash
credentials are not set — it "gracefully disables when credentials absent." The
2026-06-09 Goal 4 security audit confirmed this live (12 rapid `GET /signin` →
all `200`, no `429`). See `docs/deployment/audits/2026-06-09-goal-4/security-audit.md`
finding #12/#13.

> **Severity context:** Med, not High. Credential brute-force is **already**
> guarded by the DB-backed lockout in `@alphawolf/auth` (`login.ts`: 5 failed
> logins/IP/15 min + 10/account) and OTP guessing is bounded by per-code attempt
> caps + a 5/hour resend cap. This runbook adds the missing **edge-level request
> throttle** (a coarse DoS/flood guard in front of those finer controls). It is
> defense-in-depth, env-only, and **cannot break the security model**.

## What the code expects

`getRatelimiter()` in `apps/web/middleware.ts` reads exactly two env vars and
builds an `@upstash/ratelimit` sliding window of **10 requests / IP / minute**:

| Env var                    | Where                                                            | Value                                                             |
| -------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `UPSTASH_REDIS_REST_URL`   | Vercel → Project → Settings → Environment Variables (Production) | the REST URL from the Upstash console (`https://<db>.upstash.io`) |
| `UPSTASH_REDIS_REST_TOKEN` | same (mark **Sensitive**)                                        | the REST token from the Upstash console                           |

If both are present the limiter activates; if either is empty it stays disabled
(no error, no throttle).

## Steps

1. **Create an Upstash Redis DB** (if none): https://console.upstash.com → Create
   Database → Regional, closest to `sfo1` (e.g. `us-west-1`) → copy the **REST URL**
   and **REST Token**.
2. **Set both env vars on Vercel** for the **Production** environment (and Preview
   if you want previews throttled). Use the dashboard or:
   ```bash
   vercel env add UPSTASH_REDIS_REST_URL production
   vercel env add UPSTASH_REDIS_REST_TOKEN production   # paste the token; mark Sensitive
   ```
3. **Redeploy production** so the running functions pick up the new env
   (env changes do not apply to existing deployments):
   ```bash
   vercel --prod
   # or: Vercel dashboard → Deployments → latest → Redeploy
   ```
4. **Verify it's live** — 11+ rapid requests from one IP should start returning `429`:
   ```bash
   for i in $(seq 1 12); do \
     curl -s -o /dev/null -w "%{http_code} " \
     https://alphawolfedecals-app-web.vercel.app/signin; done; echo
   # Expect: 200 ×10 then 429 (Retry-After: 60)
   ```
   (Wait 60 s between test runs — the window is 1 minute.)

## Rollback

Remove the two env vars and redeploy; the middleware reverts to the
graceful-disabled state. No code change required.
