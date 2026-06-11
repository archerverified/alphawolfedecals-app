# Token Architecture

Guidance for *structuring* a token system, beyond generating raw values. Read
this when a user asks how to organize tokens, theme across brands, or support
dark mode — the scripts generate values, this explains how to layer them.

## Contents
- Primitive vs. semantic tokens
- Naming conventions
- Dark mode strategy
- Multi-brand theming
- Common pitfalls

## Primitive vs. semantic tokens

A robust system has two layers:

**Primitives** — raw, context-free values. These are exactly what
`design_token_generator.py` outputs: `color.primary.500`, `spacing.16`,
`radius.md`. They describe *what a value is*, never *where it's used*.

**Semantic tokens** — intent-named aliases that point at primitives:
`color.text.default → neutral.900`, `color.surface.raised → neutral.0`,
`color.action.primary → primary.500`, `color.border.focus → primary.400`.

Components reference *semantic* tokens, never primitives directly. The payoff:
re-theme by repointing a handful of semantic aliases instead of editing every
component. The generator gives you the primitive foundation; you define the
semantic layer on top (often 15–30 aliases for a typical app).

A minimal semantic set worth defining: `text.{default,muted,inverse}`,
`surface.{base,raised,sunken}`, `border.{default,strong,focus}`,
`action.{primary,secondary,danger}` with `{,-hover,-active}` states.

## Naming conventions

Pick one pattern and never deviate — inconsistency here is what makes systems
feel ad hoc. A reliable structure is `category.concept.variant.state`:

- `color.action.primary.hover`
- `space.inset.md` (padding) vs. `space.stack.md` (vertical gap)
- `font.size.lg`, `font.weight.semibold`

Keep scales numeric where ordering matters (color 50–950, never
`light/lighter/lightest` — you'll run out of comparatives). Use t-shirt sizes
(`sm/md/lg`) for sets where rank matters less than recall.

## Dark mode strategy

Don't generate a separate dark palette from scratch. Instead, keep one set of
primitives and flip the *semantic* layer:

- Light: `surface.base → neutral.50`, `text.default → neutral.900`
- Dark:  `surface.base → neutral.950`, `text.default → neutral.100`

Two cautions specific to dark mode: pure-black surfaces (`#000`) look harsh —
prefer `neutral.950`. And re-run `accessibility_checker.py` on the dark
pairings; contrast that passes on white frequently fails inverted, because the
ramp isn't symmetric in perceived lightness.

## Multi-brand theming

For several brands sharing one component library: generate a primitive set per
brand (run the generator once per brand color), but keep the *semantic token
names identical* across brands. Components bind to semantic names, so swapping
the active brand is swapping which primitive file feeds the aliases — zero
component changes. The type scale, spacing, and radius can be shared or
per-brand depending on how much the brands diverge.

## Common pitfalls

- **Components referencing primitives directly.** Breaks theming. Always go
  through semantic aliases.
- **Too many tokens.** If two tokens always have the same value and always
  will, they're one token. Generate broadly, then prune to what's used.
- **Skipping the contrast check after theming.** The most common regression.
  Audit pairings every time the semantic layer changes.
- **Encoding usage in primitive names.** `color.button-blue` is a primitive
  pretending to be semantic — it can't be reused for a link. Name primitives by
  what they *are* (`primary.500`), reserve intent for the semantic layer.
