# Alpha Wolf Decals — Design System

A design system extracted from **Alpha Wolf Decals** — a Salem, Oregon vinyl-wrap, window-tint, paint-protection-film, and signage shop, and from its in-development product **Alpha Wolf Wrap Studio**, an AI-assisted vehicle wrap design and production platform.

This system gives a design agent (or a human designer) everything needed to build:
- New product surfaces inside the Wrap Studio app (editor, dashboards, admin).
- Marketing pages for the parent **alpha-wolf-decals** site.
- Print collateral, slide decks, and one-off pitches that read as on-brand.

---

## Sources used to build this system

| Source | What was read |
| --- | --- |
| `uploads/logo.png` | The Alpha Wolf Decals sticker logo (cyan + black + white). The brand cyan **#50C0F0** was sampled directly from this file. |
| `uploads/fonts.ts` | Locks the type stack to **Geist** (sans, variable) and **Geist Mono** (variable) at `geist@1.7.0`. Includes a `font-display: optional` rationale. |
| GitHub: [`archerverified/alphawolfedecals-app`](https://github.com/archerverified/alphawolfedecals-app) | The product monorepo. `prd.md` (53 KB) for product intent and brand direction; `apps/web/` for the shipped Next.js implementation; `packages/ui/` for the shared shadcn/ui kit. |

You can explore the monorepo further to see component implementations, server actions, and the canvas editor architecture — they're a far richer reference than this distilled system alone.

> **Note on conflicting brand direction.** PRD §5.4 specifies "Alpha Wolf red **#E41E26**, deep black surfaces, lime-green accent reserved for confirmation/success states only." The shipped app does **not** implement that — it uses zinc-neutral chrome with black actions, and the Alpha Wolf Decals **sticker logo** (the only brand mark we have) is cyan + black, not red.
>
> This system codifies what's **shipped** (zinc + black + cyan accent from the logo), and flags the PRD's red-themed aspirations as an alternate token set in `colors_and_type.css` comments. **Please confirm the canonical direction.**

---

## The two products

Alpha Wolf is effectively two surfaces that share one brand:

1. **Alpha Wolf Decals** — the parent shop's customer-facing storefront / marketing site (alpha-wolf-decals.vercel.app). Sells wraps, tint, PPF, signage. The codebase doesn't include this site, only the logo lives here.
2. **Alpha Wolf Wrap Studio** — the SaaS platform under development. Two-sided: end customers describe a vehicle wrap and get photoreal mockups; wrap shops receive those projects and export print-ready panel PDFs. This is what the codebase actually builds.

The shipped UI is **all Wrap Studio**. The marketing storefront is out of scope of the codebase, so the **UI kit** in this design system targets the Wrap Studio surface.

---

## File index (manifest)

```
.
├── README.md                       ← this file
├── SKILL.md                        ← Agent Skills entrypoint
├── colors_and_type.css             ← tokens: colors, type, spacing, radii, shadows
├── assets/
│   └── logo.png                    ← the master Alpha Wolf Decals sticker logo
├── fonts/
│   ├── Geist-Variable.woff2        ← from geist@1.7.0
│   └── GeistMono-Variable.woff2    ← from geist@1.7.0
├── preview/                        ← Design System tab cards (one HTML per concept)
├── ui_kits/
│   └── wrap_studio/                ← Wrap Studio recreations
│       ├── README.md
│       ├── index.html              ← interactive prototype of the core flow
│       └── *.jsx                   ← Header, Button, Card, VehicleBrowser, etc.
└── uploads/                        ← original input files (untouched)
```

---

## CONTENT FUNDAMENTALS

Voice is built for two audiences: a non-designer fleet manager who's never priced a wrap, and a pro shop owner who knows exactly which printer profile they're loading. Copy has to land cleanly with both.

### Voice & tone
- **Direct and operational.** No marketing fluff. The home page literally reads "Design or print a vehicle wrap." That sentence is the brand.
- **Second person, present tense.** "Pick up where you left off." "Choose your vehicle." "Your design starts on an accurate vehicle outline." Sometimes first-person identifies the user role: "I'm a customer." / "I run a wrap shop."
- **Pragmatic, never aspirational.** Don't promise "your vision, realized." Promise "an accurate, wrap-safe outline" and "panels labelled and laid out."
- **Confident, low ceremony.** Confirmation copy is one word ("Saved") with a check, not "Your changes have been saved successfully!"
- **Domain-specific where it matters.** Surface real terms — "wrap-safe zone", "panel breakdown", "bleed", "linear feet", "Latex 700" — when the context warrants it. The pro audience trusts a system that uses their vocabulary.

### Casing
- **Sentence case** for everything that's a sentence — buttons, titles, descriptions. "Start a new project", not "Start A New Project".
- **UPPERCASE TRACKING-WIDEST** for *eyebrow labels* over headers — section IDs like `ALPHA WOLF WRAP STUDIO`, `CONFIGURATION`, `UPLOAD`, `SELECTION`. This is the system's signature device.
- **Title case** is avoided. Even `H1`s like "Your projects" are sentence case.

### "I" vs "you"
- The system speaks to the user as **"you"**. The user identifies themselves with **"I"** ("I'm a customer / I run a wrap shop"). Never "we" except in transactional confirmations ("we'll email you when the template ships").

### Punctuation & typographic detail
- **Curly quotes and apostrophes** in product copy (`'`, `'`, `"`, `"`), straight in code.
- **Em-dashes with hair-space** for asides — like this — never spaced hyphens.
- **Ellipsis as a single character** (`…`) on loading states: "Saving…", "Creating account…", "Creating…".
- **Right-arrow as character** (`→`) in call-to-action links: "Don't see your vehicle? Request it →".

### Emoji
- **No emoji.** None in the codebase, none in the PRD, none in the logo. Don't add them.

### Vibe
- **Workshop, not boutique.** The product imagines a designer sliding panels on an HP Latex 700, not someone savouring a typeface.
- **Confidence through specificity.** "Top 50 most-wrapped vehicles in North America." "2024 Ford Transit 250, 148″ wheelbase, High Roof." "Aligns panel seams to body panel breaks where the geometry is within 2″ of a media-width interval."

### Examples lifted from the codebase

> "Design or print a vehicle wrap." *(home page subhead)*

> "Pick the vehicle you want to wrap to get started." *(welcome screen)*

> "Pick your exact year, make, model, and trim — or search — so your design starts on an accurate, wrap-safe outline." *(vehicle selector)*

> "Don't see your vehicle? Request it →" *(empty-state CTA)*

> "Typo-tolerant — 'transt 250' finds Transit 250." *(search helper text)*

> "12+ chars, 1 letter, 1 number, 1 symbol" *(password requirement, before user types)*

> "Saved" *(autosave indicator — one word, leading check icon)*

> "Element is outside the printable area" *(screen-reader live region for canvas out-of-bounds)*

---

## VISUAL FOUNDATIONS

### Color
- **The chrome is zinc-neutral.** Tailwind v4 zinc scale, top to bottom: `#FAFAFA → #18181B`. Page backgrounds are `zinc-50` (marketing/list views) or `zinc-100` (app shell / admin / editor). Cards are pure white. Borders are `zinc-200` everywhere; text hierarchy walks `zinc-900 → 800 → 600 → 500 → 400`.
- **Primary action is black**, not red, not cyan. `bg-zinc-900` button with white text, hovers to `zinc-800`. **One primary per screen.**
- **The accent is the logo cyan, #50C0F0.** Used sparingly: the wolf mark itself, accent borders on hover/focus, the "AI is thinking" progress bar, and links inside dark surfaces. Never as a button fill.
- **Status colors follow the strength-meter palette** (literally lifted from `SignupForm.tsx`): red-500, orange-500, yellow-500, lime-500, emerald-500. The "request this vehicle" empty-state card uses amber-50/200/900 — that warm-yellow request panel is the only place the neutral palette breaks.

### Type
- **Geist Variable** is the entire UI. **Geist Mono Variable** for IDs, SKUs, dimensions in inches, panel labels, and `kbd` glyphs.
- The script lettering on the **logo is bespoke, not a font** — never re-set "Alpha Wolf" as type. Always place the logo PNG/SVG.
- The signature type device is the **uppercase tracking-widest** eyebrow label (`text-xs text-zinc-500`) above page titles and section headers.
- Hierarchy is restrained: `text-2xl semibold` for page H1, `text-sm` body, `text-xs` caption. No display-scale type anywhere in the product. Slides and marketing can scale up.

### Spacing
- Pure **Tailwind 4px baseline**. Common steps: 4, 8, 12, 16, 24, 32, 48.
- Containers: `max-w-2xl` (forms), `max-w-5xl` (lists), `max-w-6xl` (admin).
- Card padding is **24px on all sides** (`px-6 py-6`).
- Stack rhythm is **`gap-4`** between sibling controls inside a form, **`gap-8`** between major sections inside a page.

### Backgrounds, imagery, illustration
- **No background images, no gradients, no patterns.** All product surfaces are flat solid colors. The PRD's brand notes about "dark surface for the editor" are implemented as plain `zinc-200` canvas + white panels — no texture.
- The **only illustrative content** in the product is the vehicle outline SVG (the hero element on every screen it appears) and the user's uploaded brand asset. Both are reproductions of real things, not decorative.
- For marketing surfaces (decks, pitches): use **photography of wrapped vehicles** when imagery is needed; the brand mark in cyan-on-black holds up on photography. Imagery should read **cool, high-contrast, neutral-to-cool color temperature** — vinyl wraps photograph that way.

### Animation
- **Restrained.** `transition` is applied to color/shadow on hover; that's almost it. No springs, no bounces, no entry animations on lists.
- The single exception: **Lucide `Loader2` spinning** for in-flight states, and `animate-spin` on the autosave indicator while pending.
- Easing default: Tailwind's `transition` (cubic-bezier(0.4, 0, 0.2, 1)) at ~150ms.

### Hover states
- **Buttons** darken: `zinc-900 → zinc-800`, `amber-900 → amber-800`, `red-600 → red-700`. Never lighten.
- **Outline / secondary buttons** wash to `zinc-50` or `zinc-100`.
- **Ghost / link buttons** wash to `zinc-100`.
- **Cards** lift their shadow: `shadow-sm → shadow-md`. Never scale, never rotate.
- **Links** add an underline; underline-offset is **2px**.

### Press / active states
- **Focus-visible ring** is the press-equivalent: `ring-[3px] ring-zinc-200/65` with `border-ring`. Never use color shift alone for keyboard users.
- No `scale-95` press behavior. Buttons don't shrink.

### Borders
- One width: **1px** (`border`), occasionally **3px** for focus rings.
- One color in chrome: `zinc-200`. Inputs use the same. The strong-border `zinc-300` is reserved for outline buttons.
- **Dashed borders** are used exclusively for empty-state cards (`border-dashed`).
- Hairline separators between sections use the same 1px `zinc-200`.

### Shadows
- Three steps only: **`shadow-xs`** (inputs), **`shadow-sm`** (cards at rest, primary buttons), **`shadow-md`** (cards on hover). The system doesn't use elevation as a hierarchy device beyond that — color contrast does the heavier lifting.
- No inner shadows. No glow effects.

### Protection gradients vs capsules
- **No protection gradients** anywhere — content always sits on solid surfaces.
- **Capsules / pills** (`rounded-full`) are used for *small inline tags* like a body-type chip on a vehicle card. Never as button shape — buttons are always `rounded-md`.

### Transparency & blur
- **Used almost nowhere in the product.** No backdrop-blur navs, no translucent overlays. The Dialog modal uses an opaque overlay.
- The one exception: status-badge backgrounds use a soft tint (e.g. amber-50 background + amber-900 text). That tinting reads as transparency but is solid color.

### Corner radii
- **`rounded-md` (6px)** — buttons, inputs, selects, badges-as-buttons.
- **`rounded-xl` (12px)** — cards, dialog content, vehicle cards, large surface panels.
- **`rounded-full`** — pills, avatars, status dots.
- Never `rounded-2xl` or beyond except for chips inside slide layouts.

### Cards
- White surface, `rounded-xl`, `border border-zinc-200`, `shadow-sm`. `gap-6` flex column inside. `px-6` padding. Hover: `shadow-md`.
- **Card title is `font-semibold leading-none`** — no extra line-height. Description sits 8px below.
- Empty-state cards swap to **dashed border** and center-align.

### Layout rules
- Pages stick to a centered, capped container — no full-bleed layout in the product.
- The editor is the only **three-column** layout: 56px tool rail · fluid canvas · 256px inspector. All other pages are single-column.
- Admin has a top nav (no sidebar). The customer-facing product has no nav chrome at all — pages connect by buttons and links.

---

## ICONOGRAPHY

The shipped product uses **Lucide React** exclusively. Pulled directly from the codebase (`CanvasEditor.tsx`):
> `Type, Square, Circle, Minus, Image, Undo2, Redo2, MousePointer2, Magnet, Check, Loader2`

Conventions:
- **Stroke style only.** Lucide's default 24px stroke, 2px width. Never filled, never duo-tone.
- **Sized `size-4` (16px) inline with text, `size-5` (20px) standalone in the tool rail, `size-3.5` (14px) in dense indicators.**
- Color matches its parent text color — no fixed `currentColor` overrides.
- **Status icons are colored**: `Check className="text-emerald-600"` for saved confirmation; `Loader2 className="animate-spin"` for in-flight; red text for failure.
- Tooltips wrap every icon-only button (a11y).

### Substitution / availability
For this design system I link **Lucide via CDN** (`https://unpkg.com/lucide@latest`) in the UI-kit HTML files. That matches the codebase one-for-one — no substitution needed.

The brand mark itself (the script "Alpha Wolf Decals" with cyan outline) lives at **`assets/logo.png`** at 2399 × 750. No SVG version is in the codebase; this PNG is the source of truth. **If you need a vector version, ask the user — do not redraw it.**

### Emoji and unicode
- **Emoji**: never used. Don't add them.
- **Unicode symbols**: only `→` (right-arrow in link CTAs), `″` (inch double-prime) and `′` (foot prime) in measurements, `·` (middle dot) as a separator (e.g. "Alpha Wolf · Admin"). That's the entire vocabulary.

---

## How to design for Alpha Wolf — quick decision rules

1. **Reach for zinc first.** When unsure, pick a neutral. The brand is *not* loud.
2. **One primary action per screen.** Black filled. Everything else is outline, ghost, or link.
3. **Use the cyan as a finishing detail**, not a structural color. It marks "this is Alpha Wolf" without shouting.
4. **Always pair a control with its label** — the codebase never relies on placeholder-only inputs.
5. **State the unit.** Inches, mm, sqft, linear feet, panels. The pro audience trusts numbers with units.
6. **Place the logo on black or white surfaces only.** The cyan ring needs the dark backing or it disappears.

---

## See also

- `SKILL.md` — Agent-Skill manifest for Claude Code / similar tools.
- `ui_kits/wrap_studio/` — interactive React recreations of the core product screens.
- `preview/` — small specimen cards that populate the Design System review tab.
