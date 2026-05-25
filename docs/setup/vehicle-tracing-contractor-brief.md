# Vehicle Outline Tracing — Contractor Brief

**Audience:** Illustrator or vehicle-template designer hired via Upwork, Toptal, or referral. Send them this whole doc.

**Project:** Alpha Wolf Wrap Studio (vehicle wrap design SaaS). We need accurate, validator-ready SVG outlines of vehicles for our customer-facing wrap design canvas. The outlines must follow our exact technical standard so they pass our automated validator and integrate cleanly into our database.

**Why your work matters:** these outlines are a competitive moat. Our spec says it explicitly: "Once we have 50 vehicles built right, our editor and our paneling engine produce results no competitor can match." You're not just drawing — you're building the foundation of a moat.

---

## Scope

Trace SVG outlines for **3 vehicles** (initial deliverable; possible expansion to 20 Tier 1 vehicles if quality is good):

| # | Year | Make | Model | Trim/Variant |
|---|------|------|-------|--------------|
| 1 | 2024 | Ford | Transit 250 | 148" WB · High Roof (Van) |
| 2 | 2024 | Ford | F-150 | XL · Crew Cab · Standard Bed (Pickup) |
| 3 | 2024 | Mercedes-Benz | Sprinter 2500 | 144" WB · High Roof (Sprinter) |

Each vehicle requires **4 view outlines + panel decomposition + wrap-safe zones** in a single SVG file conforming to our standard.

---

## Sources you should trace FROM (legal-safe)

