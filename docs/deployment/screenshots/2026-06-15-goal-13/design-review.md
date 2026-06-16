# Design + AI-Slop Review — Alpha Wolf Wrap Studio (Goal 13 E2E journey)

Reviewer: design-review skill rubric (10-category checklist + AI-slop blacklist, Jun 2026 vintage).
Source: real shipped end-to-end journey, screenshots in `2026-06-15-goal-13/`.
Brand context: black / white / cyan `#35B6E8`, aggressive/bold automotive aesthetic.

## TL;DR

This is a **competent, calm, functional product that has almost no brand on it.** The
app surfaces (editor, vehicle detail, brief wizard) are honestly good — real layouts,
not card mosaics, with genuinely strong domain chrome (the AW vehicle-template plate).
The marketing/onboarding surfaces (landing, welcome) are the weak link: centered-
everything, flat off-white, zero logo, generic copy. The single most damaging fact:
for a brand defined as **black/white/cyan + aggressive automotive**, the rendered UI is
~95% grayscale and reads as a generic SaaS starter. With the logo removed you could not
identify this brand — that is the AI-slop distinctiveness test, and it fails.

The good news: the bones are strong and almost every issue is a skin/accent problem,
not a structural one.

---

## Per-surface grades + issues

### 1. Landing (`01-landing.png`)

**Design: D+ · AI-Slop: D**

