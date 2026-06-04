---
type: diagram
date: 2026-06-04
diagram_kind: sequence
related_step: 'Goal 3a — Design canvas MVP'
tags:
  - diagram
  - goal-3a
  - canvas
  - customer-journey
---

# Goal 3a — Customer journey (signup → submit)

Sequence diagram of the full canvas journey: a customer signs up, opens the
editor, places + styles artwork, autosaves, and submits for production (which
creates a `db.order` row — no payment). The four PostHog funnel events
(`editor_opened`, `asset_placed`, `design_saved`, `submit_clicked`) are shown at
the points they fire.

```mermaid
sequenceDiagram
    actor C as Customer
    participant Web as apps/web (Next.js)
    participant Auth as Auth.js (OTP)
    participant Canvas as @alphawolf/canvas
    participant DB as Postgres (RLS)
    participant PH as PostHog

    C->>Web: Sign up / sign in
    Web->>Auth: verify OTP code
    Auth->>DB: create session (app.current_user_id)

    C->>Web: Select vehicle → create project
    Web->>DB: createProject + working version v1

    C->>Web: Open /projects/[id]/editor
    Web->>DB: getProject · getWorkingVersion · vehicle panels
    Web-->>C: Editor mounts (Konva, ssr:false)
    Web->>PH: editor_opened

    C->>Web: Upload artwork → place on panel
    Web->>DB: createAsset + signed direct upload
    Web->>PH: asset_placed

    C->>Web: Add text / shapes · recolor fill+stroke (PR3)
    Note over Web,Canvas: every edit is an undoable Command
    Web->>Canvas: serialize + validate document
    Web->>DB: saveWorkingCanvas (debounced · optimistic rev) [PR4]
    Web->>PH: design_saved

    C->>Web: Submit for production + delivery details (PR5)
    Web->>PH: submit_clicked
    Web->>DB: submitForProduction (txn)
    Note over DB: freeze working→submitted ·\nclone fresh working ·\nproject→active · INSERT order
    DB-->>Web: orderId
    Web-->>C: redirect /projects/[id]/order-confirmed
```

## Notes

- The route is `/projects/[id]/editor` (the original spec's `/editor/[projectId]`
  was superseded — confirmed against the existing route from PR #38).
- PR1 (route shell + canvas mount) and PR2 (upload + place) were already on `main`
  via PR #38; Goal 3a delivered PR3 (color), PR4 (save UX + analytics), and PR5
  (submit → order) on top.
- The order pins the **frozen** `project_versions` row; the customer keeps editing
  a freshly-cloned working version afterward (ADR-0006 §4).
