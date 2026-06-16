# Goal 14 — D1 Plan-Design-Review + Restyle Spec

> **Dual purpose.** This is the D1 `plan-design-review` deliverable **and** the single
> restyle spec every worker reads — so nobody re-reads the 80 KB design-system skill.
> The source of truth remains `.claude/skills/alpha-wolf-design/`. Posture:
> **presentational-only, don't-break-anything** (see §2). Grades below are from the
> Goal-13 `design-review.md` (current) and the design system (target).

---

## 1. What already exists (reuse, do NOT rebuild)

- **Design system** (committed `origin/main` @ `777ed30`): `colors_and_type.css`
  (`--aws-*` app tokens), `README.md` (rules + voice), `ui_kits/wrap_studio/`
  (`components.jsx` primitives, `pages.jsx`, `editor.jsx`, `vehicle.jsx`, `index.html`
  prototype), 30 `preview/*.html` specimens, `fonts/Geist*.woff2`, `assets/logo.png`.
- **Strong app bones already shipped** (per Goal-13 review): editor 3-zone layout and
  vehicle-detail "AW template plate" both grade **A−/A** — KEEP these, restyle around
  them. Spacing is already on-scale. **axe = 0 violations on all 8 key pages** (the D5 floor).
- **shadcn primitives** in `packages/ui/src/components/ui/` (Button, Input, Label, Card,
  Dialog, Tabs, Skeleton, Popover, Tooltip, DropdownMenu, Separator, Sonner, …). cn() at
  `packages/ui/src/lib/utils.ts`.
- **THE KEY LEVER:** the Button/Input/Card cva's already reference semantic CSS vars
  (`--primary`, `--primary-foreground`, `--ring`, `--destructive`, `--border`, `--accent`,
  `--muted`, `--background`, …) — but `apps/web/app/globals.css` **never defines them**
  (it's just `@import "tailwindcss"` + one `@source`). **Defining those vars (mapped to
  `--aws-*`) restyles every primitive on-brand with ZERO component-code change** — the
  safest possible path through the don't-break gate.

## 2. NOT in scope (deferred — stated so nothing is silently assumed)

- **Marketing site** (separate repo, dark `--awd-*` palette). App uses `--aws-*` only.
- **Functional defects → Goal 15:** D13-1 parse-worker/Upstash infra; AI design not
  matching brief; customer logo never composited onto vehicle views; raster fragments in
  zones; concept-preview **render-timing root cause** (we add only a branded skeleton);
  single-rear-view export logic.
- **Untouchable code:** Konva canvas / `VehicleLayer` / `VehicleArtLayer` / `ArtworkLayer` /
  `OverlayLayer` / element nodes / zones-snapping / autosave; server actions, data fetching,
  route handlers, auth, RLS; **export COMPUTATION** (what `spec-pack.ts` includes/computes —
  styling only). No Stripe.
- Component **APIs/props do not change** — restyle in place so callers are untouched.

## 3. Distilled `--aws-*` token + rule cheatsheet (the app surface)

