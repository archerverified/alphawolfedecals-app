# Goal 2a — catalogue seed: browse → detail → editor

Sequence of the customer flow the 3-PR Goal-2a stack lights up: the curated
`/vehicles` grid, the wrapped-SVG detail render, and the hand-off into the
editor. The wrapped SVGs live in the **public** `vehicle-templates` Supabase
Storage bucket; the DB row carries the bucket-relative `svg_storage_key`.

```mermaid
sequenceDiagram
    actor C as Customer
    participant W as Next.js (Vercel sfo1)
    participant DB as Postgres (vehicles)
    participant S as Supabase Storage<br/>(vehicle-templates, public)
    participant PH as PostHog

    Note over C,PH: Browse
    C->>W: GET /vehicles
    W->>DB: listAlphaWolfTemplates()<br/>(published, alpha_wolf_tpl_id NOT NULL)
    DB-->>W: 3 AW-TPL rows (+ thumb URLs)
    W-->>C: grid of 3 cards<br/>(make·model, view-count, scale 1:20)
    C->>S: <img> thumb.png (per card)
    C->>PH: vehicle_card_viewed ×3

    Note over C,PH: Detail
    C->>W: GET /vehicles/[id]
    W->>DB: getPublishedDetail(id)
    DB-->>W: row + svg_storage_key
    W->>W: templatePublicUrl(svg_storage_key)
    W-->>C: detail page + <img src=wrapped.svg><br/>(AW frame already baked — no re-wrap)
    C->>S: GET wrapped.svg (public)
    C->>PH: vehicle_detail_opened

    Note over C,PH: Editor hand-off
    C->>W: "Start design" → createProjectAction<br/>(double-submit CSRF, PR #80 bootstrap)
    W->>DB: insert project (vehicle_id)
    W-->>C: 302 → /projects/[id]/editor
    C->>PH: editor_opened_from_vehicle
```

## Data contract

| Layer          | Carrier                                                  | Notes                                                                               |
| -------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Browse list    | `vehicles.listAlphaWolfTemplates()`                      | published rows with `alpha_wolf_tpl_id`, ordered by tpl id                          |
| Wrapped render | `<img src={storage.templatePublicUrl(svg_storage_key)}>` | public bucket; CSP `img-src` already allow-lists `dxwnzxlmggpdjyoxdybh.supabase.co` |
| Editor route   | `/projects/[id]/editor`                                  | existing; reached via `StartProjectButton` (CSRF preserved)                         |
| Events         | `posthog-js` (env-gated)                                 | `vehicle_card_viewed`, `vehicle_detail_opened`, `editor_opened_from_vehicle`        |

Seeds: **AW-TPL-0001** BMW X3 (4-view) · **AW-TPL-0002** Contender 36.5' Bass
Boat (2-view) · **AW-TPL-0003** 1973 Crown Super Coach (3-view), all 1:20.
