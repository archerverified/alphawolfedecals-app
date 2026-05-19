# Claude Code Playbook — Phase 1

Sequential prompts for Claude Code, in the exact order to run them. Each prompt is engineered to one outcome with explicit scope, stop conditions, and guardrails. Don't reorder. Don't merge. Don't paraphrase — paste exactly.

## TODO

- [ ] Step 0 — Setup (bash, one-time)
- [ ] Step 1 — Read + plan (Claude Code, no code)
- [ ] Step 2 — Monorepo skeleton + CI
- [ ] Step 3 — Auth scaffold (GH-001, GH-002, GH-020)
- [ ] Step 4 — Vehicle templates (GH-003, GH-004, GH-017)
- [ ] Step 5 — Asset upload + canvas editor base (GH-005, GH-008)
- [ ] Step 6 — Phase 1 demo

After each Claude Code session, review the PR, merge if AC pass, then move to the next step.

---

## Step 0 — Setup (run in terminal, from inside the repo)

```bash
# Copy remaining workspace files into the repo
mkdir -p docs/adr && \
cp "/Users/ashton/Documents/Claude/Projects/alphawolf-decals-app/docs/adr/template.md" docs/adr/ && \
cp "/Users/ashton/Documents/Claude/Projects/alphawolf-decals-app/docs/adr/0000-record-architecture-decisions.md" docs/adr/ && \
cp "/Users/ashton/Documents/Claude/Projects/alphawolf-decals-app/docs/adr/0001-locked-stack.md" docs/adr/ && \
cp "/Users/ashton/Documents/Claude/Projects/alphawolf-decals-app/docs/phase-1-readiness-checklist.md" docs/ && \
cp "/Users/ashton/Documents/Claude/Projects/alphawolf-decals-app/docs/claude-code-prompts.md" docs/ && \
cp "/Users/ashton/Documents/Claude/Projects/alphawolf-decals-app/activities.md" ./

# Commit
git add . && git commit -m "Add ADRs, readiness checklist, Claude Code playbook" && git push

# Seed GitHub issues (only run once — creates duplicates if re-run)
./scripts/create-github-issues.sh

# Verify
gh issue list --repo archerverified/alphawolfedecals-app --limit 30
```

Then work through `docs/phase-1-readiness-checklist.md`. Don't proceed to Step 1 until every box is checked.

---

## Step 1 — Read + plan

**Outcome:** Claude Code has read the spec, summarized it back to you, surfaced any contradictions, and proposed a PR sequence for Phase 1. No code yet.

**Paste this into Claude Code:**

````
You are a senior full-stack engineer starting work on Alpha Wolf Wrap Studio. This session is read-only — do not write or modify any code.

## Skills to activate
Load and apply these skills from /.claude/skills/ for this task:
- product-manager-toolkit (PR planning, story decomposition)
- product-strategist (gap analysis, scope challenge)
- software-architecture (cross-cutting architectural review)
- senior-architect (stack and topology validation)
- senior-prompt-engineer (apply prompt rigor to the questions you ask back)

Read these files in order, completely:
1. /prd.md
2. /docs/adr/0000-record-architecture-decisions.md
3. /docs/adr/0001-locked-stack.md
4. /docs/vehicle-database-spec.md
5. /docs/claude-code-kickoff.md
6. /activities.md

Then produce the following in your reply, in this exact order, using these headings:

## Phase 1 in 200 words
What ships, what doesn't, written for an engineer joining the team next week.

## Hardest three problems
The three problems most likely to cost extra time or require an ADR. One sentence each.

## Contradictions or gaps
Anything in the docs that conflicts, is ambiguous, or under-specifies what you need. If you find none, say "none." Don't invent gaps.

## Phase 1 PR plan
A numbered list of pull requests to ship Phase 1, in dependency order. Each item: PR title (using `[GH-XXX]` format), the stories it implements, and the rough size (S/M/L). Group related stories into a single PR only when they're tightly coupled (e.g., signup + OTP).

## Blocking questions
Up to 5 questions whose answers change what you build. Skip questions answered in the docs. Skip nice-to-knows.

