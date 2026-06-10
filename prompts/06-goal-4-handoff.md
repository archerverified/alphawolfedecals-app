# Goal 4 — Verification + investor handoff package

Regenerated 2026-06-09 by Cowork (Fable 5) — the 2026-06-04 original was lost with the `prompts/` directory. Verified against prod state as of 2026-06-09: main HEAD `5b6a9b8` (PR #93 merged + deployed), prod 200 on `/vehicles`.

Paste everything below the line into a fresh `claude` session started in `/Users/ashton/Documents/AlphaWolfDecals-App`.

---

/goal 4

## ROLE

You are Claude Code (Opus 4.8) executing Goal 4 of Alpha Wolf Wrap Studio: prove the MVP to investors. You work autonomously in a dedicated worktree. You have an `advisor` tool — usage rules in CONSTRAINTS.

## SETUP (do this first, in order)

The repo has 3 stale goal worktrees and the canonical checkout is stranded on `tmp/rebase-99`. Clean up, then create your worktree:

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App
git worktree prune
git worktree remove ../alphawolf-goal-3a 2>/dev/null; git worktree remove ../alphawolf-goal-3b 2>/dev/null; git worktree remove ../alphawolf-goal-3c 2>/dev/null
git checkout main && git pull origin main
git worktree add -b goal/4-mvp-handoff ../alphawolf-goal-4 origin/main
cd ../alphawolf-goal-4
```

Note: `tmp/rebase-99` carries one unpushed commit `30e1f02` (code-simplifier agent + code-structure skill). Do NOT delete that branch. Whether to ship it is Archer's call — flag it in your closeout.

## CONTEXT (read before any substantive work)

- Read `activities.md` top entries (Goal 3a/3b/3c) and `CLAUDE.md` first. Activities log is append-only — corrections are new entries.
- **AUDIT FIRST.** Check what's already shipped before building anything. PR #38 pre-delivered an entire goal's territory once. `dist/mvp-handoff/` is currently an empty `.gitkeep` — Goal 4 has not started, but verify.
- MVP is functionally complete on prod: catalog (3 templates), design canvas, submit→order, shop dashboard + status transitions, 4 email templates, mvp-flow smoke spec. Prod: https://alphawolfedecals-app-web.vercel.app
- PR #100 (3c docs salvage) is MERGED (`acc0706`) — the activities.md conflict risk is resolved.
- **Review stack changed 2026-06-09:** CodeRabbit is RETIRED for this project (org ran out of credits; Archer approved the swap). The replacement protocol is in CONSTRAINTS. The `.coderabbit.yaml` guardrails are part of ADR-0013's LOCKED invariants — do NOT delete that file; migrating its guardrails is part of DELIVERABLE 4.

### Known environment state (verified 2026-06-09, do not re-derive)

| Item | State |
|---|---|
| Prod main HEAD | `acc0706` (#100 docs salvage merged 2026-06-09; #93 deployed before it) |
| RLS on `orders` | orders_owner_all / orders_shop_read / orders_shop_update — all live |
| `RESEND_API_KEY` on Render alphawolf-api | SAVED but NOT deployed — trigger a deploy of alphawolf-api or the retry worker won't see it |
| Resend domain verification (GH-016) | DONE 2026-06-09 (Archer). Emails should send on prod — verify a real send end-to-end during the smoke run and check the Resend dashboard/Sentry for delivery failures |
| `SMOKE_*` GitHub Actions secrets | NOT set (verified: 0 repo secrets). See DELIVERABLE 0.5 |
| Supabase | `dxwnzxlmggpdjyoxdybh` us-west-1, 6 migrations applied, free tier (auto-pauses after 7d idle) |

## TASK — deliverables in strict order

### DELIVERABLE 0 (BLOCKING — nothing else starts until both clear)

Run `/website-security-audit`, then `/production-readiness`, against `https://alphawolfedecals-app-web.vercel.app`.

- Any live FAIL → open a hotfix PR, run the review protocol (CONSTRAINTS), merge, re-audit, then resume.
- Call `advisor()` BEFORE acting on any security finding that touches RLS, auth, or the two-connection DB split.

### DELIVERABLE 0.5 — smoke unblock (new since the original prompt)

The smoke spec (`apps/web/e2e/mvp-flow.spec.ts`) green-skips on prod without pre-seeded accounts. Passwords are argon2id and `email_lower_hash` is a keyed HMAC, so accounts CANNOT be seeded by raw SQL — use the app's own code path:

1. Write `scripts/seed-smoke-accounts.ts` using `@alphawolf/auth` (hashPassword + the real user-creation path) with `.env.local` loaded. Create: 1 verified customer account, 1 verified shop account with a membership in a dedicated "Smoke Test Shop". Generate strong random creds.
2. Run it against prod DB (DIRECT_URL, migrations-style connection).
3. Set repo secrets via `gh secret set`: `SMOKE_CUSTOMER_EMAIL`, `SMOKE_CUSTOMER_PASSWORD`, `SMOKE_SHOP_EMAIL`, `SMOKE_SHOP_PASSWORD`, and variable `SMOKE_INCLUDE_SHOP=1`. If `gh` is unauthenticated, write creds to a `.gitignore`d local file and flag for Cowork to set via API.
4. Run the smoke locally against prod (`DEPLOY_URL=https://alphawolfedecals-app-web.vercel.app`) and confirm it passes end-to-end. This also delivers the outstanding PostHog prod verification (task #69).

### DELIVERABLE 1 — demo screenshot set

10–15 screenshots covering: catalog browse → template detail → editor (upload, place, color, text) → save → submit dialog → order-confirmed → shop queue → order detail → status transition → email template renders (local render is fine given GH-016). Store in `docs/deployment/screenshots/2026-06-09-goal-4/`.

### DELIVERABLE 2 — investor handoff package

`dist/mvp-handoff/`: handoff doc as `.md` + `.docx` + `.pdf` + `.pptx`. Content: what the MVP does, architecture snapshot, security posture (DELIVERABLE 0 results), known gaps + launch blockers (GH-016, deferred v1.1 items), demo screenshot walk-through.

### DELIVERABLE 3 — final verification + Lighthouse re-baseline

Lighthouse against prod `/`, `/vehicles`, `/vehicles/[id]`. Compare to the existing baseline; record deltas. No new Sentry error class on prod during your session.

### DELIVERABLE 4 — ADR-0013 §9 amendment

Amendment ADR listing the LOCKED invariants the MVP build introduced (orders RLS triple, two-connection split surfaces, notification dispatch non-throwing contract — audit for others) AND the review-stack swap: CodeRabbit → Claude review protocol. Port any still-relevant `.coderabbit.yaml` guardrails (path filters, deploy-invariant checks) into CI or the review checklist so they survive the retirement; only then may `.coderabbit.yaml` be removed. Call `advisor()` BEFORE finalizing the list.

## CONSTRAINTS

- You have access to an `advisor` tool backed by Opus 4.8. It takes no parameters — call advisor() and your entire transcript is forwarded automatically. CALL ADVISOR:
  - BEFORE substantive work (orientation reads don't count as substantive).
  - BEFORE writing or editing an RLS policy.
  - BEFORE declaring DONE (after the deliverable is durable on disk).
  - WHEN stuck — recurring errors, results that don't fit.
  - WHEN considering a change of approach mid-PR.
  Set max_tokens: 2048 on the tool definition to keep advice focused. If the advisor and your earlier evidence conflict, do one more reconcile call surfacing the conflict — never silently switch.
- **Review protocol (replaces CodeRabbit; Greptile remains obsolete — never invoke either):** every PR gets, before merge: (1) the repo's `/code-review` plugin command (or `code-reviewer` skill) run against the full diff in a FRESH context — not the context that wrote the code; (2) CI green; (3) for any PR touching RLS, auth, the DB split, or deploy config: an `advisor()` call reviewing the diff — the Goal 3b rule "do NOT rubber-stamp reviews on RLS" now applies to self-review doubly. Record the review output in the PR description.
- NEVER use `withSystem` for user-scoped queries. The two-connection split is a security boundary.
- ADR-0013 invariants are LOCKED. Changes require an amendment ADR (DELIVERABLE 4 is the sanctioned path).
- `PII_ENCRYPTION_KEY` never rotates without a planned re-encryption migration.
- Vercel debugging: sub-2s deploy + empty build logs = preflight reject (region/config), NOT billing. Pull deployment via MCP/API, never trust CLI summary.
- "Missing env var" on Vercel when the var "already exists" = empty value; edit-in-place, then push a fresh commit.
- Stacked PRs after squash-merge: retarget base to main, rebase head branch (auto-detects applied commits), force-push.
- Voice: simple, concise, direct. Archer is not a dev — dumb down explanations of decisions, not the work itself.

## OUTPUT / DEFINITION OF DONE

1. DELIVERABLE 0 both audits PASS (or hotfix PRs merged + re-audit PASS), report saved in repo.
2. Smoke accounts live, secrets set, mvp-flow passes against prod.
3. Screenshot set committed.
4. `dist/mvp-handoff/` contains all 4 formats.
5. Lighthouse deltas recorded; no new Sentry error class.
6. ADR-0013 amendment merged via a PR that followed the review protocol.
7. Closeout ritual: `activities.md` entry at TOP (after confirming #100 merged), mermaid diagram in `docs/vault/diagrams/goal-4-mvp-handoff.md`, PostHog/Sentry screenshots if metrics changed, then `git worktree remove ../alphawolf-goal-4 && git branch -d goal/4-mvp-handoff`.
8. Final message to Archer: 5-line summary — what passed, what's blocked on him (GH-016 at minimum), where the package lives.
