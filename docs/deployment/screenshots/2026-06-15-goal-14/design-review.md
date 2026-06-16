# Design + AI-Slop Review — Alpha Wolf Wrap Studio (Goal 14 restyle)

Reviewer: `design-review` skill rubric (10-category checklist + AI-slop blacklist, Jun 2026 vintage).
Method: strict fresh-eyes audit of the 15 AFTER screenshots in `2026-06-15-goal-14/`, compared to
the Goal-13 baseline (its `design-review.md` text — the **authoritative** baseline, graded
**Design B− / AI-Slop C+**) and the bolder-call mockups in `docs/goal-14/mockups/`.
Brand: black / white / cyan `#00AEEF`, zinc-neutral chrome, Geist + Geist Mono, operational voice.

> **Baseline-fidelity caveat (read first).** The `2026-06-15-goal-13/*.png` files in this repo are
> **not all faithful pre-restyle baselines** — several are re-captures of a post-restyle (or near-final)
> state. Concretely: the goal-13 `01-landing.png` already shows the dark hero, and `04-welcome.png`
> already shows the restyled left-aligned "Choose your vehicle to start" with the cyan step eyebrow.
> The Goal-13 **design-review.md text** describes the _original_ flat-off-white D+/D landing and the
> "You're in." C−/C welcome — that text is what I grade the jump against, **not** those PNGs. Where the
> goal-13 PNG _does_ show the true pre-fix state (catalogue duplicate line, vehicle-detail text-link CTA,
> editor toast-on-toolbar, brief logo copy, generation tri-grid), I cite it directly. Archer should know
> the before/after PNG pairs in these two folders do **not** uniformly show the real delta.

---

## 1. Dual grades (vs the B− / C+ baseline)

### Design: **B− → A−** (jumped ~1.5 letters)

The restyle did exactly what the plan promised at the system level: it wired the design-system tokens
(`--aws-*`) through the shadcn primitives so the whole app reads on-brand with one vocabulary, threaded
cyan as a finishing accent, and — most importantly — gave the **landing a real brand-forward hero**
(dark zinc-900 band, logo lockup, cyan headline word, product-voice copy, one dominant CTA, an
"ACCURATE OUTLINE" spec card). That single change converts the worst surface in the journey (the
documented flat D+/D config-dialog) into the best marketing moment. The strong app bones (editor,
vehicle-detail plate) are untouched and still A−/A. It lands at A− rather than A because a few enrichments
from the team's own mockups did **not** ship (welcome has no vehicle visual; catalogue's warm-amber
request card was not built), the brief Zones step has a genuine **label-overflow defect**, and several
headline closures (D13-2 toast position, D13-3 logo copy, D13-4 skeleton, D13-6 strength meter) are
**not positively verifiable** in the AFTER screenshot set.

### AI-Slop: **C+ → A−** (jumped ~1.5 letters)

