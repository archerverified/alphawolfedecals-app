# ADR-0001: Lock the v1 stack to Next.js 15 + Node + Postgres + Python AI service

- **Status**: Accepted
- **Date**: 2026-05-18
- **Deciders**: Archer
- **Related stories**: All Phase 1 stories
- **Supersedes**: n/a

## Context

The PRD (§8.5) recommends a stack. This ADR formally locks it for v1 so contributors (especially Claude Code in autonomous sessions) don't drift into competing technologies on a per-PR basis.

The product needs: a high-fidelity canvas editor in the browser, a stateless API tier with strong typing, a relational store with row-level security for multi-tenant safety, and a separate service for AI orchestration and PDF/geometry work that doesn't belong on the API hot path. Phase 6 adds a mobile client that should share as much code as possible with the web client to keep the team small.

## Decision

We use this stack for the entirety of v1. Any deviation requires a superseding ADR before merge.

**Web client**
- Next.js 15 (App Router) + React 19
- TypeScript in strict mode, repo-wide
- Tailwind v4 + shadcn/ui
- Konva.js for the canvas editor (wrap editor in GH-008)

**API**
- Node.js with Express (or Hono — engineering choice, locked at first PR)
- Same TypeScript config as the web client
- Prisma as the ORM
- Auth.js with credentials + email OTP provider

**Database + storage**
- Postgres on Supabase (auth, RLS, storage all in one)
- Row-level security policies enforce shop/customer isolation at the query layer
- Supabase Storage for raw uploads; consider Cloudflare R2 if egress bills become a problem

**AI + heavy-compute services (separate processes)**
- Python 3.12 with FastAPI
- One service for AI orchestration (Claude prompts, model routing through OpenRouter)
- One service for the print paneling engine and PDF composition (PRD §4.6, §4.8)
- Both run on Fly.io or Google Cloud Run, autoscale on queue depth

**Email**
- Resend for transactional. SES configured as fallback in Phase 4.

**Background jobs**
- BullMQ on Redis (Upstash). Each AI generation, each export becomes a job.

**Observability**
- Sentry for errors, PostHog for product analytics, OpenTelemetry traces shipped to Honeycomb (or Grafana Cloud — picked at first PR).

**Mobile (Phase 6)**
- React Native via Expo. Shares the `packages/` directory with the web client.

**Build tooling**
- pnpm workspaces (monorepo)
- Turborepo for task orchestration
- Vitest for unit tests, Playwright for E2E

## Alternatives considered

- **Next.js + Go backend**: Go would win on raw performance for the paneling engine, but the Python ML/PDF ecosystem (ReportLab, Shapely, OpenCV) is mature in ways Go isn't. We'd ship slower for a perf win we won't measure in v1.
- **Full Python stack (FastAPI + HTMX or FastAPI + Next.js)**: tighter integration with AI, but the editor will be the heaviest part of the product — a React-native editor on a Python backend keeps the heavy lift where the ecosystem is strongest.
- **Remix instead of Next.js**: stronger data-loading primitives but smaller ecosystem and less Vercel-native deploy story. Net loss for v1.
- **Drizzle instead of Prisma**: leaner, faster, but Supabase's docs and tooling assume Prisma. Net loss for v1.
- **Custom queue on Postgres (skipQ, graphile-worker)**: tempting to avoid Redis, but BullMQ's UI, retry semantics, and concurrency control save engineering time. Worth one more dependency.
- **Konva vs Fabric.js vs Pixi**: Konva wins on its layer/group model matching our per-panel architecture (PRD §4.5). Fabric is more popular but the per-shape model doesn't map cleanly to wrap masking. Pixi is overkill (we don't need WebGL effects).

## Consequences

**Positive**
- The whole team (and Claude Code) operates on one TypeScript codebase for client + API, with one Python codebase for AI/heavy work. Cognitive load stays low.
- Supabase covers auth, DB, storage, and RLS — three vendors collapse to one for v1.
- React Native in Phase 6 reuses ~70% of TypeScript by following the `packages/` discipline now.

**Negative**
- Two languages = two CI pipelines, two dependency graphs, two test runners. Acceptable cost.
- Vendor concentration on Supabase: if they raise prices or change auth semantics, migration is real work. Mitigated by using Postgres-standard SQL (avoid Supabase-specific extensions where possible) and isolating auth behind an interface in `packages/auth`.
- Locked stack means contributors *can't* reach for a more familiar tool. Friction by design.

**Follow-ups**
- First PR establishes the monorepo skeleton with `apps/web`, `apps/api`, `services/ai`, `services/paneling`, `packages/db`, `packages/ui`, `packages/canvas`, `packages/auth`.
- Provision Supabase project (see Phase 1 readiness checklist).
- Provision Resend sender domain.
- ADR-0002 will lock the canvas-editor data model (Konva scene → DB persistence shape) when GH-008 starts.

## References

- /prd.md §8.5
- /docs/claude-code-kickoff.md (stack section)
- /docs/phase-1-readiness-checklist.md
