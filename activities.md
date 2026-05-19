# Alpha Wolf Wrap Studio — Project Activities Log

Append-only event log for the build. Every architectural decision, story completion, and meaningful working session gets a new entry at the top. Do not edit prior entries — corrections are new entries that reference the original.

Companion to the Obsidian vault at `/docs/vault/`. The in-app per-project activities log (PRD section 4.10, story GH-013) is a separate concept — this file is the project-level dev log.

---

## 2026-05-18 — Archer + Claude (monorepo skeleton + CI)

- **Decision**: Adopted pnpm workspaces + Turborepo as the monorepo orchestration. Top-level layout locked: `apps/{web,api}`, `services/{parse,ai,paneling}`, `packages/{db,ui,canvas,auth}`. Adding a new top-level package or service now requires a superseding/supplementary ADR.
- **Decision**: GitHub Actions CI runs `lint + typecheck + test` for Node (`pnpm turbo run …`) and matrixed `ruff + pytest` for Python services on every PR. Merge to `main` is blocked on green. Conventional commits enforced via husky `commit-msg` + commitlint; PR title is not CI-enforced so `[infra]` prefixes are permitted.
- **Decision**: API tier is Express 5 (deferred Express/Hono pick from ADR-0001). Background jobs use BullMQ on Upstash Redis; queue names (`parse`, `ai`, `paneling`) declared centrally in `apps/api/src/queue/queues.ts`.
- **Decision**: Multi-tenant isolation enforced at the database via Postgres RLS, with the user ID propagated through the Postgres session variable `app.current_user_id`. Set by Prisma `$extends` middleware per request (transaction-scoped via `set_config(…, true)`); policies read it via `current_setting('app.current_user_id', true)::uuid` (fails closed when unset). All Prisma calls must flow through the `@alphawolf/db` client factory — bare `@prisma/client` imports will be linter-blocked in the auth feature PR.
- **Decision**: `services/parse` is a Node worker (not Python), running Sharp + svgo + Inkscape CLI + pdf2svg CLI + rembg via the Replicate API. AI orchestration and print paneling remain Python per ADR-0001. This amends ADR-0001's Python-only stance on backend services.
- **Decision**: Python services standardize on **uv** (`uv sync --frozen`, `uv run`) for env + dependency management. pyproject.toml + uv.lock are the canonical files.
- **Artifacts produced**: `apps/web` (Next.js 15 + React 19 + Tailwind v4 + shadcn/ui scaffolding + Playwright + Vitest), `apps/api` (Express 5 + BullMQ queue wiring), `services/parse` (Node stub, `/health` only), `services/ai` + `services/paneling` (FastAPI stubs, `/health` only), `packages/db` (empty Prisma schema), `packages/ui` (shadcn target package + `cn()` helper), `packages/canvas` + `packages/auth` (empty placeholders), root tooling (pnpm-workspace, turbo, tsconfig.base, ESLint flat config, Prettier, commitlint, husky, lint-staged), `.github/{pull_request_template.md, workflows/ci.yml}`, `CODEOWNERS`, `.env.example` (all keys from the readiness checklist, no values), ADR-0002, ADR-0003.
- **Hard scope**: No GH-001…GH-022 implementation in this PR. Structure and tooling only.
- **Followups**: Auth feature PR adds Prisma `$extends` middleware, ESLint rule banning bare `@prisma/client` imports, and the first RLS policies. Deployment ADR (later) records the Docker base image with Inkscape + pdf2svg preinstalled. Observability stack (Sentry / PostHog / OpenTelemetry) wired in its own ADR + PR.

## 2026-05-18 — Archer + Claude (kickoff infrastructure)

- **ADRs**: Created ADR template at `/docs/adr/template.md`, ADR-0000 (record decisions using MADR), ADR-0001 (lock v1 stack to Next.js 15 + Node + Postgres + Python AI services).
- **Readiness checklist**: Created `/docs/phase-1-readiness-checklist.md` covering accounts, secrets, domain, repo hygiene, team cadence, vehicle DB pre-work, and legal stubs.
- **Status**: All planning artifacts now in repo. Phase 1 kickoff blocked only on running the readiness checklist.
- **Followups**: After readiness checklist passes, paste `/docs/claude-code-kickoff.md` prompt into Claude Code in the repo. First Claude Code session should produce ADR-0002 locking the monorepo skeleton + Auth.js setup.

## 2026-05-18 — Archer + Claude (PRD draft)

- **Decision**: Adopted Core MVP scope for v1 (Auth + vehicle selector + AI generation + print paneling + detailed export). Defer customer portal, installer mode, material estimator to v1.1/v2.
- **Decision**: Hybrid AI architecture — Claude Sonnet 4.6 for orchestration, Flux/Higgsfield for image generation. Router chooses per generation based on cost/quality.
- **Decision**: Two-sided user model (Customer + Shop) with project token handoff. Alpha Wolf is the default routing shop at launch.
- **Decision**: Proprietary vehicle template DB. Top 50 vehicles in v1. Build > license for moat.
- **Decision**: Next.js 15 + Node/Express + Postgres + Python AI microservice. Mobile via React Native in Phase 6.
- **Decision**: Pricing deferred; data model accommodates `subscription_status` + `plan_tier` from day one.
- **Decision**: Export PDF carries full metadata (vehicle, design, print production, project tracking) on cover sheet plus embedded as PDF/X structured data.
- **Followups**:
  - Phase 1 kickoff requires: codified design system (use `creative-design/ui-design-system` skill), data model spike, vehicle template schema review.
  - Need legal review of ToS for customer-uploaded brand assets before public launch (open question in PRD §12).
  - Decide AI cost transparency to customers — recommend absorb in v1.
- **Artifacts produced**: `prd.md` v1.0, `activities.md` (this file), `journey-and-architecture.html`.
