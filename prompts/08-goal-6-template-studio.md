# Goal 6 — Template Studio (authoring pipeline + AW panel data)

Drafted 2026-06-11 by Cowork orchestration per /prompt-engineer discipline. Executor: **Fable 5 in Claude Code**, `--dangerously-skip-permissions`, autonomous single run.

Paste everything below the line into a fresh `claude` session started in `/Users/ashton/Documents/AlphaWolfDecals-App`.

---

## ROLE

You are Claude (Fable 5) in Claude Code executing Goal 6 of Alpha Wolf Wrap Studio: build the **Template Studio** — the internal authoring pipeline that turns owned source material (shop photos, OEM dimensional drawings, owned SVG art) into published vehicle templates with full panel data — and use it to make the 3 AW catalog templates fully functional in the editor. This is the machine that builds the company's moat. You run autonomously start-to-finish; Archer is away.

## DECISION POLICY (identical to Goal 5 — read twice)

- NEVER ask the user to choose. Pick the option you'd recommend, state it in one line, proceed. Log every non-obvious decision in a DECISIONS section of your activities.md entry.
- If genuinely blocked: skip the sub-task, document it as a launch item with exact unblock instructions, continue. Never idle, never improvise across a security or legal boundary.
- **Hard stops (never, even to unblock):** use PVO or any license-restricted provider's files/traces/derivatives — `docs/legal/template-source-license.md` is a legal wall and "for testing" is not an exception; rotate `PII_ENCRYPTION_KEY`; force-push main; delete files; `withSystem` for user-scoped queries; modify ADR-locked invariants.
- A failing test or review finding = fix and re-verify, not stop.

