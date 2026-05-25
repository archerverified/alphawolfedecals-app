# Vehicle Outline Tracing — In-House Checklist

**Audience:** Archer or Mara tracing in Illustrator or Inkscape directly.

**Per-vehicle estimated time:** 4-8 hours warmed up. First vehicle is slower (~12 hours) because you're calibrating against the standard.

---

## Before you start the first vehicle

1. [ ] Read `/docs/vehicle-database-spec.md` §3 (SVG standard) end-to-end
2. [ ] Read §6 (build workflow) — the 9 stages each vehicle goes through
3. [ ] Pick your tool: Illustrator (faster if you know it), Inkscape (free)
4. [ ] Create the source folder: `apps/web/public/vehicle-templates/<year>/<make>/<model>/<trim-slug>/`
5. [ ] Download manufacturer technical drawing PDF (NOT a marketing photo) — see "Sources" below

---

## Sources (legal-safe, in priority order)

✅ **Use these:**
- Ford fleet brochures: https://www.fleet.ford.com → Vehicle → "Body Builder Layout"
- Mercedes Sprinter Body & Equipment Guide
- Ram ProMaster Body Builder Guide
- Equivalent for Chevrolet, GMC, Toyota, etc. — search "<make> body builder guide" or "<make> upfitter guide"
- Manufacturer dimensional spec sheets (PDF)

❌ **Don't use:**
- ProVehicleOutlines SVGs (license forbids it — see `/docs/legal/template-source-license.md`)
- EasySIGN templates
- Any "wrap template" provider that competes with us
- Marketing photos as the primary tracing source (use only as reference)

---

## Per-vehicle workflow

Follow these steps in order. Each one should be checked off in your `notes.md` for the vehicle.

### 1. Spec capture (~15 min)

- [ ] Record from manufacturer source:
  - `year`, `make`, `model`, `trim`, `variant`
  - `body_type` (sedan / suv / crossover / pickup / van / box_truck / sprinter / motorcycle / rv / trailer / boat / equipment)
  - `length_mm`, `width_mm`, `height_mm`, `wheelbase_mm`
  - Body-type-specific facets (cab_size, bed_size, roof_height, door_count as applicable)
- [ ] Source URL → `notes.md`
- [ ] Date of capture → `notes.md`

### 2. Outline tracing (~2-4 hours per vehicle)

- [ ] Open manufacturer technical drawing in Illustrator/Inkscape as a tracing reference
- [ ] Set up SVG with viewBox `0 0 4800 1200` (mm × 10 coordinate system)
- [ ] Create 4 view groups: `view-front`, `view-driver`, `view-back`, `view-passenger` (each translated horizontally so they fit side-by-side)
- [ ] For each view, trace the body outline as a single `<path>` per body line. Use Bézier curves; vehicles have very few hard angles.
- [ ] Confirm viewBox aspect ratio is within ±5% of `(length_mm × 4 / height_mm × 2)`

### 3. Panel decomposition (~1-2 hours per vehicle)

Inside each view, split the body into individual panels. Use the canonical names below — don't invent variations.

**Pickups:** Hood · Front Bumper · Front Fender Driver · Front Fender Passenger · Door (Driver/Passenger × Front/Rear) · A-Pillar · B-Pillar · C-Pillar · Quarter Panel · Tailgate · Bed Side · Bed Floor · Roof · Rocker

**Vans/Sprinters:** Hood · Front Bumper · Front Fender · Door (Driver/Passenger Front) · Slider Door (Driver/Passenger) · Door Rear (Left/Right) · Quarter Panel · Roof · Rocker

**SUVs/Crossovers:** combination of pickup + van panel names as applicable

For each panel:
- [ ] Wrap in `<g class="panel" id="<slug>" data-name="<readable name>" data-install-order="<N>" data-finish-hint="<hint>">`
- [ ] Add `<path class="outline" d="...">` — the visible body line
- [ ] Add `<path class="wrap-safe" d="...">` — see step 4
- [ ] Numeric install order: 1..N per view, in the order an installer would wrap (Hood = 1 typically, small detail panels last)
- [ ] Finish hint: pick the most common wrap finish (`gloss` for most body panels, `none` for windows/anti-wrap)

### 4. Wrap-safe zones (~30 min per vehicle)

For each panel's `wrap-safe` path:
- [ ] Inset 12mm from any edge with: door gaps, window seals, fuel doors, badges, or sharp curves
- [ ] Verify visually that the wrap-safe shape is fully INSIDE the outline shape
- [ ] If a compound curve makes wrap-safe hard to define, document it in `notes.md`

### 5. Anti-wrap masking (~20 min per vehicle)

- [ ] Mark windows as `<path class="no-wrap" d="...">`
- [ ] Mark lights (headlights, taillights, fog lights) as `no-wrap`
- [ ] Mark grilles + badges + chrome trim as `no-wrap`
- [ ] Mark fuel doors as `no-wrap`

### 6. Surface-area precompute (~5 min, automated)

- [ ] Run: `pnpm tsx packages/db/src/svg/precompute-area.ts apps/web/public/vehicle-templates/<path>/outline.svg`
- [ ] Confirm `printable_area_mm2` populated per panel

### 7. Validator (~5 min)

- [ ] Run: `pnpm tsx packages/db/src/svg/validate.ts apps/web/public/vehicle-templates/<path>/outline.svg`
- [ ] If validator rejects, fix and re-run. Common failures:
  - Missing view group → add it
  - Missing `.outline` or `.wrap-safe` in a panel → add both
  - Embedded image > 500KB → remove embedded image; reference externally if needed
  - viewBox aspect off → recheck stated dimensions or rescale

### 8. Review (~20 min, second pair of eyes)

- [ ] Ask Mara (or whoever didn't trace) to look at the SVG against a real-world photo of the vehicle
- [ ] Check compound curves at A-pillar, fender flares, rocker panels — these are the easiest to misread
- [ ] Note anything that needed corrections in `notes.md`

### 9. Publish

This step happens via Goal 2's admin UI once the import pipeline is built. For now:
- [ ] Place final files at `apps/web/public/vehicle-templates/<year>/<make>/<model>/<trim-slug>/`:
  - `outline.svg` (the traced file)
  - `reference.jpg` (manufacturer drawing screenshot for reference)
  - `notes.md` (build notes, tracer name, source URL, quirks)
- [ ] Goal 2 will pick them up + run the publish workflow when fired

---

## Realistic schedule (per spec §6)

- Per vehicle warmed up: **4-8 hours**
- First vehicle: **~12 hours** (calibration)
- 3-5 vehicles for MVP: **~1.5-3 weeks** in-house (assuming part-time work alongside other things)
- Full Tier 1 (20 vehicles): **~8-10 weeks** of focused specialist time

If timeline is tight, hire a contractor using `vehicle-tracing-contractor-brief.md`.

---

## When you're done with 3-5 vehicles

Fire the revised Goal 2 prompt in a fresh Claude Code session. The prompt lives **outside this repo** in Archer's Claude Projects orchestration folder at `/Users/ashton/Documents/Claude/Projects/alphawolf-decals-app/prompts/02-goal-2-catalog-ingest.md` (project artifacts are kept out of the repo so they don't conflate with versioned product docs). The goal will:

1. Build the validator + import pipeline + admin UI
2. Run the seed script that imports your traced files
3. Create Obsidian notes per spec §7
4. Open 4 PRs (each CodeRabbit-reviewed)
5. Close out with a mermaid diagram of the revised pipeline

After Goal 2 lands, proceed to Goal 3a (canvas) per the playbook.
