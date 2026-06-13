# Goal 9 — Growth Loops + Polish (share-for-feedback, referral credits, shop locator) + 3 hygiene riders

Drafted 2026-06-13 by Cowork orchestration via /prompt-engineer + /superpowers. Executor: **Claude in Claude Code**, autonomous single run. Sequenced after Goal 7; Goal 8 (paneling) is DEFERRED post-launch (`docs/product/roadmap-goals-6-10.md`), so this is the next goal in the chain.

**To run:** start a fresh `claude` session in `/Users/ashton/Documents/AlphaWolfDecals-App` with `--dangerously-skip-permissions`, then issue this file as the goal brief:

```
/goal prompts/10-goal-9-growth-loops.md
```

If `/goal` expects inline text instead of a path, paste everything below the `---` as its argument. Everything below the line is the brief.

---

## ROLE

You are Claude in Claude Code executing Goal 9 of Alpha Wolf Wrap Studio: build the **growth loops on the export funnel** — a public share-for-feedback page with concept voting, referral credits (give 2 / get 2), and a "no shop? find one near you" locator handoff — plus three hygiene riders rescued from the deferred Goal 8 prompt. You run start-to-finish alone, no questions.

## ACTIVATE (workspace skills + review subagents — verified present 2026-06-13)

- **Skills** (`.claude/skills/`, confirmed to exist — read each skill's current SKILL.md before applying, per /superpowers): `senior-frontend` + `ui-design-system` (share page, vote UI, locator, referral surfaces — reuse existing theme tokens incl. `svg.brand.cyan`); `senior-backend` (public share read path, referral grant + anti-abuse, locator query); `supabase-postgres-best-practices` + `supabase` (public-share RLS — the highest-risk surface this goal); `api-security-best-practices` + `website-security-audit` (the unauthenticated read surface + the credit-minting path); `code-reviewer` (every PR); `webapp-testing` (e2e on the public page + referral flow); `systematic-debugging` (when flows misbehave — theory→evidence→fix); `design-review` (the polish pass, deliverable 4).
- **Review subagents — NO named security/architecture/test agents exist in this repo.** `.claude/agents/` holds only `context-manager` + `vercel-deployment-specialist`; the Goal 7 run confirmed `backend-architect` / `security-auditor` / `test-engineer` / `debugger` are absent. Fulfil every review with a **role-prompted subagent in a FRESH context** via the Task tool — the proven Goal 7 pattern (decision #9): a security-reviewer role for deliverables 1/2/5, an architecture-reviewer role for the referral idempotency design before you build it.
- Process order per CLAUDE.md §0: planning/review (architecture-reviewer subagent + `software-architecture` / `senior-architect` skill) before implementation skills.

## DECISION POLICY (unchanged from Goals 5/6/7 — read twice)

Never ask; choose the recommended option, log it (DECISIONS section in `activities.md`). Blocked → skip, document, continue. **Hard stops:** PVO/licensed sources; `PII_ENCRYPTION_KEY`; force-push main; file deletion; `withSystem` for user-scoped queries; ADR-locked deploy invariants (ADR-0013/0014); exceeding BUDGET. Failing test/review = fix, not stop.

## BUDGET

This goal is mostly **non-AI** (loops + polish + cleanup). Real model spend should be ~$0. Ceiling: **$1 combined** for any incidental generation needed to seed share/referral test data — prefer the MOCK adapter. Keep the running ledger habit; report the total (expected: near zero). Grant-only credits remain in force: **NO Stripe, no checkout UI** anywhere in this goal.

## SETUP

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App
git fetch origin main
git worktree add -b goal/9-growth-loops ../alphawolf-goal-9 origin/main
cd ../alphawolf-goal-9
```

Keep PRs small and merged as you go — interrupted runs resume from git state. Dependabot PRs remain DEFERRED.

## CONTEXT (read in order before any code)

1. Repo `CLAUDE.md` — review protocol §3 (**verdict text in EVERY PR body, incl. data/docs PRs**; RLS/auth/credit PRs get the independent second security opinion), security boundaries §2 (DB split), gotchas §6.
2. `activities.md` top 3 entries (Goal 7 closeout + the 2026-06-13 Cowork session entry that logged this goal's setup).
3. `prd-b2c-guided-design-flow.md` — §4 items 3/5/6 (share-for-feedback voting P2, shop locator P2, referral credits give-2/get-2 P2), §5 (credit ledger: `source: grant|purchase|referral|admin` already exists; grant-only; waitlist not checkout), §7 Phase 3, §1.2 (the export pack is the viral artifact — its QR + short URL already ship).
4. `docs/product/roadmap-goals-6-10.md` — the Goal 9 row + the 3 folded riders (authoritative scope for this goal).

**AUDIT FIRST (CLAUDE.md §1.2 — search the code by what's shipped, not by goal label; the PR #38 over-delivery lesson):**
- **The before/after slider is ALREADY SHIPPED** (Goal 7 deliverable 6, on concept views). PRD §4 lists it under loops, but it is DONE — do NOT rebuild it. Confirm it exists, then exclude it from scope.
- **The `referral` credit source already exists** in the ledger enum, and credits move ONLY through the SECURITY DEFINER functions (`app_spend_credits` / `app_refund_credits` and the sanctioned grant path; `app_user` INSERT on the ledger stays revoked — Goal 7 decision #8). Referral grants MUST use the sanctioned path — do not add a new write surface.
- **The export pack already carries a project QR + short URL** (Goal 7 export page 1). The referral QR composes onto that existing artifact — don't invent a second QR system.
- **`projects.transfer_token` already exists.** Use a scoped share token for the public page; do not invent a parallel token scheme.
- **`shops` + `memberships` tables exist** (real rows). The locator queries platform shops first, then a static directory fallback.
- The waitlist exhaustion sheet, PostHog server capture, and rate-limit helpers all exist — COMPOSE.

## TASK — deliverables in order

1. **Share-for-feedback page (P2)** — a public, read-only, unauthenticated page (scoped by share token) showing the project's 3 concept directions with 👍 voting ("my crew picked #2"). **Security is the point of this deliverable:** expose ONLY the concept images + vote tally — **never** customer name, email, brief internals, or any PII. Read path is the rare legitimate unauthenticated read — scope it tightly (token-bound, read-only view; if `withSystem` is used it is token-validated and returns only the whitelisted public columns). Voting is rate-limited and idempotent per visitor. PostHog: `share_page_viewed`, `concept_voted`. **This PR gets the §3 second security review.**
2. **Referral credits (P2)** — give 2 / get 2: a referrer shares a link or the export-pack QR; a new signup attributing that code grants 2 credits to each side, **once**, via the sanctioned SECURITY DEFINER grant path (`source: referral`). Anti-abuse (architecture-reviewer subagent reviews the design FIRST): no self-referral, one grant per referee, attribution captured at signup only. PostHog: `referral_link_created`, `referral_signup_attributed`, `referral_credits_granted`. No Stripe.
3. **Shop locator handoff (P2)** — "no shop? find one near you" entry point from the export/handoff flow: maps to platform `shops` first, then a static directory fallback. Feeds the B2B funnel; lays the QR-attribution groundwork (no affiliate program — that's a future phase, out of scope). PostHog: `locator_opened`, `shop_handoff_clicked`.
4. **Theme / visual polish pass** — run the `design-review` skill against the live B2C flow (wizard → generation → export); fix the top findings only (surgical, no redesign). Record the before/after grade in the PR.

### Riders (folded from the deferred Goal 8 prompt — 2026-06-13)

5. **Test-account retirement policy** — ~69 test customers + the 8 former-admin test accounts (created 2026-06-12 during the Goal 7 proof run; **Cowork already revoked `is_admin` on all 8 on 2026-06-13 — verify 0 admins remain, then proceed**) sit in prod. Define a retirement policy (identify test cohort deterministically; anonymize-or-delete via a documented, RLS-safe maintenance routine — NOT ad-hoc), apply it, and add a **guard so e2e/proof runs can never persist accounts to prod with elevated flags** (root-cause: a customer signup path or test seed set `is_admin=true`; find it and fix the root cause, per CLAUDE.md §6 detective method — theory, evidence, then fix). Deletion of real user data requires the documented routine + the second security review.
6. **PostHog test-traffic filtering** — launch metrics are currently mostly smoke/e2e runs. Add an internal-traffic / test-cohort filter (PostHog internal-traffic config + an `is_test` property on synthetic events) so post-launch dashboards are clean. Document what's filtered.
7. **PRD §10 truth-up** — record the bake-off outcome in `prd-b2c-guided-design-flow.md` §10: the shipped default is **nano-banana (Gemini edit)**, overturning the spec's flux-depth paper pick (rationale: it edits the template's own view render so the customer sees THEIR vehicle — Goal 7 decision #4). Spec must match what shipped.

## CONSTRAINTS

- Review protocol §3 on every PR; deliverables 1, 2, and 5 (public read surface, credit minting, user-data deletion) each get the independent second security review. Verdict text in every PR body.
- **Public share page leaks nothing but the concepts + votes.** No PII, ever. If in doubt about a column, exclude it.
- Grant-only credits — NO Stripe, no checkout UI; referral uses the existing `referral` source via the sanctioned grant fn; `app_user` ledger INSERT stays revoked.
- All new tables (votes, referral attributions) → Prisma + owner/where-applicable RLS; user-scoped reads via `withUser`; `withSystem` only for the token-scoped public read and documented maintenance.
- e2e cleanup rule (standing): prod e2e/proof runs retire every artifact they create — and this goal's rider 5 makes that enforceable going forward.
- No heavyweight new deps without logged rationale. User-facing copy: simple, direct, non-dev voice.

## OUTPUT / DEFINITION OF DONE

1. All 7 deliverables merged via reviewed, CI-green PRs; deliverables 1/2/5 carry the second security-review verdict in the PR body.
2. Public share page live on prod: loads by token, shows 3 concepts + voting, leaks no PII (verified — screenshot + a note on exactly which columns the public path returns).
3. Referral give-2/get-2 proven end-to-end (1 referrer + 1 referee), credits granted exactly once via the sanctioned path, self-referral blocked — evidence committed.
4. Shop locator reachable from the handoff flow; queries platform shops then static fallback.
5. Rider 5: 0 admin-flagged customer accounts remain; test cohort retired per the documented routine; root-cause guard against elevated-flag e2e persistence merged + tested. Rider 6: PostHog test-traffic filter live + documented. Rider 7: PRD §10 updated.
6. Spend ledger total reported (expected ≈ $0, ≤ $1); smoke green on prod; Supabase advisors: no new WARNs beyond the 2-WARN baseline (note the pre-existing RLS-disabled advisory on `rate_limits` / `_prisma_migrations` — flag for the Goal 10 audit, do not silently change).
7. Closeout ritual: `activities.md` TOP entry + DECISIONS log; mermaid `docs/vault/diagrams/goal-9-growth-loops.md`; PostHog screenshot of the new event taxonomy → `docs/deployment/screenshots/<date>-goal-9/`; worktree removed (`git worktree remove ../alphawolf-goal-9 && git branch -d goal/9-growth-loops`).
8. Final message to Archer ≤8 lines: what shipped, spend total (≈$0), what the test-account cleanup removed + the root cause it fixed, the public-page PII-safety confirmation, and anything flagged for Goal 10.
