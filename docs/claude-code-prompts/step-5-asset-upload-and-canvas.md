# Step 5 — Asset upload pipeline + base canvas editor (revision 3)

Paste-ready prompt for a fresh Claude Code session. Revision 3 incorporates the recap from the cleared prior session: `REDIS_URL` standardization, inline-queue fallback in CI, and the saved canvas-data-model plan at `~/.claude/plans/vectorized-skipping-nova.md`.

---

## Pre-flight (run on your Mac, in the repo root)

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App

# 1. Confirm the branch (already created by the prior session, 0 commits past main)
git checkout feat/gh-005-008-asset-upload-canvas-editor
git log --oneline -3

# 2. Unstage anything left over from the failed pre-commit attempt
git reset HEAD

# 3. Re-add ONLY the files that should be tracked (Obsidian plugin JS is now gitignored
#    so the 7933-error lint blowup won't repeat)
git add docs/vault/00-START-HERE.md docs/vault/70-quick-reference.md \
        docs/vault/_templates docs/vault/.obsidian/app.json \
        docs/vault/.obsidian/appearance.json docs/vault/.obsidian/community-plugins.json \
        docs/vault/.obsidian/core-plugins.json docs/vault/.obsidian/templates.json \
        .claude/agents .claude/skills/shadcn .mcp.json skills-lock.json .gitignore

git commit -m "chore(workspace): seed vault templates, shadcn skill, context-manager agent

- gitignore Obsidian plugin binaries + workspace state
- gitignore .claude/settings.local.json (per-machine state)
- track Obsidian shareable config (app/appearance/community-plugins/core-plugins/templates.json)"

git push -u origin feat/gh-005-008-asset-upload-canvas-editor

# 4. Add the BullMQ Redis URL to .env.local. Get the TCP URL from upstash.com:
#    database alphawolfedecals-app → Details → Connect → TCP tab.
#    Endpoint is certain-bass-131284.upstash.io:6379 — only the token is private.
#
#    Append to .env.local (DO NOT paste your token into chat — paste only into the file):
#
#    REDIS_URL="rediss://default:<TOKEN>@certain-bass-131284.upstash.io:6379"
#
#    Note: variable is named REDIS_URL (not UPSTASH_REDIS_URL) per Claude Code's
#    prior decision to standardize. The existing UPSTASH_REDIS_REST_URL/_TOKEN entries
#    can stay for future @upstash/redis Edge use.

# 5. (Recommended) Install the missing vector-converter CLIs locally so AI/EPS/PDF
#    parsing works end-to-end in dev. Without these, the parse worker correctly
#    queues those jobs but they never resolve.
brew install inkscape pdf2svg

# 6. Dedupe the duplicate PII_ENCRYPTION_KEY in .env.local (lines 17 and 37 hold
#    different values per the prior session's blocker discovery). Since the users
#    table has 0 rows, just delete whichever line is older. If unsure, keep line 17
#    (the original from auth setup) and delete line 37.
$EDITOR .env.local
```

---

## Prompt to paste into a fresh Claude Code session

```
Implement Step 5: asset upload pipeline + base canvas editor. Two stories, one PR:
- GH-005 Asset upload with vector parsing (AI/EPS/PDF → SVG, raster, rembg background removal)
- GH-008 Canvas editor with per-panel masking (base manual tools; AI integration deferred to Phase 2)

