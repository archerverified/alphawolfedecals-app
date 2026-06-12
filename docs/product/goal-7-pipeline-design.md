# Goal 7 — AI Generation Pipeline Design (pre-build, 2026-06-12)

Reviewed by backend-architect pass before implementation (review notes appended at bottom).

## Where the pipeline runs — DECISION

**Next.js server on Vercel (server actions + route handlers), using fal.ai's hosted queue for async image jobs. No BullMQ. No Render involvement.**

Why:
- `ANTHROPIC_API_KEY` + `FAL_KEY` already live in Vercel env (Preview + Production). Render does not have them, and the Render MCP is unauthorized this session — adding them is an Archer item, not a blocker.
- fal.ai exposes a hosted queue (submit → request_id → status/poll → result). Retries, queueing, and long-job handling are the provider's problem; our state machine lives in `generation_runs` rows. BullMQ would duplicate that for zero gain.
- Vercel Fluid Compute default timeout is 300s; a draft run (3 concepts × ≤5 views, submitted concurrently to fal's queue) completes well inside it. Pipeline execution is detached from the user request via `after()`/`waitUntil`, with client polling run status.
- `services/parse` BullMQ stays what it is (heavy local vectorization). `services/ai` (FastAPI, health-only) stays health-only this goal; rembg remains its future tenant.

## Components

```
ReviewStep "Generate" button
  → startGenerationRunAction (server action, withUser tx):
      snapshotBrief(label 'generation_run')
      generationRunGate(plan, runsThisMonth)        — existing gate, now wired
      rate-limit bucket account:<uid>:generation     — existing pg sliding window, 30/day
      daily spend cap check (SECURITY DEFINER fn)    — global, config cap, PostHog alert on trip
      atomic credit decrement (advisory xact lock on userId → balance check → negative ledger row)
      INSERT generation_runs (status 'queued', kind 'initial')
  → after(): runPipeline(runId)
      orchestrate: Haiku 4.5 → 3 directions × per-view instructions (JSON, versioned prompts)
      condition: per-view template render PNG (control image) from vehicle-templates storage
      render: provider.generate() per view per direction → fal queue → poll
      watermark previews (sharp tile), store originals + previews in project-assets
      INSERT generation_images; run → 'complete'
      failure at any point → refund (compensating +ledger row), run 'failed', Sentry + PostHog generation_failed
Client polls getGenerationRunAction → gallery renders 3 concepts
Iteration: same action path, kind 'iteration', parentRunId + conceptKey + instruction;
           Kontext edit per AFFECTED views only; 1 credit
Selection: kind 'final', FLUX.2 Pro per included view, NO watermark, included with selection (0 credits);
           on complete → final renders become project_assets; editor working version gets locked
           per-view ImageElements + logo ImageElement(s) per zone assignment (logo NEVER AI-rendered);
           export pack cover uses chosen concept hero; provenance into PDF metadata
```

## Provider adapter (D1)

`apps/web/lib/ai/` (server-only modules):
- `provider.ts` — `WrapImageProvider` interface: `generate(req)`, `edit(req)`, `upscale(req)`; request carries model id, prompt, control image, size, seed; response carries image bytes/url, requestId, costUsd, provider+model for provenance.
- `fal.ts` — fal implementation via `@fal-ai/client` (queue submit + poll). Key from `process.env.FAL_KEY` only; never logged; client constructed server-side only.
- `mock.ts` — deterministic placeholder renderer (sharp: template control image + direction-colored overlay + label). DEFAULT when `AI_PROVIDER!=='fal'` or `FAL_KEY` absent. CI and unit tests always mock; real spend never in CI.
- `packages/db/src/ai-config.ts` — model IDs, per-image prices, default draft/edit/final model (set by bake-off), daily spend cap USD, preview width, views policy. Config-not-code, mirroring `credit-config.ts`.

## Data (D4)

- `GenerationRun`: id, projectId, userId, kind (`initial|iteration|final`), status (`queued|orchestrating|rendering|complete|failed`), briefVersion, parentRunId?, conceptKey?, instruction?, directions JSONB, provider, model, costUsd, error?, timestamps.
- `GenerationImage`: id, runId, conceptKey, view, storagePath, previewPath?, width, height, requestId, costUsd, provenance JSONB.
- RLS: owner-only via `user_id = app.current_user_id` (same policy shape as briefs); `withUser` for every customer query. Migration + `_prisma_migrations` checksum row per gotcha §6.
- Credit spend rows: negative `delta`, `reason` = `generation_run|iteration_run`, refund rows `reason` = `*_refund`. (Ledger `source` enum describes credit origin for POSITIVE grants; spends reuse the append-only table per B2C-001 — exact enum handling verified at implementation against the existing constraint.)

## Cost tracking + safety rails (D7)

- Per-image `costUsd` from config prices recorded on each `GenerationImage`; run total on `GenerationRun.costUsd`. Per-user/per-month derivable by query (PRD §4.4).
- Rate limit: existing `rate-limit.ts` sliding window, `account:<uid>:generation`, 30/day, enforced server-side beneath credits.
- Daily global spend cap: `app_generation_spend_today()` SECURITY DEFINER (search_path-pinned, EXECUTE to app_user — Goal 4 pattern) summing today's run costs; over cap → run blocked with friendly copy + PostHog `ai_spend_cap_hit`.

## Real-call surfaces — DECISION

`FAL_KEY` is Vercel-Sensitive (write-only; `vercel env pull` returns blank) and absent from `.env.local`. Therefore ALL real fal calls (bake-off, integration verification, prod proof) execute server-side on the deployed app where Vercel injects the key, via an **admin-gated internal bake-off/proof harness route** (role-gated + non-admin 404, same pattern as /admin/vehicles). Anthropic calls can additionally run locally (`ANTHROPIC_API_KEY` present in `.env.local`).

## Bake-off (D2, budget-amended)

6 representative briefs × up to 3 candidate fal models × 1 view each. Candidates (final IDs pinned in D1 against fal's live catalog): Flux Depth Dev (PRD pick), FLUX.2 [pro] with image conditioning, nano-banana edit family on fal. Scored: brief adherence, geometry respect, zone compliance, style distinctness → `docs/product/bakeoff-2026-06.md`; winner → `ai-config.ts` default.

## PR plan (small, merge-as-you-go)

1. **PR A — D9 rider**: panel-number unification (independent, ships first).
2. **PR B — D1**: ai-config + adapter (interface/fal/mock) + bake-off harness route (admin-gated) + unit tests. Security-auditor pass.
3. *(bake-off runs on prod after PR B deploy)* **PR C — D2**: scorecard doc + default model config.
4. **PR D — D4 data + D7 rails**: Prisma models + RLS migration + atomic credit decrement/refund + gate wiring + rate limit + spend cap.
5. **PR E — D3 pipeline**: orchestrator (versioned prompts) + runPipeline + watermark + storage + events.
6. **PR F — D5/D6 UI**: gallery, iteration chips, balance header, waitlist sheet, selection→final, before/after slider, editor/export handoff.
7. **PR G — D8**: mock e2e into smoke + proof run evidence + closeout docs.

PRs touching RLS/credits/keys get the second fresh security review per CLAUDE.md §3.

---

## Backend-architect review (2026-06-12) — VERDICT: sound-with-changes (all adopted)

Topology (fal hosted queue, no BullMQ, no Render) and the start-transaction confirmed correct. Required changes, all incorporated above-as-amended:

1. **Execution model**: `after()` is NOT durable (killed at maxDuration/recycle, no retry). The driver is a **client-poll-driven `advanceGenerationRunAction(runId)`** — idempotent, re-entrant, CAS-guarded status transitions (`UPDATE … WHERE status='<expected>'`), one bounded slice of work per call, each DB touch its own short withUser call (15s tx timeout forbids holding a tx across fal polls). `after()` calls advance once as a pure latency fast path. A **sweeper cron** (vercel.json + system-auth route, withSystem = legitimate system maintenance) fails + refunds non-terminal runs past TTL (15 min).
2. **Credit spend encoding**: `credit_source` enum gains `'spend'` + `'refund'` (ADD VALUE in its OWN migration — PG forbids using a new enum value in the tx that adds it; two migration files). `credit_ledger` gains nullable `run_id` FK (ON DELETE SET NULL). `auth_rls.sql` REVOKES INSERT on credit_ledger from app_user — so spend/refund go through **SECURITY DEFINER `app_spend_credits` / `app_refund_credits`** (app_is_shop_member shape: search_path pinned, user derived from GUC never a parameter, fail closed, EXECUTE to app_user only, plpgsql). CHECK: `(source='spend' AND delta<0) OR (source<>'spend' AND delta>0)`.
3. **Idempotency index set**: `generation_runs.client_token` UNIQUE (double-click); one non-terminal run per (project, kind) partial unique; `credit_ledger(run_id) UNIQUE WHERE source='spend'` and `WHERE source='refund'` (ON CONFLICT DO NOTHING — refund callable from advance + sweeper safely); per-(run, concept, view) **job rows persisting fal `request_id` at submit time** — resume harvests by request_id, NEVER resubmits (double-spend guard); `(parent_run_id, concept_key) UNIQUE WHERE kind='final'` (free-final farming guard); monthly gate + balance both evaluated under the per-user advisory xact lock (`pg_advisory_xact_lock(hashtext('credit_spend'), hashtext(user_id))` — xact-scoped only, pgBouncer transaction pooling).
4. **Spend cap TOCTOU**: write ESTIMATED costUsd at run INSERT (config prices), true-up at completion.
5. **Fail-closed provider selection**: prod with `AI_PROVIDER='fal'` and blank FAL_KEY throws loudly; mock serving a non-CI request emits a PostHog event (silent-mock-in-prod footgun).
6. **Unwatermarked originals** served only via owner-scoped signed URLs; gallery client never receives original paths pre-selection.
7. **RLS**: generation_runs INSERT WITH CHECK verifies user GUC AND project ownership EXISTS (design_briefs_owner_all shape); generation_images immutable (REVOKE UPDATE/DELETE, brief_snapshots shape); runs keep UPDATE (advance) but REVOKE DELETE.
8. **PR plan amendments**: PR B's bake-off harness carries its own hard per-invocation image cap + cumulative counter in config + per-call PostHog cost logging (rails don't exist until PR D); PR D = two migration files; sweeper cron ships in PR E; PR F splits into F1 (gallery/iteration/waitlist) and F2 (selection→final + editor/export handoff — touches ProjectVersion invariants, own review); mock e2e lands with PR F1, not last.
9. Rate-limit repo is a fixed-window failure counter (effective cap = threshold-1): set threshold 31 for a 30/day cap; it's the secondary rail beneath credits + spend cap.
