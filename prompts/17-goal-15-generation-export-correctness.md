# Goal 15 — Generation & Export Correctness (the export IS the product)

Drafted 2026-06-16 by Cowork orchestration via /prompt-engineer + /superpowers + /systematic-debugging. Executor: **Claude in Claude Code**, autonomous single run (may span 1–2 sessions; ship per-deliverable PRs). Goal: fix the core value chain — the AI must honor the brief, the customer's logo must land **on the vehicle**, zones must composite cleanly, and the export must show the real design on multiple views. Plus the two design carryovers from Goal 14 that the local mock couldn't render. Real fal, budget-capped, net-zero.

**Why this goal exists (verified by Cowork + Archer from the Goal 13 export PDF, 2026-06-16):** the E2E produced an export that's a **near-stock white BMW X3 with a cyan rear bumper** — NOT the brief's "gloss-black base + cyan stripes + white Alpha Wolf script." The **logo never appears on the car** (only as clipped text in the spec table). Zones show messy raster fragments. The export hero is a single rear view. A beautiful app (Goal 14) that exports the wrong design with no logo is still a broken product. This goal fixes that.

**To run:** fresh `claude` session in `/Users/ashton/Documents/AlphaWolfDecals-App` with `--dangerously-skip-permissions`, then:

```
/goal prompts/17-goal-15-generation-export-correctness.md
```

If `/goal` expects inline text, paste everything below the `---`.

---

## ROLE

You are Claude in Claude Code executing Goal 15: make the AI wrap-generation + export actually correct. A customer's brief ("gloss black base, cyan stripes, white Alpha Wolf script on the doors") must produce a recognizably-that design on their vehicle, with their real logo composited onto a prominent panel, shown across multiple views, and exported as a spec pack that reflects it. You diagnose before you fix (the brief-not-honored bug is a root-cause hunt), you change generation/export _logic_ deliberately (this is NOT a styling goal), you keep every _other_ part of the product working, and you prove it with a real-fal run + net-zero cleanup.

## ACTIVATE (skills + agents + connectors)

- **Process skill FIRST (RIGID):** `systematic-debugging` — the "AI ignores the brief" + "logo not on the car" bugs get Phase-1 root-cause (inspect the ACTUAL generation prompts/payloads sent to fal in the Goal 13 run, the compositing code path, the export render) BEFORE any fix.
- **Implementation:** `senior-prompt-engineer` / `senior-backend` (the Haiku orchestrator → fal generation prompts are the likely root cause — the brief→prompt mapping; apply prompt-engineering rigor + versioned prompts), `supabase-postgres-best-practices` (data), `frontend-design` + `shadcn` + `ui-ux-pro-max` + `design-review` (the screen-22 concept cards carryover), `webapp-testing` (verify), `code-reviewer` (every PR), **graphify** (audit-first / PR-impact on the generation + export + canvas subsystems before touching them — §8).
- **Connectors:** the **fal adapter (real generation)** + Anthropic (Haiku orchestrator), Supabase (data + net-zero), the **Resend MCP** (OTP read if on prod), Sentry/Vercel/PostHog for verification. Agents: `vercel-deployment-specialist` for deploy verify; reviews via fresh-context role-prompted subagents (security review on any data/credit path).

## DECISION POLICY (unchanged)

Never ask; choose the recommended option, log it (DECISIONS in `activities.md`); surface notable quality/judgment calls in the final report. Failing test/review = fix, not stop. **Hard stops:** PVO/licensed art; **the customer logo is COMPOSITED, never AI-rendered** (PRD rule); `PII_ENCRYPTION_KEY`; force-push main; `withSystem` for user-scoped queries; ADR-0013/0014 locks; no Stripe; exceeding BUDGET.

## BUDGET (real fal — this goal must spend to prove the fix)

Generation + iteration + final + multiple proof runs. Ledger in the report. **Ceiling: $6 fal + $1 Anthropic.** Prove the brief-honored fix on ONE brief first, then the logo + multi-view, before broader runs. If the ledger projects a breach, ship what's proven + document the rest.

## ENVIRONMENT (real fal, isolated, net-zero)

Same model as Goal 13: **local build + real fal** (`AI_PROVIDER=fal` + `FAL_KEY` + `ANTHROPIC_API_KEY` from `apps/web/.env.local`), **DATABASE_URL on a LOCAL throwaway Postgres — never prod** (Goal 13 stood one up by hand: create DB → `prisma migrate deploy` → `auth_rls.sql` → `ALTER ROLE app_user LOGIN` → seed the catalogue; consider landing a documented **`db:setup-local`** script — the Goal 13 env finding). Vehicle art reads read-only from the public bucket. Generated images + logo uploads will write to LIVE storage (no local storage without Docker/Supabase-CLI) — **purge them after via `maintenance.purgeTestProjects` and verify the bucket returns to baseline** (Cowork will diff `project-assets` object counts). State the environment used.

