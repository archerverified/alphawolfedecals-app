---
type: diagram
date: 2026-06-08
diagram_kind: sequence
related_step: 'Goal 3c — Email notifications + production smoke test'
tags:
  - diagram
  - goal-3c
  - notifications
  - email
  - smoke-test
---

# Goal 3c — Email dispatch per state transition + smoke path

Sequence diagram of the transactional order-email layer and the canonical MVP
smoke. Email send is **best-effort and never blocks a status transition**: on a
Resend failure the dispatch captures to Sentry + PostHog (`email_delivery_failed`)
and enqueues a BullMQ retry that the `apps/api` worker drains. `order_submitted`
and `order_received` fire **now** (submit time); `order_in_production` and
`order_fulfilled` fire from the **Goal 3b seam** (`dispatchOrderStatusEmail`) once
the shop dashboard lands.

```mermaid
sequenceDiagram
    actor C as Customer
    participant Web as apps/web (Server Action)
    participant DB as Postgres (RLS)
    participant N as @alphawolf/notifications
    participant R as Resend (@alphawolf/auth)
    participant PH as PostHog
    participant Q as BullMQ (email queue)
    participant Wk as apps/api worker
    actor S as Shop user

    Note over C,PH: Submit for production (Goal 3a action + Goal 3c dispatch)
    C->>Web: submitForProductionAction(project, contact)
    Web->>DB: orders.submitForProduction → order (status=submitted)
    Web->>N: dispatchOrderSubmittedEmails(order)
    N->>R: order_submitted → customer
    N->>R: order_received → ops inbox
    alt send ok
        N->>PH: email_sent (per template)
    else send fails
        N->>PH: email_delivery_failed
        N->>Q: enqueue retry job
        Q->>Wk: drain → re-send via Resend
    end
    Web-->>C: /order-confirmed (#order)

    Note over S,PH: Shop status transitions (Goal 3b seam — dispatchOrderStatusEmail)
    S->>Web: accept → status in_production
    Web->>N: dispatchOrderStatusEmail(order, 'in_production')
    N->>R: order_in_production → customer ("accepted")
    N->>PH: email_sent
    S->>Web: mark complete → status fulfilled
    Web->>N: dispatchOrderStatusEmail(order, 'fulfilled')
    N->>R: order_fulfilled → customer ("ready for pickup")
    N->>PH: email_sent

    Note over C,S: MVP smoke (apps/web/e2e/mvp-flow.spec.ts)
    C->>Web: signin → vehicle → editor → upload → color → save → reload → submit
    Web-->>C: order-confirmed (asserts order created → emails dispatched)
    S->>Web: (SMOKE_INCLUDE_SHOP) dashboard → accept → complete
```

## Template ↔ OrderStatus mapping

| Template (kind)       | Recipient | Fires on                     | Status          |
| --------------------- | --------- | ---------------------------- | --------------- |
| `order_submitted`     | customer  | order creation               | `submitted`     |
| `order_received`      | ops inbox | order creation               | `submitted`     |
| `order_in_production` | customer  | accept (Goal 3b seam)        | `in_production` |
| `order_fulfilled`     | customer  | mark complete (Goal 3b seam) | `fulfilled`     |

The `OrderStatus` enum (`submitted, in_production, fulfilled, cancelled`) is the
source of truth; the spec's prose names ("accepted"/"completed") map to
`in_production`/`fulfilled`.
