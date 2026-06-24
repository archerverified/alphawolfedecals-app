# Goal 22 - Print-ready paneling engine + shop print profile

How an approved design becomes a never-short, curvature-corrected, tiled Print Pack for a shop's
printer. Pure engine modules (TDD) sit under `apps/web/lib/print/`; the data model is additive on the
vehicle catalogue plus one per-shop table.

```mermaid
flowchart TD
  subgraph data["Data model (additive, RLS)"]
    vp["vehicle_panels<br/>+ curvature_factor / source / margin (D4)<br/>admin write, public read"]
    pri["curvature_class_priors<br/>seeded conservative priors (312 rows)<br/>signed-in read, admin write"]
    spp["shop_print_profiles (D1)<br/>printer, effective width, overlap, bleed<br/>RLS app_is_shop_member read+write"]
  end

  subgraph profile["Shop print profile (D1)"]
    form["/dashboard/print-profile<br/>PrintProfileForm"]
    pin["validatePrintProfileInput<br/>zod + deriveEffectiveWidthIn + never-short guard"]
    act["saveShopPrintProfileAction<br/>requireShopUser + RLS upsert"]
    form --> pin --> act --> spp
  end

  subgraph engine["Pure engine (apps/web/lib/print, TDD)"]
    printers["printers.ts<br/>Roland VG3 54in -> 52.5in effective"]
    curv["curvature.ts (D4)<br/>true = flat*k, safe = true*(1+margin)<br/>measured -> sibling -> prior -> unknown"]
    panel["paneling.ts (D2)<br/>tile to effective width, overlap+bleed<br/>NEVER SHORT, no tile over media"]
    plan["print-pack.ts<br/>buildPrintPlan: flat -> true -> safe -> tiled"]
    curv --> plan
    panel --> plan
  end

  subgraph deliver["Print Pack (D3)"]
    loader["load-print-plan.ts<br/>membership -> profile -> project -> curvature"]
    pdf["print-pack-pdf.ts<br/>layout sheet + per-panel tile schematics"]
    route["GET /projects/[id]/print-pack<br/>streams application/pdf (no storage write)"]
    page["/projects/[id]/print<br/>plan table + confidence + download"]
    loader --> plan
    plan --> pdf --> route
    loader --> page
  end

  flat["panelPrintSizesIn (existing, flat 2D)"]
  spp --> loader
  vp --> curv
  pri --> curv
  flat --> plan
  loader --> flat

  classDef warn fill:#fff7ed,stroke:#b45309,color:#7c2d12;
  class curv,panel warn;
```

## Never-short chain (why nothing prints short)

1. `panelPrintSizesIn` gives the flat template size (an undercount of a curved body).
2. `curvature.ts` multiplies by a per-(body, panel-class) factor `k` (biased up), then adds a one-sided
   safety margin keyed on confidence (measured 0.02 -> calibrated 0.05 -> prior 0.08 -> unknown 0.10).
   `k` is clamped >= 1 (never shrink); `unknown` falls back to a conservative worst-case `k` + a loud
   "measure before printing" warning.
3. `paneling.ts` tiles each panel to the EFFECTIVE width (never nominal), with overlap + bleed, so the
   union of tiles net of overlaps covers at least the safe extent and no tile exceeds the media.
4. DB CHECK constraints (effective <= nominal, overlap < effective, factor > 0, margin in [0,1)) are the
   belt-and-braces backstop, proven against a real Postgres.

## What is gated / future

- Per-tile high-DPI raster crops of the actual art at print resolution (the current Print Pack carries
  exact dimensions + the layout + an optional reference preview; per-tile art crops are the next increment).
- Cross-panel nesting optimisation for linear feet (current estimate is a conservative per-panel sum).
- Live shop measurement loop to promote class priors to `measured_in_shop` (data path is built; the bulk
  measurement-entry UI is future).
- Deploy + prod migration + prod-smoke are gated on Archer's go (not run by this build).