✅ **USE THESE:**
- Manufacturer technical drawings from fleet/body-builder spec guides:
  - Ford fleet brochures (https://www.fleet.ford.com)
  - Mercedes Sprinter Body & Equipment Guide
  - Ram ProMaster Body Builder Guide
  - Equivalent documents from other OEMs
- Manufacturer dimensional spec sheets (PDF)

❌ **DO NOT USE:**
- ProVehicleOutlines SVGs (copyrighted, license forbids derivative works)
- EasySIGN templates (same reason)
- Competitor "wrap design platform" outlines of any kind
- Marketing photos as the primary tracing source (use only as visual reference)

When in doubt, ask. The legal exposure of mis-sourcing is real and worse than a delayed deliverable.

---

## SVG technical standard (HARD requirements — validator rejects non-conforming files)

The full standard is at `/docs/vehicle-database-spec.md §3` in the codebase. Summary:

```xml
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 4800 1200"
     data-vehicle-id="<placeholder-uuid>"
     data-version="1">

  <!-- EXACTLY 4 view groups required. view-top optional (5th view). -->
  <g id="view-front"     data-view="front"     transform="translate(0,0)">     ... </g>
  <g id="view-driver"    data-view="driver"    transform="translate(1200,0)">  ... </g>
  <g id="view-back"      data-view="back"      transform="translate(2400,0)">  ... </g>
  <g id="view-passenger" data-view="passenger" transform="translate(3600,0)">  ... </g>

  <!-- Inside EACH view, ≥1 panel as its own group with class="panel". -->
  <g class="panel"
     id="driver-quarter-panel"
     data-name="Driver Quarter Panel"
     data-install-order="3"
     data-finish-hint="gloss">
    <path class="outline"   d="..." />     <!-- visible body line -->
    <path class="wrap-safe" d="..." />     <!-- clip path for wrap (inset 12mm) -->
  </g>

  <!-- Anti-wrap zones: windows, lights, badges, fuel doors, chrome. -->
  <path class="no-wrap" d="..." />
</svg>
```

### Coordinate system

- viewBox uses **mm × 10** (so `4800` = 480mm display scale)
- Each view group is translated horizontally so all 4 views fit side-by-side in the same SVG
- viewBox aspect ratio must be within ±5% of `(length_mm × 4 / height_mm × 2)` for the stated vehicle dimensions

### Per-panel requirements

For EACH panel inside EACH view:
- `class="panel"` group with `id`, `data-name`, `data-install-order`, `data-finish-hint`
- `<path class="outline" d="..." />` — the visible body line
- `<path class="wrap-safe" d="..." />` — clip path for wrap material, **inset 12mm** from any edge with door gaps, window seals, fuel doors, badges, or sharp curves

### Panel naming (canonical)

Use these names. Don't invent variations.

**Pickups:**
- Hood, Front Bumper, Front Fender Driver/Passenger, Door (Driver/Passenger × Front/Rear), A-Pillar Driver/Passenger, B-Pillar Driver/Passenger, C-Pillar Driver/Passenger, Quarter Panel Driver/Passenger, Tailgate, Bed Side Driver/Passenger, Bed Floor, Roof, Rocker Driver/Passenger

**Vans/Sprinters:**
- Hood, Front Bumper, Front Fender Driver/Passenger, Door (Driver/Passenger Front), Slider Door (Driver/Passenger), Door Rear (Left/Right), Quarter Panel Driver/Passenger, Roof, Rocker Driver/Passenger

**SUVs:** combination of pickup + van names as applicable.

### Install order

Number panels 1..N per view in the order an installer would actually wrap them. Hood = 1 typically; small detail panels last. We'll refine with you per vehicle.

### Finish hints

For each panel, pick the most common wrap finish for that surface:
- `gloss` — most body panels
- `satin` — common for accent panels
- `matte` — performance/aggressive looks
- `chrome` — trim only
- `carbon` — accent panels
- `brushed` — accent panels
- `none` — windows, mirrors, anti-wrap zones

---

## Deliverable format

Per vehicle:

1. **Single SVG file** named `outline.svg`, conforming to the standard above
2. **Reference photo** of the actual vehicle (any side-view photo from a manufacturer site is fine) named `reference.jpg`
3. **Build notes** in a small markdown file `notes.md`:
   - Source URL(s) you traced from
   - Tracing date
   - Your name (becomes our `verified_by` attribution)
   - Any quirks you noticed (compound curves at the A-pillar, etc.)

Place all three files in a folder named `<year>/<make>/<model>/<trim-slug>/`. Example:
```
2024/ford/transit-250/148wb-highroof/
  ├── outline.svg
  ├── reference.jpg
  └── notes.md
```

Deliver as a zip or shared Google Drive folder.

---

## Validation before you submit

You can run our validator yourself before sending the deliverable:

```bash
# In the repo (we'll provide read access if you need it):
pnpm tsx packages/db/src/svg/validate.ts path/to/your/outline.svg
```

This catches:
- Missing view groups
- Missing panels
- Missing `.outline` or `.wrap-safe` paths
- Malformed `d` attributes
- viewBox aspect ratio off vs stated dimensions
- Embedded images > 500KB

If validation fails, fix and re-submit before delivering.

---

## Compensation

- **Per-vehicle rate:** $TBD-by-negotiation. Industry range we've seen: $50-200 per vehicle depending on complexity. Vans/sprinters are simpler; pickups with bed variations are middle; SUVs with crossover styling are higher.
- **Initial 3 vehicles:** fixed-price quote requested.
- **If quality is good:** option to continue with Tier 1 (remaining 17 vehicles) and Tier 2 (20 vehicles) at the agreed rate.

---

## Quality bar

A vehicle is "done right" when:

1. Validator passes (no errors)
2. A wrap installer looking at the panel decomposition would agree with the panel breaks
3. Wrap-safe zones are conservatively inset — better to under-wrap than to require trim work in-shop
4. Anti-wrap zones (windows, lights, badges) are marked accurately
5. Compound curves are noted in `notes.md`
6. Dimensions match the manufacturer spec sheet within 1%

We'll review the first vehicle together before you start the other two so the standard is calibrated.

---

## Timeline

- **First vehicle (Ford Transit 250):** ~3-5 days from kickoff (includes calibration)
- **Subsequent vehicles:** ~2-3 days each once standard is calibrated
- **All 3 initial vehicles:** ~10 days realistic
- **Full Tier 1 (20 vehicles):** ~6-8 weeks if continued (2-3 vehicles/week)

---

## Communication

- Initial scope kickoff: 30-min video call to walk you through the standard with a sample
- Per-vehicle: async via the project channel — share progress photos / WIP files as you go
- First-vehicle review: 30-min video call to align on panel breaks + wrap-safe zones

---

## Reference docs you'll be given

- `/docs/vehicle-database-spec.md` — full schema + standard (we'll send the relevant sections)
- This brief
- Example SVG from one of our existing test vehicles (if any are traced when you start)
- Access to a Slack/Discord channel for questions

---

## Next steps if interested

Reply with:
1. Portfolio link or 1-2 samples of prior vehicle outline / technical illustration work
2. Quote for the initial 3 vehicles (fixed-price)
3. Earliest start date
4. Any clarifying questions

Looking forward to it.

— Archer, Alpha Wolf Wrap Studio
