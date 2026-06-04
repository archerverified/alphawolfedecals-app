---
type: session-handoff
date: 2026-06-04
session_type: claude-code
related_pr: '#90, #91, #92'
related_step: 'Goal 3a — Design canvas MVP (goal-chain-2-through-4.md)'
tags:
  - handoff
  - goal-3a
  - canvas
  - editor
  - orders
---

# Session handoff — 2026-06-04 (Goal 3a — Design canvas MVP)

> Goal 3a ships the customer design canvas end-to-end: open the editor, place +
> style artwork, autosave, reload-and-resume, and **submit for production** (which
> creates a `db.order` row — no payment). The base editor (route shell, canvas
> mount, upload + place, undo/redo, autosave engine) already shipped with PR #38,
> so this session delivered the **remaining** 3 of the 5 planned PRs on top of it.
> Customer-journey diagram: `docs/vault/diagrams/goal-3a-canvas.md`.

## Reconciliation with the 5-PR plan

The plan predates the actual codebase state. Audit before writing any code:

| Plan PR                                   | Status entering session                                    | This session |
| ----------------------------------------- | ---------------------------------------------------------- | ------------ |
| PR1 route shell + canvas mount            | ✅ already on `main` (PR #38), at `/projects/[id]/editor`  | —            |
| PR2 asset upload + place                  | ✅ already on `main` (PR #38)                              | —            |
| PR3 color picker + text tool              | text tool ✅; **color picker missing**                     | **PR #90**   |
| PR4 save/load polish + autosave indicator | engine + indicator ✅; **manual Save + analytics missing** | **PR #91**   |
| PR5 submit-for-production + db.order      | **entirely missing** (no `order` table)                    | **PR #92**   |

## What shipped

- **PR #90 — color picker** (`feat/editor-color-and-text`). New `ColorField`
  inspector control (preset wrap swatches + OS picker + validated hex) for text
  `fill` and shape `fill`/`stroke`; commits as undoable `updateElements`. Built
  from existing shadcn primitives — no new dep (ADR-0013). Enabled vitest's
  automatic JSX runtime so component-render tests work.
- **PR #91 — save UX + analytics** (`feat/editor-save-ux`). Manual **Save** button
  (flushes the debounced queue) + instrumented `editor_opened`, `asset_placed`,
  `design_saved` via the env-gated `capture` helper.
- **PR #92 — submit-for-production + `db.order`** (`feat/editor-submit-flow`).
  `Order` model + `order_status` enum + migration + owner-scoped RLS;
  `orders.submitForProduction` (one txn: freeze working→submitted, clone working
  forward, project→active, INSERT order); RPC-style `submitForProductionAction`;
  `SubmitDialog` (fires `submit_clicked`); `/projects/[id]/order-confirmed` page.
- **Closeout**: this note, the customer-journey sequence diagram, `activities.md`
  entries (one per PR + a summary).

## Decisions made

- **Route is `/projects/[id]/editor`**, not the plan's `/editor/[projectId]` —
  the existing PR #38 route wins (TASK 2 already flagged this).
- **Custom `ColorField` over a new dependency** — shadcn has no color picker; a
  popover of primitives respects ADR-0013's no-new-server-external-dep rule.
- **RPC-style submit action** (not a CSRF FormData action) — mirrors the existing
  `saveCanvasAction`: Next origin check + `requireUser` + RLS, Sentry-auto.
- **Order pins the frozen version** and the customer keeps editing a cloned
  working version (ADR-0006 §4 milestone pattern, reusing `snapshotVersion` logic).
- **`@alphawolf/observability` exports only `scrubSentryEvent`** — there is no
  "Sentry scope wrapper" helper; Server Actions rely on the Sentry Next SDK's
  automatic instrumentation. Followed the codebase, not the prompt's idealization.

## What the next session needs to know

- **The `orders` migration must be applied to prod**: `prisma migrate deploy`
  (no shadow DB — no footgun) **then** `db:apply-sql` for the new RLS policies.
  CI only runs `prisma generate`, so it does NOT apply or validate migrations.
- **Goal 3b consumes this schema**: `orders.owner_shop_id` is the routing shop,
  and `orders_shop_read` RLS already lets shop members read their orders.
- **PostHog production verification is out-of-band**: the 4 events are wired and
  env-gated (no-op without `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`). Confirm they fire
  on the PostHog dashboard after a real signed-in production run — this session
  cannot drive an authenticated prod browser session to emit them.

## Files touched (highlights)

- `apps/web/components/editor/`: `ColorField.tsx`, `SubmitDialog.tsx`,
  `CanvasEditor.tsx`, `useAutosave.ts` (+ tests).
- `apps/web/lib/actions/order.ts`, `apps/web/app/projects/[id]/order-confirmed/page.tsx`.
- `packages/db`: `schema.prisma`, `migrations/20260604120000_orders/`,
  `sql/auth_rls.sql`, `src/repos/orders.ts`, `src/index.ts`.

## Cross-references

- Diagram: `docs/vault/diagrams/goal-3a-canvas.md`
- Plan: `goal-chain-2-through-4.md` → Goal 3a; spec `prompts/03-goal-3a-canvas.md`
- ADRs: ADR-0006 (canvas model), ADR-0007 (asset storage), ADR-0013 (deploy contract)
- PRs: #90, #91, #92 (base editor: #38)