## SETUP

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App
git fetch origin main
git worktree add -b goal/6-template-studio ../alphawolf-goal-6 origin/main
cd ../alphawolf-goal-6
```

main should be at `7139b0d` (PR #134) or later. Open dependabot PRs (#108/#110/#112–#115/#131) are DEFERRED — leave them alone.

## CONTEXT (read in this order before any code)

1. Repo `CLAUDE.md` — review protocol §3, security boundaries §2, gotchas §6. Activate repo skills/agents as relevant: `.claude/skills/` (code-reviewer, webapp-testing, supabase-postgres-best-practices, ui-design-system) and `.agents/` (database-architect, security-auditor, test-engineer) — use them per the skill-check-first rule.
2. `activities.md` top 3 entries (PR #134 hardening, Goal 5 closeout).
3. `docs/product/template-supply-strategy.md` — the strategy this goal implements, including the legal boundary table and the Studio pipeline spec (§"The Template Studio").
4. `docs/product/roadmap-goals-6-10.md` — where this goal sits in the chain.
5. PRD v1.1 §4.2 (template data model: views, dimensions, panel breakdown, wrap-safe zones) + `prd-b2c-guided-design-flow.md` §3 step 3 / B2C-003 (zone selector consumes the same panel data).

**AUDIT FIRST (verify, don't assume):**
- The schema already has `vehicle_templates` + `vehicle_panels`; the **Ford Transit (`a0000000…`) has 6 panel rows** — it is your schema reference and fidelity bar. The 3 AW templates (AW-TPL-0001 BMW X3 4-view, AW-TPL-0002 Contender Bass Boat 2-view, AW-TPL-0003 Crown Super Coach 3-view) have ZERO panel rows.
- A Python paneling service exists (CI job "Python — lint + test (paneling)") plus the parse pipeline (`services/parse`, AI/EPS/PDF→vector) and prior AI→SVG conversion work — inventory ALL of it before writing new vectorization code; the Studio should COMPOSE existing capability.
- The AW templates' wrapped SVGs were a Goal 2a manual import of **Alpha Wolf's own art** (license-clean, unlike PVO) — they ARE legitimate source material for panel authoring.
- The "Request this vehicle" flow (PRD §4.2 / GH-style request queue) exists in some form — find it before wiring the worklist.

## TASK — deliverables in order

### D1 — Studio pipeline (the tool)
Internal, **admin-gated** (internal-admin role per PRD §3.3 — verify how admin gating works in this codebase and reuse it; if no admin surface exists, a gated route + CLI scripts is acceptable, decide and log). Pipeline stages per the strategy doc:
1. **Ingest:** photo set (orthographic views) OR dimensioned drawing (PDF) OR owned SVG art, + reference measurements (overall length, wheelbase, wrap height).
2. **Vectorize:** perspective-correct → edge-extract → clean Bézier outlines per view (reuse parse/paneling capability where it exists).
3. **Panel segmentation:** propose panel regions per view (doors, hood, quarters, roof, glass, trim) with an operator confirm/adjust step; emit `vehicle_panels` rows matching the Transit's schema shape exactly (the editor and zone selector must consume them unchanged).
4. **Wrap-safe zones + scale calibration** from the reference measurements.
5. **Publish:** template + panels + the 1/20th-scale multi-view layout sheet (name, code, dimension callouts — the format in `docs/product/template-supply-strategy.md`).
Persistence/storage follows existing patterns (Supabase storage bucket `vehicle-templates`, Prisma migrations + RLS: templates are public-read like today; Studio write paths are admin-only — design the policies, advisor-gate them).

### D2 — Panel data for the 3 AW templates (the launch blocker)
Run the Studio on the AW templates' own SVG art + their stored dimensions. Author complete panel sets (all views) for AW-TPL-0001/0002/0003. Quality bar = the Transit. Since panel-boundary judgment is visual: generate side-by-side QC screenshots (template art + panel overlay) into the closeout evidence folder and FLAG "Archer visual approval of AW panel sets" as the one human launch item this goal produces. Publish the panels regardless (editor functional > pixel-perfect; his pass adjusts, not blocks).

### D3 — Editor + wizard verification on AW templates
Prove end-to-end: editor place/color/text works on at least AW-TPL-0001 panels; the B2C wizard zone selector renders and toggles AW panels. Extend the e2e suite: the wizard happy-path spec gains an AW-template variant (or a new spec) that runs in the prod smoke.

### D4 — Request-queue worklist
Wire the existing "Request this vehicle" submissions into a Studio worklist view (admin): status (requested → in_progress → published), requester notified on publish via the existing email path (it's fixed and loud now — PR #134).

### D5 — Operator runbook
`docs/product/template-studio-runbook.md`: how Archer authors a new vehicle start-to-finish (photo spec: which angles, how to measure; OEM drawing path; expected time ≤60 min). Written for a non-dev. The runbook is the Studio's user manual — its quality decides whether the strategy doc's "150–400 templates/yr" claim is real.

## CONSTRAINTS

- Review protocol on every PR (repo CLAUDE.md §3): fresh-context review + CI green; RLS/auth/admin-gating PRs get a second fresh security review; record verdicts in PR descriptions. Small stacked PRs in deliverable order.
- New tables/policies: Prisma migration + RLS, `withUser`/admin patterns per the established codebase; SECURITY DEFINER helpers follow the `app_is_shop_member` lockdown pattern (search_path-pinned, EXECUTE to app_user only).
- No heavyweight new deps without need — prefer existing python services + sharp/svgo/potrace-class tooling; log any new dep with rationale.
- PostHog: template_authored, template_published, vehicle_request_fulfilled events. Sentry on all new server actions.
- All user-facing + runbook copy: simple, direct, non-dev voice.

## OUTPUT / DEFINITION OF DONE

1. Studio pipeline merged via reviewed PRs; admin-gated; operator can run ingest→publish on a new vehicle.
2. AW-TPL-0001/0002/0003 have published panel sets on prod; editor verified functional on AW-TPL-0001 (e2e + screenshots); zone selector renders AW panels.
3. QC overlays + prod screenshots in `docs/deployment/screenshots/<date>-goal-6/`; "Archer visual approval" flagged as the only human item.
4. Request-queue worklist live; notify-on-publish verified (one real send, now that email errors loudly).
5. Smoke suite green on prod including the new AW-template coverage; Supabase advisors: no new WARNs (baseline 2).
6. Runbook committed; closeout ritual complete (activities TOP entry with DECISIONS log, mermaid diagram `docs/vault/diagrams/goal-6-template-studio.md`, worktree removed).
7. Final message to Archer, ≤8 lines: what shipped, decisions count, the visual-approval ask, where evidence lives.