**Surfaces:** page `zinc-50 #FAFAFA` · app-shell `zinc-100 #F4F4F5` · canvas `zinc-200 #E4E4E7`
· card `#FFFFFF` · inverse `zinc-900 #18181B`.
**Text:** strong `zinc-900` · default `zinc-800` · muted `zinc-600` · subtle `zinc-500` · faint `zinc-400`.
**Border:** `zinc-200 #E4E4E7` (chrome) · strong `zinc-300 #D4D4D8` (outline buttons/inputs).
**Action (primary):** `bg zinc-900` → hover `zinc-800`, fg white. **ONE primary per screen.**
**Accent (cyan):** `#00AEEF` (`--aws-accent`) — sparingly: wolf mark, hover/focus accent borders,
"AI thinking" bar, selected-zone fill, links on dark. **Never a button fill. Soft = `rgba(0,174,239,.10)`.**
**Status:** success `#059669`/bg `#ECFDF5`/bd `#A7F3D0`/fg `#064E3B`; warning `#92400E`/`#FFFBEB`/`#FDE68A`/`#78350F`;
danger `#DC2626`/`#FEF2F2`/`#FECACA`/`#7F1D1D`.
**Strength meter (5-step, single source):** `0 #EF4444 Too weak · 1 #F97316 Weak · 2 #EAB308 Okay · 3 #84CC16 Strong · 4 #10B981 Excellent` (= Tailwind red/orange/yellow/lime/emerald-500; bar width `(score+1)*20%`).
**Radii:** buttons/inputs/selects/badges `rounded-md 6px` · cards/dialogs/vehicle cards `rounded-xl 12px` · pills/avatars/dots `rounded-full`. **No `rounded-2xl`+.**
**Shadows:** `xs` inputs · `sm` cards-at-rest + primary buttons · `md` cards-on-hover. No inner/glow.
**Type:** Geist Sans UI; Geist Mono for IDs/SKUs/inches/panel labels/kbd. H1 `text-2xl semibold`;
body `text-sm`; caption `text-xs`. **No display-scale type in-product.**
**Eyebrow (signature device):** `text-xs uppercase font-medium tracking-[0.10em] text-zinc-500` (grey, not cyan).
**Spacing:** 4px base; `gap-4` between form controls, `gap-8` between page sections; card padding `px-6 py-6` (24px).
**Containers:** forms `max-w-2xl`, lists `max-w-5xl`, admin `max-w-6xl`. Centered, capped — no full-bleed in-product (the landing hero band is the one sanctioned exception, see DEC-3).
**Buttons:** sentence case, h-36px (`default`), `rounded-md`; primary darken on hover (never lighten); outline washes `zinc-50/100`; ghost washes `zinc-100`; link underline offset 2px; focus-visible `ring-[3px] ring-zinc-200/65 border-ring`; **no scale-95 press.**
**Cards:** white, `rounded-xl`, `border zinc-200`, `shadow-sm`, `px-6` `gap-6`; title `font-semibold leading-none`, desc 8px below; hover `shadow-md`; **empty-state = `border-dashed` + center.**
**Icons:** Lucide, stroke-only, `size-4` inline / `size-5` tool-rail / `size-3.5` dense; status icons colored (Check `emerald-600`, `Loader2 animate-spin`, red failure); tooltip on every icon-only button.
**Animation:** restrained — `transition` on color/shadow ~150ms; the only motion exception is `Loader2` spin. No springs/entry anims.
**The one palette break:** the amber "request this vehicle" empty-state card (`amber-50/200/900`).

### Hard rules (governs everything)

No third color beyond cyan · **no emoji anywhere** · no invented radii/spacing (round to tokens) ·
logo = place `assets/logo.png` ONLY on black or white surface, never re-set as type, never crop the drop-shadow ·
Geist variable axis 100–900 (one face) · voice operational/two-clause, sentence case, UPPERCASE eyebrows, curly quotes, em-dash hair-space, `…` single char, `→` link CTAs.

## 4. Canonical Goal-13 defect map (corrected numbering)

> The prompt's D3/DoD garbled the D13-6/7 numbers. Authoritative source =
> `findings-and-defects.md`. This is the map used in all reporting.

| ID    | What                                                                                   | Class         | Disposition (Goal 14)                                                             |
| ----- | -------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| D13-1 | Photo parse-worker hang (Upstash noeviction)                                           | infra         | **Goal 15** (out)                                                                 |
| D13-2 | Editor success-toast occludes Save/Submit                                              | design        | **FIX** — toast z-order/offset below toolbar (also WCAG 2.2 _Focus Not Obscured_) |
| D13-3 | Duplicated "vector file" copy on logo step                                             | copy          | **FIX** — reword success verdict distinct from hint                               |
| D13-4 | Concept previews render empty on cards                                                 | render-timing | **Partial** — add branded skeleton (presentational); root cause → Goal 15         |
| D13-5 | Landing/welcome/auth brand-less (~95% grayscale)                                       | design        | **FIX** — the headline of this goal                                               |
| D13-6 | Password strength meter bar/color/label disagree                                       | design        | **FIX** — single-source score → bar+color+label                                   |
| D13-7 | Catalogue dup "Don't see your vehicle?" + vehicle-detail "Start design" is a text link | design        | **FIX** — dedupe + promote to primary button                                      |

## 5. Per-surface ratings (current → target) + restyle plan

Rating method: 0–10 vs the design system. `<7` = needs a 10/10 mockup (§9). Posture:
**S**urgical (default) / **B**older (option-3, flag for Archer).

