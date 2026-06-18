# ADR-0015: ADR-0013 amendment — Next.js 16 (webpack `--webpack` bridge + `.mjs` config)

- **Status**: Accepted
- **Date**: 2026-06-17
- **Deciders**: Archer, Claude (Goal 19 — dependency triage)
- **Related stories**: Goal 19; PR #200 (next 15.5 -> 16.2); Dependabot #181
- **Supersedes**: n/a (amends ADR-0013 Invariant 2 + Invariant 3b)

## Context

Goal 19 upgrades `next` 15.5.18 -> 16.2.9 (Dependabot #181). The bump clears **9 Next.js
security advisories (7 High)** — Server-Component DoS, several middleware/proxy bypasses,
Cache-Components connection-exhaustion DoS, image-optimization DoS, and two App-Router
XSS classes — so it is a security upgrade, not just version currency.

Next 16 makes **Turbopack the default bundler** for `next build` and `next dev`. When a
project defines a custom `webpack` function in `next.config`, Turbopack **hard-fails the
build on purpose** ("a webpack configuration was found") to prevent a silent
misconfiguration. Even past that gate, Turbopack **ignores** the webpack function entirely.

`apps/web/next.config.ts` carries a load-bearing `webpack(config, { isServer })` function
that implements two **ADR-0013 locked invariants**:

- **Inv2** — `config.resolve.extensionAlias` maps `.js -> [.ts, .tsx, .js]` (and `.mjs ->
[.mts, .mjs]`) so webpack resolves the NodeNext `.js` import specifiers in the
  `transpilePackages` workspace TypeScript sources (`@alphawolf/auth`, `/canvas`, `/db`,
  `/observability`, `/parse`, `/ui`) to the real `.ts`/`.tsx` files.
- **Inv3b** (webpack half) — `config.externals` marks the native / dynamic-`require`
  server packages (`/^@node-rs\//`, `svgo`, `sharp`, `canvas`, `bullmq`, `ioredis`,
  `replicate`, `@sentry/profiling-node`) as externals so webpack never tries to bundle
  their `.node` binaries or dynamic requires.

ADR-0013 Inv2 **explicitly anticipated this day**: "If Next.js migrates to Turbopack as the
default bundler, this alias likely needs to move to Turbopack's equivalent ... When that
day comes, search for `extensionAlias` and replace." This ADR records the decision taken
at that point.

The original Dependabot #181 (bare version bump, no config change) **failed the Vercel
preview build** for exactly this reason — Turbopack-default `next build` rejected the
webpack config. (The Node CI job passed, because it runs lint/typecheck/test and never
`next build`.)

**Second blocker (surfaced only after `--webpack` got the build running):** Next 16's
config loader compiles a TypeScript `next.config.ts` to a temporary
`next.config.compiled.js` emitted as **CommonJS** (`exports.*`) and then evaluates it in
**ESM scope**, throwing `ReferenceError: exports is not defined in ES module scope` at
`next.config.compiled.js:2`. This reproduced both on Vercel and on a clean local
`next build --webpack` (so it is a real Next 16 config-loader behaviour, not a stale build
cache). A native `next.config.mjs` is loaded directly as ESM with no compile step, side-
stepping the CJS/ESM mismatch entirely.

## Decision

**Pin the Next build to webpack via the `next build --webpack` flag** (and `next dev
--webpack`), as a deliberate, temporary bridge.

```jsonc
// apps/web/package.json
"dev":   "next dev --webpack",
"build": "next build --webpack",
```

With `--webpack`, Next 16 runs the legacy webpack bundler, the `webpack()` function in
the config applies normally, and **ADR-0013 Inv2 + Inv3b stay in force verbatim** — no
rewrite of the extensionAlias or the externals list, and therefore no change to the
nft-traced lambda packaging that Inv3a/Inv3b/Inv3c jointly guarantee.

**And author the Next config as `next.config.mjs`** (not `.ts`), to avoid the Next 16
config-loader CJS-in-ESM crash (the second blocker above). The `.mjs` is the same config
verbatim — Inv2 `extensionAlias`, Inv3a `outputFileTracingRoot`, Inv3b
`serverExternalPackages` + webpack `config.externals`, and the `withSentryConfig` wrapper
are byte-for-byte equivalent; only the file format changes (ESM JS instead of compiled
TS), with a JSDoc `@type {import('next').NextConfig}` annotation preserving editor
type-safety. A small follow-on: `eslint.config.mjs` gains a Node-globals block for
`**/*.{js,cjs,mjs}` so the `.mjs` config's `process.env` references pass `no-undef`
(typescript-eslint silences `no-undef` for `.ts` via type info; plain JS needs the
globals declared).

This was validated by a clean local `next build --webpack` (Next.js 16.2.9 webpack,
optimized build, 26/26 static pages) and a Vercel preview deploy before merge.

Scope of what this amendment does and does **not** touch:

- **Inv3a** (`outputFileTracingRoot`) and **Inv3c** (Prisma `binaryTargets`) are
  **unaffected** — they are `next.config` keys / schema settings read regardless of
  bundler. `serverExternalPackages` (the documented, bundler-agnostic half of the externals
  contract) is likewise unchanged and still covers the native modules; the webpack
  `config.externals` block is the belt-and-suspenders that `--webpack` keeps active.
- **`apps/web/middleware.ts` stays on the legacy `middleware` filename.** Next 16 deprecates
  `middleware.ts` in favour of `proxy.ts`, but `proxy.ts` runs **nodejs-only** and would
  drop the Edge runtime that the file depends on (Web-Crypto CSRF, Upstash-REST rate
  limiting, and the CSP/HSTS security headers from ADR-0014 §9). The legacy `middleware`
  name still works in 16, so this is a **tracked deprecation, not actioned**. Do NOT rename
  it to `proxy.ts` without re-validating the Edge guarantees.
- **ADR-0014 §9 CSP** (`'unsafe-inline'` / `'unsafe-eval'`) is **unchanged** — its
  "Next bootstrap + Tailwind v4 + Konva" rationale holds identically on 16; the headers are
  still emitted from `middleware.ts`.

Pre-requisites that were already satisfied (so this is genuinely a bundler-only change):
React is already 19.2 (apps/web), the async request APIs (`cookies()`/`headers()`/`params`)
are already awaited everywhere, and the repo uses none of the removed/changed Next surfaces
(AMP, `serverRuntimeConfig`/`publicRuntimeConfig`, `experimental.ppr`/`dynamicIO`/
`useCache`, `revalidateTag`/`unstable_cache`, `next lint`).

## Alternatives considered

- **Full Turbopack migration now** (drop the webpack function: rely on `serverExternalPackages`
  for the externals and on Turbopack's native TS resolution for the `.js`-specifier imports,
  removing `extensionAlias`). **Rejected for this goal** — it rewrites two locked invariants
  and would require re-proving, on a real deploy, that (a) the workspace NodeNext `.js`
  imports still resolve under Turbopack and (b) every native external (`sharp`, `@node-rs/
argon2`, `svgo`, `bullmq`/`ioredis`/`replicate`, `@sentry/profiling-node`) still loads at
  runtime. That is a larger, separate change; it is the documented **follow-up**, to land
  before Next 17 removes the webpack option.
- **Hold Next 16 entirely.** Rejected — it forgoes 7 High-severity CVE fixes, and the
  `--webpack` bridge is a one-line, invariant-preserving change validated by a real Vercel
  preview build + prod smoke.
- **Edit ADR-0013 in place.** Rejected per the project's amendment-ADR rule (change history
  stays legible), consistent with ADR-0014.

