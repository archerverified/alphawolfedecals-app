# Goal 4 — MVP verification + investor handoff

The end-to-end MVP flow as verified on production this session, with the two HIGH
findings overlaid (one fixed, one flagged).

```mermaid
flowchart TD
  subgraph customer["Customer (withUser → app_user, RLS enforced)"]
    A[Sign in<br/>argon2id + JWT cookie] --> B[Browse catalogue<br/>/vehicles gallery]
    B --> C[Template detail]
    C --> D[Open editor<br/>start-project → /editor]
    D --> E{Template has<br/>vehicle_panels?}
    E -- "Ford Transit (6 panels)" --> F[Place shape + recolor<br/>tool-shape · color-fill]
    E -- "3 AW templates (0 panels)" --> X[/"No design surface<br/>FINDING #2 — launch blocker"/]
    F --> G[Save autosave]
    G --> H[Submit for production<br/>SubmitDialog]
    H --> I[(orders row created<br/>owner_user_id = customer)]
    I --> J[Order-confirmed page]
  end

  I -. "order_submitted +<br/>order_received email<br/>(best-effort, non-throwing)" .-> MAIL[[Resend]]

  subgraph shop["Wrap shop (withUser → app_user, RLS enforced)"]
    K[Sign in shop_user<br/>requireShopUser] --> L[Production queue<br/>orders_shop_read]
    L --> M[Order detail]
    M --> N[Accept → in_production<br/>orders_shop_update]
    N --> O[Complete → fulfilled]
  end

  I === |"owner_shop_id<br/>(routing unwired in UI;<br/>seeded for the smoke)"| L

  classDef fixed fill:#dcfce7,stroke:#16a34a;
  classDef flag fill:#fee2e2,stroke:#dc2626;
  classDef ok fill:#eff6ff,stroke:#3b82f6;
  class X flag;
  class F,N,O ok;
```

**RLS boundary (the crown jewel).** Every customer/shop query runs on the
non-superuser `app_user` connection with row-level security forced. The shop reads an
order only via `orders_shop_read` (membership-gated); a non-member sees nothing —
verified live from a second identity.

**Finding #1 — FIXED (PR #116).** `orders_shop_read` → `EXISTS(memberships)` →
`memberships_member_select` (which self-referenced `memberships`) → `42P17` infinite
recursion, breaking the whole shop path. Now routed through the `SECURITY DEFINER`
`app_is_shop_member` helper (no RLS re-entry). Membership/tenant predicates must use
this pattern — never an inline `EXISTS(memberships …)` in a memberships policy
(ADR-0014 inv 4).

**Finding #2 — FLAGGED (launch blocker #1).** The `vehicle_panels` decision point
(`E`) is the gap: the 3 AW catalogue templates have none, so the editor is
non-functional on them. The Transit (6 panels) proves the editor works. Remediation:
author panel geometry (in-house/licensed, never PVO) — ADR-0014 inv 12.

See `dist/mvp-handoff/handoff.md` for the full findings + launch-blocker list.
