# Prisma 5 -> 7 upgrade plan (Dependabot #180 — HELD by Goal 19)

**Status:** HELD with this plan. Dependabot #180 (`@prisma/client` 5.22.0 -> 7.8.0) is
**not merged**. It is a two-major, driver-adapter rewrite that rewrites the ADR-0014
two-connection DB split and retires an ADR-0013 deploy invariant, and it is **not a
security fix** (no advisory against `@prisma/client` 5.22). Forcing it into a
dependency-triage goal would be the opposite of "current+secure without breaking locked
invariants." It needs its own focused goal. This document is the actionable plan.

## Why it can't land in Goal 19

The bare Dependabot PR (3 manifest lines) **cannot compile or deploy** — both the Node CI
job and the Vercel build fail on it — because Prisma 7 changes the client architecture, not
just the version. Confirmed by the D1 research (official Prisma 6 + 7 upgrade guides +
reading the repo's `packages/db/src/client.ts`, `crypto.ts`, `schema.prisma`,
`next.config`):

## What breaks (concrete, repo-specific)

1. **Default generator changes + `output` now required.** Prisma 7's default generator is
   `prisma-client` (not `prisma-client-js`), and the generator block must declare an
   `output` path; the client is no longer emitted into `node_modules/@prisma/client`.
   `packages/db/prisma/schema.prisma` uses `provider = "prisma-client-js"` with no `output`
   -> `prisma generate` (run via the `packages/db` postinstall on every build) hard-errors.
   *This is a primary reason Node CI + Vercel both fail.*
2. **Rust-free client -> driver adapter required.** Prisma 7 drops the Rust query-engine
   binary; PostgreSQL connections require a JS driver adapter (`@prisma/adapter-pg` + `pg`).
   `packages/db/src/client.ts` builds two clients with `new PrismaClient({ datasourceUrl })`
   (getPrisma + getSystemPrisma) — unsupported on 7. The **ADR-0014 two-connection split**
   (`app_user` `DATABASE_URL_APP` RLS-enforced vs superuser `DATABASE_URL` RLS-bypassing)
   must be re-expressed as **two separate `PrismaPg` adapter instances**, preserving the
   exact boundary (the silent-superuser-fallback footgun must stay closed).
3. **`binaryTargets` obsolete (ADR-0013 Inv3c retired).** With no engine binary,
   `binaryTargets = ["native","rhel-openssl-3.0.x","debian-openssl-3.0.x"]` and the
   `apps/web` `.prisma/client` engine-hoist rationale in `next.config` no longer apply.
   Pooling moves to the `pg` driver. **This retires a locked deploy invariant -> requires an
   ADR-0013 amendment.**
4. **Prisma 6: `Bytes` -> `Uint8Array` (not `Buffer`).** All `Bytes` columns and raw-query
   `Bytes` results return `Uint8Array` on Prisma 6+. The schema has **8 encrypted-PII `Bytes`
   columns** (User email/firstName/lastName/phone + emailLowerHash; shop companyName/website/
   address). `crypto.ts` types `$queryRaw` results as `Buffer` and returns `Promise<Buffer>`;
   `repos/users.ts` types encrypted fields as `Buffer`. These become `Uint8Array` ->
   **TypeScript typecheck fails** (the second reason Node CI fails). The pgcrypto
   encrypt/decrypt round-trip must be re-verified on the `Uint8Array` path.
5. **ESM + `prisma.config.ts`.** Prisma 7 ships ESM and no longer auto-loads env; CLI config
   (schema path, migrations, seed, datasource) moves to a root `prisma.config.ts`. No such
   file exists; the inline `prisma` block in `packages/db/package.json` + the
   `dotenv -e .env --` script wrappers must migrate. `--shadow-database-url` is removed
   (configured via `prisma.config.ts`) — note the existing MEMORY `prisma-shadow-db-footgun`.
6. **`migrate dev` / `db push` no longer auto-run `generate`.** The standalone postinstall
   `prisma generate` becomes the only generation trigger; `db:setup` semantics change.

