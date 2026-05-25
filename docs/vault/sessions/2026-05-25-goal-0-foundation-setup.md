---
type: session-handoff
date: 2026-05-25
session_type: claude-code
related_pr: '#81 (throwaway verification, closed un-merged)'
related_step: 'STEP B — Goal 0 (mvp-execution-playbook.md)'
tags:
  - handoff
  - goal-0
  - foundation
---

# Session handoff — 2026-05-25 (Goal 0 — foundation setup)

> Foundation for the autonomous `/goal` MVP chain. Not product code — the safety
> nets, verification artifacts, and process guardrails that let Goals 1-4 run
> unattended. See `activities.md` (2026-05-25 Goal 0 entry) for the full log.

## What shipped

- **D1 CODEOWNERS** (`23db3b1`) — `.github/CODEOWNERS`, path-scoped to ADR-0013 invariants + auth primitives; dropped the never-enforced root `*` catch-all.
- **D2 Branch protection** — applied to `main`; exact payload at `docs/setup/github-branch-protection.json`. 4 required checks + `strict` + code-owner reviews + count 0 + `enforce_admins: false`.
- **D3 Scaffolding** (`c15507c`) — `docs/vault/{sessions,diagrams}/`, `docs/setup/`, `docs/legal/`, `docs/data/`, `dist/mvp-handoff/`; START-HERE updated.
- **D4 MCP smoke** (`2361927`) — `docs/setup/mcp-smoke-checklist.md`, **10 PASS / 1 FAIL**.
- **D5 Manual steps** — `docs/setup/manual-steps.md`, 8 UI steps with WHY + dependent goal.
- **D6 Closeout** — this note + `docs/vault/diagrams/goal-0-foundation-state.md` (C4-context) + activities entry.

## What's still in flight

- Nothing code-wise. The **decisions** below are Archer's to make; none block Goal 1 (PoC scrape).
- PR #80 branch (`fix/middleware-csrf-vehicles-and-sentry-csp`) was merged to `main` (`82b12d4`) before this session; unrelated local `.claude/` agent-install changes were stashed (`goal-0-presafe`) to keep Goal 0 commits clean.

## Decisions made (link/log)

- **CODEOWNERS path-scoped, not global** — keeps the chain's clean-PR auto-merge working while still drawing Archer onto invariant/auth changes.
- **Left `required_approving_review_count: 0`** — honored the "don't block the solo dev" constraint; the resulting CODEOWNERS _soft_-gate is surfaced for Archer's decision rather than silently flipping to a hard block.

## What the next session needs to know

- **The CODEOWNERS gate is soft** (see PR #81 finding): with count 0 + agent-as-sole-owner, code-owner review does **not** block merge. The real invariant guard is `.coderabbit.yaml` (fires on ADR-0013 changes, verified in PR #78) + the 4 required CI checks. Pick option (a/b/c) in `manual-steps.md` before trusting CODEOWNERS to stop a bad invariant merge.
- **Before STEP C:** Anthropic $50/day cap + Claude Code Auto mode (manual-steps 1-2).
- **Before STEP F (Goal 3a):** Figma MCP is authed as `Tee` (not Archer) — re-auth or share files; Sentry alert + prod CSP fix; PostHog funnel.
- **Before STEP H (Goal 3c):** Resend domain verification (current key is send-only).
- Branch protection re-apply command is in `manual-steps.md` if protection ever gets wiped.

## Bugs surfaced this session

- **CODEOWNERS soft-gate** under count 0 + author-is-owner (process, not code) — documented, decision pending.
- Re-confirmed (from the 2026-05-25 hardening entry, not re-fixed here): prod CSP blocks the regional Sentry ingest host `*.ingest.us.sentry.io`; Resend key is send-only; Figma authed as non-Archer account.

## Files touched

- `.github/CODEOWNERS` (new), root `CODEOWNERS` (removed)
- `docs/setup/{github-branch-protection.json, mcp-smoke-checklist.md, manual-steps.md}` (new)
- `docs/vault/{sessions,diagrams}/`, `docs/legal/`, `docs/data/`, `dist/mvp-handoff/` (scaffold)
- `docs/vault/00-START-HERE.md`, `activities.md` (updated)
- GitHub `main` branch protection (API, no file)

## Cross-references

- Related PR: #81 (throwaway verification, closed un-merged) · #78 (CodeRabbit guardrail proof) · #80 (merged pre-session)
- Related ADR: [[../../adr/0013-deploy-infrastructure-contract]]
- Related diagram: [[goal-0-foundation-state]]
- Next: STEP C — Goal 1 single-vehicle scrape PoC.
