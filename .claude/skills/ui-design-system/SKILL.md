---
name: ui-design-system
description: UI design system toolkit for generating design tokens, documenting components, doing responsive math, checking accessibility, and producing developer handoff docs. Use this skill whenever the user is building or maintaining a design system, generating design tokens (colors, type scale, spacing) from a brand color, creating a tonal color ramp or palette, documenting UI components and their props/variants, computing fluid typography or clamp() values, checking WCAG color contrast, or preparing a design-to-dev handoff. Also trigger when the user mentions design tokens, a "single source of truth" for styles, CSS custom properties / SCSS variables for a system, component libraries, visual consistency across an app, or "make this look consistent" — even if they don't say the words "design system."
---

# UI Design System

A toolkit for building and maintaining scalable design systems: the tokens that
define a brand, the components built on them, and the handoff that gets it all
into code without losing intent. Five focused scripts cover the parts that are
tedious or error-prone to do by hand — color math, contrast checking, fluid
type calculations, consistent documentation — so the work is fast and correct.

The scripts are stdlib-only Python (no `pip install`), so they run anywhere.
Each prints usage when run with no arguments.

## When to reach for this

Use this skill when the work is *systemic* — defining reusable foundations
rather than styling one element. Signals: a brand color that needs to become a
full palette, a component that needs documentation matching the rest of a
library, "is this contrast accessible," fluid type across breakpoints, or a
spec a developer will implement. For one-off "make this button prettier"
styling, the `frontend-design` skill is the better fit; this one is about the
system behind many such decisions.

## Workflow

A typical end-to-end build runs the scripts in this order. Each step's output
feeds the next, which is the point — the toolkit is a pipeline, not five
unrelated utilities.

1. **Generate tokens** from the brand color → `tokens.json` / `.css` / `.scss`
2. **Check contrast** on the key text/surface pairings; adjust tokens if needed
3. **Compute responsive values** (fluid type, grid) the tokens don't cover
4. **Document components** built on the tokens → one `.md` per component
5. **Assemble the handoff** combining tokens + component docs → `HANDOFF.md`

You won't always need all five. A user asking only "give me a palette from
#6D28D9" needs step 1. But when someone is standing up a system, walking the
pipeline produces a coherent, dev-ready result.

Save generated artifacts to files and present them — these are deliverables the
user will hand to developers or commit to a repo, not throwaway chat output.

## Scripts

All live in `scripts/`. Run with `python3 scripts/<name>.py`.

### design_token_generator.py — the foundation

Turns one brand color into a complete token set: a 50–950 tonal ramp for
primary + a harmonized secondary, brand-tinted neutrals, semantic status colors
(success/warning/error/info), a modular type scale, an 8pt spacing grid, and
radius / shadow / motion / breakpoint tokens. Exports JSON, CSS custom
properties, or SCSS variables.

```
python3 scripts/design_token_generator.py <brand_hex> [style] [format]
```
- **style**: `modern` (default) · `classic` · `playful` — shifts the type-scale
  ratio, corner radius, shadow softness, accent harmony, and neutral
  temperature so the same color reads buttoned-up or friendly.
- **format**: `json` (default) · `css` · `scss`

```
python3 scripts/design_token_generator.py "#6D28D9" playful css
```

The `style` knob exists because a brand color underdetermines a system — the
*personality* comes from those secondary decisions, and bundling coherent
presets beats hand-tuning twenty values every time.

### accessibility_checker.py — contrast, with a fix

WCAG 2.1 contrast is exact math and the most common a11y failure, so don't
eyeball it. Pair mode reports the ratio and AA/AAA pass/fail for normal text,
large text, and UI components — and if a pairing fails, suggests the nearest
same-hue foreground that passes.

```
python3 scripts/accessibility_checker.py <fg_hex> <bg_hex>
```

Audit mode checks many pairings from JSON and exits non-zero on any failure
(drop it in CI to catch regressions):

```
python3 scripts/accessibility_checker.py --audit pairs.json
```
`pairs.json`: `[{"name":"Body","fg":"#475569","bg":"#FFFFFF","level":"AA","size":"normal"}]`
(`level`: AA/AAA · `size`: normal/large/ui)

Always sanity-check the primary text-on-background and button pairings from a
freshly generated token set here before shipping them.

