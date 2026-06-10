---
type: session-handoff
date: 2026-06-08
session_type: claude-code
related_pr: '#97, #98'
related_step: 'Goal 3c — Email notifications + production smoke test'
tags:
  - handoff
  - goal-3c
  - notifications
  - email
  - smoke-test
---

# Session handoff — 2026-06-08 (Goal 3c — Email notifications + MVP smoke)

> Goal 3c wires the transactional order-email layer and the canonical MVP smoke.
> Built **self-contained with a Goal 3b seam** (per the scoping decision), since
> only Goal 3a is on `main` — Goal 3b is open but unmerged (#94–#96).

## What shipped

- **PR #97 — feat/order-notifications** (open, pending merge): new pure
  `@alphawolf/notifications` package (4 PII-safe templates + non-throwing dispatch
  with injected effects); apps/web wiring (reuses `@alphawolf/auth`'s single Resend
  client, server-side PostHog over HTTP, BullMQ retry producer, submit action now
  dispatches customer + shop emails); apps/api email retry worker.
- **PR #98 — feat/mvp-smoke-spec** (open, stacked on #97): `mvp-flow.spec.ts`
  (customer loop now, shop loop gated), `.github/workflows/smoke.yml`, auth-gate
  decision (pre-seeded accounts).
- Sequence diagram: [[goal-3c-notifications]]
  (`docs/vault/diagrams/goal-3c-notifications.md`).

## What's still in flight

- **Both PRs open** — gated on CodeRabbit + the 4 CI checks + Archer's merge. #98
  must be retargeted from `feat/order-notifications` to `main` after #97 merges.
- **Live verification is operational** (couldn't run from the build session):
  - Real Resend sends — sandbox key only delivers to the account owner until the
    domain is verified (GH-016 / manual-steps item 5). Blocks true 4-template
    delivery confirmation + PostHog `email_sent` on prod.
  - MVP smoke against a deployed target needs `SMOKE_CUSTOMER_EMAIL/PASSWORD`
    (pre-seeded verified account) repo secrets + a reachable DB.
  - The shop half of the smoke + the `order_in_production`/`order_fulfilled`
    emails need **Goal 3b merged** (then set `SMOKE_INCLUDE_SHOP=1` and wire the
    seam call — see below).

## Decisions made (link/log)

- **Scope = self-contained 3c + seam** (Archer's call). 3c does not absorb the 3b
  dashboard; instead `order_in_production`/`order_fulfilled` are ready-to-call,
  unit-tested dispatch functions that 3b wires in one line.
- **Template names track the `OrderStatus` enum**, not the spec's prose. Enum is
  the source of truth (`submitted, in_production, fulfilled, cancelled`):
  accepted→`in_production`, completed→`fulfilled`.
- **Auth gate = Option (a) pre-seeded accounts + password login.** No prod OTP
  backdoor; rejected (b) header-gated dev-otp (in-memory ring isn't
  serverless-safe) and (c) Resend webhook (extra infra). Documented in #98.
- **Shop receipt → ops inbox** (`ORDERS_OPS_EMAIL`): the Shop model has no contact
  email, and resolving member emails would decrypt PII into a header.
- **Server PostHog via the HTTP capture endpoint** (no `posthog-node` dep).

## What the next session needs to know

- **Goal 3b seam:** after a status transition writes `in_production`/`fulfilled`,
  call `apps/web/lib/notifications/order-emails.ts → dispatchOrderStatusEmail(ctx,
status)`. It never throws (won't block the transition). Pointer comment lives in
  `packages/db/src/repos/orders.ts`.
- **New env** (`.env.example` + `turbo.json`): `ORDERS_OPS_EMAIL`. PostHog uses
  existing `POSTHOG_API_KEY`/`POSTHOG_HOST`. Retry queue uses `REDIS_URL` /
  `UPSTASH_REDIS_URL`. apps/api needs `RESEND_API_KEY` for the retry worker to send.
- **CI**: `smoke.yml` runs on `deployment_status` — only active once on `main`
  (default-branch rule). Add the `SMOKE_*` secrets to enable the deployed run.

## Bugs surfaced this session

- None surfaced in shipped code. Pre-existing in the fresh worktree: apps/web
  vitest fails until `pnpm --filter @alphawolf/db exec prisma generate` runs (CI
  does this); turbo replays cross-worktree cache logs (cosmetic — artifacts land
  in the correct worktree). Neither is a Goal 3c regression.

## Files touched

- `packages/notifications/**` (new package: types, templates, format, dispatch, tests)
- `apps/web/lib/notifications/**` (effects, order-emails, posthog-server, retry-queue)
- `apps/web/lib/actions/order.ts` (dispatch wiring), `apps/web/tests/**`
- `apps/api/src/queue/email-worker.ts` + `src/index.ts`, `apps/api/tests/**`
- `apps/web/e2e/mvp-flow.spec.ts`, `e2e/support/flows.ts`, `.github/workflows/smoke.yml`
- `packages/db/src/repos/orders.ts` (seam comment), `.env.example`, `turbo.json`

## Cross-references

- Related PRs: #97 (feat/order-notifications), #98 (feat/mvp-smoke-spec)
- Related diagram: [[goal-3c-notifications]]
- Related step: Goal 3c (`prompts/05-goal-3c-notifications.md`,
  `goal-chain-2-through-4.md` → Goal 3c)
- Goal 3b dependency: open PRs #94–#96 (shop dashboard + status transitions)