## Consequences

**Positive**

- The 9 Next.js advisories (7 High) are cleared without touching the load-bearing deploy
  invariants — Inv2/Inv3b are preserved exactly, so the nft lambda-tracing contract is
  unchanged and the deploy stays green.
- Minimal diff (two package.json scripts + the version range), low blast radius, easy to
  reason about and revert.

**Negative**

- Commits the build to webpack, which Next.js has marked deprecated and **may remove in
  Next 17**. This ADR must be re-amended (to the Turbopack migration) before adopting Next 17. Tracked as the follow-up below.
- The webpack path is now an opt-in/deprecated code path; future Next minors may warn on it.

**Follow-ups**

- **Turbopack migration** (before Next 17): move Inv2's `extensionAlias` to Turbopack's
  resolution config (or confirm Turbopack's native TS resolution makes it unnecessary) and
  confirm `serverExternalPackages` alone covers Inv3b's externals, with a real deploy +
  full-journey smoke proving the native externals and workspace `.js` imports still resolve.
  Then drop `--webpack` and this bridge.
- **`middleware.ts` -> `proxy.ts`** rename if/when Vercel ships Edge-runtime support for
  `proxy.ts` (today it is nodejs-only and would lose the Edge CSP/rate-limit/CSRF).
- **Sentry `disableLogger` deprecation.** `@sentry/nextjs` 10.58 warns that
  `withSentryConfig({ disableLogger: true })` is deprecated in favour of
  `webpack: { treeshake: { removeDebugLogging: true } }`. Harmless (a build-time warning)
  on 16; migrate the Sentry option when convenient.

## References

- /docs/adr/0013-deploy-infrastructure-contract.md (Invariant 2 + Invariant 3b — the
  webpack `extensionAlias` + server externals this bridge keeps active)
- /docs/adr/0014-mvp-locked-invariants-and-review-protocol.md (§9 CSP — unchanged on 16)
- /apps/web/next.config.mjs (the `webpack()` function `--webpack` keeps in force; authored
  as `.mjs` to avoid the Next 16 `.ts`-config CJS-in-ESM loader crash)
- /apps/web/package.json (`build`/`dev` scripts pinned to `--webpack`)
- PR #200 (next 16 + the `--webpack` bridge); Dependabot #181
- https://nextjs.org/docs/app/guides/upgrading/version-16 (Turbopack-default + `--webpack`)
