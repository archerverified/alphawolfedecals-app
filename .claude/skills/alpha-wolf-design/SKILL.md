---
name: alpha-wolf-design
description: Use this skill to generate well-branded interfaces and assets for Alpha Wolf Decals (the Salem, OR vinyl-wrap / tint / PPF / signage shop and its marketing site at alpha-wolf-decals.vercel.app) and Alpha Wolf Wrap Studio (the SaaS app for designing and printing vehicle wraps). Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the **README.md** at the root of this skill, and explore the other available files. Two surfaces share one brand:

- **Marketing site (`alphawolfdecals.com`)** — dark-first, electric-blue (#00AEEF) accent. Bold, automotive, declarative voice. Tokens prefixed `--awd-*`. UI kit at `ui_kits/marketing/`.
- **Wrap Studio app (`alphawolfwrap.com`)** — light-first, zinc-neutral, black actions. Quiet, workshop voice. Tokens prefixed `--aws-*`. UI kit at `ui_kits/wrap_studio/`.

Both share **Geist Sans + Geist Mono** (self-hosted, see `fonts/`) and the **wolf logo** at `assets/logo.png`.

## Files in this skill

```
README.md                     ← brand overview, content + visual + iconography fundamentals
colors_and_type.css           ← every token (color, type, spacing, radii, shadow, motion)
assets/logo.png               ← the master sticker logo (2399 × 750)
fonts/                        ← Geist Variable + Geist Mono Variable .woff2
preview/                      ← 30 specimen cards (one HTML per concept)
ui_kits/
  marketing/                  ← React recreation of the marketing site
  wrap_studio/                ← React recreation of the SaaS app
```

## How to use

**Visual artifact (slide, mock, throwaway prototype)**

1. Copy `colors_and_type.css`, `fonts/`, and `assets/logo.png` next to your HTML.
2. `<link rel="stylesheet" href="./colors_and_type.css">`.
3. Pick a surface — marketing (dark) or app (light) — and use the matching token prefix consistently.
4. For marketing tagline composition, copy the pattern from `preview/brand-tagline.html`.
5. For component patterns, lift JSX from `ui_kits/<surface>/components.jsx`.
6. Place the real logo PNG — never re-set "Alpha Wolf" as type, never redraw it as SVG.

**Production code**

Reference `colors_and_type.css` directly, or wire the same tokens into your project's CSS or Tailwind config. The two repositories of truth are:
- `archerverified/AlphaWolfDecals` (marketing — Next 14 + Tailwind 3 + shadcn-derived primitives)
- `archerverified/alphawolfedecals-app` (Wrap Studio — Next 15 + Tailwind v4 + shadcn/ui)

**No clear ask from the user**

Ask the user what they want to build. Confirm the **surface** (marketing vs. app) up front — that single choice swaps the entire palette, type rhythm, button voice, and card radius. Then act as an expert designer who outputs HTML artifacts or production code, depending on the need.

## Hard rules

- **Don't introduce a third color.** The whole system is built on three: cyan #00AEEF, neutrals (zinc on light, custom AWD on dark), and selective status accents.
- **No emoji.** Anywhere. Don't add them.
- **No invented radii or spacing values.** Round to existing tokens.
- **Logo placement is binary**: black or white surface only. Don't crop it to remove the drop-shadow.
- **The Geist variable axis is 100–900.** Don't load a separate static weight when a single variable face works.
- **Voice is operational, not aspirational.** Two-clause taglines (setup + payoff). Em-dashes for asides, never spaced hyphens.
