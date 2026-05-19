# @alphawolf/parse

Node + Express + TypeScript worker for vector/raster asset parsing.

**Status:** Stub. Only `/health` is implemented. Full stack lands in Step 5.

See **ADR-0003** for why this service is Node (not Python) and the full
dependency list (Sharp + svgo + Inkscape CLI + pdf2svg CLI + rembg via
Replicate API).

## Scripts

```bash
pnpm --filter @alphawolf/parse dev
pnpm --filter @alphawolf/parse build
pnpm --filter @alphawolf/parse start
pnpm --filter @alphawolf/parse lint
pnpm --filter @alphawolf/parse typecheck
pnpm --filter @alphawolf/parse test
```
