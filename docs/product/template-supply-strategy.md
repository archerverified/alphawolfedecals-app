# Vehicle Template Supply Strategy

Date: 2026-06-11 · Decided with Archer · Companion to `prd.md` §2.1 (template moat) and `prd-b2c-guided-design-flow.md` (B2C-003 zone selector depends on this data)

## The decision

**Do not buy or sublicense a catalog. Build a demand-driven authoring machine ("Template Studio") and let the pilot shop's real traffic decide what gets authored.** Output is always the standard 2D multi-view vector pattern (top / both sides / front / rear, 1/20th scale, panel shading, wrap-height + dimension callouts) — the PVO-style format, produced from our own art.

Why not the alternatives:
- **PVO / provider sublicense:** their EULAs prohibit platform redistribution (Goal 1 verdict: RESTRICTIVE); an enterprise-license negotiation reveals the product roadmap to the incumbent; recurring cost with zero ownership.
- **Stock/blueprint sites:** the-blueprints.com's own royalty-free license prohibits use in "templates" by name (verified 2026-06-10). Same class of wall industry-wide.
- **Bulk commissioning ($30–100/template):** $2.5–5k+ upfront for inventory that may not match real demand. Not feasible at pilot stage, and unnecessary given the Studio.

## Legal boundary table (hard rules)

| Allowed | Forbidden |
|---|---|
| The pilot shop (Alpha Wolf Decals) using its OWN PVO subscription for its OWN client production work — that's PVO's licensed use | Any PVO (or other provider) file, trace, or derivative entering the app's template database — ever |
| Redrawing outlines from OEM body-builder dimensional drawings (dimensions are facts; the new art is ours) | Copying provider art "as reference open in the next window" — authorship must trace to our photos/OEM data |
| Photographing customer vehicles at the shop (with job consent) and tracing from OUR photos | Scraping any template provider |
| Badge-free, logo-free outlines of real make/models (established industry practice — PVO's entire catalog) | Manufacturer logos, badges, or wordmarks inside templates |

Keep two storage roots that never cross: shop production files (may contain licensed PVO art) vs `app template sources` (only our photos, OEM PDFs, and authored SVGs).

## Sources (all ~$0 cash)

1. **The shop floor (primary).** Every vehicle that comes in for a job gets the orthographic photo set (both sides, front, rear, top where feasible — ladder/drone or high vantage) + 3 reference measurements (overall length, wheelbase, wrap height). The vehicle is physically present and getting wrapped anyway; capture costs minutes.
2. **OEM upfitter publications (commercial seed set).** Ford Pro Body Builder Layout Books, GM Upfitter body-builder manuals, Mercedes & Stellantis equivalents — free, official, dimensioned drawings published for commercial upfitters. Seeds the top ~20 fleet vehicles (Transit, Sprinter, ProMaster, Silverado/Sierra chassis, E-series, box trucks) before pilot traffic even starts.
3. **Marine/specialty:** manufacturer spec sheets (boats publish hull profiles + dimensions) + the hull in the yard. Same pipeline.
4. **(Declined) 3D models** — not needed; the deliverable is 2D and physical access + OEM data covers sourcing. Revisit only if a remote/rare vehicle must be authored sight-unseen.

## The Template Studio (internal tool — Goal 6 candidate)

Pipeline, extending the existing AI→SVG conversion work from the PoC era:

1. **Ingest:** photo set or OEM drawing PDF + the 3 reference measurements.
2. **Orthorectify + auto-trace:** perspective-correct photos → edge extraction → vectorize (potrace-class) → clean Bézier outline per view.
3. **AI-assisted panel segmentation:** propose panel regions (doors, hood, quarters, roof, glass, trim) on the traced outline; operator confirms/adjusts. Output = `vehicle_panels` rows (the SAME data the B2C zone selector and editor consume — one machine feeds both needs).
4. **Wrap-safe zones + scale:** operator marks no-wrap areas (glass per policy, trim, handles); measurements calibrate true scale; auto-generate the 1/20th-scale layout sheet with name/code/dimension callouts.
5. **QC + publish:** human pass in the wrap editor (the Transit template is the fidelity reference), then publish to catalog.

Target: ≤ 60 minutes operator time per vehicle. Authoring cost = operator time only.

## Sequencing

| Phase | What | Cost |
|---|---|---|
| Now (pilot day 1) | Shop runs production on its own PVO license (legal, shop-side only). App demos on owned templates (Transit + the 3 AW templates once panels land). | $0 |
| Goal 6 | Build Template Studio. First outputs: panel data for the 3 existing AW catalog templates (unblocks the editor + B2C-003), then the OEM-seeded fleet top-20. | build time |
| Pilot steady-state | Author-on-demand: every no-template job → photos → Studio → catalog +1 (forever). Expected 150–400 owned templates/year at shop traffic rates, matching real regional demand. | operator minutes |
| Shop #2+ | "Request this vehicle" becomes the shop-contribution program: their photo sets, our pipeline, credited contributions. The flywheel. | ~$0 |

## Why this wins long-term

PVO sells static inventory. We're building the machine that converts a day's shop traffic into permanent catalog assets — owned outright, panel-data-rich (providers ship flat art; ours is structured for the editor and AI pipeline), and demand-weighted. At pilot scale it's cheaper than any license; at platform scale it's the moat the investor doc already promises.