Classifier: MARKETING/LANDING. This is the brand's first impression and it is the
worst surface in the journey. It violates the landing rules almost line by line: flat
single-color off-white background (rule: no flat backgrounds), centered-everything
(blacklist #4), no full-bleed composition, no visual anchor, no image, and no brand
presence beyond a text wordmark. Squint test: there is nothing to see — it reads as a
config dialog, not a poster. First three things the eye hits: the H1, the two buttons,
the footer — which is _all there is_. Trunk test for "what is this brand": FAIL.

Highest-value issues:

1. **No brand, no anchor, flat background (HIGH).** For an aggressive automotive brand,
   the hero has no vehicle, no wrap imagery, no logo lockup, no cyan. Add a full-bleed
   dark hero with a wrapped-vehicle hero shot and the AW mark; make the wordmark the
   loudest element. Right now it could be any SaaS.
2. **Generic hero copy (HIGH).** "Design or print a vehicle wrap." is blacklist-tier
   filler — it describes the mechanic, not the value. Replace with product language
   ("Wrap your truck. Quote-ready in minutes.") and let the headline carry the brand
   voice.
3. **Centered-everything + weak CTA hierarchy (MEDIUM).** Both CTAs sit at the same
   visual weight as the footer links; "Browse vehicles / Sign in" competes with the two
   primary buttons. Establish one dominant CTA, demote the rest.

### 2. Sign-up / auth (`02-signup.png`)

**Design: B- · AI-Slop: B**

A clean, conventional card form — fundamentally fine. The "ALPHA WOLF / Wrap Studio"
stacked lockup is the most brand-forward moment in the whole journey, ironically on the
auth page. Card is well-spaced, the password strength meter is a nice touch.

Highest-value issues:

1. **Strength meter contradicts itself (MEDIUM).** The bar is short + red but the label
   says "Strong". Either the color (red = weak) or the word is wrong. This is a trust
   ding on the exact screen where you ask for a password. Fix the mapping: full + green
   = Strong.
2. **Flat off-white field/page on white card (POLISH).** The page bg and card are nearly
   the same value, so the card barely floats. Add a touch more elevation/contrast or a
   subtle dark brand band at top.
3. No cyan anywhere; the only color on the screen is the (mis-signalled) red bar.

### 3. Welcome (`04-welcome.png`)

**Design: C- · AI-Slop: C**

Functional but thin and oddly empty. A single centered card on a vast flat field. The
"Your design starts on an accurate vehicle outline." line inside the card is happy-talk
adjacent and the card content is center-aligned (blacklist #4).

Highest-value issues:

1. **One small card in a huge empty viewport (MEDIUM).** Massive dead space below. Either
   make this a confident full-width welcome with a vehicle visual, or fold it into the
   catalogue and skip a step (the goodwill reservoir rewards step-saving).
2. **"You're in." + sub-copy is happy talk (MEDIUM).** Cut to the action — the only job
   of this screen is "Choose your vehicle", so lead with that.
3. Centered card content; left-align for scannability.

### 4. Catalogue / vehicle picker (`05-catalogue.png`)

**Design: C+ · AI-Slop: B-**

Honest, utilitarian search+filter layout — appropriate for the task (APP UI rules). The
"Typo-tolerant" helper and "Pick your exact year/make/model" copy are genuinely useful.
But it's visually inert and has a real content bug.

Highest-value issues:

1. **Duplicate "Don't see your vehicle?" (HIGH — content).** The line appears twice
   back-to-back ("Don't see your vehicle? Request it →" then "Don't see your vehicle?
   Request it — we'll email you…"). One is a button, one is prose. Pick one; this looks
   unfinished.
2. **Disabled selects read as broken (MEDIUM).** Make/Model/Trim are greyed before Year
   is picked, with no visual cue that they unlock sequentially. Add a hint or progressive
   disclosure so the empty state doesn't look like a bug.
3. Empty state below the filters ("Pick a vehicle above or search to begin.") is bare —
   a small vehicle illustration or popular-makes shortcuts would warm it and save a step.

### 5. Vehicle detail — X3 (`06-vehicle-detail-x3.png`)

**Design: A- · AI-Slop: A**

The best non-editor surface. The AW vehicle-template plate (dark header bar, template ID
`AW-TPL-0001`, scale 1:20, "REFERENCE ONLY — NOT FOR REDISTRIBUTION") is a real,
distinctive, ownable brand asset — exactly the kind of thing AI slop never produces.
Spec line (`4708 × 1891 × 1676 mm · 4-view · Scale 1:20`) signals genuine domain
competence. The 15-panel list is clean and scannable with consistent right-aligned
`zone · finish` metadata.

Highest-value issues:

1. **"Start design" looks like a text link, not the primary CTA (MEDIUM).** It sits as
   plain bold text next to "Choose a different vehicle" with equal weight at the very
   bottom. This is the money action — make it a real filled button and lift it.
2. **Panel list is long and uniform (POLISH).** 15 identical rows; grouping by view
   (front / driver / back / passenger) with subheaders would aid scanning.
3. The dark template plate is the one place the brand breathes — push that dark/cyan
   language up into the rest of the chrome.

### 6. Editor — empty / art / zone / AI dialog (`07`, `23`, `24`, `25`, `26`)

**Design: A- · AI-Slop: A**

Classifier: APP UI — and it nails the app-UI rules: real three-zone layout (left tool
rail, center canvas, right inspector), calm surface, minimal chrome, one workspace. Not a
card mosaic. The right-rail inspector (Zone / View / Area `0.31 m² · 3.3 ft²` / Finish
Gloss) is exactly the "secondary context" the rules ask for. The empty-state "Start your
wrap" coachmark with Text / Shape / Design-with-AI is a textbook good empty state
(message + actions). The selected hood zone highlighting in cyan (`24`) is the rare,
correct, on-brand use of the accent. Applied art (`26`) renders convincingly on all four
views.

Highest-value issues:

1. **Toast overlaps the top toolbar (HIGH).** The green "Final design ready!" toast sits
   directly on top of Save / Submit-for-production in `23`/`24`/`25`, partially obscuring
   both. A success message must not occlude primary actions — move it below the toolbar or
   inset it.
2. **Left tool rail icons are unlabeled and ambiguous (MEDIUM).** Five mono icons with no
   labels/tooltips visible; select vs. shape vs. image vs. frame aren't self-evident
   (don't-make-me-think). Add tooltips or labels.
3. **"Nothing selected" inspector is bare (POLISH).** When nothing is selected the rail is
   mostly empty; a hint graphic or "click a panel" affordance would fill it. (`24` already
   does this well once a zone is picked — carry that warmth to the empty state.)

### 7. Brief wizard — logo / colors / style / tint / review (`10`, `11`, `12`, `15`, `18`)

**Design: B · AI-Slop: B+**

The strongest _flow_ in the product. Pill-tab stepper across the top is clear, "Saving…"
autosave is reassuring, and the domain content is excellent: real film SKUs (`3M 2080-G12`),
"Pull colors from my logo", per-state legal tint VLT checks ("Meets Georgia's 32%+ VLT
minimum") — this is deep, credible, non-generic. The Review screen is a clean spec table.
This flow is where the product's expertise shows.

Highest-value issues:

1. **Tabs wrap to two rows and the active state is subtle (MEDIUM).** 11 pills wrap; the
   active pill (black fill) reads okay but the in-progress/visited pills (faint grey fill)
   are nearly indistinguishable from untouched ones. Add a clearer progress treatment
   (numbered steps, or a progress bar) so users know where they are — wayfinding.
2. **Color rows: `role…` select is unexplained + tiny swatch (MEDIUM).** The "role…"
   dropdown next to each hex has no label/help; users won't know what a color "role" is.
   And the hex is shown as raw `#35b6e8` mono text — fine, but pair it with the film-SKU
   match inline so the anchoring story ("anchor to a real film SKU") is visible at the row.
3. **Tint swatches are visually identical across the three window groups (POLISH).** Three
   stacked rows of the same 5%–70% chips; the only differentiator is the heading. Consider
   collapsing to one control with per-window toggles, or visually distinguish "no tint"
   rows. The legal-VLT callout is the hero here — keep it.

### 8. Generation studio — three concepts + final (`20`, `22`)

**Design: C · AI-Slop: C-**

Classifier: HYBRID leaning APP. This is the product's headline feature and the screenshot
(`20`) undersells it badly. The layout is a literal **3-column card grid** (blacklist #2,
the single most recognizable AI layout) — and on `20` the cards show **no preview image
at all**: just a title, a 2-line description, "Drag to compare with the blank vehicle"
(referencing a preview that isn't rendered), refine chips, and a CTA. The most important
thing on the most important screen — the actual generated wrap — is missing from the
view. `22` (zoomed out) _does_ show the rendered concepts, so this is a render/loading
state issue on `20`, but as shipped it's the make-or-break moment landing flat.

Highest-value issues:

1. **Concept previews not visible on the primary view (HIGH).** Whether it's a slow image
   load or a layout bug, `20` shows three text cards where three rendered vehicle wraps
   should dominate. The image must be the hero of each card — title/description/chips are
   secondary. Until the preview renders, show a branded skeleton that matches the final
   image shape (not a blank card).
2. **3-identical-column card grid (MEDIUM, AI-slop).** Three symmetric cards with
   identical chip sets ("More aggressive / Less busy / Brighter colors…") repeated 3× is
   textbook slop rhythm. Differentiate: make the recommended/strongest concept larger or
   featured, or stack them with big previews instead of a symmetric tri-grid.
3. **Repeated boilerplate in every card (MEDIUM).** "Drag to compare with the blank
   vehicle. Previews are watermarked until you pick a final." is duplicated verbatim in
   all three cards. Say it once above the grid. (Omit, then omit again.)

---

## Inferred design system (rendered, not claimed)

- **Type:** single sans throughout — reads as Inter/system-ui (flag: blacklist #11, the
  "gave up on typography" signal). No display face anywhere. For an "aggressive/bold
  automotive" brand this is a major miss — there's no condensed/industrial face to carry
  attitude. The only typographic personality is the letter-spaced "ALPHA WOLF" eyebrow.
- **Color:** ~95% grayscale (black, white, ~3 greys). Cyan `#35B6E8` appears in exactly
  three places (selected zone fill, a color swatch, the logo SVG). Red shows up only as
  the (mis-signalled) password bar. The brand's defining accent is effectively absent from
  all chrome.
- **Radius:** consistent ~6–10px rounded rects everywhere — leans toward the uniform-radius
  slop tell (#5), though not egregious.
- **Background:** flat off-white `#FAFAFA`-ish on every page (violates "no flat single-color
  backgrounds" for the marketing surfaces).
- **Spacing:** consistent and on-scale — this is genuinely good. Vertical rhythm is clean.

Distinctiveness check (logo removed, could you ID the brand?): **No** on landing/welcome/
auth; **Yes** on vehicle-detail/editor (because of the AW template plate). The product's
identity lives entirely in one asset.

---

## OVERALL

### Design grade: **B−**

Strong app-UI bones, excellent domain depth, clean spacing — dragged down by a
brand-less marketing/onboarding front door and a headline feature (concepts) that
presents flat. The floor is the landing page; the ceiling is the editor.

### AI-Slop grade: **C+**

Verdict: _"Not slop where it counts, but slop where it's seen first."_ The editor and
brief flow are the opposite of generic. But the landing (centered-everything, flat bg,
generic copy), the 3-up concept grid, and the near-total absence of the brand's own
colors keep this from clearing the distinctiveness bar. Paint the brand on and ship the
concept previews and this jumps to a B+.

---

## Prioritized top-5 fixes

1. **Render the concept previews on the studio page (`20`).** The generated wrap must be
   the hero of each card; show a branded skeleton in the final image's shape while loading.
   This is the product's whole value prop landing flat. (HIGH)
2. **Give the landing a real brand-forward hero.** Full-bleed dark composition, wrapped-
   vehicle hero shot, loud AW wordmark, cyan accent, and product-language copy replacing
   "Design or print a vehicle wrap." Kill centered-everything. (HIGH)
3. **Fix the toast overlapping Save / Submit-for-production in the editor.** Move it below
   the toolbar so it never occludes primary actions. (HIGH)
4. **Fix the password strength meter (`02`): red+short must not say "Strong."** Map color
   and label to the same scale. Trust ding on the password screen. (HIGH)
5. **Remove the duplicate "Don't see your vehicle?" line on the catalogue, and promote
   "Start design" on the vehicle-detail page from a text link to a real primary button.**
   Two small fixes that make the core path feel finished. (MEDIUM)

**Bonus quick win (<5 min):** thread cyan `#35B6E8` into active tabs, primary buttons,
and focus rings across all surfaces — the brand accent currently appears almost nowhere,
and using it is free distinctiveness.
