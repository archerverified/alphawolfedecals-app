# SPIKE - Vehicle curvature correction (2D template to true print dimensions)

Date: 2026-06-22. Author: Claude (Claude Code), per `prompts/25-spike-curvature-correction.md`.
Type: time-boxed research spike. Research only, no code changes, no prod migrations, net-zero.
De-risks the hardest part of the B2B print engine (`prompts/24-goal-22-print-ready-paneling-engine.md`, D4).
Method: `/superpowers` + audit-first (CLAUDE.md sections 0 to 8) + a 15-agent research workflow (6 source
evaluations, each adversarially verified, plus 3 calibration cases) + a local geometry/multiplier prototype.

---

## 0. TL;DR for Archer (plain language)

- **The problem is real and physical.** Flat 2D templates are a shadow of a 3D body. Curved panels always
  need more vinyl than their shadow. An F-150 rear door is ~52 in on the flat template but ~60 in of real
  vinyl (+15.4%). Printing that 52 is a guaranteed reprint.
- **Nobody sells the answer.** We checked manufacturers, collision-repair databases, the paid template
  shops (ProVehicleOutlines and friends), 3D model stores, and photo scanning. **None of them publish
  true, curvature-corrected panel sizes.** The whole industry's "fix" is to add a blunt 6 inches of bleed
  to every side and tell the installer to go measure the real car. That is the gap we can own.
- **What we should build now:** a correction layer that multiplies our flat numbers by a per-panel
  "curvature factor," always rounds UP so we never print short, carries a confidence flag so the app warns
  when a number is a guess, and gets more accurate every time the owner measures a real panel in the shop.
  It is cheap, it is legally clean (our own measurements are our own facts), and it drops straight into the
  code we already have.
- **What we should NOT do yet:** promise paying shops that our curvature numbers are accurate. They are a
  conservative estimate until the owner validates them on real vehicles. Photo/3D scanning is the long-term
  accuracy play, but customer phone scans are not reliable enough today to bet a reprint on.
- **Decision: GO (conditional).** Build the correction layer plus the never-short margin plus the warning
  into Goal 22. Do not advertise curvature accuracy until live shop measurements back it. See section 8.

---

## 1. Audit-first: where curvature lives in our code today

| Thing                 | Location                                                                                                                                                                  | State today                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel print sizing    | `apps/web/lib/brief/quality.ts` -> `panelPrintSizesIn()`                                                                                                                  | Pure 2D: projects each panel's SVG bounding box onto the vehicle's **flat** length/width (`viewSpanMm`). Zero curvature awareness.                                                                                                          |
| Where sizes surface   | `apps/web/lib/export/spec-pack.ts` (page 3 "Approx. size" + total sq ft)                                                                                                  | Already disclaims: "Sizes are template-derived estimates, the shop measures the vehicle before ordering film." There is a `WASTE_FACTOR = 1.15`, but that is a **material waste** allowance, not curvature, and they must not be conflated. |
| Intended data home    | `docs/vehicle-database-spec.md` -> `vehicle_panels.printable_area_mm2` + a `source_authority` enum (manufacturer_spec / measured_in_shop / licensed / community_verified) | `printable_area_mm2` is computed from flat SVG geometry today; `source_authority` is the natural anchor for a confidence field.                                                                                                             |
| Downstream dependency | `prompts/24` D4                                                                                                                                                           | "Use the curvature-corrected true dimensions from the spike ... If the spike is not yet landed, gate on a clearly-labeled estimate and warn." This spike defines exactly that estimate + warning.                                           |
| Licensing guardrail   | memory `template-source-license-restrictive`, DB spec section 5.3                                                                                                         | Do NOT scrape or ingest ProVehicleOutlines. Confirmed still binding (see section 3).                                                                                                                                                        |

**Conclusion of the audit:** the correction is a multiplier layer that slots in right after `panelPrintSizesIn`,
keyed on (body type, panel class, view axis), with a confidence/tolerance field. We are extending one pure
function and one table, not rebuilding the pipeline.

---

## 2. Source evaluation (6 candidates, each web-researched then adversarially verified)

