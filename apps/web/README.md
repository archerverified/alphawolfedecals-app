# @alphawolf/web

Next.js 15 (App Router) + React 19 + Tailwind v4 + shadcn/ui front-end for Alpha Wolf Wrap Studio.

## Stack

- **Next.js 15** App Router
- **React 19**
- **Tailwind v4** via `@tailwindcss/postcss`
- **shadcn/ui** — components live in `packages/ui` (see `components.json`)
- **Vitest** for unit tests (`tests/`)
- **Playwright** for e2e (`e2e/`)

## Scripts

```bash
pnpm --filter @alphawolf/web dev          # next dev
pnpm --filter @alphawolf/web build        # next build
pnpm --filter @alphawolf/web lint         # next lint
pnpm --filter @alphawolf/web typecheck    # tsc --noEmit
pnpm --filter @alphawolf/web test         # vitest
pnpm --filter @alphawolf/web test:e2e     # playwright test
```

## Notes

- shadcn components are added into `packages/ui` (see `components.json` `aliases.*`).
- See ADR-0001 for stack rationale; ADR-0002 for monorepo layout.
