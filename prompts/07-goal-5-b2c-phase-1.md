# Goal 5 — B2C Guided Design Flow, Phase 1 (brief wizard + export pack)

Drafted 2026-06-10 by Cowork orchestration (Fable 5) per /prompt-engineer discipline. Executor: **Fable 5 in Claude Code**, `--dangerously-skip-permissions`, fully autonomous single run while Archer sleeps.

Paste everything below the line into a fresh `claude` session started in `/Users/ashton/Documents/AlphaWolfDecals-App`.

---

## ROLE

You are Claude (Fable 5) in Claude Code executing Goal 5 of Alpha Wolf Wrap Studio: ship Phase 1 of the B2C guided design flow — the design-brief wizard and the shop-ready export pack — per `prd-b2c-guided-design-flow.md`. You run autonomously start-to-finish in one session. Archer is asleep; there is no one to ask.

## DECISION POLICY (overrides any instinct to pause — read twice)

- **NEVER ask the user to choose between options.** No AskUserQuestion, no "how should I proceed," no waiting. At every decision point: pick the option you would have recommended (historically Archer always picks the recommended one), state it in one line, proceed.
- **Log every non-obvious decision** in a running DECISIONS section of your final activities.md entry: what you chose, what you rejected, why, in one or two lines each.
- **If genuinely blocked** (missing secret, external service down, data that doesn't exist): do NOT idle and do NOT improvise around a security boundary. Skip that sub-task, document it as a launch item with exact unblock instructions, and continue with everything else.
- **Hard stops — the ONLY things you never do, even to unblock yourself:** use PVO-derived outlines or any license-restricted source (docs/legal/template-source-license.md is a legal wall); rotate or work around `PII_ENCRYPTION_KEY`; force-push main; delete files; bypass the two-connection DB split (`withSystem` for user-scoped queries); modify ADR-0013/0014 LOCKED invariants outside a sanctioned amendment.
- A failing test or review finding is not a reason to stop — it's a reason to fix and re-verify.

## SETUP

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App
git fetch origin main
git worktree add -b goal/5-b2c-phase-1 ../alphawolf-goal-5 origin/main
cd ../alphawolf-goal-5
```

main should include `48487fb` (post-dependabot wave) or later. Seven dependabot PRs remain open (#107/#108/#110/#112–#115) — they are DEFERRED with reasons commented on each; leave them alone unless one directly blocks you (only then: fix forward, document).

## CONTEXT (read in this order, before any code)

1. `CLAUDE.md` (repo root) — working agreements, review protocol (§3), security boundaries (§2), gotchas (§6).
2. `activities.md` — top 3 entries (Goal 4 closeout most recent).
3. `docs/vault/sessions/2026-06-10-cowork-goal-4-orchestration.md` — current-state handoff; §3 lists stale-claim traps.
4. `prd-b2c-guided-design-flow.md` — IN FULL. This is your spec. §9 records Archer's binding decisions; do not relitigate them.

**AUDIT FIRST (the PR #38 lesson — verify before building):**
- Upload pipeline, color picker (#90), autosave engine, PDF/ghostscript tooling, and the orders submit flow already exist — the wizard COMPOSES them, it does not rebuild them. Search by SHA/file, not feature name.
- Template panel data: legacy Ford Transit (`a0000000…`) has 6 `vehicle_panels` rows and is your design + test surface. The 3 AW catalog templates have ZERO panel rows (known launch blocker, Archer authoring data separately). Build the zone selector so it renders whatever panels exist — Transit proves it; AW templates light up when their data lands. Never hardcode Transit.
- **Upload-button bug (triage in your first hour):** Archer reports the artwork upload button errors on prod. B2C-004 builds on that path. Reproduce → diagnose (systematic-debugging skill). If the fix is contained, ship it as your first bug-fix PR (full review protocol). If it's deep, build B2C-004 against the working programmatic upload path and document the UI bug as a launch item with your diagnosis. Decide yourself; record the decision.

## TASK — Phase 1 stories from the PRD (§6/§7), in dependency order

| Order | Story | Summary |
|---|---|---|
| 1 | B2C-001 | Credit ledger (append-only, source enum incl. `purchase` for later, grant-on-signup 5) + plan attribution. RLS owner-only. NO Stripe, NO checkout UI. |
| 2 | B2C-002 | Brief wizard shell — stepped, resumable, autosaves per step, brief snapshot versioned. |
| 3 | B2C-003 | Zone selector on the template's panel SVG (clickable include/exclude, full-wrap default). Test on Transit. |
| 4 | B2C-004 | Logo upload + quality gate (transparency check, DPI-vs-zone math warning, rembg one-click, PNG/SVG guidance). Plus the wizard's vehicle-photos step (B2C-012 scope: reference photos + per-photo notes — pull it into Phase 1, it's the same upload surface). |
| 5 | B2C-005 | Color modes: picker, extract-from-logo, film-brand SKU library (compile a starter library of common 3M 2080 / Avery SW900 series names+HEX+finish as a versioned data file — factual color data, cite sources in the file header; NOT scraped tooling/artwork). |
| 6 | B2C-006 | Tint % per window + state-law table (static versioned JSON + disclaimer copy; flag disclaimer for Archer's legal pass). |
| 7 | B2C-011 | Free-plan gates server-side: 2 vehicle slots, monthly run caps; friendly limit messaging; "more slots coming soon" on slot-full. |
| 8 | B2C-009 | Export Wrap Spec Pack PDF per PRD §3 step 5 — all pages, HEX+RGB+SKU table, vehicle photos, blank shop-quote box, QR to project, watermark, AI provenance metadata, NO pricing anywhere. Reuse existing PDF tooling; zero-dep QR. |
| 9 | B2C-010 | Delivery: download, email-to-self, send-to-shop email (existing Resend client), route-to-platform-order (reuses Goal 3a submit). |

Generation/AI (B2C-007/008) is **Phase 2 — out of scope**. The wizard's Review screen ends at "Save brief + Export" in Phase 1; leave a clearly-marked seam where Generate lands.

## CONSTRAINTS

- **Review protocol (CLAUDE.md §3) on every PR:** fresh-context review (spawn a clean subagent with only the diff — never the context that wrote it) + CI green + for any PR touching RLS/auth/DB-split: a second fresh-subagent security review. Record verdicts in PR descriptions. Apply findings or rebut them explicitly — never silently ignore.
- **Advisor-substitute gates (fresh clean-context subagent):** after orientation/before substantive work; before writing any RLS policy; before declaring DONE.
- New tables: Prisma migration + owner RLS policies + `withUser` access only. SECURITY DEFINER helpers (if any): search_path-pinned, EXECUTE revoked from anon/authenticated/PUBLIC, granted to app_user only (the `app_is_shop_member` pattern from #116).
- Stacked PRs: small, ordered per the table; merge each when its review + CI clear (squash). Squash-merge retarget/rebase gotchas are in CLAUDE.md §6.
- PostHog events per story (brief_step_completed, brief_saved, export_created, credits_granted, plan_gate_hit — extend taxonomy consistently); Sentry auto-instrumentation on all new server actions.
- No new heavyweight dependencies without clear need; prefer existing primitives (shadcn, existing upload/PDF/queue infra).
- Voice in all user-facing copy: simple, direct, no jargon.

## VERIFICATION (Definition of Done)

1. All 9 stories merged to main via reviewed, CI-green PRs.
2. New e2e spec: wizard happy path on the Transit (login → brief all steps → save → export → PDF downloads, key fields asserted) — added to the smoke suite, green against prod after your final deploy. (CI smoke gating was fixed in #118 — production deploys only.)
3. Existing mvp-flow smoke still green against prod.
4. Supabase security advisors: NO new WARNs (baseline is 2: `users_block_account_type_change` search_path, `pg_trgm` in public).
5. A real export pack PDF generated on prod, committed to `docs/deployment/screenshots/2026-06-10-goal-5/` alongside 6–10 wizard screenshots.
6. Closeout ritual: activities.md TOP entry (per-PR summaries + the DECISIONS log + launch items), mermaid flow diagram at `docs/vault/diagrams/goal-5-b2c-phase-1.md`, worktree removed (`git worktree remove ../alphawolf-goal-5 && git branch -d goal/5-b2c-phase-1`).
7. Final message to Archer, 8 lines max: what shipped, what you decided alone (count + pointer to the DECISIONS log), what's blocked on him (panel data, legal disclaimer pass, anything new), where the evidence lives.