Constraints:
- Do not propose any work outside Phase 1.
- Do not propose any dependency, library, or service not listed in ADR-0001. If something looks missing, list it as a blocking question.
- Do not write code, scaffold files, or run shell commands in this session.
````

**Review Claude Code's output.** Answer the blocking questions. Then move to Step 2.

---

## Step 2 — Monorepo skeleton + CI

**Outcome:** Repo has the package structure from ADR-0001, working CI on PRs, and the PR template/CODEOWNERS in place. One PR, ready to merge.

**Paste this into Claude Code:**

````
Implement the monorepo skeleton for Alpha Wolf Wrap Studio. One PR. No feature code in this PR — structure and tooling only.

## Skills to activate
Load and apply these skills from /.claude/skills/ for this task:
- senior-architect (monorepo design, package boundaries)
- software-architecture (cross-cutting decisions)
- file-organizer (directory layout, naming consistency)
- clean-code (baseline code standards, linter configs)
- workflow-automation (GitHub Actions CI, pre-commit hooks)
- code-reviewer (PR template, CODEOWNERS, review gates)

## Scope
Create the following directory layout. Each package gets a minimal package.json, tsconfig, and a README placeholder. No business logic yet.

/apps/web                Next.js 15 App Router + React 19 + Tailwind v4 + shadcn/ui
/apps/api                Node + Express + TypeScript strict
/services/parse          Node + Express worker + TypeScript strict (stub: /health only; full stack lands in Step 5)
/services/ai             Python 3.12 + FastAPI (stub: /health only)
/services/paneling       Python 3.12 + FastAPI (stub: /health only)
/packages/db             Prisma schema + migrations + seeds (empty schema for now)
/packages/ui             Shared shadcn components
/packages/canvas         Konva editor primitives (empty)
/packages/auth           Auth interface (empty)
/docs                    (already exists)
/scripts                 (already exists)

## Tooling
- pnpm workspaces + Turborepo
- Vitest at package level, Playwright at apps/web level
- ESLint + Prettier configs at the root, extended per package
- Husky + lint-staged pre-commit: prettier, eslint, tsc
- Conventional commits enforced via commitlint
- GitHub Actions: lint + test + typecheck on every PR. Block merge on failure.
- BullMQ + Upstash Redis wired (connection from env, empty queues). Exercised in Step 5 by services/parse.

## Repo plumbing
- /.github/pull_request_template.md requiring: linked issue, AC checklist copied from the PRD story, ADR link if applicable, screenshot if UI changes.
- /CODEOWNERS pointing all paths to @archerverified.
- /.env.example listing every env var named in /docs/phase-1-readiness-checklist.md "Secrets" section, with no values.
- /.gitignore covering Node, Python, Next.js, Turbo, .env*, .venv, __pycache__.

## ADRs (both land in this PR)
- **ADR-0002** covers four decisions: (1) monorepo layout + pnpm + Turborepo, (2) CI structure, (3) Auth.js + RLS-via-`current_setting('app.current_user_id')` pattern (set the PG session var via Prisma `$extends` middleware on every request; RLS policies read it), (4) Express + BullMQ + Upstash Redis as the API/queue stack.
- **ADR-0003** covers services/parse = Node worker (Sharp + svgo + Inkscape CLI + pdf2svg CLI + rembg via Replicate API), scope-limited to vector/raster parsing. Amends ADR-0001's Python-only stance on backend services.
- Use /docs/adr/template.md for both. Update /activities.md with a single new top entry summarizing both.

## Done definition
- pnpm install at repo root succeeds clean.
- pnpm turbo run lint test typecheck passes (with empty packages — tests can be skipped placeholders).
- The PR is open against main, draft → ready, CI green.
- ADR-0002 AND ADR-0003 committed in the same PR.
- /activities.md updated with a new top entry summarizing the decision.

## Hard constraints
- Do not implement any of GH-001 through GH-022 in this PR. Structure only.
- Do not add any dependency not implied by ADR-0001 without asking me first.
- Do not configure the Supabase client, Resend client, or Anthropic client yet — that lands in the relevant feature PR.
- If you hit an ambiguity, stop and ask. Do not guess.

Title the PR: `[infra] Monorepo skeleton + CI`
````

