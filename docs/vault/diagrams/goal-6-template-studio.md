# Goal 6 — Template Studio (authoring pipeline → AW panels → functional editor)

The machine that turns owned source material into published, panel-rich
templates — and its first real output: panel sets for the 3 AW catalogue
templates, which unblocked the editor + B2C zone selector on them
(Goal 4 launch blocker #1).

```mermaid
flowchart TB
  subgraph SOURCES["Owned sources only (ADR-0014 inv 12)"]
    PHOTO["Shop photos\n(orthographic set)"]
    OEM["OEM body-builder PDF"]
    ART["Alpha Wolf owned SVG art\n(the 3 wrapped sheets)"]
  end

  subgraph STUDIO["Template Studio (/admin/studio — requireAdmin + CSRF)"]
    INGEST["Ingest\nsigned-URL direct upload →\ntemplate-sources bucket (PRIVATE)\n+ template_sources provenance row\n+ 3 reference measurements"]
    DRAW["Panel authoring\ndraw/refine polygons over backdrop\nname · finish · install order"]
    CAL["Calibration\nview span ↔ real dimension\n→ mm-per-unit"]
    SAVE["Save\nbuildOutlineSvg → validateOutlineSvg\n(declared views) → 12mm wrap-safe insets\n→ CALIBRATED printable_area_mm2\n→ setVehiclePanels (identity-preserving)"]
    PUB["Publish\npublishVehicle + 1/20 layout sheet\n(SVG+PNG) + PostHog events"]
  end

  subgraph DATA["vehicle data"]
    VP[("vehicle_panels\n(view, svg_path, wrap_safe_zone,\nprintable_area_mm2 — real mm²)")]
    TS[("template_sources\n(provenance audit)")]
    ST[["vehicle-templates bucket\noutline.svg · layout-sheet.svg/png"]]
  end

  subgraph CONSUMERS["panel consumers (unchanged — data-driven)"]
    ED["Wrap editor\nplace/color/text per panel"]
    ZS["B2C wizard zone selector\ninclude/exclude zones"]
    XP["Export pack\nper-zone areas"]
  end

  subgraph QUEUE["demand loop (D4)"]
    REQ["Customer: Request this vehicle\n(CTA on /vehicles/select)"]
    WL["Studio worklist\npending → in_progress → shipped"]
    MAIL["shipRequestAndNotify\n(shared step: queue + publish)\n→ Resend email + PostHog\nvehicle_request_fulfilled"]
  end

  PHOTO --> INGEST
  OEM --> INGEST
  ART --> INGEST
  INGEST --> TS
  INGEST --> DRAW --> CAL --> SAVE --> PUB
  SAVE --> VP
  SAVE --> ST
  PUB --> ST
  VP --> ED
  VP --> ZS
  VP --> XP
  REQ --> WL --> DRAW
  PUB -- "fulfills request" --> MAIL
  WL -- "manual ship" --> MAIL
```

## D2 — the first authored output (published to prod 2026-06-11)

| Template                        | Views                        | Panels | Side area (calibrated) |
| ------------------------------- | ---------------------------- | ------ | ---------------------- |
| AW-TPL-0001 BMW X3              | front/driver/back/passenger  | 15     | 3.0 m²                 |
| AW-TPL-0002 Contender Bass Boat | driver(port)/passenger(stbd) | 6      | 8.8 m²                 |
| AW-TPL-0003 Crown Super Coach   | driver/passenger/back        | 12     | 26.6 m²                |

QC overlays (panels composited 1:1 over the wrapped art):
`docs/deployment/screenshots/2026-06-11-goal-6/` — awaiting Archer's visual
approval (publish-then-adjust).

## Review loop that shipped it

PR #135 (foundations) went through three adversarial review rounds — the
second round caught a regression the first round's fix introduced (reflex
bevel under-clearance); the final geometry contract is ENFORCED in code
(dense boundary-clearance sampling — reject, don't repair). PRs #136/#137
caught a Render deploy-killer (canvas had no node-loadable dist), the
Server-Action 1MB body cap making the ingest unusable, and a silent
submit-button/value bug that had broken "Retire"/"Mark in review" since
GH-004.
