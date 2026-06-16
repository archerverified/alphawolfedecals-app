# UI Kit · alphawolfdecals.com

Interactive recreation of the live marketing site at **alpha-wolf-decals.vercel.app**.

Source of truth: [`archerverified/AlphaWolfDecals`](https://github.com/archerverified/AlphaWolfDecals).

## Open

[`./index.html`](./index.html) — full site prototype with header, hero, services grid, trust band, testimonials, financing strip, and final CTA. Click between pages via the top nav.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Bootstraps React + Babel, loads the components, mounts the homepage. |
| `components.jsx` | Primitives: `Button`, `Badge`, `Card`, `SectionHeading`, `Logo`, `SiteHeader`, `SiteFooter`. |
| `service-art.jsx` | The six bespoke SVG illustrations for the services grid (lifted from the codebase). |
| `sections.jsx` | Page sections: `Hero`, `ServicesGrid`, `WhyTrustBand`, `Testimonials`, `FinalCta`, `FinancingStrip`. |
| `pages.jsx` | Composed pages: `HomePage`, `AboutPage`, `ServiceDetailPage`. |

## Conventions

- Tokens come from `../../colors_and_type.css` (loaded by `index.html`). Surfaces use the `--awd-*` set, NOT the `--aws-*` set.
- All buttons UPPERCASE @ `0.08em` tracking. Primary = cyan fill on near-black text.
- All cards rounded **8 px** (`--radius-lg`) with `border: 1px solid #1A1A1A`.
- All hover states are color/glow transitions over 200 ms with `cubic-bezier(0.32, 0.72, 0, 1)`.

## What's faithful vs. what's stubbed

| Faithful | Stubbed |
| --- | --- |
| Hero composition (cinema band + tagline + CTAs + paw scroll cue) | Real video (poster placeholder used instead) |
| Service-card art (real SVGs from `components/sections/service-art.tsx`) | `/services/[slug]` detail routes |
| Trust-band count-up + cyan suffix | IntersectionObserver gating (counts on mount) |
| Testimonial schema markup | Real Google Reviews import |
| Final-CTA radial glow + tagline echo | Actual `/quote` form |