**After the session:** Review the PR. If AC pass, merge to main. Then Step 3.

---

## Step 3 — Auth scaffold (GH-001, GH-002, GH-020)

**Outcome:** Customer + shop signup with email OTP, hardened sessions, account type permanence enforced.

**Paste this into Claude Code:**

````
Implement Phase 1 auth. Three stories, one PR (they share infrastructure so coupling is correct here):
- GH-001 Customer signup + email OTP
- GH-002 Shop signup + org creation
- GH-020 Auth + session hardening

## Skills to activate
Load and apply these skills from /.claude/skills/ for this task:
- api-security-best-practices (auth flows, sessions, CSRF, rate limiting, OWASP Top 10)
- senior-data-engineer (Prisma schema, Supabase RLS, pgcrypto column encryption)
- react-best-practices (signup UI components, form state, accessibility)
- ui-design-system (signup screen tokens, button hierarchy)
- webapp-testing (Vitest unit + Playwright E2E for the full OTP flow)
- code-reviewer (security-focused review pass before marking ready)
- clean-code (general)

## Read first
- /prd.md §10.1, §10.2, §10.20 (acceptance criteria)
- /docs/adr/0001-locked-stack.md (Auth.js + Supabase)
- The corresponding GitHub issues for full AC.

## Scope
- Prisma schema additions: users, shops, memberships, otp_codes (with TTL), auth_events (audit log).
- Supabase RLS policies for users/shops/memberships such that no row is readable across orgs.
- Auth.js configured with credentials provider + email OTP via Resend.
- Argon2id password hashing (m=64MB, t=3, p=4).
- httpOnly, Secure, SameSite=strict session cookies. 30-day refresh.
- CSRF middleware on all state-changing routes.
- Rate limiting: 5 failed logins per IP per 15 min → lockout with exponential backoff; per-account lockout after 10 failures.
- Signup UI screens at /signup (customer) and /signup-shop (shop), both behind the same OTP flow.
- Email templates that pass SPF/DKIM/DMARC and score ≥9 on Mail Tester.

## Tests
- Vitest unit: password hashing, OTP generation/verification, lockout logic.
- Playwright E2E: full signup → OTP → landed on next screen flow for both account types.
- Integration tests hit a real Supabase instance (local or testcontainers). No DB mocks.

## ADRs
- ADR-0004 if any non-obvious decision came up in Auth.js configuration (e.g., session adapter choice, OTP storage strategy). (ADR-0003 was claimed in Step 2 for services/parse.)
- The Auth.js + RLS pattern itself is already locked in ADR-0002 from Step 2 — do not re-derive it.
- Skip ADR if the implementation was straightforward.

## Done definition
- All AC checkboxes in GH-001, GH-002, GH-020 pass.
- CI green.
- Test coverage on the auth package ≥80%.
- I can run pnpm dev locally, sign up as a customer with my email, receive the OTP, verify, and land on the next screen.
- Same for shop signup.
- /activities.md updated.

## Hard constraints
- Do not implement vehicle template, asset upload, or editor work — those are Step 4 and 5.
- Use Auth.js. Do not roll custom session management.
- All PII (name, email, phone) encrypted at column level via pgcrypto.
- Account type (customer vs shop_user) is permanent — enforce at the DB constraint level.

Title the PR: `[GH-001/002/020] Auth scaffold with email OTP`
````

---

## Step 4 — Vehicle templates (GH-003, GH-004, GH-017)

**Outcome:** Vehicle DB live, admin can CRUD templates, customers can browse/select, request loop wired.

**Paste this into Claude Code:**

````
Implement the vehicle template system. One PR covering:
- GH-003 Vehicle browse + select (cascade + search + facets)
- GH-004 Admin template CRUD
- GH-017 "Request this vehicle" loop

## Skills to activate
Load and apply these skills from /.claude/skills/ for this task:
- senior-data-engineer (vehicles/panels/requests schema, search index, facet queries)
- react-best-practices (cascade selector, search-as-you-type, faceted filter UI)
- ui-ux-pro-max (admin CRUD UX, browse/select flows)
- frontend-design (template preview card layout, empty states)
- ui-design-system (consistent control treatment with auth screens)
- web-design-guidelines (admin route shell)
- webapp-testing (SVG validator unit tests, browse-and-select E2E)
- code-reviewer (schema and validator review)