## SETUP

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App
git fetch origin main
git worktree add -b goal/15-export-correctness ../alphawolf-goal-15 origin/main
cd ../alphawolf-goal-15
cp ../AlphaWolfDecals-App/.env.local apps/web/.env.local   # real AI keys; then point DATABASE_URL at LOCAL throwaway PG
```

## CONTEXT (read in order)

1. `CLAUDE.md` (incl. §8 graphify) + `activities.md` top entries (Goals 12–14).
2. **The Goal 13 evidence:** `docs/deployment/screenshots/2026-06-15-goal-13/goal-13-export-pack.pdf` (the wrong export) + `findings-and-defects.md` (D13-1 parse queue, D13-4 empty concept previews, + the env findings).
3. The generation stack (Goal 7): the fal provider adapter + the **Haiku orchestrator prompts** (brief snapshot → per-view generation instructions; **nano-banana-edit** is the default — it EDITS the vehicle's view render, which is why output can stay too close to stock), the credit rails, the logo-compositing rule (logo is a layer, never AI-rendered).
4. The export/spec-pack pipeline (the PDF generator) + the editor compositing (Konva) for how artwork maps to zones.

## TASK — deliverables in order

### D1 — Root-cause + fix: the AI must honor the brief (the headline)

`systematic-debugging` Phase 1: inspect the ACTUAL prompt/payload the orchestrator sent to fal for a "gloss black base + cyan stripes + white script" brief, and the rendered output. Determine WHY it came back near-stock: orchestrator prompt loses the brief? nano-banana edit too conservative (low strength / preserves the base)? conditioning dominates? Form one hypothesis, test minimally. Then fix at the root — most likely **upgrade the orchestrator prompts** (apply `senior-prompt-engineer`; version them) and/or the edit strength/model params, possibly the model choice for bold color changes. **Proof:** that brief now yields a recognizably gloss-black + cyan-striped design — not a stock vehicle. Add an eval (2–3 distinct briefs → assert the output reflects each).

### D2 — Logo composited ONTO the vehicle (PRD rule)

The customer logo must render **on the design** at its assigned zone(s), defaulting to a **prominent panel (driver door or hood)** when the brief implies it — never AI-rendered, composited as a layer. Fix the export render + the editor so the logo appears ON the car (cover + views), not only as text in the spec table. Also fix the **clipped `alpha-wolf-logo.svg` text** in the spec-table Logo column.

### D3 — Clean zone compositing

Fix the messy raster fragments dropped into zones (Goal 13 `24`/`26`): artwork clips cleanly to a zone's printable area with correct fit/anchor — no stray image bits, no spill.

### D4 — Multi-view export

The export pack shows the design on **multiple views** (front + sides + rear), with a strong hero (front/3-quarter, not a bare rear), and the spec table aligned to it. Keep the existing spec data; fix what views render.

### D5 — Concept previews never empty (D13-4)

Branded skeleton until each preview decodes; the card binds the first complete render so the 3 concepts never present blank (the money shot).

### D6 — Screen-22 concept-selection redesign (Goal 14 carryover DEC-4 — now verifiable with real fal)

Land it for real: each concept a shadcn Card that animates on hover; the SELECTED/"final" concept gets a distinctly more prominent treatment (not equal to the other two); remove the odd blue ring around the vehicle. **Verify against real rendered concepts** (the local mock couldn't show the populated grid in Goal 14).

### D7 — Vehicle-detail line-art (Goal 14 carryover)

The vehicle-detail page (`06`) still renders the heavy black-FILLED template; switch it to the clean line-art used in the editor (`23`/`24`) for consistency.

### D8 — Parse-queue reliability (D13-1)

The logo/photo parse queue (BullMQ) silently drops jobs on an evicting Redis. Pin the parse Redis to `noeviction` (or a dedicated instance) and surface a "still processing… / retry" state instead of an indefinite spinner.

### D9 — Real-fal proof run + net-zero

One full journey on real fal with a design-heavy brief: brief → 3 concepts (honoring it) → iterate → final → editor (logo on the car, clean zones) → **export pack showing the right design + logo across views**. Commit the new export PDF as proof (the before/after vs the Goal 13 PDF). Purge all live-storage artifacts; verify net-zero (DB local; storage back to baseline). Sentry 0 new; advisors baseline.

## CONSTRAINTS

- This goal CHANGES generation/export logic — that's expected. But **don't break other parts**: all unit/integration tests + the Goal 13 journey spec + prod smoke stay green; the editor + auth + RLS + DB split untouched unless a deliverable requires it (then second security review).
- Logo composited, NEVER AI-rendered. Real fal within BUDGET. Net-zero (DB local + storage purged + verified).
- `systematic-debugging` RIGID for D1/D3 — root cause before fix. Review §3 every PR; generation/credit/export PRs get the independent second review. graphify PR-impact before merge.

## OUTPUT / DEFINITION OF DONE

1. **D1:** the brief is honored — a gloss-black + cyan-stripe + white-script brief yields a recognizably-that design (evidenced new render vs the Goal 13 stock-ish one); eval of 2–3 briefs committed.
2. **D2:** logo composited onto the vehicle at a prominent zone (cover + views), never AI-rendered; spec-table logo text no longer clipped.
3. **D3:** zones composite cleanly (no stray fragments). **D4:** export shows multiple views + a strong hero. **D5:** no empty concept cards.
4. **D6:** screen-22 redesigned + verified against real concepts. **D7:** vehicle-detail uses the clean line-art. **D8:** parse queue `noeviction` + a real processing/retry state.
5. **D9:** a real-fal proof export PDF committed showing the CORRECT design + logo on the car across views; net-zero verified (DB local, `project-assets` storage back to baseline — Cowork will confirm); Sentry 0 new; advisors baseline.
6. All PRs reviewed + CI-green; spend ≤ budget (ledger); closeout: `activities.md` TOP entry + DECISIONS, mermaid `docs/vault/diagrams/goal-15-export-correctness.md`, worktree removed, branch deleted (or PR open for Archer).
7. Final report to Archer ≤10 lines: the root cause of the wrong export + the fix, whether a real brief now produces the right design, the logo-on-car proof, the new export PDF location, net-zero confirmation, spend, and anything deferred.
