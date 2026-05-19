# Vehicle Database — Technical Specification

Companion to `prd.md` §4.2, §4.7, GH-003, GH-004, GH-017. This document is the authoritative spec for the proprietary vehicle template library. It is written to be mirrored into the Obsidian vault at `/docs/vault/vehicle-db/` — each `### Entry` becomes its own Obsidian note via the Dataview plugin pattern.

## 1. Why this is a competitive moat

ProVehicleOutlines, EasySIGN, and OEM-supplied templates are the existing options. All three are visualizers — outlines only, no production semantics. Our database carries the outline **plus** wrap-safe zones, body panel breaks, finish suggestions, surface-area math per panel, and a versioned source-of-authority chain. Once we have 50 vehicles built right, our editor and our paneling engine produce results no competitor can match without rebuilding the same data layer from scratch.

The DB is the moat. Treat it accordingly.

## 2. Schema

Sits in Postgres (Supabase). Row-level security: read = public for `published` rows; write = `admin` only.

```sql
CREATE TYPE body_type AS ENUM ('sedan','suv','crossover','pickup','van','box_truck','sprinter','motorcycle','rv','trailer','boat','equipment');
CREATE TYPE template_status AS ENUM ('draft','review','published','retired');
CREATE TYPE source_authority AS ENUM ('manufacturer_spec','measured_in_shop','licensed','community_verified');
CREATE TYPE finish_hint AS ENUM ('gloss','satin','matte','chrome','carbon','brushed','none');

CREATE TABLE vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year            int NOT NULL CHECK (year BETWEEN 1990 AND extract(year from now())::int + 2),
  make            text NOT NULL,
  model           text NOT NULL,
  trim            text,                              -- e.g. "XL", "Lariat", "Limited"
  variant         text,                              -- e.g. "148\" WB High Roof"
  body_type       body_type NOT NULL,

  -- Universal dimensions
  length_mm       int NOT NULL,
  width_mm        int NOT NULL,
  height_mm       int NOT NULL,
  wheelbase_mm   int,

  -- Body-type-specific facets (nullable per type)
  cab_size        text,           -- pickup: regular | extended | crew
  bed_size        text,           -- pickup: short | standard | long
  roof_height     text,           -- van/sprinter: low | mid | high
  door_count      int,            -- sedan/suv

  -- Templating
  outline_svg_url text NOT NULL,  -- 4-view (front/back/driver/passenger) as one SVG
  topview_svg_url text,           -- optional 5th view
  thumb_png_url   text NOT NULL,

  -- Provenance
  source_authority source_authority NOT NULL,
  source_notes    text,           -- citation, manufacturer doc URL, measurement date
  verified_at     timestamptz,
  verified_by     uuid REFERENCES users(id),

  -- Versioning
  version         int NOT NULL DEFAULT 1,
  status          template_status NOT NULL DEFAULT 'draft',
  supersedes_id   uuid REFERENCES vehicles(id),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vehicles_search_idx ON vehicles
  USING gin ((to_tsvector('simple',
    coalesce(make,'') || ' ' || coalesce(model,'') || ' ' ||
    coalesce(trim,'') || ' ' || coalesce(variant,'') || ' ' ||
    year::text)));
CREATE INDEX vehicles_year_make_model_idx ON vehicles (year, make, model);
CREATE UNIQUE INDEX vehicles_published_uk
  ON vehicles (year, make, model, coalesce(trim,''), coalesce(variant,''))
  WHERE status = 'published';

CREATE TABLE vehicle_panels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  name            text NOT NULL,                    -- "Driver Quarter Panel"
  svg_path        text NOT NULL,                    -- SVG `d` attribute, in vehicle outline coords
  view            text NOT NULL,                    -- front | back | driver | passenger | top
  wrap_safe_zone  jsonb NOT NULL,                   -- {clip_path: "...", inset_mm: 12}
  printable_area_mm2 int NOT NULL,                  -- precomputed surface area
  finish_hint     finish_hint NOT NULL DEFAULT 'none',
  install_order   int NOT NULL,                     -- 1..N suggested install sequence
  notes           text,                              -- e.g. "compound curve at A-pillar"
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vehicle_panels_vehicle_idx ON vehicle_panels (vehicle_id);

CREATE TABLE vehicle_template_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    uuid REFERENCES users(id),
  requester_email text,
  year            int NOT NULL,
  make            text NOT NULL,
  model           text NOT NULL,
  trim            text,
  variant         text,
  reference_photo_urls text[],
  notes           text,
  status          text NOT NULL DEFAULT 'pending',  -- pending | in_progress | shipped | rejected
  shipped_vehicle_id uuid REFERENCES vehicles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
```

