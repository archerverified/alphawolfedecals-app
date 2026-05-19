# @alphawolf/ui

Shared shadcn/ui components and design-system primitives.

## Adding components

shadcn components are generated into this package from `apps/web`:

```bash
cd apps/web
pnpm dlx shadcn@latest add button
```

`apps/web/components.json` aliases route the generated files into
`packages/ui/src/components/ui/`. Import from `@alphawolf/ui/components/ui/<name>`.

## Layout

```
src/
  index.ts                # public exports
  components/             # shared composed components
    ui/                   # shadcn primitives (generated)
  lib/
    utils.ts              # cn() helper
  hooks/                  # shared hooks
```
