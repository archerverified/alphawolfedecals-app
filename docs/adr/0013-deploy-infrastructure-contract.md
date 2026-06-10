# ADR-0013: Deploy infrastructure contract — workspace compilation, hoisted externals, and binary-target coverage

- **Status**: Accepted
- **Date**: 2026-05-23
- **Deciders**: Archer, Claude (deploy session)
- **Related stories**: PR #73 (initial Phase 1 deploy), PR #75 (audit), commits `e2459f0..1339c0e`
- **Supersedes**: n/a (augments ADR-0012)
- **Amended by**: ADR-0014 (2026-06-10 — MVP-build locked invariants + review-stack swap)

## Context

ADR-0012 picked the Phase 1 deploy topology (Vercel sfo1 + Render Oregon + Supabase + Upstash). Shipping the actual infrastructure on top of a pnpm + Turborepo monorepo took **18 commits** (`e2459f0..1339c0e`, the explicit Render+Vercel fix chain; 19 if you also count `e2b4a6a`, the prior Prisma postinstall fix that surfaced the chain) because the toolchain has three independent failure modes that all surface as runtime `Cannot find module` errors, and each fix only unblocks the next layer. The fixes are now load-bearing — silently unwinding any of them re-breaks the deploy.

This ADR documents the contract so the next maintainer can change it intentionally rather than by accident.

## Decision

The Vercel + Render deploy of this monorepo depends on **three coordinated invariants**. Changes that touch any of them must update the other two if needed and re-verify both deploy targets.

### Invariant 1 — Workspace TypeScript packages compile to `dist/` and are reached via a `node` exports condition

Every workspace package consumed at runtime (`@alphawolf/observability`, `@alphawolf/db`, `@alphawolf/auth`) has:

- `tsconfig.build.json` extending the package's `tsconfig.json` with `noEmit: false`, `outDir: dist`, `rootDir: src`
- `"build": "tsc -p tsconfig.build.json"` script
- `"node": "./dist/index.js"` arm in package.json `exports` field (alongside `"default": "./src/index.ts"` for transpiling consumers)
- `"files": ["dist", "src"]` so published artifacts include both

Turbo's `dependsOn: ["^build"]` (see `turbo.json`) handles compile order automatically — `pnpm turbo run build --filter=@alphawolf/web` builds every workspace dep first.

**Why this matters:** Render runs `node services/parse/dist/index.js` directly. Node 22 does not strip TypeScript by default and does not auto-resolve `.js` imports to `.ts`. Without dist + a `node` exports arm, `import '@alphawolf/observability'` at runtime hits `src/index.ts` and throws `ERR_MODULE_NOT_FOUND`.

### Invariant 2 — Relative imports use `.js` extensions even in `.ts` source, AND `apps/web/next.config.ts` aliases `.js → .ts`

Every workspace package and every Node service writes relative imports as `import { x } from './foo.js'` (TypeScript NodeNext convention). `tsc` preserves the `.js` extension in compiled output; Node ESM resolves `dist/foo.js`. This was rolled out across `apps/api`, `services/parse`, `packages/{observability,db,auth}` in commits `ee71003` + `fab49e9`.

Next.js webpack with `transpilePackages` reads the same `.ts` sources and would fail with `Module not found: Can't resolve './foo.js'` because it looks for literal `.js` files. The fix lives in `apps/web/next.config.ts`:

```ts
config.resolve.extensionAlias = {
  '.js': ['.ts', '.tsx', '.js'],
  '.mjs': ['.mts', '.mjs'],
};
```

**Why this matters:** Two consumers (raw Node and webpack) interpret the same source. The aliases make webpack tolerate the NodeNext convention.

**Risk:** This couples the codebase to webpack's resolution behavior. If Next.js migrates to Turbopack as the default bundler, this alias likely needs to move to Turbopack's equivalent (currently `experimental.turbo.resolveExtensions` or similar). When that day comes, search for `extensionAlias` and replace.

### Invariant 3 — Vercel lambda packaging requires (a) workspace root as nft tracing root, (b) hoisted transitive externals, and (c) full Prisma binary-target coverage

Three sub-invariants for Vercel only:

**3a. `outputFileTracingRoot` in `apps/web/next.config.ts`** points at the monorepo workspace root via `path.join(__dirname, '../..')`. Without it, Vercel's nft (Node File Tracer) only sees `apps/web/node_modules/` and misses everything reachable via pnpm's `.pnpm/` symlink store at the workspace root.

**3b. Every transitive `serverExternalPackage` is listed as a direct dependency of `apps/web/package.json`.** Currently: `svgo`, `svgson`, `bullmq`, `ioredis`, `replicate`, `@node-rs/argon2`, `@sentry/profiling-node`, `@prisma/client`, `sharp`. None of these are imported by `apps/web` source — they're only reached via `@alphawolf/db`, `@alphawolf/auth`, `@alphawolf/parse`, `@alphawolf/observability`. nft cannot statically trace packages whose only import path crosses a workspace symlink + a dynamic `require()` call (svgo, prisma engine, etc.). Hoisting them as direct deps causes pnpm to symlink them into `apps/web/node_modules/`, where nft finds them via standard module resolution.