Scores are 1 (worst) to 5 (best). Every row was independently checked by a second skeptic agent; the
"verified" column records what survived. Full citations are in the appendix.

| #   | Source                                                   | Coverage | Curvature accuracy | Cost                  | Licensing                    | Effort to integrate | Verdict                            |
| --- | -------------------------------------------------------- | -------- | ------------------ | --------------------- | ---------------------------- | ------------------- | ---------------------------------- |
| 1   | OEM specs / owner manuals / body-builder guides          | 2        | **1**              | $0 docs               | High (CAD is NDA-gated)      | 2                   | **Reject**                         |
| 2   | Collision / body-panel datasets (Mitchell, CCC, Audatex) | 2        | 2                  | Enterprise / per-seat | High                         | 2                   | **Reject**                         |
| 3   | Paid template providers (PVO, EasySIGN, SignSilo, ...)   | **5**    | 2                  | ~$549/yr              | **Blocker (PVO EULA)**       | 2                   | **Reject**                         |
| 4   | 3D model libraries (Hum3D, TurboSquid, CGTrader)         | 3        | 2                  | ~$95/model            | High (editorial + trademark) | 2                   | **Prototype only**                 |
| 5   | Photogrammetry from customer photos / LiDAR              | 4        | 2                  | Low SW / high ops     | Low (own car)                | 1                   | **Long-term**                      |
| 6   | Empirical correction-factor model                        | 4        | 2                  | ~Free                 | Low                          | **5**               | **Adopt as conservative fallback** |

### The single most important finding (verified across sources 1 to 3)

**No off-the-shelf source publishes curvature-aware (true developable-surface) panel dimensions.**

- OEM body-builder guides (verified firsthand in the Ford F-150 2023 Body Builders Layout Book and the
  2016 Sprinter Body & Equipment Guide) carry only point-to-point datum and bounding dimensions and frame
  sections, plus a "frontal surface area worksheet" that is projected frontal area for aero/loading. No
  developed panel skin anywhere.
- Collision systems (Mitchell, CCC, Audatex) carry structural frame geometry for straightening and labor
  TIME per panel, never surface area. Industry sources explicitly say paint time is not panel area.
- Paid template providers sell flat 2D orthographic outlines, the exact projection that undercounts. Their
  only curvature answer is a **fixed 6 inch bleed on every side**. ProVehicleOutlines' own square-footage
  list literally states "Measurements include 6\" bleed," i.e. flat area plus a constant pad, not true
  surface area. A constant pad both over- and under-pads depending on panel.

**Why flat must undercount (physics, verified):** vehicle body panels are predominantly **non-developable**
surfaces (non-zero Gaussian curvature), so they cannot be flattened to a plane without stretch. Published
spherical-cap geometry gives a surface-area increase of **10.7% to 24.9%** depending on the cap's opening
angle, a band that neatly contains the owner's +15.4% F-150 datum. This is not a template bug we can fix
with better tracing; it is geometry.

### Per-source notes (what the verification changed)

1. **OEM specs - Reject.** The PDFs are curvature-useless and that was confirmed firsthand. The one
   nuance the verifier added: Ford BBAS _does_ sometimes release full STEP exterior-surface CAD to
   qualifying upfitters for free under NDA (a real 441-file, 20.9 GB Transit package was documented). That
   CAD is true 3D and could in principle be developed into curvature-aware sizes, but it is NDA-gated to
   upfitters, per model, multi-GB, needs surface cleanup, and the NDA bars redistribution. So OEM CAD is
   "real but encumbered," not a viable commercial data feed. Reject as a primary source stands.

2. **Collision datasets - Reject.** Confirmed: wrong measurement type (frame points, labor time), high
   licensing risk (CCC Secure Share is per-workfile, CIECA-gated, repair-facility-owned), and no
   surface-area record exists to license. The verifier flagged the dollar figures as unverified estimates
   (vendors do not publish pricing) and reinforced that even the _correct_-type wrap data is approximate.