## 3. SVG outline standard

Every `outline_svg_url` must conform to the following structure. The admin upload validator (GH-004) rejects on any miss.

```xml
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 4800 1200"
     data-vehicle-id="..."
     data-version="1">

  <!-- Group per view. Coordinates in mm × 10 (so 4800 = 480mm = scale display). -->
  <g id="view-front"     data-view="front"     transform="translate(0,0)">     ... </g>
  <g id="view-driver"    data-view="driver"    transform="translate(1200,0)">  ... </g>
  <g id="view-back"      data-view="back"      transform="translate(2400,0)">  ... </g>
  <g id="view-passenger" data-view="passenger" transform="translate(3600,0)">  ... </g>

  <!-- Inside each view, every body panel is its own group with class="panel". -->
  <g class="panel"
     id="driver-quarter-panel"
     data-name="Driver Quarter Panel"
     data-install-order="3"
     data-finish-hint="gloss">
    <path class="outline"   d="..." />     <!-- visible body line  -->
    <path class="wrap-safe" d="..." />     <!-- clip path for wrap -->
  </g>

  <!-- Anti-wrap zones (windows, lights, badges, fuel doors) are marked .no-wrap. -->
  <path class="no-wrap" d="..." />
</svg>
```

### Validator rules (admin upload, hard-rejected on fail)
- Exactly 4 view groups present: `view-front`, `view-driver`, `view-back`, `view-passenger`. `view-top` optional.
- ≥1 `<g class="panel">` inside each view.
- Every panel has both `.outline` and `.wrap-safe` paths.
- No embedded `<image>` elements larger than 500KB base64 payload.
- No external `<use href="...">` references.
- viewBox aspect ratio within ±5% of (length × 4 / height × 2) for the published vehicle dimensions (sanity check that the outline matches stated size).
- All `d` attributes parseable; no malformed paths.
- Run through SVGO with `removeViewBox: false`, `removeMetadata: false`, `cleanupIds: false` before storage.

## 4. Top 50 launch target

