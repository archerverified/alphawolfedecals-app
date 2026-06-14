# Goal 9 — Growth loops + polish (diagram)

Shipped 2026-06-13. Share-for-feedback voting, referral give-2/get-2, shop locator
handoff, polish pass, + 3 hygiene riders. PRs #158, #159, #160, #161, #163, #164.

## The growth loops on the export funnel

```mermaid
flowchart TD
    subgraph customer["Customer journey (Goal 7)"]
        BRIEF[Brief wizard] --> GEN[Generate 3 AI concepts]
        GEN --> STUDIO[Generation studio]
        STUDIO --> FINAL[Final + export pack PDF]
    end

    %% Loop 1 — share for feedback (D1)
    STUDIO -->|"Share for feedback"| SHARE["/share/&lt;token&gt; (public)"]
    SHARE -->|"👍 vote a concept"| VOTES[(concept_votes<br/>sealed: RLS no-policy,<br/>system-only)]
    SHARE -->|"crew sees it, signs up"| SIGNUP[Sign up]
    SHARE -. "share_page_viewed<br/>concept_voted" .-> PH[(PostHog)]

    %% Loop 2 — referral give-2/get-2 (D2)
    REFER["/refer (link + QR)"] -->|"?ref=&lt;code&gt;"| SIGNUP
    STUDIO -.-> REFER
    EXPORT_QR["export-pack QR<br/>(existing)"] -.-> SHARE
    SIGNUP -->|"verify email"| GRANT{{grantReferralIfAttributed<br/>ONE withSystem tx, idempotent}}
    GRANT -->|"+2 referee / +2 referrer<br/>(once, sanctioned grant)"| LEDGER[(credit_ledger<br/>source=referral<br/>partial-unique idempotency)]
    GRANT --> ATTR[(referral_attributions<br/>once-per-referee anchor)]
    GRANT -. "referral_link_created<br/>referral_signup_attributed<br/>referral_credits_granted" .-> PH

    %% Loop 3 — shop locator handoff (D3)
    FINAL -->|"No shop? Find one near you"| LOC["/find-a-shop"]
    LOC -->|"opted-in platform shops first"| SHOPS[(shops.public_listing<br/>+ public_city, PII-safe)]
    LOC -->|"then directory, then maps"| MAPS[Google Maps fallback]
    LOC -. "locator_opened<br/>shop_handoff_clicked" .-> PH

    %% Anti-abuse on the credit-minting path
    GRANT --- ABUSE[/no self-referral by id OR normalized email,<br/>verified+active gate, per-referrer cap+advisory lock/]
```

## Hygiene riders

```mermaid
flowchart LR
    R5["Rider 5 — admin guard"] --> G1[make-admin route → @e2e only]
    R5 --> G2[setUserAdminByEmail → non-test needs operatorOverride]
    R5 --> G3[createUser → reject reserved test domains in prod]
    R5 --> G4[db:retire-test-accounts<br/>dry-run default, domain-allowlist safe]
    R6["Rider 6 — PostHog filter"] --> IS[is_test person property<br/>@ activation → filter person.is_test=true]
    R7["Rider 7 — PRD §10 truth-up"] --> NB[shipped default = nano-banana edit<br/>overturns flux-depth paper pick]
```

## Security posture (the point of D1/D2/rider-5)

- **concept_votes** — sealed ballot box: RLS enabled+forced, 0 policies, app_user grants revoked. System connection only.
- **Share read** — withSystem, token-gated, whitelisted columns only (vehicle label + concept key/title/summary + watermarked previewPath + vote tally). No PII, ever. Verified live on prod (no owner/email/name in the rendered page).
- **Referral** — credits minted only via the sanctioned append-only ledger (system-written, partial-unique idempotent); referral_attributions system-written, referrer-read-only (referee can't see who referred them).
- **Admin elevation** — only real staff (CLI override) or synthetic test identities (retired) can ever hold is_admin.

All three security-gated PRs (D1, D2, rider 5) carry an independent §3 second security review (APPROVE WITH NITS, all addressed).