3. **Paid template providers - Reject (PVO ingest is a hard blocker).** Best breadth on earth (PVO claims
   19,500+ North American templates) but it is breadth of FLAT outlines. The PVO EULA (now Fiery/EFI
   owned) bans derivative works and reverse engineering and calls the templates trade secrets; combined
   with our existing do-not-ingest rule, ingesting PVO is off the table. Competitor licenses are end-user
   design licenses, not data-product redistribution licenses. Note: raw numeric dimensions are
   uncopyrightable facts (Feist), so the binding constraint is the contract/EULA, not copyright.

4. **3D model libraries - Prototype only.** The one source that natively captures curvature (a mesh is a
   true surface, so per-panel surface area can be integrated). But: catalog granularity is
   make/model/generation, not the exact trim/cab/bed permutations that change panel size; stock models are
   render approximations with unverified absolute scale (error is unbounded per asset); and licensing is
   high-risk to blocking for a commercial derived-dimension product (editorial-use bans, anti-data-mining
   clauses, GM's unilateral per-sale approval, and BMW has actively litigated branded car models). Usable
   as a non-commercial calibration/prototype source, not a production feed.

5. **Photogrammetry from customer photos - Long-term.** The only approach that physically measures the
   real curvature of the real vehicle, and licensing is LOW when it is the customer's own authorized scan
   (derived dimensions are facts). But absolute SCALE is the killer: lab Apple Object Capture hits
   sub-millimeter only with a good scale reference; real vehicle-scale handheld LiDAR is ~3 cm RMSE under
   ideal conditions and degrades to ~10 to 12 cm in fast daylight scans; generic photogrammetry without
   scale bars drifts >10% (it could itself cause the very +15% miss it is meant to fix). Glossy paint,
   glass, and chrome (exactly the panels being wrapped) are the worst case. The error is silent and
   direction-random. It cannot today GUARANTEE never-short without a LiDAR capture app plus a mandatory
   known-reference / human QA gate. This is the phase-2 accuracy upgrade, not the near-term answer.

6. **Empirical correction-factor model - Adopt as a conservative fallback.** Cheapest path, licensing
   clean (our own measured multipliers are our own facts; the only upstream exposure is the flat template
   we already use), and trivial to integrate (a multiplication keyed on a panel-class tag the pipeline
   already has). The verified weakness, which shapes the whole recommendation: a single class-average
   multiplier is **most wrong exactly on the compound-curve panels (bumpers, crowns) where reprints
   happen**, and a flat template gives no signal to tell a shallow door from a deeply crowned one.
   Within-class variance is large (an ~18% square-foot spread appears within a single nameplate's
   cab/bed configs). So this model is defensible ONLY when biased upward, margined by confidence, and
   treated as a conservative estimate that live measurement supersedes, never as the sole authority.

---

## 3. Prototype (geometry + empirical multiplier, tested on 3 cases)

Net-zero: the scripts ran in `/tmp` and are reproduced in the appendix. Nothing was written to the app.

### 3a. Geometry finding: the +15.4% is compound, so it cannot be computed from the flat template

Modeling the F-150 door cross-section as a single circular-arc crown (chord 52 in):

| Crown depth (sagitta) | Multiplier k | Real length | Added |
| --------------------- | ------------ | ----------- | ----- |
| 1 in                  | 1.001        | 52.05       | 0.1%  |
| 2 in                  | 1.004        | 52.20       | 0.4%  |
| 3 in                  | 1.009        | 52.46       | 0.9%  |
| 6 in                  | 1.035        | 53.83       | 3.5%  |
| 8 in                  | 1.062        | 55.22       | 6.2%  |

A realistic door crown is ~1 to 3 in deep, which a single arc turns into only **~1 to 3%**. To get the
observed +15.4% from one arc you would need a ~12.8 in bulge (a 105 degree arc), which is physically absurd
for a door. So the +15.4% is **compound**: horizontal crown, plus vertical curvature / tumblehome, plus the
door wrapping around its leading/trailing edges into the jamb, plus foreshortening of a surface that tilts
away from the projection plane. An illustrative decomposition of realistic components lands around +9.7%,
same order of magnitude, with the residual gap to 15.4% being exactly the part you cannot derive from a
2D shadow. **This is the technical core of the recommendation: the true factor must be calibrated from
measurement, not computed from the template.** The calibration research independently agreed (the BMW X3
finding: a crossover door's face crown adds only ~0.3 to 0.6%; the large corrections come from compound
curvature at the fender/quarter shoulders and the door-to-roof transition, which are panel- and body-
specific, not a universal constant).

### 3b. Empirical multiplier model + never-short margin, applied to the 3 cases

Model: `true = flat x k(body, panel_class)`, then `safe-cut = true x (1 + margin)` where the margin is set
by confidence so the engine never prints short. `k` priors are biased upward, anchored on the one real
datum (F-150 rear door = 1.154) and the spherical-cap band, and are meant to be backfilled by
`measured_in_shop` data.

| Panel                                        | Flat (in) | k     | True (in) | Safe-cut (in) | Confidence |
| -------------------------------------------- | --------- | ----- | --------- | ------------- | ---------- |
| **F-150 rear door (ANCHOR, owner-measured)** | 52        | 1.154 | **60.0**  | 61.2          | measured   |
| F-150 hood (compound)                        | 70        | 1.12  | 78.4      | 84.7          | prior      |
| F-150 front bumper (deep compound)           | 60        | 1.27  | 76.2      | 82.3          | prior      |
| BMW X3 rear door (face)                      | 51        | 1.10  | 56.1      | 60.6          | prior      |
| BMW X3 rear quarter (arch + C-pillar)        | 42        | 1.15  | 48.3      | 52.2          | prior      |
| Sprinter 144 side slab (per side)            | 133       | 1.03  | 137.0     | 147.9         | prior      |
| Sprinter 170 side slab (per side)            | 173       | 1.03  | 178.2     | 192.4         | prior      |
| Sprinter roof transition                     | 60        | 1.10  | 66.0      | 71.3          | prior      |
| Sprinter front clip / hood                   | 60        | 1.18  | 70.8      | 76.5          | prior      |

**Accuracy honesty (this is the part that matters because short prints cost money):**

- **F-150 rear door:** the model reproduces the owner's anchor (52 x 1.154 = 60.0 vs the owner's ~60). This
  is the ONLY datum validated against a real measurement.
