# Goal 7 — AI Generation (B2C Phase 2: brief → concepts → iterate → final)

Drafted 2026-06-12 by Cowork orchestration per /prompt-engineer discipline. Executor: **Fable 5 in Claude Code**, `--dangerously-skip-permissions`, autonomous single run. Keys live: `ANTHROPIC_API_KEY` + `FAL_KEY` in Vercel env AND `.env.local` (both capped at **$10/month** — see BUDGET, it binds you).

Paste everything below the line into a fresh `claude` session started in `/Users/ashton/Documents/AlphaWolfDecals-App`.

---

## ROLE

You are Claude (Fable 5) in Claude Code executing Goal 7 of Alpha Wolf Wrap Studio: ship the headline feature — AI wrap-concept generation. A customer's completed brief becomes 3 distinct concept directions rendered on their actual vehicle's views; they iterate via chips/prompts; the chosen concept renders at export quality and flows into the existing editor/export pipeline. You run start-to-finish alone.

## ACTIVATE (repo skills + agents — use them, per CLAUDE.md §0)

- **Skills** (`.claude/skills/`): `senior-backend` (adapter + queue architecture), `senior-prompt-engineer` (the orchestrator's Haiku prompts ARE prompt engineering — apply the skill to them), `senior-frontend` + `ui-design-system` (generation gallery, iteration chips, waitlist sheet, before/after slider — use existing theme tokens incl. `svg.brand.cyan`), `webapp-testing` (e2e), `code-reviewer` (every PR), `supabase-postgres-best-practices` (generation_runs schema + RLS).
- **Agents** (`.agents/`): `backend-architect` (review your pipeline design BEFORE building — queue topology, idempotency, failure states), `security-auditor` (key handling + the new server surface), `test-engineer` (mock-fal test strategy so CI never spends real money), `debugger` (when generation outputs misbehave).
- Process order per CLAUDE.md: planning/review agents before implementation skills.

## DECISION POLICY (unchanged from Goals 5/6 — read twice)

Never ask; choose the recommended option, log it (DECISIONS section in activities.md). Blocked → skip, document, continue. **Hard stops:** PVO/licensed sources; `PII_ENCRYPTION_KEY`; force-push main; file deletion; `withSystem` for user-scoped queries; ADR-locked invariants; **exceeding BUDGET**. Failing test/review = fix, not stop.

## BUDGET (new hard constraint — this is real money with $10 caps)

- Maintain a running spend ledger (file in the worktree, totals in your final report): every fal call and Anthropic call you trigger, estimated cost, cumulative.
- **Ceiling for this entire goal: $6 fal + $3 Anthropic** (leaves headroom under the $10 caps for Archer's own post-goal testing).
- CI and unit tests use a MOCK provider adapter — real API calls never run in CI. Real calls only in: the bake-off, pipeline integration verification, and the final prod proof run.
- PRD §10's "20-brief bake-off" is AMENDED to budget-fit (log as a decision): **6 representative briefs × up to 3 candidate models × 1 representative view each** (~$1.50–2.50). Score on: brief adherence, geometry respect (design stays on the vehicle), zone compliance, style distinctness. Pick the default; record the scorecard in `docs/product/bakeoff-2026-06.md`. The full 20-brief rerun is a launch-list item for when caps raise.
- If the ledger projects a ceiling breach: stop real calls, finish with mocks, document exactly what remains unverified.

## SETUP

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App
git fetch origin main
git worktree add -b goal/7-ai-generation ../alphawolf-goal-7 origin/main
cd ../alphawolf-goal-7
```

Dependabot PRs remain DEFERRED. Keep PRs small and merged as you go — interrupted runs resume from git state (proven pattern).

## CONTEXT (read in order before any code)

1. Repo `CLAUDE.md` (review protocol §3 — **verdict text in EVERY PR body, including data/docs PRs**; gotchas §6).
2. `activities.md` top 3 entries.
3. `prd-b2c-guided-design-flow.md` **§10 in full** (model stack: Haiku 4.5 orchestrator, Flux Depth Dev drafts, Kontext iterations, FLUX.2 Pro final — all via a fal.ai provider adapter, models swappable by config) + §5 (credits: GRANT-ONLY, decision #8 — NO Stripe, exhaustion shows the credit-pack WAITLIST sheet) + §3 step 4.
4. PRD v1.1 §4.4 (generation requirements: per-view fidelity, cost tracking, rate limits, provenance signature).
5. `docs/product/roadmap-goals-6-10.md` (where this sits; Goal 8 is print paneling — leave its seams alone).

**AUDIT FIRST:** the brief wizard (Goal 5) ends at a marked Generate seam (`generationRunGate`, snapshot versioning — find them); credit ledger + decrement patterns exist (B2C-001); watermarking, BullMQ queue patterns (`services/parse`, email retry), PostHog server capture, and the Studio's SVG/render tooling all exist — COMPOSE, don't rebuild. The Render `alphawolf-ai` FastAPI service is currently health-only; decide whether the pipeline runs there or in Next/BullMQ workers (log the decision; if Render needs the keys, flag it for Archer in your final report — do NOT block on it).

## TASK — deliverables in order

1. **Provider adapter** — one thin interface (generate / edit / upscale), fal.ai implementation + MOCK implementation (CI + dev default). Model IDs, prices, and the chosen default from the bake-off live in CONFIG, not code. Keys read from env only; never logged (security-auditor pass on this layer).
2. **Bake-off (budget-fit, per BUDGET)** → scorecard doc → set the default model config.
3. **Orchestrator** — Haiku 4.5 compiles brief snapshot (zones, colors+SKUs, style, per-zone instructions, vehicle photos context, notes) into per-view generation instructions; depth/structure conditioning from the template's view renders; **the customer's logo is NEVER AI-rendered** — it composites as a layer downstream (PRD §10 rule 1). Apply senior-prompt-engineer to the orchestrator prompts; version them in the repo.
4. **Generation runs** — 3 distinct concept directions per run (literal/bolder/minimal), per-view, watermarked previews, persisted to the project gallery with brief-version linkage; 1 credit decremented atomically with run creation; PRD §4.4 cost tracking per run/user recorded; provenance signature in outputs. Failure = credit refunded + loud (Sentry + PostHog `generation_failed`).
5. **Iteration UX** — chips + free text; Kontext edit calls re-render only affected views; cost-on-button; balance header; exhaustion → **waitlist sheet** (PostHog `credit_waitlist_joined`). 1 credit per iteration.
6. **Selection → final** — chosen concept re-renders at export quality (FLUX.2 Pro), un-watermarked, flows into the existing editor/export pack pipeline; before/after slider (stock vs wrapped) on concept views.
7. **Safety rails** — PRD §4.4 rate limits enforced server-side beneath credits; in-code daily spend cap (config) with PostHog alert event; all new tables (generation_runs etc.) Prisma + owner RLS + `withUser` only.
8. **Proof** — e2e with MOCK adapter joins the prod smoke (no real spend in CI); ONE real prod proof run end-to-end (brief → 3 concepts → 1 iteration → final → export pack with generated art + composited logo), screenshots to `docs/deployment/screenshots/<date>-goal-7/`.

## CONSTRAINTS

- Review protocol §3 on every PR; pipeline/key-handling PRs get the second fresh security review. Verdict text in every PR body.
- **e2e cleanup rule (standing, from the 2026-06-12 addendum): prod e2e/proof runs must retire/clean every artifact they create — no test projects, runs, or published anything left visible.**
- Grant-only credits — NO Stripe code, no checkout UI; the waitlist sheet is the exhaustion path; everything stays purchase-ready per PRD §5.
- No heavyweight new deps without logged rationale (fal client lib is fine).
- User-facing copy: simple, direct, non-dev voice.

## OUTPUT / DEFINITION OF DONE

1. All 8 deliverables merged via reviewed, CI-green PRs.
2. Spend ledger total ≤ $9 combined, included in the final report.
3. Bake-off scorecard committed; default model set by config.
4. Real prod proof run evidence committed (screenshots incl. the export pack with AI art + composited logo); artifacts cleaned per the e2e rule.
5. Smoke green on prod (mock-adapter e2e included); Supabase advisors: no new WARNs (baseline 2).
6. Closeout ritual: activities TOP entry + DECISIONS log, mermaid `docs/vault/diagrams/goal-7-ai-generation.md`, PostHog screenshot (new event taxonomy), worktree removed.
7. Final message to Archer ≤8 lines: what shipped, spend total, bake-off winner + why, what's flagged (Render keys? cap raise for full bake-off?), where evidence lives.
