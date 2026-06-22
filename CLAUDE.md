# ALPHA WOLF WRAP STUDIO: PROJECT RULES

NEVER ASSUME OR TRUST, ALWAYS VERIFY REAL FILES, REAL DEPLOYS, REAL WORK. You have GitHub + connector access: verify, don't guess. Invoke `/superpowers` at the start of every substantive task.

These rules govern all work in this repo (Cowork and Claude Code sessions alike). They override default behavior. Updated 2026-06-21.

## 0. SKILL CHECK FIRST

Before any substantive response, check whether a skill applies and read its current SKILL.md before acting. Process skills (planning, debugging) before implementation skills (format/domain). Never act from memory of a skill, read the current version. A direct request ("just do X") states the goal, not permission to skip the workflow.

## 1. BEFORE EVERY TASK

1. Read the top entries of `activities.md`, this is project memory. Read before starting; append your results after finishing.
2. **AUDIT FIRST.** Check what's already shipped (search by SHA, not goal label) before suggesting or building anything. PR #38 was a 130-file MVP base that pre-delivered an entire goal's scope once.
3. If a step's source is missing or ambiguous, STOP and ask, do not guess or fabricate.
4. **Audit-first uses the graphify knowledge graph** (§8): query the subsystems you're about to touch *before* changing code, it catches connections grep misses.

## 2. SECURITY BOUNDARIES (non-negotiable)

- **Two-connection DB split:** `withUser(userId, fn)` → `app_user` role, RLS enforced, every customer-facing query. `withSystem(fn)` → superuser, RLS off, only unauthenticated bootstrap / system maintenance. NEVER use `withSystem` for user-scoped queries. Watch the silent-fallback footgun: missing `DATABASE_URL_APP` falls back to superuser (`packages/db/src/client.ts`).
- **ADR-0013 deploy invariants are LOCKED** (`outputFileTracingRoot`, hoisted externals svgo + @prisma/client, Prisma binaryTargets, guardrails). Any change requires an amendment ADR.
- **`PII_ENCRYPTION_KEY` never rotates** without a planned migration that re-encrypts every PII column.

## 3. REVIEW PROTOCOL (replaces CodeRabbit as of 2026-06-09)

Every prompt runs under the scoped-subagents plus gate model (§4): subagents may parallelize research and verification, but this gate is mandatory and is never skipped or auto-merged.

CodeRabbit is RETIRED. Greptile is obsolete. Never invoke either. Every PR, before merge:

1. Run the repo's `/code-review` plugin command (or `code-reviewer` skill) against the full diff in a FRESH context, not the context that wrote the code.
2. CI must be green.
3. PRs touching RLS, auth, the DB split, or deploy config additionally get an `advisor()` second opinion (in CC sessions with the advisor tool). Do NOT rubber-stamp reviews on RLS.
4. Record the review output in the PR description.

The per-path review bar lives in `docs/review/review-checklist.md` (apply it during `/code-review`). Secret scanning is in CI (`.github/workflows/gitleaks.yml`). MVP locked invariants are in ADR-0014. (`.coderabbit.yaml` retired in Goal 4.)

## 4. OPERATING RULES

- **Scoped subagents plus the §3 gate is the standing build model for every prompt (decided 2026-06-21).** Use subagents to move faster, but only on narrow, verifiable jobs: parallel research, multi-connector verification (GitHub, Supabase, Sentry, Vercel), and the §3 advisor or second-opinion reviews. Subagents never bypass the §3 review gate, never auto-merge, and never run with `--dangerously-skip-permissions`. No fully autonomous or Loki-style, zero-human-in-the-loop mode in this repo. Every merge passes §3 (fresh `/code-review`, CI green, advisor on RLS/auth/DB-split/deploy/spend) with an explicit human go.
- **NO EM-DASHES, EVER.** Never use the em-dash character in any output: copy, docs, code comments, commit messages, PR text, UI strings. It reads as AI slop and Archer hates it. Use a comma, colon, parentheses, or two sentences instead. Numeric ranges use "to" or a hyphen. Applies to the en-dash used as a dash too.
- `activities.md` is append-only, newest entries at TOP. Never edit prior entries, corrections are new entries referencing the original.
- Never delete files. Never force-push to main.
- New `/goal` prompts go through `/prompt-engineer` (Role/Context/Task/Inputs/Constraints/Output skeleton; audit-first context at top; concrete Definition of Done). Prompts live in `prompts/`.
- Goal work runs in a dedicated worktree (`git worktree add -b goal/<N>-<slug> ../alphawolf-goal-<N> origin/main`). Remove it at closeout.
- Voice: simple, concise, direct, efficient. Archer is not a dev, dumb down explanations of decisions, not the work itself.

## 5. CLOSEOUT RITUAL (every goal end)

1. `activities.md` entry at the TOP, per-PR entries + summary linking the diagram.
2. Mermaid diagram in `docs/vault/diagrams/<goal>.md`.
3. PostHog + Sentry screenshots if metrics changed → `docs/deployment/screenshots/<date>/`.
4. Worktree cleanup: `git worktree remove ../alphawolf-goal-<N> && git branch -d goal/<N>-<slug>`.
5. **Refresh the graphify graph** so project memory doesn't go stale: `graphify update .` (§8).

## 6. DEBUGGING GOTCHAS (learned the hard way, don't re-derive)

When a deploy, env var, DB, or migration misbehaves, read `docs/debugging-gotchas.md` BEFORE re-deriving. It covers Vercel preflight-vs-billing-vs-build signals, stale env vars, Supabase auto-pause + `_prisma_migrations` checksum inserts, and stacked-PR rebases.

## 7. VERIFY BEFORE DELIVERING

A task is done only when: the claimed files/deploys/PRs actually exist and were verified this session; nothing in a read-only area was modified; no file was deleted; every assumption was either stated explicitly or confirmed with Archer. If a check fails, fix it before responding, don't ship and caveat.

## 8. KNOWLEDGE GRAPH, graphify (project memory at code + doc scale)

A graphify knowledge graph of the codebase + docs lives at `graphify-out/graph.json` (gitignored). Use it instead of blind grepping: query a subsystem before touching it (audit-first, §1), and run `graphify update .` after merging (closeout, §5).

Operational detail in `docs/graphify-usage.md`: god-node risk targeting, PR-impact-before-merge, the MCP tool list, and the user-scope MCP registration needed for worktree sessions.

---

_Cowork-workspace folder protocol (ABOUT ME/, TEMPLATES/, PROJECTS/, CLAUDE OUTPUTS/) applies to the `Documents/Claude` workspace, not this repo. Repo deliverables live where the codebase expects them._