| #   | Surface                          | File(s)                                                                                                | Current (D/AI) | →Target | Posture         | Plan / defects closed                                                                                                                                                           |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------- | ------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Landing**                      | `app/page.tsx`                                                                                         | D+/D ≈ **3**   | A−/A    | **B**           | zinc-900 inverse hero band + white logo + vehicle-outline visual + selective cyan + product-voice copy + one dominant CTA; kill centered-everything. **D13-5.** _(DEC-3, flag)_ |
| 2   | **Signup + auth shell**          | `components/auth/SignupForm.tsx`, `(auth)/signup`, `signup-shop`                                       | B−/B ≈ **6**   | A−      | S               | token+primitive restyle floats the card; **fix strength meter (D13-6)**; thread cyan into focus/active; logo lockup on a thin zinc-900 band.                                    |
| 3   | **Verify / OTP**                 | `(auth)/verify`, `VerifyForm`                                                                          | ≈ **6**        | A−      | S               | match auth; mono `tracking` OTP input; resend as ghost/link.                                                                                                                    |
| 4   | **Sign in**                      | `(auth)/signin`, `SignInForm`                                                                          | ≈ **6**        | A−      | S               | match auth shell.                                                                                                                                                               |
| 5   | **Welcome**                      | `app/welcome/page.tsx`, `welcome/shop`                                                                 | C−/C ≈ **4**   | B+      | S→light-B       | confident branded welcome, left-align, vehicle visual, lead with "Choose your vehicle", cut "You're in." happy-talk.                                                            |
| 6   | **Catalogue / select**           | `vehicles/select`, `VehicleBrowser`                                                                    | C+/B− ≈ **6**  | A−      | S               | **dedupe "Don't see your vehicle?" (D13-7)**; progressive-disclosure hint on locked Make/Model/Trim; warm empty state (amber request card); token restyle.                      |
| 7   | **Vehicle detail**               | `vehicles/[id]`                                                                                        | A−/A ≈ **8**   | A       | S (keep)        | **promote "Start design" → primary filled button (D13-7)**; group 15 panels by view; carry dark/cyan plate language outward.                                                    |
| 8   | **Brief wizard (11 steps)**      | `components/brief/*`, `BriefWizard.tsx`                                                                | B/B+ ≈ **7**   | A−      | S               | clearer stepper progress (numbered/visited state); color-"role" label + inline SKU; **reword logo success (D13-3)**; token restyle.                                             |
| 9   | **Generation studio**            | `projects/[id]/generate`, `GenerationStudio`                                                           | C/C− ≈ **4**   | A−      | **B**           | featured strongest concept (asymmetric, not symmetric tri-grid); image-hero cards + **branded skeleton (D13-4)**; say boilerplate once. _(DEC-4, flag)_                         |
| 10  | **Editor chrome**                | top bar / tool rail / inspector shells, `EditorMount`, `SubmitDialog`, `UploadPanel`, `AiDesignButton` | A−/A ≈ **8**   | A       | S (chrome only) | **toast z-order below toolbar (D13-2)**; tool-rail tooltips; warm "nothing selected" inspector. **NO canvas/render/zones.**                                                     |
| 11  | **Export PDF**                   | `lib/export/spec-pack.ts`                                                                              | (clipping)     | clean   | S (style only)  | fix Logo-column truncation/clip + column widths + page-4 sparse spacing. **No compute change.**                                                                                 |
| 12  | **Share-for-feedback**           | `(public)/share/[token]`                                                                               | —              | A−      | S               | brand the public page, token restyle, one strong primary, warm.                                                                                                                 |
| 13  | **Referral**                     | `app/refer`, `ReferralPanel`                                                                           | —              | A−      | S               | token restyle, brand give-2/get-2, QR card to system.                                                                                                                           |
| 14  | **Locator**                      | `find-a-shop`, `ShopLocator`                                                                           | —              | A−      | S               | token restyle, warm empty state.                                                                                                                                                |
| 15  | **Dashboard / account**          | `app/dashboard`, order detail                                                                          | —              | A−      | S               | token restyle; status badges → system status palette; order queue cards.                                                                                                        |
| 16  | **Global empty states + toasts** | sonner host in `layout.tsx`; ad-hoc empties                                                            | —              | A−      | S               | every empty state: warmth + primary action + context; sonner restyled to system tokens.                                                                                         |

## 6. Cross-cutting 7-pass review (system level — most fixes are token/primitive)

1. **Information Architecture — 7/10.** Bones strong (editor 3-zone, detail plate). Gap:
   landing has no hierarchy (3 equal-weight things); generation tri-grid gives no "look here
   first." Fix: one dominant CTA on landing; featured concept in studio. → 9.