## Resume context — important
The prior session on this branch was cleared after deep exploration + plan-mode design. **No code was shipped** (zero commits past main). Before starting:
1. Run `git log --oneline -3` and confirm HEAD is the vault-seed commit on `feat/gh-005-008-asset-upload-canvas-editor`. The previous session's branch creation + dependency-version pinning was discarded with the conversation; re-derive as needed.
2. The prior session saved a load-bearing canvas-data-model design at `~/.claude/plans/vectorized-skipping-nova.md`. **Read it first.** It is the result of a Plan-agent design pass and contains the recommended `@alphawolf/canvas` file layout, the discriminated-union TS types for the canvas-state JSON schema, the undo/redo command-stack interface, the persistence/versioning recommendation, the 60fps Konva checklist, and the benchmark method. Treat it as binding unless you find a concrete reason to depart — if you do, document the departure in ADR-0006.
3. Two architectural decisions were confirmed last session: **(a)** parse queue = real BullMQ against Upstash locally, **inline fallback when `REDIS_URL` is absent** (so CI + Playwright stay green with zero infra); **(b)** **provision the live shared Supabase Storage now** (buckets + RLS + the new project/asset migration applied directly, not just script-generated). Honor both.
4. Three blockers were discovered: Upstash creds were missing (now resolved — see `REDIS_URL` in `.env.local`); `inkscape` + `pdf2svg` not installed locally (recommend `brew install inkscape pdf2svg` before E2E, otherwise the parse worker queues AI/EPS/PDF jobs correctly but they never resolve); `.env.local` had a duplicate `PII_ENCRYPTION_KEY` (lines 17 & 37, different values) which should have been deduped pre-flight — confirm only one is present before any test that exercises pgcrypto. Live Supabase has only the seeded Transit (`a0000000-...0001`), no Storage buckets yet.

