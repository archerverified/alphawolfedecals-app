# Goal 22 - Print-ready paneling engine + shop print profile (build plan + DECISIONS)

Branch: `goal/22-print-engine` (worktree `../alphawolf-goal-22`, base `origin/main` 4930944).
Prompt: `prompts/24-goal-22-print-ready-paneling-engine.md`. Spike consumed:
`docs/product/2026-06-22-spike-curvature-correction.md` (decision GO conditional).
Build model: CLAUDE.md §4 (scoped subagents + §3 gate). Not merged without Archer's go.

## Audit-first result (what already exists, do not rebuild)

- `apps/web/lib/brief/quality.ts` → `panelPrintSizesIn(panels, dims)` is the pure 2D projection
  (flat undercount). Single curvature hook point. Consumed at `spec-pack.ts:391`.
- Export: `apps/web/lib/export/spec-pack.ts` → `buildSpecPack(): Uint8Array` (pdf-lib), route
  `app/projects/[id]/export/route.ts`. Storage = Supabase (`project-assets` private, signed URLs,
  app-layer ownership; no storage RLS because custom-auth GUC).
- DB split: `withUser`/`withSystem` (`packages/db/src/client.ts`); RLS in `prisma/sql/auth_rls.sql`
  applied via `db:apply-sql`; migrations in `prisma/migrations/`. Helpers `app_is_shop_member()`,
  `app_is_admin()` exist. `vehicle_panels` RLS = public-read of published-vehicle panels + admin writes.
- Tenancy: `User` / `Shop` / `Membership(shop_admin|shop_designer)`. B2B = shop is the tenant.
- Deps available: pdf-lib, sharp, zod, qrcode-generator. NO zip lib (avoid adding one - ADR-0013).

## Architecture (layers, innermost first)

- **A. Curvature (D4)** - additive data model + pure correction. `vehicle_panels` gains
  `curvature_factor/source/margin/measured_at/notes`; new reference table `curvature_class_priors`;
  new enum `curvature_source`. Pure `apps/web/lib/print/curvature.ts` resolves k+margin and computes
  `true = flat·k`, `safe = true·(1+margin)`. Never short; one-sided margin; confidence + warning.
- **B. Paneling/tiling (D2)** - pure `apps/web/lib/print/paneling.ts`. Tiles each wrap panel to the
  effective media width with overlap + bleed; never short; per-tile dims, linear feet, layout model.
- **C. Shop print profile (D1)** - per-shop table `shop_print_profiles` (RLS `app_is_shop_member`),
  printer registry (`apps/web/lib/print/printers.ts`, Roland VG3), repo, server action, settings UI.
- **D. Print-ready export (D3)** - `apps/web/lib/print/layout-sheet.ts` + `print-pack.ts` build a
  Print Pack PDF (pdf-lib): layout sheet page + one page per print tile at true physical size with
  overlap/bleed/cut marks and art placed when bytes exist. Route + project print page.
- **E. Integration** - spec-pack size table shows corrected "true" dims + confidence (spike §5).
- **F. Verify (D5)** - panel a real approved design to Roland VG3 (52.5" eff, 0.5" overlap), prove
  the math + that the export opens at print resolution; §3 + advisor; net-zero except purged tests.

## DECISIONS (prompt DECISION POLICY: choose recommended, log, never ask)

- **D-1 Print profile scope = per-shop** (`Shop.id`), one row per shop, read/write by any shop member
  (`app_is_shop_member`). Matches B2B tenancy. Solo/customer users with no shop: the UI prompts to set
  up a shop; the engine refuses to build a pack without a profile (never guesses media width).
- **D-2 Curvature data = admin-curated global catalog data**, not per-tenant. Lives on `vehicle_panels`
  (admin write, public read) + a global `curvature_class_priors` (public read, admin write, like the
  vehicle catalog). The "shop" that measures is the Alpha Wolf studio operator (admin). Per-tenant
  curvature overrides are a future enhancement. Keeps RLS simple and correct.
- **D-3 Never-short reconciliation for `unknown` confidence.** Spike says unknown → "do not auto-size,
  warn." Hard constraint says "never emit short." Reconcile: when no measured factor and no matching
  class prior, apply a CONSERVATIVE fallback (k = max known prior ≈ 1.27, margin = 0.10) so output is
  never short, AND tag `source='unknown'`, `estimated=true`, `needsMeasurement=true` with a prominent
  warning. The UI labels it "estimate - measure before printing"; it never claims accuracy.
- **D-4 Margins (one-sided, never short):** measured 0.02, calibrated_sibling 0.05, class_prior 0.08,
  unknown 0.10. Stored per-panel (`curvature_margin`) and per-prior; engine uses the resolved value.
- **D-5 Output = single Print Pack PDF + structured manifest** (no zip dep). Layout sheet is always
  vector. Per-tile pages embed high-DPI raster art (AI finals are raster today) at the correct physical
  size; vector art plugs into the same seam later. Per-file RIP packaging (zip of per-panel PDFs/PNGs)
  is the logged next increment.
- **D-6 Seam policy = body-break by construction + even interior splits.** Each wrap "panel" is a body
  part, so panel-to-panel seams already fall on body breaks; we never tile across a body break. Interior
  seams (panels wider than the media) are even splits; overlap is shop-configurable (default 0.5", larger
  allowed on tight curves). Drag-to-place seams = future.
- **D-7 Effective width derivation.** Roland VG3 nominal 54", effective = nominal - 1.5" roller margin
  = 52.5" by default; shop may override effective directly. Engine ALWAYS tiles to effective, never nominal.
- **D-8 Tiling orientation** picks the orientation (which physical axis runs across the media) that
  minimises tile count, tie-break minimum media area. The non-tiled axis runs along the unlimited roll feed.
- **D-9 DPI gate untouched.** The B2C logo DPI gate keeps using flat sizes (its own scope). Curvature
  surfaces in the print engine + spec-pack size table only. Avoids changing a shipped B2C surface.
- **D-10 Linear feet = simple per-panel sum** (n_tiles · feed_length), conservative (no cross-panel
  nesting optimisation). Cross-panel nest packing = future.

## Build order (TDD; commit per unit; §3 + advisor before any merge)

1. Pure: `printers.ts` (+test) → `curvature.ts` (+test) → `paneling.ts` (+test). Safety-critical, owner-led.
2. DB: schema (curvature cols, `curvature_class_priors`, `shop_print_profiles`, `curvature_source` enum)
   - migration SQL (+ idempotent prior seed) + `auth_rls.sql` policies + repos (`print-profiles`,
     `curvature`) + barrel. Advisor on RLS.
3. PDF: `layout-sheet.ts` + `print-pack.ts` (+tests).
4. Surfaces: shop-print-profile action + settings page; print-pack route + project print page.
5. Integration: spec-pack size table → corrected dims + confidence.
6. Verify: full vitest + typecheck + build; real-design panel-through proof; §3 fresh-context review +
   advisor (export/RLS/spend); activities entry + mermaid + graphify-refresh note. Hold for go.

## Hard rules (carried from prompt/CLAUDE.md)

Never emit a short or mis-paneled layout. Effective width not nominal. RLS on every new table. No
em-dashes. Net-zero except purged test data. §3 + advisor on export/RLS/spend. No merge without go.