- **BMW X3 and Sprinter:** these are PREDICTIONS from priors plus published overall dimensions. We do NOT
  have the owner's real measured numbers for them, and no manufacturer publishes panel-level dimensions for
  either. The Sprinter slab-side k = 1.03 is the most trustworthy prediction (corroborated qualitatively:
  the body width is a constant 79 in / 92 in across every wheelbase and roof, which only happens when the
  sides are near-vertical flat planes). The X3 door/quarter numbers are the least trustworthy (crossover
  compound curvature is edge-driven and body-specific). Both go on the validation list (section 7).
- **What "uncorrected" costs:** if today's flat path printed these, it would be short by 8.0 in on the
  F-150 door, 16.2 in on its bumper, 5.1 in on the X3 door, and 4.0 to 5.2 in on each Sprinter side. Every
  one is a reprint. Even the "low curvature" Sprinter slab side is +3%, which on a 14 ft van panel is real
  money.

---

## 4. Recommended approach

**A two-layer, measurement-calibrated empirical correction with a confidence-driven never-short margin.**
This is option 6, deployed the only way the evidence supports: conservative, margined, and superseded by
real measurement. It is the only candidate that is buildable now, licensing-clean, and integrates into the
function we already have.

- **Layer 1 - curvature multiplier `k`** keyed on (body_type, panel_class, view_axis). Seeded with
  conservative priors from the spherical-cap band and installer allowances; biased upward; compound-curve
  classes (bumpers, fenders, crowns, front clips) get the largest priors.
- **Layer 2 - confidence and tolerance** driving a one-sided safety margin so the print path never falls
  below the true estimate: `measured_in_shop` (tight, ~+2%) -> `calibrated` from a measured sibling
  (~+5%) -> `class prior` (wide, ~+8%) -> `unknown` (warn and refuse to auto-size). The engine displays
  the confidence and warns whenever a dimension is estimated. This is literally the "clearly-labeled
  estimate and warn" that Goal 22 D4 asks for.
