# Goal 4 — MVP demo screenshot set (2026-06-09)

Captured from **production** (`alphawolfedecals-app-web.vercel.app`) against
pre-seeded verified smoke accounts, via Playwright (`apps/web/scripts/capture-*.ts`).

> **Editor screenshots use the Ford Transit, not the AW catalog templates.** The 3
> curated AW templates (BMW X3 / Bass Boat / Crown Coach) have **no panel geometry**
> (`vehicle_panels` = 0), so the editor has no design surface on them — the #1 launch
> blocker (a data-authoring gap; see the handoff doc). The Ford Transit (6 panels) is
> the panel-bearing template that proves the editor works end-to-end.

| #   | File                         | What it shows                                                                  |
| --- | ---------------------------- | ------------------------------------------------------------------------------ |
| 01  | `01-catalog-gallery.png`     | `/vehicles` — the curated AW template gallery (browse works; catalog renders). |
| 02  | `02-template-detail.png`     | Vehicle detail (Ford Transit) — the design CTA.                                |
| 03  | `03-editor-empty.png`        | Editor loaded on the Transit — all 6 panels render.                            |
| 04  | `04-editor-shape-placed.png` | A shape placed on the Front Fascia panel (placement engine works).             |
| 05  | `05-editor-colored.png`      | The shape recolored to `#EF4444` via the inspector (place **and** color work). |
| 06  | `06-editor-saved.png`        | Manual save (autosave flush).                                                  |
| 07  | `07-submit-dialog.png`       | Submit-for-production dialog (contact details; no payment in MVP).             |
| 08  | `08-order-confirmed.png`     | Order-confirmed page — the order was created.                                  |
| 09  | `09-shop-queue.png`          | Shop dashboard production queue — the routed order is visible (RLS-scoped).    |
| 10  | `10-order-detail.png`        | Shop order detail.                                                             |
| 11  | `11-order-in-production.png` | After **Accept** → status `in_production`.                                     |
| 12  | `12-order-fulfilled.png`     | After **Mark complete** → status `fulfilled`.                                  |

**Not shown / flagged (see handoff launch-blockers):**

- Artwork **upload** is omitted from the editor shots — it produced a Server
  Components error + a failed asset render in testing (a finding to investigate;
  possibly fixture-specific). The upload control is visible in 03/05.
- Email template renders are described in the handoff (the 4 PII-safe templates ship
  in `@alphawolf/notifications`); a live send depends on GH-016 (Resend domain — done).