Raw-query APIs (`$queryRaw`/`$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe`) are
**unchanged**, so the ADR-0014 `$executeRawUnsafe` + `pgQuoteLiteral` pooler pattern survives
(only the `Bytes` return type shifts). RLS policies, the SECURITY DEFINER helpers, and the
`auth_rls.sql` apply flow are untouched by the bump itself.

## Migration steps (staged, in a dedicated worktree)

1. **Stage through Prisma 6 first** (isolate the Bytes fallout): bump to `^6.x`,
   `prisma generate`, fix `crypto.ts` + `repos/users.ts` `Buffer` -> `Uint8Array` typings,
   get `pnpm turbo run typecheck` green. Commit as a discrete step.
2. **Bump to `^7.8.0`:** schema generator `provider = "prisma-client"` + required `output`
   (e.g. `../src/generated/prisma`) + **remove `binaryTargets`**; add `@prisma/adapter-pg`
   + `pg` (+ `@types/pg`) to `packages/db`; rewrite `client.ts` `getPrisma`/`getSystemPrisma`
   to construct `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` for the
   two connection strings (preserve the `app_user` vs superuser split + the
   `warnRlsBypassOnce` footgun guard); repoint the `PrismaClient` import to the generated
   output.
3. **Create `prisma.config.ts`** (schema path, migrations dir, seed `tsx seeds/index.ts`,
   explicit env loading); remove the inline `prisma` block + adjust the `db:*` scripts.
4. **Update `apps/web`:** hoist `@prisma/adapter-pg` + `pg` as direct deps (ADR-0013 Inv3b
   recipe — nft needs them in `apps/web/node_modules`); add them to `serverExternalPackages`
   + the webpack `config.externals` server block in `next.config.mjs`; drop the
   `.prisma/client` engine-binary comment block. Reassess whether `@prisma/client` must stay
   hoisted now that there's no engine binary.
5. **Write the amendment ADRs:** ADR-0013 (Inv3b: the `@prisma/client` engine hoist becomes a
   `pg`/`@prisma/adapter-pg` hoist+external; Inv3c retired — no engine binary), and ADR-0014
   (the two-connection split re-implemented via two `PrismaPg` adapters; the
   `connection_limit=1` + transaction-pooler note re-expressed for the `pg` driver; the
   `Bytes` `Buffer`->`Uint8Array` shift in session-config/crypto). Run graphify PR-impact on
   the `withUser`/`withSystem` god-node before merge.

## Test matrix (the gate before any merge)

- `prisma generate` succeeds (new generator/output) + `pnpm turbo run typecheck` green
  (Bytes/Uint8Array).
- `packages/db` **integration RLS suite** (`*-rls.integration.test.ts`) against a LOCAL
  throwaway Postgres: `withUser` still enforces RLS, `withSystem` still bypasses, the
  `orders_shop_update` WITH CHECK still blocks re-routing — all through the new adapters.
- Transaction-pooler behaviour: prepared-statement collisions still avoided (the
  `$executeRawUnsafe` session-config path under `PrismaPg`).
- **PII encrypt/decrypt round-trip** on the `Uint8Array` path (pgcrypto via `app.pii_key`)
  returns correct plaintext; `app_email_lookup_hash` still matches its unique index.
- **Both runtimes:** a Vercel **preview** deploy AND a Render build resolve the `pg` driver at
  runtime (no `MODULE_NOT_FOUND`); prod smoke (when the MVP smoke is repaired) + Sentry 0-new.
- §3 fresh-context review **+ advisor() second opinion** (RLS/DB-split/deploy-config) recorded
  in the PR.

## Recommendation

Schedule as its own goal ("Prisma 7 driver-adapter migration") with the above as the spec.
Effort: roughly a full goal (driver-adapter rewrite of the locked DB boundary + 2 ADR
amendments + RLS re-verification + dual-runtime deploy verification). Until then, `@prisma/
client` 5.22.0 stays — it carries no known advisory, so holding incurs no security debt.
