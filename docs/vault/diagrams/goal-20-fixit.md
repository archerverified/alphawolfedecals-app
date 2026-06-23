# Goal 20 fix-it: launch-blocker repairs (B2B re-triage)

Branch `goal/20-fixit` off `origin/main` 758eca8. Built 2026-06-22, reviewed x2
(section 3 + advisor), held for Archer's merge + 3 owner actions.

## D1: session-on-verify (fixes F3 + NODE-G)

Before: verify marked the account active but established no session, so the first
auth-gated action bounced the new user to /signin (and shop last_login_at stayed
null). After: the server signs the user in at verify via a short-lived HMAC
ticket that never reaches the browser.

```mermaid
sequenceDiagram
    participant U as New shop / customer
    participant V as verifyOtpAction (server)
    participant A as @alphawolf/auth
    participant NA as next-auth (otp-verified provider)
    participant DB as Postgres (withSystem)

    U->>V: submit OTP code
    V->>A: verifySignupOtp(email, code)
    A->>DB: consume OTP, markUserActive, stampLastLoginAt
    A-->>V: ok { userId, accountType }
    V->>V: issueVerificationTicket(userId, email)<br/>HMAC(AUTH_SECRET), 2-min TTL, never sent to browser
    V->>NA: signIn('otp-verified', { email, ticket, redirectTo })
    NA->>A: authorizeVerifiedSession(email, ticket)
    A->>A: verify HMAC + TTL (before any DB call)
    A->>DB: findUserById -> must be active, email matches
    A-->>NA: session user { id, email, accountType }
    NA-->>U: Set-Cookie JWT session + redirect /welcome[/shop]
    Note over U: signed in, no /signin bounce
```

## D3: the "Bucket not found" root cause (intermittent prod parse outage)

~60% of prod parses failed with `Bucket not found` though the bucket + objects
exist where uploads land. The upload is always signed by Vercel into project
dxwnzxlmggpdjyoxdybh; the Render parse worker reads from a DIFFERENT (wrong)
project, so its download 404s the bucket. Code change = make it loud; the env
correction is the owner step.

```mermaid
flowchart TD
    B[Browser PUT artwork] -->|signed by Vercel| P1[(Supabase project dxwn...<br/>project-assets bucket EXISTS)]
    P1 --> Q{enqueue parse}
    Q -->|BullMQ| W[Render alphawolf-parse worker]
    W -->|downloadAssetObject<br/>SUPABASE_URL points at WRONG project| P2[(Other Supabase project<br/>NO project-assets bucket)]
    P2 -->|Bucket not found| F[parse_status = failed<br/>Parse complete toast never shows<br/>e2e smoke RED]

    subgraph fix [Goal 20 D3]
      H[boot self-check: checkAssetsBucketReachable<br/>loud log + Sentry + /health storage status]
      O[OWNER: fix Render SUPABASE_URL/KEY<br/>to dxwn... then redeploy]
    end
    W -.surfaced by.-> H
    P2 -.corrected by.-> O
    O ==> P1
```

## D2 / D4 / D5 (one-line each)

- D2: `transitionOrderAction` now fires `dispatchOrderStatusEmail` on
  accept/complete; `/welcome/shop` links to the existing RLS-scoped `/dashboard`
  order view (orders are no longer email-only).
- D4: CSP allows `us-assets.i.posthog.com` (script + connect) and
  `us.posthog.com` (connect) so PostHog remote config + flags load. No locked
  invariant weakened.
- D5: Support repointed to the verified `support@1stimpression.co` domain.