## Read first
- /docs/vehicle-database-spec.md (the schema and SVG standard are mandatory)
- /prd.md §10.3, §10.4, §10.17

## Scope
- Prisma schema from vehicle-database-spec.md §2 (vehicles, vehicle_panels, vehicle_template_requests).
- Admin UI at /admin/vehicles, role-gated (404 for non-admins).
- SVG upload validator enforcing every rule in vehicle-database-spec.md §3.4.
- Public read API for templates with the cascade + search behavior in GH-003 AC.
- Customer/shop UI for browse + facet filtering + selection.
- "Request this vehicle" form + admin queue + email-on-ship.
- Database seed loads any vehicle SVGs present in /packages/db/seeds/vehicles/ (so I can drop in the first 5 vehicles from the spec §4 Tier 1).

## Tests
- Vitest unit: SVG validator (rule-by-rule), search/facet query builder.
- Playwright E2E: browse-and-select flow for a customer, admin create flow with valid + invalid SVG.

## ADR
ADR-0005 documenting any deviation from the spec's schema if you find one needed. Otherwise no ADR.

## Done definition
- All AC checkboxes pass on the three stories.
- CI green.
- I can log in as admin, upload one of the 5 Tier 1 vehicle SVGs (when they exist), publish it, then switch to customer account and see it in the selector.
- "Request this vehicle" form submits and lands in the admin queue.
- /activities.md updated.

## Hard constraints
- Do not implement the canvas editor consumption of templates — that's Step 5.
- Use the schema in vehicle-database-spec.md §2 exactly. If you need to add a column, write an ADR first.
- Do not deploy a partial SVG validator. All rules in §3.4 or none.

Title the PR: `[GH-003/004/017] Vehicle template system`
````

---

## Step 5 — Asset upload + canvas editor base (GH-005, GH-008)

**Outcome:** Users can upload logos, vectors get parsed, base Konva canvas renders the selected vehicle with per-panel layers and wrap-safe masking. No AI yet.

**Paste this into Claude Code:**

````
Implement asset upload and the base canvas editor.
- GH-005 Asset upload + vector parsing pipeline
- GH-008 Canvas editor with per-panel masking (base only, manual tools — AI integration is Phase 2)

## Skills to activate
Load and apply these skills from /.claude/skills/ for this task:
- frontend-design (canvas tool layout, panel-aware editor chrome)
- ui-ux-pro-max (editor interaction model, snap behavior, tool hierarchy)
- ux-researcher-designer (validate editor flow against the "Mara" power-user persona)
- react-best-practices (Konva-in-React integration, state shape, debounced persistence)
- ui-design-system (tool palette consistency)
- web-performance-optimization (60fps with 200 layers benchmark, layer batching)
- workflow-automation (BullMQ job orchestration for the parse worker)
- senior-data-engineer (project/version/asset schema, canvas_state persistence)
- webapp-testing (parse-output schema tests, editor E2E)
- code-reviewer (final review)

## Read first
- /prd.md §10.5, §10.8
- /docs/vehicle-database-spec.md §3 (SVG structure — the editor consumes this)
- /packages/canvas (currently empty; you own its design)

## Scope
- /services/parse (already scaffolded in Step 2). Fill in the parse stack: Sharp (raster + HEIC), svgo (SVG cleanup), Inkscape CLI subprocess (AI/EPS → SVG), pdf2svg CLI (PDF → SVG), rembg via Replicate API (background removal; self-host deferred to v2). Triggered via BullMQ job; runs as its own deployable, never inline in apps/api.
- Resumable chunked upload to Supabase Storage. Max 50MB. Client + server enforcement.
- rembg routed through Replicate per ADR-0003; if Replicate routing or fallback strategy needs nuance, write ADR-0007.
- Project model in Prisma: projects, project_versions, project_assets.
- Editor at /editor/[projectId] using Konva. Renders the selected vehicle's 4 views. Each `<g class="panel">` from the vehicle SVG becomes its own Konva.Group. Each panel's wrap-safe path becomes a Konva.Group clip.
- Tools (Phase 1 manual set only): text, shape (rect/ellipse/line), image (raster + vector), color fill, gradient, opacity, finish swatch (visual indicator only, no print semantics yet).
- Snap to body line, panel edge, vehicle centerline, other elements. Toggleable.
- Undo/redo 50-step history persisted to project_versions.canvas_state on debounced save.
- 60fps with up to 200 layers on a 2021 M1 baseline — measure and document.