- **Calibration loop:** start by measuring the highest-risk panels (doors, bumpers, fenders, crowns) on
  the Tier-1 vehicles in the shop. Each measurement promotes that (body, panel) from `prior` to
  `measured`, shrinks its margin, and improves accuracy monotonically. The vehicle DB already has the
  `measured_in_shop` source authority for exactly this.

**Expected accuracy.** On `measured` panels, within the shop's own tape accuracy (sub-percent to ~2%). On
`prior` panels, the estimate is deliberately conservative (biased to over-cut), so expected error is "never
short, sometimes generously long," with the long-side waste bounded by the margin and shrinking as
measurements land. We should NOT claim a single accuracy number for un-measured panels; the honest claim is
"never short, with a known and shrinking over-cut margin."

**Effort.** Layer 1 + Layer 2 are days of engineering (a versioned multiplier table, the margin policy, a
confidence field, and the hook after `panelPrintSizesIn`). The ongoing work is governance and calibration
(measuring panels, recording provenance), not code.

**Why not the others, in one line each:** OEM/collision/template providers do not have the data and (PVO)
legally block us; 3D libraries have the data shape but unverified scale and high IP risk; photogrammetry is
the right long-term physical measurement but customer phone scans are not reliable enough to guarantee
never-short today.

---

## 5. Proposed data model

Additive to the existing `vehicle_panels` table (DB spec section 2). No migration is run by this spike; this
is the proposed shape for Goal 22.

```sql
-- New enum for the confidence/source of a curvature factor.
CREATE TYPE curvature_source AS ENUM ('measured_in_shop','calibrated_sibling','class_prior','unknown');

-- Additive columns on vehicle_panels (the per-panel record we already plan to carry).
ALTER TABLE vehicle_panels
  ADD COLUMN curvature_factor    numeric(5,3),        -- k, e.g. 1.154 (NULL => fall back to class prior)
  ADD COLUMN curvature_source    curvature_source NOT NULL DEFAULT 'class_prior',
  ADD COLUMN curvature_margin    numeric(4,3) NOT NULL DEFAULT 0.08,  -- one-sided never-short safety margin
  ADD COLUMN curvature_measured_at timestamptz,       -- when a real measurement set this
  ADD COLUMN curvature_notes     text;                -- "rear door, tape over crown, 2026-06-25, owner"

-- A small reusable table of class priors (body_type x panel_class), versioned, app-readable.
CREATE TABLE curvature_class_priors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body_type    body_type NOT NULL,
  panel_class  text NOT NULL,         -- 'door','hood','roof','bumper','fender','quarter','slabside', ...
  view_axis    text NOT NULL,         -- 'length' | 'width' (which extent the panel spans)
  k            numeric(5,3) NOT NULL, -- conservative prior, biased upward
  margin       numeric(4,3) NOT NULL DEFAULT 0.08,
  version      int NOT NULL DEFAULT 1,
  notes        text,
  UNIQUE (body_type, panel_class, view_axis, version)
);
```

**How the engine consumes it (resolution order, conservative):**

1. If the panel has a `curvature_factor` with `curvature_source = 'measured_in_shop'`, use it (tight margin).
2. Else if a measured sibling in the same (body_type, panel_class) exists, use it as `calibrated_sibling`.
3. Else use the `curvature_class_priors` row (`class_prior`, wide margin) and **warn: estimated**.
4. Else `unknown`: do not auto-size; require the shop to measure, and surface a hard warning.

`true_dim = flat_dim x k`; `safe_print_dim = true_dim x (1 + curvature_margin)`. The paneling engine then
adds its own overlap/bleed on top of `safe_print_dim` (so curvature and panel-overlap stay separate and
auditable, and neither double-counts the existing `WASTE_FACTOR`). The spec pack and editor display the
confidence so a shop sees which numbers are measured vs estimated.

