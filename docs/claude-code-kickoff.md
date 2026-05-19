# Claude Code — Phase 1 kickoff prompt

Copy the block below into Claude Code from the repo root (`alphawolfedecals-app/`).

The prompt is opinionated by design: it tells Claude Code exactly what to read first, exactly what to clarify before writing code, and exactly how to log decisions. Don't rewrite it. Run it, answer the questions it asks, and let it scaffold.

---

```
You are building Phase 1 of Alpha Wolf Wrap Studio. Treat this as a greenfield repo with strong opinions.

## Read first (in this order, before any code)
1. /prd.md — full product spec, version 1.1. The contract for what we're building.
2. /activities.md — project decision log. Every decision and direction change goes here.
3. /docs/vehicle-database-spec.md — schema and sourcing plan for the vehicle template library.
4. /journey-and-architecture.html — visual companion: customer journeys, system topology, data model.

After reading, summarize back to me in <200 words what Phase 1 actually ships, what it does not, and what the three hardest engineering problems are. Do not start coding until I confirm your read.

## Phase 1 scope (weeks 1-4)
Implement and ship behind a feature flag:
- GH-001 customer signup + email OTP
- GH-002 shop signup + org creation
- GH-003 vehicle template browse/select (cascade + facets + search)
- GH-004 internal admin vehicle template CRUD
- GH-005 asset upload + vector parsing pipeline
- GH-008 canvas editor (base; AI integration deferred to Phase 2)

Do NOT touch Phase 2+ stories (AI gen, print paneling, etc.) in this phase, even if dependencies tempt you.

## Stack (locked)
- Next.js 15 App Router, React 19, TypeScript strict mode
- Tailwind v4 + shadcn/ui
- Node/Express API (separate package in the monorepo)
- Postgres via Supabase (auth, RLS, storage)
- Konva.js for the canvas editor
- Auth.js for credentials + email OTP
- Resend for transactional email
- Inkscape (CLI) + svgo for server-side vector parsing
- pnpm workspaces

If a choice isn't on this list, ask me before adopting it. Default to "boring tech."

## Repo layout (create if missing)
/apps/web         Next.js app (customer + shop UI + admin)
/apps/api         Node/Express API
/packages/db      Prisma schema + migrations + seeds
/packages/ui      Shared shadcn/Tailwind components
/packages/canvas  Konva editor primitives
/services/parse   Vector parsing worker
/docs             PRD, specs, this file, ADRs
/docs/vault       Obsidian vault (decisions, journey notes)
/scripts          Operational scripts (incl. create-github-issues.sh)

## Working agreement
- One PR per user story. Title format: `[GH-XXX] <story title>`.
- Open the PR as draft when you start. Move to ready when AC pass.
- Every PR description links to its issue and lists the AC checkboxes from the PRD.
- Every architectural decision lands as an ADR in /docs/adr/NNNN-title.md AND a new entry at the top of /activities.md.
- Pre-commit hooks: prettier, eslint, type-check, vitest. No exceptions.
- Conventional commits.
- No mocks for the DB in integration tests — Supabase local or testcontainers.
- Sentry + PostHog wired from day one but feature-flagged off in dev.

## Before you write any code
Ask me to confirm:
1. Supabase project ready or do you bootstrap one?
2. Domain name decision (app.alphawolfwrap.com? something else?)
3. Resend sender domain available?
4. Branch protection rules on main?
5. Anything in this prompt that conflicts with what you read in the PRD?

## Done definition for Phase 1
- All 6 Phase 1 stories pass their AC in CI.
- Lighthouse mobile + desktop ≥90 on the marketing landing + signup pages.
- One internal Alpha Wolf admin can:
  - Sign up, verify email, log in
  - Create a vehicle template with SVG upload
  - Browse and select that template in the customer flow
  - Upload a logo and see it on the editor canvas (no AI yet)
- Deploy to a staging env behind a basic-auth gate.
- Demo recorded and dropped into /activities.md.

Begin by completing the "Read first" step. Do not skip ahead.
```

---

## How to use this with VS Code + Claude Code

1. Make sure the repo is cloned and `gh auth status` reports authenticated.
2. Open the repo in VS Code.
3. From the integrated terminal, run the issue seeder once:
   ```
   chmod +x scripts/create-github-issues.sh
   ./scripts/create-github-issues.sh
   ```
4. Launch Claude Code in this repo (`claude` or via the VS Code extension).
5. Paste the prompt block above into Claude Code's first message.
6. Answer its clarifying questions. Then let it work.

## What to do if Claude Code drifts

- It tries to start coding before reading: tell it "stop, complete the Read first step."
- It pulls in Phase 2 work: tell it "park that; create a Phase 2 issue if missing and move on."
- It proposes a new dependency not in the locked stack: tell it "open an ADR first; do not add until approved."
- It forgets to update `activities.md`: that's a PR blocker. Tell it to log the decision retroactively in the next entry.
