# @alphawolf/api

Node + Express + TypeScript strict API tier for Alpha Wolf Wrap Studio.

## Stack

- **Express 5** on Node 22
- **TypeScript strict** (extends `tsconfig.base.json`)
- **BullMQ + ioredis** for the job queue (Upstash Redis)
- **Prisma** via `@alphawolf/db`
- **Auth.js** via `@alphawolf/auth`

## Layout

```
src/
  index.ts            # express app + /health
  queue/
    connection.ts     # singleton ioredis connection from env
    queues.ts         # bullmq Queue declarations: parse, ai, paneling
  routes/             # feature routes land here per PRD story
```

## Scripts

```bash
pnpm --filter @alphawolf/api dev          # tsx watch
pnpm --filter @alphawolf/api build        # tsc
pnpm --filter @alphawolf/api start        # node dist/index.js
pnpm --filter @alphawolf/api lint
pnpm --filter @alphawolf/api typecheck
pnpm --filter @alphawolf/api test
```

## Queue topology

`QUEUE_NAMES` in `src/queue/queues.ts` is the single source of truth for queue
names. Workers in `services/parse`, `services/ai`, `services/paneling`
subscribe to the matching names. Step 5 fills in payload schemas.

## RLS / `app.current_user_id`

Per ADR-0002, every request sets the Postgres session variable
`app.current_user_id` via Prisma `$extends` middleware before executing
queries. RLS policies in `packages/db` read it. Middleware lands in the
auth feature PR.