**Consumed by:** `apps/web/lib/brief/quality.ts` (`panelPrintSizesIn` gains a post-projection correction
step), `apps/web/lib/export/spec-pack.ts` (size table shows corrected dims + confidence), and the Goal 22
paneling/tiling engine (D2/D4) which sizes panels off `safe_print_dim`, never the flat number.

---

## 6. Honest accuracy and risk

- **What we can promise now:** never short on any panel where we have either a measurement or a
  conservative prior, because the margin is one-sided and biased up. We can also promise a clear "measured
  vs estimated" signal on every dimension.
- **What we cannot promise now:** that an un-measured panel's number is _accurate_ (only that it is not
  short). Within-class curvature variance is real and undetectable from a flat template, so a class prior
  can be generously long, and on the worst compound-curve panels it could even be short if the prior were
  set too low (hence: bias up, widen margins on bumpers/crowns, and validate).
- **Where it will fail:** compound-curve panels (bumpers, fenders, deep hood/roof crowns) on body styles we
  have not measured; trim packages that change cladding (rocker flares, fender flares) without changing the
  template; and any vehicle outside our template library.
- **The hard rule:** do not advertise curvature accuracy to paying shops until the priors on a body class
  are validated by live shop measurement. Until then it is a conservative estimate with a visible warning.

---

## 7. Must be validated by live shop testing (before promising paying shops)

1. **The +15.4% F-150 door anchor itself.** It is the shop owner's internal datum and could not be
   independently confirmed from any published source (no OEM door-skin dimensions exist). Re-measure flat
   template vs real laid-out vinyl on a real F-150 rear door to lock the anchor.
2. **The BMW X3 door and quarter predictions** (k = 1.10 / 1.15). Unvalidated; crossover compound curvature
   is edge-driven and body-specific. Measure the owner's X3.
3. **The Sprinter slab-side prior** (k = 1.03) and the roof-transition / front-clip priors (1.10 / 1.18).
   The slab side is the most confident prediction but still unmeasured; the roof and nose are the risk.
4. **The class priors for compound-curve panels** (bumpers, fenders, crowns) across body styles. These are
   where reprints happen and where a class average is least trustworthy.
5. **The size of the never-short margins** (+2% / +5% / +8%). Tune so over-cut waste is acceptable to shops
   while never printing short.
6. **Trim deltas:** confirm whether trims that add cladding (e.g., Lariat rocker cladding, fender flares)
   need their own multiplier or a template variant.

---

## 8. Decision: GO (conditional)

**GO to build curvature correction into Goal 22**, specifically: the multiplier layer, the
confidence/tolerance field, and the never-short margin + warning, exactly as in sections 4 and 5. This is
strictly better than today (today the app prints the flat undercount silently; the new layer biases
conservative AND warns), it is the literal mechanism Goal 22 D4 asks for, it is cheap, it is licensing-clean,
and it slots into existing code.

**Conditions (non-negotiable, because short prints cost real money):**

1. Ship it as a **conservative, clearly-labeled estimate with a warning**, never as a precise number, until
   live shop measurement validates the priors for that body class.
2. **Do not promise curvature accuracy** to paying shops until the section 7 validation is done. The
   marketing claim is "never prints short," not "exact."
3. Stand up the **measurement calibration loop** (the owner measuring real panels) as part of Goal 22, and
   wire `measured_in_shop` to promote priors and shrink margins.
4. Put **photogrammetry / 3D-scan on the roadmap as the phase-2 accuracy upgrade**, gated on a LiDAR
   capture app plus a mandatory QA gate. Do not build it into Goal 22.

**NO-GO on:** ingesting ProVehicleOutlines (EULA blocker), licensing collision datasets, building a
commercial dimension product off purchased branded 3D models (IP/contract risk), or relying on customer
phone photogrammetry for print-critical dimensions today.

---

## Appendix A. Prototype scripts (ran in /tmp, net-zero)

### A1. Geometry (single-arc crown vs observed compound +15.4%)