## Current state (post PR #36 + #37, plus the pre-flight vault commit)
- RLS enforces in dev. Use `withUser(userId, fn)` for any per-user query; `withSystem(fn)` only for paths with no user scope.
- Vehicle template system shipped (PR #37): `packages/db` has `vehicles`/`vehicle_panels`/`vehicle_template_requests` tables, RLS policies, repos, SVG validator (`packages/db/src/svg/validate.ts` extracts `ExtractedPanel: {name, view, outlinePath, wrapSafePath, finishHint, installOrder, notes}`). The editor consumes vehicle SVGs structured per `docs/vehicle-database-spec.md` §3.
- Sign-in flow shipped in PR #37 — auth surface complete. `requireUser(returnTo)` exists in `apps/web/lib/admin/guard.ts`.
- **PR #37 added a stopgap local asset store** (git-ignored local files via a route handler). **This PR REPLACES that with Supabase Storage.** Migrate or wipe the dev store as part of this PR — never shipped to production.
- `vehicle_panels.printable_area_mm2` defaults to 0 (PR #37). **This PR populates it** from wrap-safe SVG path geometry.
- `vehicles.thumb_png_url` stores SVG URLs (PR #37 stopgap). **This PR generates real PNG thumbnails** from outline SVGs via Sharp.
- Native modules in `apps/web` need `serverExternalPackages` + webpack externals regex (`apps/web/next.config.ts` precedent: `@node-rs/argon2`, `svgo`). Apply the same pattern to Sharp and to Konva's server-side `canvas` peer (the editor must be a client-only component via `dynamic(..., { ssr: false })`).
- Raw SQL with parameters MUST use `$executeRawUnsafe` + `pgQuoteLiteral` helper. Never `$executeRaw` tagged template.
- Repo barrel rule: never import `@prisma/client` outside `@alphawolf/db` (eslint-enforced). All DB access through repo functions.
- shadcn/ui skill is installed at `.claude/skills/shadcn`. Use its registry CLI to install components rather than hand-writing primitives.
- Design-token baseline: Tailwind zinc. Match `apps/web/components/auth/*` visually.

## Read first
- `~/.claude/plans/vectorized-skipping-nova.md` (the load-bearing canvas design from the prior session)
- /docs/vault/00-START-HERE.md (project orientation, critical learnings, top-5 patterns, UI/UX skill stack)
- /docs/vault/70-quick-reference.md (env vars including the new REDIS_URL + Upstash section, commands, diagnostic table)
- /prd.md §10.5, §10.8, §5.4 (acceptance criteria + UI/UX intent — shadcn/ui is named in §5.4)
- /docs/vehicle-database-spec.md §3 (vehicle SVG structure — editor consumes this)
- /packages/db/src/client.ts (withUser / withSystem helpers, pgQuoteLiteral)
- /packages/db/src/repos/vehicles.ts (existing repo pattern to match)
- /packages/db/src/svg/validate.ts (validator output the editor consumes)
- /packages/canvas/src/index.ts (empty `@alphawolf/canvas` scaffold — fill in per the saved plan)
- /services/parse/src/index.ts (stub worker from Step 2 — fill in)
- /apps/web/next.config.ts (native module externals pattern)
- /apps/web/components/auth/* (visual language to match)
- /apps/web/lib/admin/guard.ts (`requireUser` pattern)
- /.claude/agents/context-manager.md (BullMQ + Upstash schema design)
- /.claude/skills/shadcn (component installation patterns)
- /docs/adr/0001-locked-stack.md, /docs/adr/0002-monorepo-and-runtime-platform.md, /docs/adr/0005-admin-role-storage.md

## Skills and Agents to activate

**Skills (per-task expertise) from /.claude/skills/, layered design → behaviour → implementation:**

*Design layer:*
- frontend-design (canvas tool layout, panel-aware editor chrome, overall visual hierarchy)
- ui-design-system (tool palette consistency with auth + vehicle-browse screens, design tokens, finish swatches)
- web-design-guidelines (cross-screen visual coherence with the existing auth + vehicle browse surface)

*Behaviour layer:*
- ui-ux-pro-max (editor interaction model, snap behaviour, tool hierarchy, undo/redo affordance, error states)
- ux-researcher-designer (validate editor flow against the "Mara" power-user persona, PRD §3.2)

*Implementation layer:*
- shadcn (Dialog, Popover, Slider, Tooltip, Toast for the editor chrome; install via the skill's CLI rather than hand-writing primitives; accessibility comes free from Radix)
- react-best-practices (Konva-in-React integration, state shape, debounced persistence, Server Component vs client component boundaries; the editor is `dynamic(..., { ssr: false })`)
- web-performance-optimization (60fps with 200 layers benchmark, layer batching, `listening:false` on non-interactive layers, `perfectDrawEnabled:false`, hit-graph disabling on the outline+clip layer)

*Backend + ops:*
- workflow-automation (BullMQ job orchestration for the parse worker, including the inline-fallback queue adapter for CI)
- senior-data-engineer (project/version/asset schema design)
- supabase (Storage bucket configuration, signed URLs, RLS on storage — provision live this session)
- supabase-postgres-best-practices (asset + project table design, indexes, partial unique constraints)
- api-security-best-practices (signed-URL TTL, mime-type allowlist, anti-XSS on parsed SVGs)
- webapp-testing (parse-output schema tests, editor E2E with Playwright, fps benchmark via Playwright)
- code-reviewer (final review, especially around the asset storage migration)
- mermaid-diagrams (canvas data-model diagram in ADR-0006)

**Agents (cross-task coordinators) from /.claude/agents/:**
- **context-manager** — design the BullMQ + Upstash schema around design-asset metadata. Apply to:
  1. Job metadata schema in Redis (asset_id → status, retry count, worker assignment, timestamps, error context). <100ms retrieval, efficient updates.
  2. Caching strategy for parsed-asset metadata read by the canvas editor (avoid hitting Postgres on every panel hover/select). TTLs, invalidation triggers, cache-warming on project open.
  3. Compression and archival policies for completed-job records (don't keep 6 months of "parse_complete" rows in hot Redis; the free-tier ceiling is 256 MB and 500k commands/month).
  4. Version vectors for `project_assets` so the editor can detect when a parse upgrade invalidates cached canvas state.
  5. Tune the BullMQ worker so blocking pops don't eat the 500k/month command budget on idle (drainDelay, polling interval).
  6. Document the chosen design in ADR-0009.

## Scope

### Storage layer (replaces PR #37's local stopgap; provision live this session)
- **Supabase Storage** with two buckets, created against the live shared dev project:
  - `vehicle-templates` — public-read for published vehicle outline SVGs + generated PNG thumbnails
  - `project-assets` — private; per-user RLS via storage policies tied to `app.current_user_id`
- Signed URLs for `project-assets` reads (24-hour expiry)
- Migration script `packages/db/scripts/migrate-local-assets.ts` — reads PR #37's local SVGs, uploads to `vehicle-templates`, wipes local store afterward
- Remove the local-store route handler from PR #37; redirect existing references to the signed-URL helper

### Parse worker (`services/parse`)
- Fill in the Node worker from Step 2's stub:
  - AI/EPS → SVG via Inkscape CLI subprocess
  - PDF → SVG via `pdf2svg` CLI subprocess
  - Raster (PNG/JPG/HEIC) processing via Sharp (N-API; add to `serverExternalPackages` + webpack externals)
  - Background removal via Replicate API call to `cjwbw/rembg` model — no self-host
- **Queue adapter:** when `REDIS_URL` is set, use BullMQ against Upstash (ioredis, TLS, `maxRetriesPerRequest: null`). When `REDIS_URL` is unset, run the same job code inline (no Redis dependency). The seam is one `enqueue(jobName, payload)` function that decides at boot. Document the seam in ADR-0009. This is the model that keeps CI + Playwright green without external infra.
- BullMQ job contract: `parse-asset` job takes `{ assetId, sourceUrl, mimeType, options }`, writes parsed result back to `project_assets.parsed_url` + emits completion event
- Pre-flight checks: file size ≤50MB, MIME type in allowlist
- If `inkscape` / `pdf2svg` are not on PATH, the AI/EPS/PDF→SVG conversion queues but does not fail; surface a clear `parse_status = 'queued_missing_cli'` so the editor can show "waiting on dependency" rather than crashing. Document in `70-quick-reference.md`.

### Asset upload pipeline (GH-005)
- Prisma additions: `project_assets` table (asset_id, project_id, owner_user_id, mime_type, source_url, parsed_url, parse_status, parse_metadata JSONB, version, created_at, updated_at). RLS via `app.current_user_id`.
- Resumable chunked upload directly to Supabase Storage signed URL (avoid passing files through Server Actions)
- Client-side validation: file size, MIME type before upload
- Bounding-box detection + crop UI for logos (shadcn Slider for crop adjustment, shadcn Dialog for the crop modal)
- "Remove background" toggle (shadcn Switch) calls the parse worker with `{ rembg: true }`
- Toast notifications (shadcn Toast / Sonner) on upload success, failure, parse-complete

### Canvas editor base (GH-008 — Phase 1 manual tools only)
- `/editor/[projectId]` route. Editor mounted via `dynamic(() => import('@/components/editor/Editor'), { ssr: false })`. Konva's server-side `canvas` peer goes into `serverExternalPackages` + the webpack externals regex.
- Editor renders selected vehicle's 4 views (each `<g data-view="...">` → Konva.Group; each panel `<g class="panel">` → child Konva.Group with `clipFunc` from the wrap-safe path).
- **Implement per the saved plan at `~/.claude/plans/vectorized-skipping-nova.md`:** the framework-agnostic core (canvas-state schema, command stack, geometry math, snapping) lives in `packages/canvas/src/` and is unit-tested with plain vitest. React/Konva components live in `apps/web/components/editor/`. Do not invert this split.
- Tool palette using shadcn Tabs or ToggleGroup (text, shape, image, color fill, gradient, opacity, finish swatch)
- Color picker — install shadcn's color picker primitive OR compose Radix Popover + a hex/RGB input
- Snap toggles via shadcn Switch in a Settings Popover
- Undo/redo controls via shadcn Button with keyboard shortcuts (Cmd+Z / Cmd+Shift+Z) and Tooltip
- 50-step history persisted to `project_versions.canvas_state` on debounced save (interval + leading/trailing per the saved plan)
- Per-panel wrap-safe clipping: panel group `clipFunc` enforces visual clip on render. Drag handler computes bbox-vs-clip and renders a hard visual cue (red outline pulse) on any element whose bbox escapes — the cue must not tank fps (use a single overlay node, not per-element listening).
- 60fps with 200 layers on 2021 M1 baseline — measure via the Playwright benchmark method in the saved plan; document in PR description.
- Loading states use shadcn Skeleton; empty state uses shadcn Card with clear CTA.

### Project model
- Prisma additions: `projects` (id, owner_user_id, owner_shop_id NULL, vehicle_id, status enum `draft|active|deleted`, transfer_token NULL, timestamps), `project_versions` (id, project_id, version int, canvas_state JSONB, approval_state, created_at). RLS via `app.current_user_id`.
- Versioning model per the saved plan (default: one mutable "working" version row updated in place + explicit snapshots on milestones; justify in ADR-0006).
- Basic project CRUD inside this PR: create from vehicle selector → render editor; list on `/projects` (shadcn DataTable or Card grid); rename (shadcn Dialog with Form); soft-delete (status = 'deleted', 30-day recovery per PRD §8.2). Add to GH-008 done definition.

## Tests
- Vitest unit (in `packages/canvas`): canvas-state schema migrate-on-load, command stack, wrap-safe clipping math, snapping math, signed-URL helper. No jsdom/canvas required — the core is framework-agnostic per the plan.
- Vitest integration (in `integration` project): `project_assets` + `projects` + `project_versions` RLS — cross-tenant isolation.
- Playwright E2E:
  - Upload logo (PNG and SVG paths) → bounding-box crop → save → re-open → asset still there
  - Place asset on panel → wrap-safe clipping enforces visually → drag outside → red-cue triggers → undo → redo → save → reload → state intact
  - Local-store migration: seed two SVGs, run script, confirm bucket contents
  - **fps benchmark:** mount 200 elements, sample requestAnimationFrame deltas, assert median frame time < ~16.7ms. Method documented in PR description.

## ADRs
- ADR-0006 locking the canvas-editor data model (Konva scene → DB persistence shape, undo/redo semantics, transfer-on-handoff guarantees, schemaVersion migration). **Required.** Use mermaid-diagrams skill for the data-flow diagram. Anchor to the saved plan.
- ADR-0007 covering Supabase Storage bucket strategy (public vs private, signed URL TTL, RLS policy approach, the bucket-creation script). **Required.**
- ADR-0008 if Replicate integration has non-obvious fallback/retry logic. Skip if straightforward.
- ADR-0009 documenting the context-manager-driven BullMQ + Upstash schema **AND the queue-adapter seam** (REDIS_URL present → BullMQ; absent → inline). Free-tier ceiling, TTL, compression, archival policy. **Required.**
- ADR-0010 if you adopt a shadcn pattern that meaningfully constrains future UI work (e.g. forcing a specific Form library, locking ToggleGroup over Tabs for the tool palette). Skip if it's just "we use shadcn for X."

## Done definition
- All AC checkboxes on GH-005 and GH-008 pass
- `pnpm turbo run lint typecheck test` green
- `pnpm --filter @alphawolf/db test:integration` green (extended with project + asset RLS tests)
- CI (Node + Python ai + Python paneling) green — branch protection enforces. CI runs the inline-queue path, no Redis needed.
- PR #37's local asset store is gone; migration script ran against live; Supabase Storage buckets configured with RLS policies
- Upstash Redis exercised locally per ADR-0009; cache hit-rate measured + logged in PR description (target ≥80% on the editor open path); command-budget projection vs the 500k/month free-tier limit included
- shadcn components installed via skill's CLI (not hand-written); `components.json` updated
- I can `pnpm dev`, sign up, create a project against the seeded Transit, upload a logo, place it on a panel, see wrap-safe clipping (and the red-cue on drag-outside), undo, redo, save, reload, state intact
- 60fps benchmark documented in PR description with test method
- /activities.md updated with a new top entry
- /docs/vault/70-quick-reference.md updated with REDIS_URL + new pnpm commands + new env vars (SUPABASE_STORAGE_BUCKET_*, REPLICATE_API_TOKEN if newly set) + the `inkscape`/`pdf2svg` dependency note + the deduped PII_ENCRYPTION_KEY footgun reference

## Hard constraints
- No AI generation (Phase 2 — GH-006, GH-007)
- No print paneling (Phase 3 — GH-010)
- No export (Phase 3 — GH-011)
- No real-time co-editing. Single-editor lock with last-write-wins
- No Fabric.js, no Pixi — Konva only (per ADR-0001 alternatives)
- No hand-rolled Dialog, Popover, Tooltip, Toast, Switch, Slider primitives — install via shadcn registry. If shadcn lacks a primitive, prefer underlying Radix over a third-party UI lib.
- Editor is client-only (`dynamic(..., { ssr: false })`). Never import the editor or Konva from a Server Component.
- The two open Phase 4 follow-ons (fail-closed DATABASE_URL_APP, ESLint withSystem restriction) — DO NOT implement here; reference in activities.md if you touch `eslint.config.mjs`
- Branch protection enforced. CI must be green to merge.
- **Never echo `REDIS_URL`, the token portion of it, or any password back into chat output or commit messages.** If the env var ever lands in a printf/log line, redact it.

Title the PR: [GH-005/008] Asset upload pipeline + base canvas editor
```