## Tests
- Vitest unit: vector parse output schema, wrap-safe clipping math, undo/redo stack.
- Playwright E2E: upload a logo, drop it on a panel, undo, redo, save, reload, see the same state.

## ADRs
- ADR-0006 locking the canvas-editor data model (Konva scene → DB persistence shape). Required.
- ADR-0007 optional — only if Replicate routing or fallback strategy warrants it. The parse-stack itself is already locked in ADR-0003.

## Done definition
- All AC checkboxes on GH-005 and GH-008 pass.
- CI green.
- I can log in, pick a vehicle template, upload my logo, place it on a panel, see it clipped by the wrap-safe zone, undo, redo, save, reload.
- 60fps benchmark documented in the PR description with the test method.
- /activities.md updated.

## Hard constraints
- No AI generation. No print paneling. No export. Those are Phase 2 + 3.
- No real-time co-editing. Single-editor lock with last-write-wins on conflicts.
- Do not introduce Fabric.js or Pixi. Konva only (per ADR-0001 alternatives).

Title the PR: `[GH-005/008] Asset upload + base canvas editor`
````

---

## Step 6 — Phase 1 demo

**Outcome:** Deployed staging, end-to-end demo recorded, Phase 1 closed.

**Paste this into Claude Code:**

````
Wrap Phase 1. Three tasks, one PR.

## Skills to activate
Load and apply these skills from /.claude/skills/ for this task:
- workflow-automation (Vercel + Fly.io deploy pipelines, env promotion)
- api-security-best-practices (basic-auth gate, secret hygiene on staging)
- web-performance-optimization (Lighthouse pass on staging)
- webapp-testing (Playwright smoke test of the full Phase 1 flow)
- code-reviewer (final pre-launch review)

## Scope
1. Deploy /apps/web to Vercel staging at staging.alphawolfwrap.com with basic-auth gate.
2. Deploy /apps/api to Fly.io staging.
3. Deploy the two Python services (/services/ai stub, /services/paneling stub) to Fly.io staging.
4. Configure Sentry + PostHog in production mode behind a STAGING flag.
5. Smoke test the full Phase 1 flow on staging:
   - Sign up as a customer
   - Verify OTP
   - Pick one of the 5 seeded vehicles
   - Upload a logo
   - Place it on a panel in the editor
   - Save
   - Sign out, sign back in, see the saved state
6. Record a 3-5 minute Loom of the smoke test.
7. Drop the Loom link into /activities.md as the Phase 1 demo entry.

## Done definition
- Staging URLs live and reachable behind basic auth.
- Smoke test passes start-to-finish.
- Loom recorded and linked.
- /activities.md updated with a "Phase 1 complete" entry summarizing scope shipped, blockers found, and what changed for Phase 2.

## Hard constraints
- No new features. No Phase 2 work.
- If the smoke test fails, fix the bug in this PR. Do not defer.

Title the PR: `[infra] Phase 1 staging deploy + demo`
````

---

## What to do if Claude Code drifts

| Symptom | Say this |
|---|---|
| Starts coding before reading | "Stop. Complete the Read first step from the prompt before any code." |
| Pulls in Phase 2 work | "Park that. Create the Phase 2 issue if missing, then return to scope." |
| Adds a dependency not in ADR-0001 | "Open an ADR-0002+ first; do not add the dependency until I approve." |
| Forgets to update activities.md | "PR blocker. Add the activities.md entry now, then mark ready for review." |
| Asks too many clarifying questions | "Make the call yourself, document it in an ADR if it's architecturally significant, and proceed." |
| Output drifts mid-session | Start a fresh session. Long sessions decay. Each step here is one session.
