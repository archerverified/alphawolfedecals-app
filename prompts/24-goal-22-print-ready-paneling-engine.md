# Goal 22 - Print-ready paneling engine + shop print profile (B2B core)

Drafted 2026-06-18 by Cowork orchestration via /prompt-engineer + /superpowers, standardized goal-prompt format. This is the core of the B2B pivot (see `docs/product/2026-06-18-pivot-decision-b2b.md`): turn an approved wrap design into a print-ready, panel-accurate, vectorized file tailored to a shop's printer. Real code touching export, storage, RLS, and spend, so it runs in Claude Code with the §3 review plus an advisor second opinion. Depends on the curvature spike (`prompts/25-spike-curvature-correction.md`) for true dimensions.

## 0. SKILL CHECK FIRST
Invoke `/superpowers`. Process skills before implementation. Read current SKILL.md for any skill used. Audit-first (CLAUDE.md §1); query the graphify graph for the export/generation subsystem before touching it (§8).

## ROLE
You are Claude in Claude Code implementing the print-ready paneling engine. Given an approved wrap design, the vehicle's true panel dimensions, and a shop's print profile, you output panels tiled to the shop's effective media width with the correct overlaps and bleed, plus a print-ready/vectorized export the shop can drop in and print. You never output a file that would print short. You verify against the live app, never assume.

## CONTEXT (audit-first)
- **B2B pivot (2026-06-18).** The product is sold to wrap shops and freelance designers; the print-ready file is what they pay for. The existing design flow (vehicle select, brief, AI generation, editor, spec pack) is the design-intake front end and is reusable. Audit it live before building.
- **Validated foundation.** The template-based spec pack (BMW X3 report, Goal 7/20) already emits per-view geometry and dimensions. Extend it; do not rebuild. PRD sections on paneling/RIP (previously deferred) are the reference spec.
- **Owner constraints (from the call):**
  - Printer: Roland VG3, 54-inch nominal, but ~52 to 53-inch effective (rollers consume 1 to 2 inches). Always panel to the EFFECTIVE width.
  - Overlap: default 0.5 inch between vinyl panels, configurable per shop; allow more on tight curves (vinyl stretch).
  - A full wrap cannot print in one piece; it must be tiled into panels with bleed and seams placed at body breaks where possible.
  - Short prints are catastrophic (reprint, money out the door). Accuracy is non-negotiable.

## ACTIVATE (skills + agents + connectors)
- `senior-backend` (paneling/tiling geometry, export pipeline), `senior-frontend` (shop print-profile UI + panel-layout preview), `supabase-postgres-best-practices` (per-account RLS for shop profiles + generated print files), `pdf-expert` (print-ready PDF/layout output and validation), `code-reviewer` + an independent advisor (export, RLS, spend surface), Playwright MCP + `webapp-testing` (verify end to end).
- Connectors: Supabase (profiles + file storage, RLS), Sentry, Vercel.

## DECISION POLICY
Never ask; choose the recommended option, log it as a DECISION in `activities.md`, surface notable calls. Failing test/review/deploy = fix or hold-with-plan. Hard stops: never emit a panel layout that prints short; RLS on all new tables/buckets; secret handling; no PII key rotation; no force-push.

## TASK - deliverables
- **D1 Shop print profile.** A per-account configurable profile: printer model + nominal media width, effective printable width (auto-derive from known printers like the Roland VG3, or manual override), default panel overlap (0.5 inch, editable, with per-curve override), media/plan type. Stored per account with RLS.
- **D2 Paneling/tiling engine.** Input: approved design + the vehicle's true (curvature-corrected) panel dimensions + the shop profile. Output: each wrap panel tiled into print panels that fit the effective media width, with the configured overlap and bleed, seams aligned to body breaks where feasible. Emit per-panel dimensions, total linear feet, and a panel-layout sheet.
- **D3 Print-ready export.** Produce the print-ready file(s) per panel (vector where the design allows, else high-DPI raster at print resolution), plus the layout sheet, packaged for the shop. Mirror the "AI design -> vectorized -> print-ready" workflow shops pay designers for today.
- **D4 Consume corrected dimensions.** Use the curvature-corrected true dimensions from the spike, not flat 2D template numbers, so nothing prints short. If the spike is not yet landed, gate on a clearly-labeled estimate and warn.
- **D5 Verify.** Panel a real approved design to the Roland VG3 profile (52 to 53-inch effective, 0.5-inch overlap); confirm the panel math (widths, overlaps, linear feet) is correct and nothing is short; the export opens and is print-resolution. §3 + advisor; Sentry 0-new; net-zero except purged test data.

## CONSTRAINTS
- Never emit a short or mis-paneled layout. Effective width, not nominal. No em-dashes anywhere. New tables/buckets get RLS. §3 + advisor on the export/RLS/spend surface. Net-zero except purged test data.

## OUTPUT / DEFINITION OF DONE
1. A shop can configure its print profile (printer, effective width, overlap, plan).
2. The engine panels an approved design to that profile with correct overlaps, bleed, and curvature-corrected dimensions.
3. A print-ready/vectorized export plus layout sheet is produced and validated (pdf-expert).
4. Verified against the Roland VG3 example with correct panel math, nothing short.
5. Reviewed (§3 + advisor), deployed, prod-smoke + Sentry 0-new, activities entry + diagram, graphify refreshed.

## OPEN QUESTIONS (choose and log)
- Vector vs raster output per design type (AI raster renders vs true vector art).
- Seam-placement policy (auto at body breaks vs shop-adjustable).
- Whether the print profile is per-shop, per-printer, or per-user.
- Dependency timing on the curvature spike.