Verdict: **"The brand finally shows up where it's seen first."** The four blacklist tells the Goal-13
review named are addressed on the surfaces I can see: centered-everything is gone on the landing (it is
now an asymmetric two-column composition); the "gave up on typography" system font is replaced with
Geist (a real face) plus the signature UPPERCASE-tracked eyebrow device; the accent is present and used
deliberately (cyan headline word, selected-zone fill, QR border, stat figures, eyebrow rules); and the
distinctiveness test now passes — with the logo removed you could still ID this brand from the AW vehicle
template plate, the dark hero, and the cyan-on-black system. It is held to A− (not A) for one honest
reason: **the single most-recognizable AI layout — the symmetric 3-up concept grid (blacklist #2) — is
still the shipped generation layout**, and its fix (the featured/asymmetric reflow, DEC-4) is a _mockup
only_, pending greenlight. The slop that remains is confined to the one screen whose populated state the
local mock can't render — so it's unverified rather than confirmed-fixed.

---

## 2. Per-surface grades + wins / remaining issues

| Surface              | Goal-13 | Goal-14                   | Key win                                                                                                                                                                                                        | Remaining issue                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing              | D+/D    | **A−/A−**                 | Dark zinc-900 hero, logo lockup, cyan "Quote-ready", spec card w/ outline + view chips, one dominant white CTA, product-voice copy. Kills centered-everything + flat bg.                                       | "Three honest steps" section is a clean 3-col card row with `—01/02/03` numerals — well-executed and not slop, but it _is_ a tri-grid; keep an eye on it. Footer is bare.                                                                                                                                                                         |
| Landing (mobile 390) | —       | **A−**                    | Intentional stack: dark hero → CTAs full-width → spec card → vertically-stacked steps. Logo + cyan hold up. Reads as a poster, not a reflowed doc.                                                             | Spec card drops below the fold; nav wraps to 2 lines (acceptable).                                                                                                                                                                                                                                                                                |
| Sign-up              | B−/B    | **B+**                    | Logo lockup, floated white card, black primary, "I run a wrap shop →" link.                                                                                                                                    | **Strength meter not verifiable** — AFTER shot is an _empty_ field showing a red ~12% bar + requirement hint and **no label**, so D13-6's bar/colour/label agreement can't be confirmed (see §3). An empty field showing a red partial bar is itself slightly odd. No cyan on the screen.                                                         |
| Verify / OTP         | ~6      | **A−**                    | Branded lockup, mono OTP-targeted email, full-width OTP input, "Verify" (disabled until entry), "Resend" as link. Clear, calm.                                                                                 | Disabled-Verify contrast is low-ish grey-on-grey (still AA for a disabled control). Vast empty viewport below the card.                                                                                                                                                                                                                           |
| Sign-in              | ~6      | **A−**                    | "Welcome back", logo lockup, single black primary, "Create one" link. Conventional and clean.                                                                                                                  | Zero cyan anywhere; the screen is pure grayscale. Lots of dead space below.                                                                                                                                                                                                                                                                       |
| Welcome              | C−/C    | **B+**                    | Left-aligned, "YOU'RE VERIFIED" eyebrow, "Choose your vehicle to start." headline, cyan "Step 1 of your wrap" rule, one primary CTA. Happy-talk "You're in." is gone.                                          | **Short of its own mockup**: no vehicle-outline spec card / visual, and the huge empty viewport below the card (the exact Goal-13 finding) **persists**. The single card still floats high in a vast field → partial close.                                                                                                                       |
| Catalogue            | C+/B−   | **A−**                    | **Dedup landed** (one request line, not two); progressive-disclosure hint "Make, model and trim unlock as you pick each one." added; token restyle.                                                            | **Short of its own mockup**: the warm **amber request card** and the per-select "Pick a year first" hints were not shipped — the empty state ("Pick a vehicle above…") is still bare prose. Disabled selects still read a touch broken despite the new hint.                                                                                      |
| Vehicle detail       | A−/A    | **A**                     | **"Start design" promoted to a real black filled primary button** (was a text link); "Choose a different vehicle" demoted to a link. AW template plate intact and gorgeous.                                    | Panels not grouped by view subheaders (moot here — this seed shows only 4 panels, not 15).                                                                                                                                                                                                                                                        |
| Editor               | A−/A    | **A−**                    | Pristine 3-zone layout; toolbar (Snap/Save/Submit) fully clear; "Start your wrap" coachmark; right inspector (UPLOAD/WRAP ZONE/SELECTION); "Design with AI" is now a black pill.                               | Tool-rail = 5 unlabeled mono icons (tooltips can't be seen in a static shot → Goal-13 MEDIUM may persist). Toast position not positively shown (no toast firing in this capture — see §3 D13-2).                                                                                                                                                  |
| Brief                | B/B+    | **B**                     | Pill stepper, autosave, black primary "Next", on-brand zone tiles.                                                                                                                                             | **NEW DEFECT: the Zones visual has oversized light-grey labels (Front/Driver/Passenger/Rear) clipped at both edges ("ront", "Rea") overflowing the container** — looks broken. Stepper still wraps to 2 rows; visited vs untouched pill states still hard to tell apart. AFTER set shows only the Zones step, so D13-3 (Logo step) isn't visible. |
| Generation           | C/C−    | **B− (empty state only)** | "No designs yet" empty state is branded + warm: wand icon, clear value copy, "Generate 3 concepts — uses 1 credit" primary, credits pill, "Review your brief first" link. A real lift over a bare empty state. | **The populated grid — the money screen — is unverifiable** (local mock won't render concepts). The shipped safe fixes (branded skeleton D13-4, boilerplate-once) can't be seen; the **symmetric tri-grid (blacklist #2) is still the shipped layout** and its featured-reflow fix is mockup-only (DEC-4, pending).                               |
| Refer                | —       | **A−**                    | "REFERRALS" eyebrow, "Give 2, get 2", cyan-bordered QR card, "Friends joined / Credits earned" stats (cyan figure), black "Copy". Cyan used well.                                                              | Referral link shows `http://localhost:3000/...` (local capture artifact, not prod).                                                                                                                                                                                                                                                               |
| Find-a-shop          | —       | **A−**                    | "PRINT & INSTALL" eyebrow, ZIP search, warm dashed empty state ("No partners in your area yet" + apologetic helpful copy), map CTA. Textbook warm empty state.                                                 | Store icon sits in a pale-cyan circle — borderline "icon-in-colored-circle" (#3); defensible as a single empty-state glyph using the brand tint, but watch it.                                                                                                                                                                                    |
| Dashboard            | —       | **A− (= projects)**       | Clean header, project card, "Refer a friend" + black "New project".                                                                                                                                            | **`12-dashboard.png` is byte-for-byte identical to `13-projects.png`** — the "dashboard" surface IS the projects list (mislabeled or duplicate capture). Flag, not a design defect.                                                                                                                                                               |
| Projects             | —       | **A−**                    | Same as above — eyebrow, "Your projects", project card with "Open", dual CTAs.                                                                                                                                 | Sparse (one seed card) → lots of empty space, but that's data, not design.                                                                                                                                                                                                                                                                        |

---

## 3. Defect-closure check (each Goal-13 defect, with screenshot evidence)

- **D13-2 — editor success toast no longer occludes Save → CLOSED (with caveat).**
  Goal-13 `23-editor-with-art.png` shows the green "Final design ready!" toast pinned **top-right, over
  "Save" and across the toolbar**. Goal-14 `07-editor.png` shows the toolbar (Snap / Save / Submit for
  production) **completely clear**. _Caveat:_ the AFTER capture is the empty/start state, so **no toast is
  firing** — I can confirm the toolbar is unobscured but I cannot _positively_ see the toast in its new
  bottom-right position. The plan + a clear toolbar are consistent with the fix; a fired-toast AFTER shot
  would have made this airtight. **Evidence: consistent, not conclusive.**

- **D13-3 — distinct logo "vector" copy → NOT VERIFIABLE in this set.**
  Goal-13 `10-brief-logo.png` shows the duplicated "vector file" language (hint "…or a vector file
  (SVG/AI/EPS) works best." + success verdict "Vector file — prints sharp at any size."). The Goal-14
  brief screenshot (`08-brief.png`) is the **Zones** step, not the **Logo** step — so the reworded verdict
  isn't in the AFTER set. **Cannot confirm from screenshots.** (Plan marks it FIX; needs a Logo-step shot.)

- **D13-4 — concept loading skeleton → PARTIAL / NOT VERIFIABLE (as expected).**
  Generation runs on the **local mock provider**, so the grid never populates — `09-generate.png` shows the
  empty "No designs yet" state only. The branded skeleton is presentational and shipped per the plan, but
  it **cannot be seen** here. Correctly scoped as partial (root-cause render-timing → Goal 15). **Deferred-verify.**

- **D13-5 — brand-forward landing/auth (the headline goal) → CLOSED.**
  The strongest result of the goal. Landing (`01-landing.png` + `01b` mobile) is now a dark, branded,
  asymmetric hero with logo, cyan, spec card, and product voice — a full jump from the documented flat
  D+/D. Auth (signup/verify/signin) all carry the logo lockup + "WRAP STUDIO" sub-label and float cleanly.
  **Evidence: conclusive.** (Auth is brand-_present_ but cyan-_absent_ — see the auth rows in §2.)

- **D13-6 — password strength meter agreement → NOT VERIFIABLE (and slightly suspect).**
  Goal-13 `02-signup.png` shows the contradiction: short **red** bar labelled **"Strong"**. Goal-14
  `02-signup.png` shows an **empty** password field with a red ~12% bar, the requirement hint
  ("12+ chars, 1 letter, 1 number, 1 symbol"), and **no strength label at all**. Because no password is
  typed, there's **no bar/colour/label trio to confirm now agree** — the exact thing D13-6 fixes is
  off-screen. Worse, a brand-new empty field rendering a red partial bar is itself a small oddity (arguably
  the meter should be empty/absent until input). **Cannot confirm the fix; the AFTER shot should have
  captured a typed-password state.** Highest-priority verification gap in this set.

- **D13-7 — catalogue dedup + vehicle-detail primary CTA → CLOSED (both).**
  _Catalogue:_ Goal-13 `05-catalogue.png` shows the duplicate ("Don't see your vehicle? Request it →"
  button **and** the prose "…Request it — we'll email you…"); Goal-14 `05-catalogue.png` shows **only the
  prose line** — duplicate gone, plus the new unlock hint. _Vehicle detail:_ Goal-13 `06` shows "Start
  design" as plain bold **text** beside "Choose a different vehicle"; Goal-14 `06` shows it as a **black
  filled primary button** with the other demoted to a link. **Evidence: conclusive for both.**

**Closure scoreboard:** 2 conclusively closed (D13-5, D13-7), 1 closed-with-caveat (D13-2),
1 not-verifiable-but-not-visible (D13-3), 2 not-verifiable-in-set (D13-4 expected, D13-6 _should_ have been).

---

## 4. AI-slop blacklist — landing + generation

**Landing (`01-landing.png`):**

- Centered-everything (#4) → **GONE.** Asymmetric two-column hero; copy + CTAs left, spec card right.
- Symmetric tri-grid (#2) → the "Three honest steps" row **is** a 3-col card layout, but it's a
  _secondary_ below-fold band with numbered `—01/02/03` eyebrows and real differentiated copy, not the
  hero, and not icon-in-circle. **Borderline-acceptable, not a hero slop tell.** Flag to watch.
- "Gave up on typography" / system font (#11) → **GONE.** Geist display + Geist Mono spec line + the
  UPPERCASE-tracked eyebrow device give real typographic personality.
- Accent-absent → **GONE.** Cyan on the headline word, the "Top 50…" bullet, the active "Driver" view chip,
  and the 1px top hairline.
- Generic hero copy (#9) → **GONE.** "Wrap your truck. Quote-ready in minutes." is product language.
- Icon-in-colored-circle (#3), blobs/orbs (#6), emoji (#7), colored left-border (#8) → none present.
- **Landing verdict: clears the blacklist.** First viewport reads as one composition; brand is the loudest element.

**Generation (`09-generate.png` empty state; populated grid unrenderable under the mock):**

- Symmetric 3-up card grid (#2) → **STILL THE SHIPPED LAYOUT** in the populated state (Goal-13 `20`
  confirms three identical columns with verbatim-repeated boilerplate). The fix (featured/asymmetric,
  `mockups/generation.png`) is **a mockup, not shipped.** This is the one remaining hero-level slop tell.
- Repeated boilerplate → the _empty_ state says it once cleanly; whether the populated cards still repeat
  it can't be seen. Plan says "say it once" — unverified.
- Accent-absent / system font / centered → the empty state is fine (branded, Geist, cyan-capable).
- **Generation verdict: the empty state clears; the populated grid's #2 tell is unresolved-and-unverified.**

---

## 5. Bolder / option-3 calls — recommendation for Archer

**(a) DEC-3 — landing `zinc-900` inverse hero band → SHIP IT (it already shipped; keep it).**
This is the highest-leverage change in the goal and it works. It's on-system (logo-on-black is sanctioned,
no third colour, not the separate `--awd-*` marketing surface), it closes D13-5 decisively, and it reads as
a confident automotive poster at both desktop and 390px. The dark band stops cleanly at the "Three honest
steps" light section — the transition is intentional, not jarring. **Recommendation: keep as shipped.** Only
nit: give the footer a hair more presence so the page doesn't end on a whisper.

**(b) DEC-4 — generation featured-concept layout → GREENLIGHT THE MOCKUP, then ship + re-screenshot.**
This pass correctly shipped only the _safe_ slop-fixes (branded skeleton + boilerplate-once) because the
populated grid can't render under the local mock — so the symmetric tri-grid (the #1 AI-slop tell on the
product's money screen) is still live. The `mockups/generation.png` featured layout is genuinely good: one
large RECOMMENDED concept (image-hero, "Send to editor" primary), two smaller stacked concepts (one with a
branded skeleton), boilerplate said once. It kills #2 and creates real "look here first" hierarchy.
**Recommendation: approve the mockup and land the featured reflow** — it's the difference between
generation grading B−/C-range and matching the rest of the app at A−. **Until it ships, this surface is the
ceiling-limiter on both grades.** Re-capture the populated grid against a real provider (or a seeded fixture)
so D13-4 and the de-slopped layout are actually evidenced, not asserted.

---

## 6. Remaining concerns (honest, not inflated)

1. **Verification gaps in the AFTER set.** Three of the seven defects (D13-2 toast position, D13-3 logo
   copy, D13-6 strength meter) are **not positively shown**. D13-6 is the worst offender — the AFTER signup
   shot captures an empty field, so the very bar/colour/label agreement the fix delivers is off-screen, and
   the empty-field red bar looks slightly wrong on its own. **Re-shoot signup with a weak _and_ a strong
   typed password, the editor with a fired toast, and the brief Logo step** before claiming these closed.
2. **Mockup-to-shipped shortfalls.** Welcome shipped without its vehicle visual and still has the
   huge-empty-viewport problem (the original Goal-13 finding only partially closed). Catalogue shipped the
   dedup + hint but **not** the warm amber request card from its mockup — its empty state is still bare
   prose. These aren't blockers, but the surfaces are short of their own targets.
3. **NEW defect on the brief Zones step:** oversized light-grey zone labels (Front/Driver/Passenger/Rear)
   are clipped at both edges and overflow the visual container — it reads as broken. This wasn't a Goal-13
   defect; it appears introduced or surfaced by the restyle. Fix before launch.
4. **Generation tri-grid still live** (see §4/§5) — the one hero-level AI-slop tell that survives.
5. **Auth surfaces are brand-present but cyan-absent** — signup/signin/verify are pure grayscale apart from
   the logo. A focus-ring or link-on-active cyan touch would finish the brand thread the rest of the app now carries.
6. **Baseline-fidelity** (see top caveat) and the **duplicate dashboard/projects capture** — housekeeping,
   not design, but they undermine the evidence trail; worth correcting in the screenshot set.

---

## Quick wins (<30 min each)

1. Re-screenshot **signup with a typed weak + strong password** to evidence D13-6 (and confirm the empty-field bar behaves).
2. Re-screenshot the **editor with the success toast firing** (bottom-right) to evidence D13-2, and the **brief Logo step** for D13-3.
3. Fix the **brief Zones label overflow** (clamp/size the Front/Driver/Passenger/Rear labels to their tiles).
4. Thread **cyan into the auth focus rings / active links** so signin/signup/verify aren't pure grayscale.
5. Greenlight + land the **generation featured layout** (DEC-4) and re-capture a populated grid against a real/seeded provider.
