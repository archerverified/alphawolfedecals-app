# UI Kit · Alpha Wolf Wrap Studio

Interactive recreation of the SaaS app — sign-up, vehicle picker, project list, and the canvas editor.

Source of truth: [`archerverified/alphawolfedecals-app`](https://github.com/archerverified/alphawolfedecals-app).

## Open

[`./index.html`](./index.html) — click-through prototype that lands on the marketing-style home page and walks through:

1. **Home** — "I'm a customer" / "I run a wrap shop" entry.
2. **Vehicles** — the cascading Year / Make / Model / Trim picker with body-type facets and a typo-tolerant search.
3. **Projects** — the customer's saved wrap designs.
4. **Editor** — the canvas-editor shell (tool rail · canvas · inspector) with autosave indicator.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Bootstraps React + Babel, wires routing, loads the component modules. |
| `components.jsx` | Primitives: `Button`, `Input`, `Select`, `Label`, `Card`, `Eyebrow`, `IconButton`, `Toast`, `Skeleton`. |
| `vehicle.jsx` | `VehicleBrowser`, `VehicleCard`, `OutlinePreview` (the SVG vehicle silhouettes). |
| `editor.jsx` | The `WrapEditor` shell — top bar, tool rail, mock canvas, right inspector. |
| `pages.jsx` | `HomePage`, `WelcomePage`, `VehicleSelectPage`, `ProjectsPage`, `EditorPage`. |

## Conventions

- Tokens come from `../../colors_and_type.css`. Surfaces use the `--aws-*` set (zinc-neutral), NOT the `--awd-*` set.
- All buttons sentence case, height 36 px, primary = `zinc-900` filled.
- All cards rounded **12 px** with `border: 1px solid #E4E4E7`.
- Page eyebrows: `text-xs uppercase tracking-[0.10em] text-zinc-500` — grey, not cyan.

## What's faithful vs. what's stubbed

| Faithful | Stubbed |
| --- | --- |
| Vehicle-browser cascade behaviour (Year → Make → Model → Trim, body-type facets revealed after Model) | Real Postgres-backed vehicle DB (uses an in-memory sample of ~20 templates) |
| Vehicle SVG outlines (line-drawn truck / van / SUV silhouettes) | Real 4-view production-grade SVGs |
| Editor chrome: top bar with undo/redo, snap popover stub, autosave indicator; tool rail; right inspector | Konva canvas (mock canvas surface only — no real drawing) |
| Project-list layout + empty state + card menu | Server actions, projects API, RLS |
| Five-step password strength meter | Real Argon2 hashing, OTP email send |
