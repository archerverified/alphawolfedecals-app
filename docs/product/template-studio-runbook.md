# Template Studio — Operator Runbook

How to turn a vehicle in the shop into a published wrap template, start to finish.
Written for the operator (you, Archer) — no coding involved. Target time per
vehicle: **under 60 minutes** once you've done a couple.

The Studio lives at **`/admin/studio`** (you must be signed in with an admin
account — the `studio-operator@alphawolfdecals.com` account, or ask for your own
account to be promoted).

---

## The one legal rule (never break this)

**Only our own material goes in.** Three sources are allowed:

1. **Photos you take** of a vehicle at the shop (with the job's consent).
2. **Official manufacturer drawings** — Ford/GM/Mercedes "body builder" PDFs
   published free for upfitters.
3. **Alpha Wolf's own artwork** (like the three catalogue sheets).

Never upload, trace, or even "reference in the next window" anything from Pro
Vehicle Outlines or any other template provider. Their files must never touch
the app. The Studio records where every template came from — that record is our
legal protection.

---

## Before you start: capture the vehicle

When a vehicle comes in for a job, take 10 minutes:

**Photos (the source material).** Stand back as far as you can (less distortion)
and shoot square-on, not at an angle:

- Both sides (driver + passenger), camera at mid-door height
- Front, camera at grille height
- Rear, same
- Top only if you can get above it (ladder/drone) — optional

Fill the frame with the vehicle, keep the whole vehicle in the shot, avoid
strong shadows across body lines.

**Three measurements (the calibration).** Tape measure:

- **Overall length** (bumper to bumper)
- **Wheelbase** (front axle center to rear axle center)
- **Wrap height** (ground to the top of the area you'd wrap)

Write them down in millimetres if you can (1 inch = 25.4 mm).

**OEM drawing instead?** If you have the manufacturer's dimensional drawing
(PDF), you can skip the photos — the drawing already has true proportions and
printed dimensions.

---

## Step by step

### 1. Create the vehicle (2 min)

`/admin/studio` → **New vehicle**. Fill in year/make/model, body type, and the
official length/width/height (the spec-sheet numbers — search "<year> <model>
dimensions"). Upload any outline SVG if you have one; otherwise create it with
the art you'll trace over. It saves as a **draft** — customers can't see it.

### 2. Upload your source material (3 min)

Open the vehicle in the Studio (**Open in Studio** on the worklist). In
**Source material**, upload each photo or the PDF, pick what kind it is, and
type the three measurements. This is the provenance record — don't skip it.

### 3. Draw the panels (20–40 min)

This is the real work. The canvas shows your source as a faint backdrop.

- Pick the **view** you're drawing (driver, passenger, front, back, top).
- **Draw panel**: drag a box over a body section — a door, a quarter panel, a
  bumper. Rough is fine.
- Refine: drag the corner dots to follow the body lines; click a small dot on
  an edge to add a corner (for slanted noses, bows, curved caps); double-click
  a dot to remove it.
- Name each panel what an installer would call it ("Front Door", "Port Bow",
  "Tailgate"), set the finish, and the install order (1, 2, 3…).
- Glass you'd cover with perforated film (bus windows): make it a panel and set
  finish to **none**.

How many panels? Think "zones a customer would include or exclude": a van side
is 2–3 panels, a car side is 4–6, a boat side is 3. Don't trace every crease.

### 4. Calibrate (2 min per view)

The Studio needs to know how big the drawing is in real life. For each view:
click **Measure span**, then click the two ends of the vehicle in that view
(nose tip to tail). The sidebar shows the mm-per-unit it worked out from your
measurements. Side views use the overall length; front/back views use the
width. If the number looks crazy, re-measure.

### 5. Save, check, publish (5 min)

- **Save panels.** The Studio checks everything (it will refuse panels that
  are too thin for the 12 mm wrap-safe margin — make them bigger or simpler).
- Look at the vehicle page — do the panels sit where the body parts are?
- **Publish.** This makes the template live in the catalogue, generates the
  1/20-scale layout sheet, and — if you picked a request from the dropdown —
  marks that customer's request "shipped" and emails them automatically.

Saving on an already-published template updates it **immediately** — the
Studio warns you when that's the case.

---

## The request queue

When a customer can't find their vehicle, they file a request ("Request this
vehicle" on the choose-your-vehicle page). Those land at the top of
`/admin/studio`. Work them oldest-first: mark one **in progress** while you
author it, then publish with that request selected — the customer gets the
"your template is ready" email with a direct link.

---

## When something refuses to save

| The Studio says                                | What it means                               | Fix                                                      |
| ---------------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| "Cannot generate the wrap-safe inset"          | The panel is narrower than ~24 mm somewhere | Make the panel wider, or simplify its shape              |
| "Calibrate … before saving"                    | A view has no span measurement              | Measure span (step 4) for that view                      |
| "Duplicate panel name"                         | Two panels in one view share a name         | Rename one                                               |
| "The panel set does not validate" with details | Something structural                        | Read the listed lines — each names the panel and problem |

If you get stuck, the three AW catalogue templates (BMW X3, Contender, Crown
Coach) are working examples — open them in the Studio and copy the pattern.