The vehicles below cover ~80% of commercial wrap demand in North America based on industry surveys (Sign & Digital Graphics 2024-25, PRINTING United Alliance wrap-specific reports, and ProVehicleOutlines' own public bestseller signals). Build order is intentionally weighted toward commercial vans and full-size trucks because they generate the highest revenue per wrap.

### Tier 1 — Build first (weeks 1-2 of vehicle DB work, 20 vehicles)
| # | Year | Make | Model | Trim/Variant | Body type |
|---|------|------|-------|--------------|-----------|
| 1 | 2024 | Ford | Transit 250 | 148" WB · High Roof | Van |
| 2 | 2024 | Ford | Transit 250 | 148" WB · Mid Roof | Van |
| 3 | 2024 | Ford | Transit 350 | 148" WB EL · High Roof | Van |
| 4 | 2024 | Mercedes-Benz | Sprinter 2500 | 144" WB · High Roof | Sprinter |
| 5 | 2024 | Mercedes-Benz | Sprinter 2500 | 170" WB · High Roof | Sprinter |
| 6 | 2024 | Ram | ProMaster 2500 | 159" WB · High Roof | Van |
| 7 | 2024 | Ram | ProMaster 3500 | 159" WB EXT · High Roof | Van |
| 8 | 2024 | Ford | F-150 | XL · Crew Cab · Standard Bed | Pickup |
| 9 | 2024 | Ford | F-150 | Lariat · Crew Cab · Standard Bed | Pickup |
| 10 | 2024 | Ford | F-250 Super Duty | XL · Crew Cab · Long Bed | Pickup |
| 11 | 2024 | Chevrolet | Silverado 1500 | LT · Crew Cab · Standard Bed | Pickup |
| 12 | 2024 | Chevrolet | Silverado 2500 HD | LT · Crew Cab · Long Bed | Pickup |
| 13 | 2024 | Ram | 1500 | Big Horn · Crew Cab · Standard Bed | Pickup |
| 14 | 2024 | Ram | 2500 | Tradesman · Crew Cab · Long Bed | Pickup |
| 15 | 2024 | GMC | Sierra 1500 | SLE · Crew Cab · Standard Bed | Pickup |
| 16 | 2024 | Toyota | Tundra | SR5 · Crew Cab · Standard Bed | Pickup |
| 17 | 2024 | Chevrolet | Express 2500 | Cargo · 135" WB | Van |
| 18 | 2024 | GMC | Savana 2500 | Cargo · 135" WB | Van |
| 19 | 2024 | Nissan | NV200 | S | Van |
| 20 | 2024 | Ford | E-Transit | 148" WB · High Roof | Van |

### Tier 2 — Build next (weeks 3-5 of vehicle DB work, 20 vehicles)
| # | Year | Make | Model | Trim/Variant | Body type |
|---|------|------|-------|--------------|-----------|
| 21 | 2024 | Ford | Transit Connect | XL · LWB | Van |
| 22 | 2024 | Mercedes-Benz | Metris | Cargo | Van |
| 23 | 2024 | Isuzu | NPR | Box Truck 16' | Box Truck |
| 24 | 2024 | Hino | 268 | Box Truck 24' | Box Truck |
| 25 | 2024 | Freightliner | M2 106 | Box Truck 26' | Box Truck |
| 26 | 2024 | Ford | F-350 Super Duty | XL · Regular Cab · Long Bed | Pickup |
| 27 | 2024 | Ford | F-450 Super Duty | XL · Crew Cab · Long Bed | Pickup |
| 28 | 2024 | Toyota | Tacoma | SR5 · Double Cab · Short Bed | Pickup |
| 29 | 2024 | Chevrolet | Colorado | LT · Crew Cab · Short Bed | Pickup |
| 30 | 2024 | Ford | Ranger | XLT · SuperCrew · Short Bed | Pickup |
| 31 | 2024 | Ford | Explorer | XLT | SUV |
| 32 | 2024 | Chevrolet | Tahoe | LT | SUV |
| 33 | 2024 | Ford | Expedition | XLT | SUV |
| 34 | 2024 | Toyota | 4Runner | SR5 | SUV |
| 35 | 2024 | Jeep | Wrangler | Sport · 4-Door | SUV |
| 36 | 2024 | Honda | Odyssey | EX | Van |
| 37 | 2024 | Chrysler | Pacifica | Touring | Van |
| 38 | 2024 | Tesla | Model Y | Long Range | Crossover |
| 39 | 2024 | Tesla | Model 3 | Long Range | Sedan |
| 40 | 2024 | Toyota | Sienna | LE | Van |

### Tier 3 — Build third (weeks 6-8 of vehicle DB work, 10 vehicles)
| # | Year | Make | Model | Trim/Variant | Body type |
|---|------|------|-------|--------------|-----------|
| 41 | 2024 | Ford | Maverick | XL · SuperCrew | Pickup |
| 42 | 2024 | Hyundai | Santa Cruz | SEL | Pickup |
| 43 | 2024 | Subaru | Outback | Premium | Crossover |
| 44 | 2024 | Toyota | RAV4 | XLE | Crossover |
| 45 | 2024 | Honda | CR-V | EX | Crossover |
| 46 | 2024 | Mazda | CX-5 | Touring | Crossover |
| 47 | 2024 | Ford | Bronco | Big Bend · 4-Door | SUV |
| 48 | 2024 | Chevrolet | Suburban | LT | SUV |
| 49 | 2024 | Ram | ProMaster City | Tradesman | Van |
| 50 | 2024 | Workhorse | W56 | Step Van | Box Truck |

Coverage check: 22 pickups + 13 vans + 9 SUVs/crossovers + 4 sedans/EVs + 2 sedans + step van. Mix matches Alpha Wolf's expected demand profile.

## 5. Sourcing strategy

Three sources, in priority order. Every published template carries `source_authority` so we can audit later.

### 5.1 Manufacturer specifications (`source_authority = 'manufacturer_spec'`)
- Dimensions pulled from manufacturer technical specification PDFs or press kits. URL stored in `source_notes`.
- Examples: Ford fleet brochures, Mercedes Sprinter Body & Equipment Guide, Ram ProMaster Body Builder Guide.
- Highest trust; first choice when available.
- Outline SVG generated by tracing a manufacturer 4-view technical drawing (NOT a marketing photo). All tracings done in-house with a documented tracer, NOT scraped from copyrighted competitor SVGs.

### 5.2 Measured in-shop (`source_authority = 'measured_in_shop'`)
- Vehicle physically measured at Alpha Wolf or partner shop. Tape measurements + photos + verifier name in `source_notes`.
- Used when manufacturer specs are missing, ambiguous, or differ from real-world (common on facelifts and option packages).
- Highest fidelity for trim-specific variants (e.g., a Lariat package adding rocker cladding that changes wrap-safe geometry).

### 5.3 Licensed (`source_authority = 'licensed'`)
- Last resort. If a body-builder template provider (e.g., a licensed reseller of OEM body data) offers commercial-use SVG outlines, license them with explicit rights for use in our derived templates.
- Do NOT use unlicensed competitor outlines. Strict prohibition. The DB's defensibility depends on a clean chain of title.

### 5.4 Community verified (`source_authority = 'community_verified'`)
- Reserved for v2. Shop users submit corrections to a published template; corrections flow through admin review before publishing as a new version. Out of scope for v1.

## 6. Build workflow (per vehicle)

Each vehicle goes through the following stages. Track in the admin UI (GH-004) and in the Obsidian note for that vehicle.

1. **Spec capture.** Pull dimensions from manufacturer source or measure in-shop. Record source URL/photo.
2. **Outline tracing.** In Illustrator or Inkscape, trace front/back/driver/passenger views from the manufacturer technical drawing. Export to SVG conforming to §3.
3. **Panel decomposition.** Inside each view, manually split the body into panels (hood, fender, door, quarter, rocker, etc.). Name each panel. Assign `install-order`.
4. **Wrap-safe zone.** For each panel, draw the `.wrap-safe` clip path inset 12mm from any edge with door gaps, window seals, fuel doors, badges, or sharp curves.
5. **Anti-wrap masking.** Mark windows, lights, grilles, badges, and chrome trim as `.no-wrap`.
6. **Surface-area precompute.** Run the geometry pipeline (Python service) to compute `printable_area_mm2` per panel.
7. **Validator.** Run the admin SVG validator. Must pass clean.
8. **Review.** Second pair of eyes confirms the outline matches a reference photo of the actual vehicle. Compound curves and trim details checked.
9. **Publish.** `status = 'published'`, `verified_at` set, `verified_by` set. Notify anyone in the request queue who asked for it (GH-017).

Realistic throughput once warmed up: 2-3 vehicles per week per template specialist. Initial 50 vehicles take ~8-10 weeks of dedicated specialist time.

## 7. Obsidian integration

The vault structure mirrors the DB:

```
/docs/vault/vehicle-db/
  README.md                       — index, dataview query showing all entries by tier
  templates/
    2024-ford-transit-250-148wb-highroof.md
    2024-ford-f-150-lariat-crewcab-stdbed.md
    ...
  conventions/
    svg-standard.md               — copy of §3
    panel-naming.md               — canonical panel names per body type
    sourcing-policy.md            — copy of §5
```

Each template note uses this Dataview-compatible frontmatter so the index renders automatically:

```yaml
---
type: vehicle-template
year: 2024
make: Ford
model: Transit 250
trim:
variant: 148" WB High Roof
body_type: van
tier: 1
status: published
source_authority: manufacturer_spec
source_url: https://www.fleet.ford.com/...
verified_at: 2026-06-12
verified_by: Mara
db_id: <uuid once published>
---

## Build notes
Free-form notes go here. Tracer's name, things that caused trouble, photos of the actual van that was measured if measured in-shop, etc.
```

A Dataview query in `README.md` renders the live index:

````
```dataview
TABLE year, make, model, variant, tier, status, source_authority
FROM "vehicle-db/templates"
WHERE type = "vehicle-template"
SORT tier ASC, make ASC, model ASC
```
````

## 8. Open decisions for Phase 1 kickoff
- Who builds the initial 50 vehicles — Mara internally, a contracted specialist, or both? (Recommend both: Mara owns Tier 1, contractor handles Tier 2-3.)
- Do we ship Tier 1 (20 vehicles) before Phase 1 demo or wait for the full 50? (Recommend Tier 1 before Phase 1 demo; rest in parallel with Phase 2-3.)
- Confirm with counsel that traced outlines from manufacturer technical drawings are clean from a copyright standpoint. (Manufacturer marketing images are not. Their fleet/body-builder spec drawings generally are when used to derive a transformed work, but verify.)
- Do we offer a one-time "verified accurate" credential alongside published templates, surfaced in the customer UI as a trust signal? (Recommend yes for v1.1.)
