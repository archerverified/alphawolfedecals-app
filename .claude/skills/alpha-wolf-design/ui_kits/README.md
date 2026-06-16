# Wrap Studio + AlphaWolfDecals.com — UI Kits

Two products live under one brand. This folder has one kit per product.

| Kit | Surface | Source repo |
| --- | --- | --- |
| [`marketing/`](./marketing/index.html) | **alpha-wolf-decals.vercel.app** — the public storefront. Hero, services, trust band, testimonials, final CTA. Dark-first, cyan accent, automotive voice. | `archerverified/AlphaWolfDecals` |
| [`wrap_studio/`](./wrap_studio/index.html) | **Alpha Wolf Wrap Studio** — the SaaS app for designing and printing vehicle wraps. Sign-up, vehicle picker, projects, canvas editor. Light, zinc-neutral, black actions. | `archerverified/alphawolfedecals-app` |

Each kit is built as a single interactive HTML prototype with React 18 + inline JSX. Components are factored into small `.jsx` files; the index wires them into a click-through of the real product.

The kits don't reimplement real logic (no canvas Konva, no Postgres, no Resend). They're pixel-correct visual + interaction recreations meant to be cut up, recomposed, and used as a starting point for new designs in the brand.