**3c. `packages/db/prisma/schema.prisma` `generator client` lists every deploy-target's binary:**

```prisma
binaryTargets = ["native", "rhel-openssl-3.0.x", "debian-openssl-3.0.x"]
```

- `native` — local dev (macOS arm64, Linux x64)
- `rhel-openssl-3.0.x` — Vercel serverless lambda runtime (Amazon Linux 2023, OpenSSL 3)
- `debian-openssl-3.0.x` — Render web services (Debian 12 / Ubuntu 22.04, OpenSSL 3)

Without this, `prisma generate` only produces the build-machine's binary. The runtime that doesn't match its libc + OpenSSL crashes with `PrismaClientInitializationError: couldn't find a query engine binary`.

## Alternatives considered

- **Skip the `dist/` compilation and run everything through `tsx` at runtime on Render.** Rejected: `tsx` is a devtime tool that adds ~80ms startup per process and isn't supported as a production runtime by Render's Node environment. Cold starts would balloon.
- **Drop the `node` exports condition and let Next.js see `src/*.ts` everywhere via the `default` arm.** Rejected: Render services need `dist/`. Two consumers, two arms.
- **Skip workspace symlinks via pnpm `hoist-pattern` config to hoist all transitive deps to the workspace root automatically.** Rejected: that pollutes the workspace root with hundreds of indirect packages and breaks isolation between workspace packages. Hoisting only the specific externals that Vercel can't trace is a more surgical fix.
- **Use `outputFileTracingIncludes` globs (`node_modules/.pnpm/<pkg>@*/...`) instead of hoisting.** Tried in commits `19615dc`, `a2176d6`, `21474f2`. Either the glob escaped the project root and Vercel rejected the lambda as "invalid deployment package … files in symlinked directories," or the path patterns didn't match pnpm's actual layout (peer-dep suffixes like `@5.22.0_prisma@5.22.0`). After three failed attempts the hoist pattern was the only thing that consistently worked.
- **Bundle externals into the Next.js server output instead of externalizing them.** Rejected for svgo and sharp specifically: svgo uses dynamic `require()` for plugin config that webpack flags as "Critical dependency" and cannot statically resolve; sharp ships `.node` binaries that webpack can't parse at all.

## Consequences

**Positive**

- Both `apps/web` (Vercel) and the three backend services (Render) deploy from the same monorepo source with no host-specific tooling. One `pnpm install` + one `pnpm turbo run build` works everywhere.
- Workspace package source can be edited in `.ts` and consumed both as raw Node (Render runtime) and webpack-bundled (Vercel runtime) without per-consumer branching.
- New transitive externals follow a known recipe — add as direct dep of `apps/web`, no Vercel UI configuration needed.

**Negative**

- `apps/web/package.json` lists ~9 dependencies the app doesn't import directly. This is acknowledged debt. CodeRabbit flagged it as P1 on PR #75; the trade-off was accepted because the alternative (nft includes) demonstrably did not work after 3 attempts.
- Version skew risk: if a workspace package upgrades svgo to 4.x but `apps/web` still pins ^3.3.3, pnpm resolves one version per use-site and the runtime gets whatever the hoist arm points at. Mitigate by keeping the version ranges in sync across workspace + `apps/web`.
- Coupling to webpack's resolution behavior via `extensionAlias`. Documented in Invariant 2 — search for `extensionAlias` if Next.js bundler changes.
- Prisma CLI lives in `packages/db` dependencies (not devDependencies), adding ~5 MB to production node_modules so the `postinstall: prisma generate` hook works on Render's `NODE_ENV=production` install. CodeRabbit and Greptile both flagged this; alternative (moving back to devDeps + explicit Render `prisma generate` step) was deferred because the postinstall path is currently load-bearing across four deploy targets.

**Follow-ups**

- BullMQ queue-age + backlog monitoring on `services/parse` (CodeRabbit nit). Tied to ADR-0012's free-tier sleep behavior; revisit when migrating off free tier (Phase 4).
- Open a tracking issue for the hoist-vs-nft-includes trade-off — if a future Vercel/nft release fixes the trace-through-symlinks-with-dynamic-require gap, the hoist list can shrink.
- When upgrading Prisma, bump `binaryTargets` if the openssl version on Vercel or Render changes (currently both on OpenSSL 3 — covered).
- When `apps/web` adds a new workspace package import that brings a new server-side external, add the external to `apps/web/dependencies` and regenerate the lockfile in the same PR.

## References

- ADR-0012 (production deployment architecture — picks the topology this ADR makes deployable)
- PR #73 (initial Phase 1 deploy infrastructure)
- PR #75 (audit + CodeRabbit/Greptile review of the fix chain)
- Commit chain: `e2459f0..1339c0e` (18 commits resolving the deploy; 19 with the prior `e2b4a6a` Prisma postinstall fix)
- /apps/web/next.config.ts (extensionAlias + outputFileTracingRoot live here)
- /apps/web/package.json (hoisted externals)
- /packages/db/prisma/schema.prisma (binaryTargets)
- /turbo.json (`dependsOn: ["^build"]` makes the workspace compile order work)
