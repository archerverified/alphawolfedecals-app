# ALPHA WOLF WRAP STUDIO: PROJECT RULES

NEVER ASSUME OR TRUST, ALWAYS VERIFY REAL FILES, REAL DEPLOYS, REAL WORK. You have GitHub + connector access: verify, don't guess. Invoke `/superpowers` at the start of every substantive task.

These rules govern all work in this repo (Cowork and Claude Code sessions alike). They override default behavior. Updated 2026-06-09.

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

CodeRabbit is RETIRED. Greptile is obsolete. Never invoke either. Every PR, before merge:

1. Run the repo's `/code-review` plugin command (or `code-reviewer` skill) against the full diff in a FRESH context, not the context that wrote the code.
2. CI must be green.
3. PRs touching RLS, auth, the DB split, or deploy config additionally get an `advisor()` second opinion (in CC sessions with the advisor tool). Do NOT rubber-stamp reviews on RLS.
4. Record the review output in the PR description.
   `.coderabbit.yaml` is RETIRED (removed in Goal 4). Its guardrails are ported: the semantic per-path review bar lives in `docs/review/review-checklist.md` (apply it during `/code-review`), and secret scanning moved to CI (`.github/workflows/gitleaks.yml`). The MVP's locked invariants are recorded in ADR-0014.

## 4. OPERATING RULES

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

- Vercel deploy <2s with EMPTY build logs = preflight reject (region/config), NOT billing. `errorMessage` populated = billing. 30–120s with logs = real build failure. Always pull deployment via MCP/API, never trust CLI summary.
- Vercel "missing env var" while the var "already exists" = empty/stale value. Edit-in-place, then push a fresh commit.
- Supabase free tier auto-pauses after 7 days idle. Resume via `restore_project`, standing permission granted, no need to ask.
- After `apply_migration` via Supabase MCP, insert the row into `_prisma_migrations` with the SHA-256 checksum so `prisma migrate deploy` skips cleanly.
- Stacked PRs after squash-merge: retarget base to main, rebase head branch (auto-detects applied commits), force-push the feature branch.

## 7. VERIFY BEFORE DELIVERING

A task is done only when: the claimed files/deploys/PRs actually exist and were verified this session; nothing in a read-only area was modified; no file was deleted; every assumption was either stated explicitly or confirmed with Archer. If a check fails, fix it before responding, don't ship and caveat.

## 8. KNOWLEDGE GRAPH, graphify (project memory at code + doc scale)

A graphify knowledge graph of the codebase + docs lives at `graphify-out/graph.json` (gitignored). Use it instead of blind grepping.

- **Audit-first (§1):** before touching a subsystem, query it, `graphify query "how does X work?"` or the MCP tools (`query_graph`, `get_neighbors`, `shortest_path`, `god_nodes`, PR-impact). It surfaces dependencies a grep would miss.
- **Risk targeting:** highly-connected "god nodes" are blast-radius-heavy, `withUser`/`withSystem` (the §2 DB-split boundary) and `captureServerEvent` (the analytics seam touching ~11 subsystems). Changes there get the §3 second review. Run the **PR-impact tools before merge** to catch cross-subsystem ripples, the class of miss that caused the sharp-0.35 prod outage.
- **Closeout (§5):** after merging code, run `graphify update .` or the graph goes stale and answers wrong.
- **Availability in worktrees:** goal work runs in a worktree (§4), and the graph file is gitignored so it is absent there. The graphify MCP must be registered at **user scope** (it serves the graph's absolute path) to be available in goal sessions:
  `claude mcp add --scope user graphify -- /Users/ashton/.local/bin/graphify-mcp /Users/ashton/Documents/AlphaWolfDecals-App/graphify-out/graph.json`
  If the tools aren't present, fall back to the `graphify` CLI or normal file reads, never block on it.

---

_Cowork-workspace folder protocol (ABOUT ME/, TEMPLATES/, PROJECTS/, CLAUDE OUTPUTS/) applies to the `Documents/Claude` workspace, not this repo. Repo deliverables live where the codebase expects them._