2. **Interaction states — 6/10.** Loading/success exist; **empty states are bare** (welcome,
   catalogue, "nothing selected" inspector) and the concept card has no skeleton. Fix:
   warm every empty state (philosophy #1) + branded skeleton for concepts (D13-4). → 9.
3. **User journey / emotional arc — 6/10.** First-impression (landing/welcome) is flat → the
   5-second visceral read fails; the money moment (concepts) lands empty. Fixing #1/#9 repairs
   the arc's two lowest points. → 9.
4. **AI-slop risk — 5/10.** Tells present: centered-everything landing (#4), symmetric
   3-up concept grid (#2), system font / "gave up on typography" (#11), accent absent. Fix:
   Geist wired (DEC-2), cyan threaded, landing de-centered, concept grid broken. → 9.
5. **Design-system alignment — 9/10.** A real committed system exists and the app's primitives
   already point at its (undefined) vars. Just wire them (D2). No new vocabulary invented.
6. **Responsive & accessibility — 8/10.** axe already 0. Hold the line + WCAG 2.2 AA new
   criteria: target-size ≥24px (buttons h-36 ✓), **Focus-Not-Obscured (D13-2 toast fix satisfies it)**,
   consistent-help, contrast on cyan-on-white text (cyan is accent/icon, not body — keep AA).
   Per-viewport: landing band stacks intentionally at 375px (not just "stacked").
7. **Unresolved decisions** → §8 (flagged for Archer) + §7-decisions logged below.

## 7. Decisions log (D1 — chosen per the no-ask policy; notable ones flagged in §8)

- **DEC-1 — Accent = `#00AEEF`.** Canonical (`--aws-accent` + Archer's confirmed decision).
  The app's stray chrome cyan `#35B6E8` aligns to `#00AEEF`. Brief **wrap-color samples**
  (e.g. a `#35b6e8` swatch the customer picks) are _content_, left untouched.
- **DEC-2 — Wire Geist (it is NOT currently wired — verified: no `geist` dep, no `next/font`,
  no `@font-face`).** Add `geist@^1` + `next/font` in `layout.tsx` (matches the system's locked
  `geist@1.7.0`, `font-display: optional`). New-dep rationale: the design-system-mandated typeface.
- **DEC-3 — Landing bolder = on-system `zinc-900` inverse hero band** (uses `--aws-bg-inverse`;
  logo-on-black is explicitly sanctioned). This is NOT the dark `--awd-*` marketing surface and
  introduces no third color — it stays in the app's light/zinc system. **Flag for Archer.**
- **DEC-4 — Generation studio bolder = featured strongest concept** (asymmetric) replacing the
  symmetric tri-grid. **Flag for Archer.**
- **DEC-5 — D13-4:** add a branded skeleton only (presentational); the render-timing root cause
  is functional → Goal 15.
- **DEC-6 — Restyle via CSS-var definition** (`--primary` etc. → `--aws-*`) so primitive code /
  props never change (don't-break-safe).
- **DEC-7 — Use canonical D13 numbering** (findings-and-defects.md), not the prompt's garbled D3/DoD.
- **DEC-8 — a11y bar = maintain 0 axe violations** + WCAG 2.2 AA; re-run axe on every restyled page (D5).
- **DEC-9 — Welcome stays a distinct step** (the Goal-13 "fold into catalogue" idea is a _flow/
  routing_ change → crosses the don't-break gate). Restyle only.

## 8. Genuine choices flagged for Archer (sign-off in the final report)

- **A — Landing zinc-900 inverse hero band** (DEC-3). _Recommended._ Why: closes D13-5
  decisively, gives the brand a loud first impression, stays on-system (logo-on-black sanctioned,
  no third color, not the separate marketing surface). Alt: fully-surgical light kit-style home
  (safer, but leaves the worst surface only marginally better).
- **B — Generation "featured concept" layout** (DEC-4). _Recommended._ Why: kills the #1
  AI-slop tell (symmetric tri-grid) and creates hierarchy on the money screen. Alt: keep three
  equal cards, just add previews + skeleton (less slop-fixing).
- **C — Export "moment" polish.** Kept **surgical** (order-confirmed page brand touch only);
  the PDF itself is template-styling-only. Noted in case Archer wants a bolder export celebration.

## 9. 10/10 mockups (for surfaces <7 — rendered on the real design CSS)

Generated to `docs/goal-14/mockups/` (see D1 mockup pass). Strong surfaces (vehicle-detail,
editor — both A−) reference the kit's `ui_kits/wrap_studio/pages.jsx` + `editor.jsx` as their
10/10 and need no new mockup.

| Surface                             | Mockup                   |
| ----------------------------------- | ------------------------ |
| Landing (bolder, DEC-3)             | `mockups/landing.png`    |
| Welcome                             | `mockups/welcome.png`    |
| Generation studio (featured, DEC-4) | `mockups/generation.png` |
| Catalogue warm empty                | `mockups/catalogue.png`  |
