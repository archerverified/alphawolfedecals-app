# @alphawolf/db

Prisma schema, migrations, and seeds.

**Status:** empty schema. Models land in feature PRs.

## RLS

Row-level security policies are added as raw SQL inside Prisma migrations. The
runtime sets `app.current_user_id` per request via Prisma `$extends`; policies
read it through `current_setting('app.current_user_id')::uuid`. See ADR-0002.

## Scripts

```bash
pnpm --filter @alphawolf/db prisma:generate
pnpm --filter @alphawolf/db prisma:migrate:dev
pnpm --filter @alphawolf/db db:seed
```