```python
import math
def arc_k_from_sagitta(c, h):
    if h <= 0: return 1.0, float('inf'), 0.0
    R = c*c/(8*h) + h/2.0
    half = math.asin((c/2.0)/R)
    return (2*R*half)/c, R, math.degrees(2*half)
c = 52.0
for h in [1,2,3,4,6,8,10,12,15]:
    k,R,ang = arc_k_from_sagitta(c,h)
    print(h, round(k,4), round(c*k,2), f"{(k-1)*100:.1f}%", round(ang,1))
# k=1.154 (52->60) needs sagitta ~12.8in / 105 deg arc -> implausible for one curve => compound.
```

### A2. Empirical multiplier + never-short margin

```python
SAFETY = {"measured":0.02, "calibrated":0.05, "prior":0.08}
def predict(flat, k, conf):
    true = flat*k
    return true, true*(1+SAFETY[conf])
# F-150 rear door: predict(52, 1.154, "measured") -> (60.0, 61.2)  reproduces the anchor.
```

## Appendix B. Key citations (full set in the research transcript)

- Developable surface / non-zero Gaussian curvature (why panels cannot flatten without stretch):
  https://en.wikipedia.org/wiki/Developable_surface
- PVO FAQ (2D-only, contour warning, 6 in bleed): https://www.provehicleoutlines.com/faq/
- PVO square-footage list ("Measurements include 6\" bleed"):
  https://weprintwraps.com/wp-content/themes/weprintwraps/files/pvo_square_footage_list.pdf
- PVO EULA (no derivative works; Fiery/EFI ownership): https://www.provehicleoutlines.com/pvo-eula/
- Ford F-150 2023 Body Builders Layout Book (datum/bounding only; CAD by request):
  https://www.fordpro.com/en-us/upfit/publications/
- Ford BBAS CAD channel (NDA, upfitters only): https://www.fordpro.com/en-us/upfit/bbas/
- Mitchell "Viewing Vehicle Dimensions" (structural frame points, no surface area):
  https://www.mymitchell.com/tchs/helpfiles/RepairCenter/1033/Content/53200.htm
- CCC Secure Share FAQ (per-workfile, CIECA-gated): https://www.cccsecureshare.com/Faq
- TurboSquid Royalty Free / Editorial license + Terms (no data mining; editorial bans resale):
  https://www.turbosquid.com/help/en/articles/9937423-royalty-free-license-faq
- TurboSquid / GM Artist Agreement (automaker unilateral sale approval; CAD-misappropriation ban):
  https://resources.turbosquid.com/general-info/terms-agreements/general-motors-artist-agreement/
- BMW v. TurboSquid (branded-vehicle IP enforcement): https://polycount.com/discussion/174378
- Hum3D pricing (~$95/model, $50 sub for 4): https://hum3d.com/subscription/
- Apple Object Capture accuracy (PLOS One 2024, scale-reference dependence):
  https://pmc.ncbi.nlm.nih.gov/articles/PMC11637407/
- Handheld LiDAR vs TLS on a vehicle (~3 cm RMSE ideal): https://pmc.ncbi.nlm.nih.gov/articles/PMC8659977/
- KIRI Engine LiDAR (car-part scale must be hand-corrected):
  https://www.kiriengine.app/blog/explained/lidar-scan-mode
- Feist v. Rural Telephone (facts/dimensions not copyrightable):
  https://www.law.cornell.edu/supremecourt/text/499/340
- 3M IJ180 / 2080 wrap film (130% stretch; conformability, not a print-size reducer):
  https://multimedia.3m.com/mws/media/202318O/3m-controltac-graphic-film-ij180-ij180c-ij180cv3-product-bulletin.pdf
- GarageTool square-footage (within-nameplate ~18% spread by cab/box):
  https://www.garagetool.app/resources/vehicle-square-footage-list
- BMW X3 G01/G45 dimensions: https://www.dimensions.com/element/bmw-x3-g01 ,
  https://en.wikipedia.org/wiki/BMW_X3_(G45)
- Mercedes Sprinter dimensions (constant 79 in / 92 in width = flat slab sides):
  https://www.mbvans.com/en/sprinter/cargo-van , https://vandimensions.com/database/mercedes/sprinter-2018
