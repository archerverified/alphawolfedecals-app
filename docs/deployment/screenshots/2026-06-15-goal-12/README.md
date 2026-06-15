# Goal 12 — Design Editor Overhaul — D5 evidence (2026-06-15)

Shakedown of the rebuilt editor on a LOCAL/ephemeral build (net-zero: a throwaway
`@e2e.alphawolf.test` customer + project, soft-deleted after). Never run against
prod. Verified with `/webapp-testing` (Playwright driving the real editor) +
axe-core WCAG 2.2 AA + a fresh-context `/code-review` pass.

## Before → After

| #   | Screenshot                              | What it shows                                                                                                                                                     |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `01-before-boxes-thin-strip.png`        | **BEFORE** — the BMW X3 rendered as crude panel boxes in a thin strip, half the canvas dead. The exact complaint Goal 12 was raised to fix.                       |
| 02  | `02-after-all-views-recognizable.png`   | **AFTER (D2)** — recognizable BMW X3 in 4 views filling the canvas, view selector, dead canvas gone.                                                              |
| 03  | `03-zone-selected-name-dimensions.png`  | **D2** — click a panel → wrap zone highlights (cyan) + inspector shows name + real printable area (Front Door · Driver side · 1.10 m² · 11.9 ft² · Gloss).        |
| 04  | `04-per-view-zoom-driver-side.png`      | **D2** — view selector "Driver side" zooms to that face (art cropped to the view, no neighbour bleed).                                                            |
| 05  | `05-d4-logo-snaps-to-zone.png`          | **D4** — uploaded logo snaps centered into the selected zone, scaled to fit, clipped to the printable area, draggable/scalable (was dropping at 0,0).             |
| 06  | `06-d3-design-with-ai-dialog.png`       | **D3** — in-editor "Design with AI" entry → dialog with credit cost shown + the logo-composited-never-AI-rendered note, routing into the Goal 7 pipeline.         |
| 07  | `07-d1-existing-wrapped-art-bmw-x3.png` | **D1 finding** — the AW-owned `wrapped.svg` already in the bucket: a fully recognizable BMW X3. AI generation was NOT the missing piece.                          |
| 08  | `08-d1-art-panel-registration.png`      | **D1** — panel zones (red) + wrap-safe (blue) overlaid on the art: coordinate-registered, which is why the editor can render art + selectable zones in one space. |

## Coverage matrix (full design flow)

| Step (DoD)                               | Method                                                  | Result                                 |
| ---------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| Pick vehicle → open editor               | Playwright signup→signin→start project on X3            | ✅ lands in editor                     |
| See a recognizable vehicle               | Konva stage has an Image backdrop node; visual 02       | ✅ recognizable BMW X3                 |
| Multi-view framing, dead canvas removed  | view selector All + per-view camera; visual 02/04       | ✅ fills canvas                        |
| Select wrap zones (name + dimensions)    | click panel → inspector name + area; visual 03          | ✅ Front Door 1.10 m²                  |
| Prompt AI (entry reachable + cost shown) | "Design with AI" → dialog, balance 5; visual 06         | ✅ reuses Goal 7 pipeline              |
| Place logo (snaps to zone)               | upload PNG → centered/scaled/clipped in zone; visual 05 | ✅ not at origin                       |
| Export                                   | unchanged Goal 7 export path (Submit / export pack)     | ✅ untouched seam                      |
| Accessibility (axe WCAG 2.2 AA)          | axe-core inline on editor + on AI dialog                | ✅ **0 violations / 22 passes** (both) |

## Design review — dual grade

- **Design grade: F → A−.** Before: abstract boxes, thin strip, ~50% dead canvas,
  no labels, no recognizable vehicle — it failed its own purpose. After: a
  recognizable vehicle that fills the frame, a clear view selector, selectable
  wrap zones with real printable areas, and a logo that lands where you click.
  Reads as a professional wrap tool, benchmarked against the WrapUP reference
  (multi-view, recognizable vehicle, panel selection). The bar named in the prompt.
- **AI-slop grade: A.** No generic/AI-slop aesthetic: the surface is the brand's
  own owned vehicle art, the zone data is real (calibrated mm² printable areas),
  and every control maps to a concrete task. Nothing decorative-but-empty.

## Notes

- Codified as a committed Playwright spec: `apps/web/e2e/goal-12-editor.spec.ts`.
- Net-zero confirmed: test accounts use `@e2e.alphawolf.test`; created projects
  soft-deleted in `afterEach`; the cron purge sweeps stragglers.