### responsive_calc.py — the math tokens don't cover

```
python3 scripts/responsive_calc.py fluid <min_px> <max_px> [min_vw=375] [max_vw=1440]
python3 scripts/responsive_calc.py scale <base_px> <ratio> [steps=6]
python3 scripts/responsive_calc.py rem <px> [root=16]   |   px <rem> [root=16]
python3 scripts/responsive_calc.py grid <container_px> <columns> [gutter=24] [margin=24]
```

`fluid` is the one to reach for most: it produces a copy-paste `clamp()` that
scales a value smoothly between two viewport widths and never exceeds its
bounds — so type and spacing grow with the screen instead of snapping at
breakpoints. `grid` gives the exact column width for pixel-accurate layouts.

### component_doc_generator.py — consistent component docs

The hard part of component docs isn't prose, it's keeping 40 components'
documentation structurally identical. This enforces one shape: anatomy, props
table, variants, states, do/don't, accessibility, tokens used.

```
python3 scripts/component_doc_generator.py scaffold [Name] > component.json   # blank template
python3 scripts/component_doc_generator.py build component.json > Component.md  # render
```

Workflow: scaffold a spec, fill in the JSON (the scaffold shows every field),
then build. The spec shape is documented in the script's header — read it
before filling one in.

### handoff_generator.py — one document for the dev

Stitches a token set and any number of component specs into a single
self-contained Markdown handoff (tokens reference + component index + full
component docs), reusing the component renderer so everything matches.

```
python3 scripts/handoff_generator.py --tokens tokens.json \
    [--components button.json card.json ...] [--title "Acme DS v1"] > HANDOFF.md
```

Handoffs leak when tokens, docs, and intent live in separate places and the
engineer reconstructs them from screenshots. One scroll with everything fixes
that.

## Putting it together — a full example

```bash
# 1. Tokens (keep a JSON copy for the pipeline; export CSS for the codebase)
python3 scripts/design_token_generator.py "#2563EB" modern json > tokens.json
python3 scripts/design_token_generator.py "#2563EB" modern css  > tokens.css

# 2. Verify the key pairings pass
python3 scripts/accessibility_checker.py --audit pairs.json

# 3. Fluid heading + body for the type system
python3 scripts/responsive_calc.py fluid 32 56   # h1
python3 scripts/responsive_calc.py fluid 16 18    # body

# 4. Document a couple of components
python3 scripts/component_doc_generator.py scaffold Button > button.json   # then edit
python3 scripts/component_doc_generator.py build button.json > Button.md

# 5. One handoff doc to rule them all
python3 scripts/handoff_generator.py --tokens tokens.json \
    --components button.json card.json --title "Acme Design System v1" > HANDOFF.md
```

## Deeper guidance

For token architecture decisions that go beyond running the scripts — primitive
vs. semantic token layering, naming conventions, multi-brand theming, and
dark-mode strategy — read `references/token-architecture.md`. Pull it in when a
user asks *how to structure* tokens rather than just *generate* them.

---

## 2025–2026 Updates (verified June 2026)
- **Accessibility bar: WCAG 2.2 AA** (now ISO/IEC 40500:2025). New criteria to check: Target Size min 24×24 CSS px, Focus Not Obscured, Dragging Movements alternative, Consistent Help placement, Accessible Authentication (no cognitive tests). EU EAA enforced since June 2025.
- **Modern CSS is the differentiator**: container queries, `:has()`, View Transitions API and scroll-driven animations (stable in Chromium 2025 — replace JS scroll/transition hacks), variable fonts (1,800+ on Google Fonts; 60–80% payload cut).
- **Platform design languages diverged in 2025**: Apple **Liquid Glass** (iOS 26 — translucent refractive material system-wide) vs Google **Material 3 Expressive** (bold dynamic color, shape-morphing, 35+ shapes, variable type). Web work should acknowledge, not clone, these.
- **W3C Design Tokens Community Group format** is the interchange target: emit tokens as DTCG JSON (\$value/\$type) alongside CSS custom properties so Figma/Style Dictionary pipelines interop.
- Token additions for the era: density scale (comfortable/compact), motion tokens (duration/easing aligned to View Transitions), and a 24px minimum-target token wired into all interactive component specs.
