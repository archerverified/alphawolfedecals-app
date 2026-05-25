# Session handoff — Alpha Wolf Wrap Studio post-deploy cycle

**Author:** Claude (cowork session, 2026-05-23 to 2026-05-24)
**For:** Next Claude Code session (Sonnet recommended — orchestration, not deep reasoning)
**Purpose:** Hand off three queued tasks without losing context. Read this top-to-bottom, decide which task to run based on the decision tree, execute it verbatim.

---

## 1. State snapshot (verify before acting)

Verify each of these with a fresh command. **Do not trust this snapshot blindly** — at least 24h may have elapsed; some claims may be stale. Where a verify command is listed, run it and compare.

| Fact | Expected | Verify |
|---|---|---|
| Production URL | `https://alphawolfedecals-app-web.vercel.app` | `curl -sI $URL \| grep HTTP` → 200 |
| Production commit | Latest on `main` | `curl -s $URL/health \| jq -r .commit` |
| Vercel deploy state | READY on latest main | Vercel MCP `get_project` |
| Render services | api/parse/ai all DEPLOYED | Render dashboard |
| Open PRs | PR #76 (cleanup/deploy-infra-followups) may or may not be merged | `gh pr list --state open` |
| Greptile installed? | YES at time of writing; user wants it REMOVED | `gh api /repos/archerverified/alphawolfedecals-app/installations` |
| `.coderabbit.yaml` at repo root? | NO (creating it is Task 3 below) | `ls .coderabbit.yaml` |
| `/docs/planning/` directory? | Does not exist (Task 4 creates it) | `ls docs/planning` |
| `.claude/agents/` | 29 aitmpl agents installed | `ls .claude/agents/ \| wc -l` |
| ADR-0013 | Exists at `docs/adr/0013-deploy-infrastructure-contract.md` | `ls docs/adr/0013*` |

---

## 2. What just happened (context — do not re-do)

- Phase 1 production deploy on Vercel + Render took **19 commits** (`e2459f0..1339c0e`) to land. Three independent failure modes cascaded: workspace TS compilation, NodeNext `.js` extension convention vs webpack, and Vercel nft + pnpm + dynamic-require failures (svgo, then Prisma).
- The fixes are documented in **ADR-0013** (`docs/adr/0013-deploy-infrastructure-contract.md`). **Do not unwind any of those invariants** without amending the ADR.
- A cleanup PR (#76, branch `cleanup/deploy-infra-followups`) removed the redundant `apps/web` prebuild hook, consolidated `render.yaml` chains into root scripts (`pnpm render:install`, `pnpm render:build:*`), and shipped ADR-0013. **Check whether it is merged before doing anything else.**
- Both CodeRabbit and Greptile have been reviewing PRs. **The user decided to drop Greptile** going forward (CodeRabbit covers the same surface). Task 1 below handles removal.

---

## 3. Decision tree — which task to run first

Run **exactly one** task per Claude Code session. Re-read state above first.

```
┌─ Is PR #76 still open?
│  ├─ YES → run TASK 1 (merge PR #76, remove Greptile, verify prod)
│  └─ NO → continue ↓
│
├─ Does `.coderabbit.yaml` exist at repo root?
│  ├─ NO → run TASK 3 (.coderabbit.yaml config)
│  └─ YES → continue ↓
│
├─ Does `/docs/deployment/lighthouse-baseline-*.html` exist (any date)?
│  ├─ NO → run TASK 2 (post-launch hardening)
│  └─ YES → continue ↓
│
└─ Does `/docs/planning/phase-2-scope.md` exist?
   ├─ NO → run TASK 4 (Phase 2 kickoff)
   └─ YES → all queued work done. Report status to user; await further direction.
```

---

## 4. Tasks

Each task is a self-contained prompt. Copy the entire `<task-N>` block and execute it. Each task ends by updating this handoff doc (mark task complete in section 5).

---

### TASK 1 — Merge PR #76, drop Greptile, verify production

<task-1>
<role>
You are a release engineer closing out the deploy-infra cleanup cycle and consolidating the bot review pool on CodeRabbit only.

Activate these aitmpl agents as personas (read each before starting):
- .claude/agents/deployment-engineer.md
- .claude/agents/devops-engineer.md
- .claude/agents/code-reviewer.md
</role>

<context>
- PR #76 (`cleanup/deploy-infra-followups`) is open with 4 commits (3 cleanup + 1 ADR nit fix from CodeRabbit). All CI checks were green at handoff. CodeRabbit left only a minor nit which is already addressed.
- User decided to drop Greptile from the bot review pool. CodeRabbit covers the same surface.
- Production is currently LIVE at the pre-merge commit. Goal: prove the merged commit doesn't regress.
</context>

<task>
Do these in order. Commit/push and confirm each before moving to the next.

1. MERGE PR #76 via gh CLI:
   - Confirm all status checks pass (Vercel Preview, Node lint/typecheck/test, Python lint/test x2).
   - Squash merge with clean summary message.
   - Delete the branch after merge.

2. REMOVE GREPTILE:
   - Uninstall the Greptile GitHub app from the `archerverified/alphawolfedecals-app` repo (use `gh api` or direct the user to https://github.com/settings/installations).
   - If `.greptileignore`, `.greptile.yaml`, or any `greptile-*` file exists at repo root, delete in a separate commit: `chore: remove Greptile config (consolidating on CodeRabbit)`.
   - Push to main directly (chore-only, no PR needed).

3. VERIFY PRODUCTION on merged commit:
   - Use Vercel MCP to confirm post-merge deploy reaches READY.
   - Hit ALL 11 routes and confirm 200:
     /, /health, /signup, /signup-shop, /signin, /vehicles/select,
     /api/vehicles/makes, /api/vehicles/search, /api/vehicles/models,
     /api/vehicles/by-model, /api/vehicles/results
   - Confirm /health returns the merged commit SHA.
   - If ANY route returns non-200, STOP and investigate before continuing — do not silently absorb regressions.

4. UPDATE /activities.md with a single dated entry summarizing the whole deploy resolution arc + this cleanup.
</task>

<output>
Report back in chat:
- Merge SHA
- Production verification result (all 11 routes)
- /activities.md entry link
</output>

<constraints>
- Do NOT modify deploy infrastructure (next.config.ts, render.yaml, package.json deps). Those are locked per ADR-0013.
- Do NOT improvise fixes if production verification fails. Stop and report.
- Do NOT skip the Greptile removal — user explicitly wants it gone.
</constraints>

<verification>
After completing all 4 steps, mark TASK 1 as ✅ in section 5 of this handoff doc and commit that update.
</verification>
</task-1>

---

### TASK 2 — Phase 1 post-launch hardening (smoke + Lighthouse + screenshots)

<task-2>
<role>
You are a release engineer performing post-launch validation. Your job is to verify the production deploy works end-to-end, capture baselines for future perf regressions, and produce demo-ready artifacts. You are NOT here to fix bugs you find — you are here to surface them with enough evidence to triage.

Activate these aitmpl agents as personas (read before starting):
- .claude/agents/test-engineer.md       — Playwright smoke test execution + fail triage
- .claude/agents/performance-engineer.md — Lighthouse baselines + Core Web Vitals interpretation
- .claude/agents/react-performance-optimization.md — Next.js-specific perf patterns

Activate these cowork skills as needed:
- /webapp-testing  — Playwright golden path + screenshot capture
- /vercel-deploy   — confirm prod commit + serve verification
- /cr-code-review  — sanity-check any docs you write before commit
</role>

<context>
- Production URL: https://alphawolfedecals-app-web.vercel.app
- Production commit: fetch via `curl -s https://alphawolfedecals-app-web.vercel.app/health | jq -r .commit`
- All three Render backend services are LIVE (api/parse/ai).
- Vercel deploy stack is locked per ADR-0013; do not modify it for perf wins.
- Existing instructions: /docs/claude-code-prompts/post-launch-hardening.md (read once and follow; this prompt is the wrapper that adds delta + gates).
- ADR-0012 perf acceptance: LCP < 2.5s, no CLS regression vs static placeholder, INP < 200ms on /projects.
</context>

<task>
Execute /docs/claude-code-prompts/post-launch-hardening.md verbatim, with one contract change: skip the "wait for first Vercel deploy" pre-flight section (already deployed and verified). Every other step runs.

Specifically:
1. Playwright smoke test against production URL (deploy-smoke.spec.ts).
2. Lighthouse baseline (JSON + HTML), committed under /docs/deployment/.
3. Demo screenshots per the script's PNG list, committed under /docs/deployment/screenshots/.
4. Update /activities.md with a single dated entry summarizing the run.
5. One bundled commit at the end.
</task>

<output>
Produce this exact report in chat:

<smoke-results>
  - health: PASS|FAIL (response + commit SHA)
  - security headers: PASS|FAIL
  - golden path: PASS|FAIL|SKIPPED (with reason if SKIPPED)
</smoke-results>

<lighthouse>
  - LCP:  <value>s  (target <2.5s)            → MEETS|MISSES
  - CLS:  <value>   (target no regression)     → MEETS|MISSES
  - INP:  <value>ms (target <200ms on /projects) → MEETS|MISSES
  - TBT:  <value>ms
  - FCP:  <value>s
  - TTFB: <value>ms
  - Report path: /docs/deployment/lighthouse-baseline-YYYYMMDD.html
</lighthouse>

<screenshots>
  - <N> captured at /docs/deployment/screenshots/
</screenshots>

<commit>
  - SHA: <commit>
  - Files: <count>
</commit>

<followups>
  - Any LCP/CLS/INP miss → file as Phase 4 follow-up, do NOT block this session
  - Any smoke fail → STOP, do not commit, escalate to user with failing line + screenshot path
</followups>
</output>

<constraints>
- Do NOT improvise fixes for failing smoke tests. Failures may indicate real production bugs; report them, do not patch.
- Do NOT block on Lighthouse misses. ADR-0013 deploy invariants take priority over perf tuning; perf wins are Phase 4.
- Do NOT commit if smoke test fails. Partial commits hide regressions.
- Do NOT modify deploy infrastructure (next.config.ts, render.yaml, package.json deps). Those are locked per ADR-0013.
- Do NOT overwrite existing Lighthouse runs; append by date.
</constraints>

<verification>
Before committing:
1. Run /cr-code-review on any new .md files you create.
2. Confirm Lighthouse report opens cleanly (file size > 0).
3. Confirm each screenshot exists and is > 10KB.
4. Confirm /health on production still returns the expected commit SHA.

After completing, mark TASK 2 as ✅ in section 5 of this handoff doc and commit that update.
</verification>
</task-2>

---

### TASK 3 — `.coderabbit.yaml` config tuned to ADR-0013

<task-3>
<role>
You are a code-review automation architect. Your job is to encode this repo's hard-won architectural invariants as CodeRabbit configuration so future PRs that violate them get auto-flagged before they reach a human reviewer.

Activate these aitmpl agents (read before starting):
- .claude/agents/code-reviewer.md       — primary persona; review priorities + tone
- .claude/agents/security-auditor.md    — for security-sensitive path rules
- .claude/agents/deployment-engineer.md — for deploy-infra guardrails

Activate these cowork skills:
- /cr-code-review — to review the config you write
- /cr-autofix     — to apply any CodeRabbit nits before merge
</role>

<context>
CodeRabbit currently runs on defaults (CHILL profile) and provides general review. The repo just survived a 19-commit deploy-fix cycle whose root causes are documented in ADR-0013. Several of those invariants are load-bearing and silently fragile — a future PR could break the deploy by removing a single config line, and a human reviewer might not catch it.

Goal: turn ADR-0013 into automated guardrails so CodeRabbit catches "wait, that line is load-bearing" cases automatically.

Reference docs (read in this order):
- /docs/adr/0013-deploy-infrastructure-contract.md (source of truth for invariants)
- /docs/adr/0012-production-deployment-architecture.md (Phase 1 topology)
- /prd.md §security/privacy posture
- https://docs.coderabbit.ai/getting-started/configure-coderabbit
- https://docs.coderabbit.ai/guides/review-instructions
- https://docs.coderabbit.ai/reference/configuration
</context>

<task>
Author /.coderabbit.yaml at the repo root and open a PR with it.

Encode AT MINIMUM these path-specific review instructions (`reviews.path_instructions`):

1. `packages/db/prisma/schema.prisma` → Flag any change to `binaryTargets`. Array MUST include all three of `native`, `rhel-openssl-3.0.x`, `debian-openssl-3.0.x` per ADR-0013 Invariant 3c.
2. `apps/web/next.config.ts` → Flag removal of `outputFileTracingRoot`, the webpack `extensionAlias` block, or any `serverExternalPackages` entry without an accompanying ADR update.
3. `apps/web/package.json` → Flag removal of any hoisted transitive external dep (svgo, svgson, @node-rs/argon2, bullmq, ioredis, replicate, @sentry/profiling-node, @prisma/client, sharp) without an ADR-0013 amendment.
4. `render.yaml` → Flag reintroduction of inline multi-line `buildCommand` blocks; require use of root package.json scripts (`pnpm render:install`, `pnpm render:build:*`).
5. `packages/auth/src/csrf*.ts`, `packages/auth/src/password.ts`, `packages/auth/src/otp.ts` → Security-sensitive. Thorough review.
6. `prisma/sql/auth_rls.sql`, `packages/db/src/client.ts` → RLS-sensitive. Thorough review of `withUser` vs `withSystem` boundaries.
7. `apps/web/middleware.ts` → Security-sensitive. Review CSP changes and rate-limit logic.

Also configure:
- `reviews.profile`: CHILL globally
- `reviews.high_level_summary`: true
- `tools.gitleaks` (or equivalent secret scanner): enabled
- `reviews.path_filters` excludes:
  - `!**/pnpm-lock.yaml`
  - `!**/*.lock`
  - `!**/dist/**`
  - `!**/.next/**`
  - `!docs/deployment/lighthouse-baseline-*.html`
  - `!docs/deployment/screenshots/**`
- `chat.auto_reply`: false
- `language`: "en-US"
</task>

<output>
Single PR to main, branch `chore/coderabbit-config`. Commits:
1. `chore(coderabbit): add .coderabbit.yaml encoding ADR-0013 guardrails` — PR body explains each rule with ADR-0013 invariant link. Include `@coderabbitai review` at end of body for self-review.
2. (only if surfaced) `chore(coderabbit): address self-review findings`
</output>

<constraints>
- Do NOT enable noisy settings (chatty replies, walkthrough comments on docs-only PRs).
- Do NOT add vague path_instructions ("review carefully"); every rule must reference a specific ADR invariant or PRD section.
- Do NOT include rules covering files that don't exist in the repo.
- Do NOT merge if CodeRabbit's self-review surfaces an actionable issue; /cr-autofix it first.
- YAML must validate against CodeRabbit's schema.
</constraints>

<verification>
Before opening PR:
1. `python3 -c "import yaml; yaml.safe_load(open('.coderabbit.yaml'))"` must succeed.
2. For every path glob, confirm at least one real file matches: `for glob in <list>; do git ls-files | grep -E "$glob" | head -1; done`
3. Cross-check: every ADR-0013 invariant mentioned in a path_instruction has matching language in `/docs/adr/0013-*.md`.

After opening PR:
1. Wait for CodeRabbit self-review (5-20 min).
2. /cr-autofix actionable findings; defer nits with reasons.
3. Merge when clean.

After merge — prove guardrails fire:
1. Open a TEST PR adding a trivial comment near `binaryTargets` in schema.prisma. Confirm CodeRabbit's review flags it with reference to ADR-0013 Invariant 3c.
2. Close the test PR without merging.
3. Update /activities.md.
4. Mark TASK 3 as ✅ in section 5 of this handoff doc.
</verification>
</task-3>

---

### TASK 4 — Phase 2 kickoff (planning artifacts only, no implementation)

<task-4>
<role>
You are a product engineering lead planning Phase 2 of Alpha Wolf Wrap Studio. Your output is a planning artifact set that an *implementation* session will consume next. You are NOT the implementer.

Activate aitmpl agents in this priority order (read each before forming a view):
1. .claude/agents/product-strategist.md          — primary: which features ship first
2. .claude/agents/fullstack-developer.md         — execution-feasibility lens
3. .claude/agents/nextjs-architecture-expert.md  — App Router patterns for new routes
4. .claude/agents/database-architect.md          — schema changes Phase 2 will need
5. .claude/agents/supabase-schema-architect.md   — RLS implications for new tables
6. .claude/agents/architect-review.md            — final pass: respects ADR-0012/0013?

Activate cowork skills:
- /prompt-engineer — recursively, to polish the Phase 2 step-1 prompt you produce
- /cr-code-review  — to review the planning docs you write before commit
</role>

<context>
Phase 1 is LIVE. Deploy infra is locked per ADR-0013. The next 4-8 weeks should focus on user-facing features from the PRD, not infrastructure.

Inputs you MUST read first (in this order):
- /prd.md
- /docs/adr/0012-production-deployment-architecture.md
- /docs/adr/0013-deploy-infrastructure-contract.md
- /activities.md (last 15 entries)
- /docs/phase-1-readiness-checklist.md
- /docs/vehicle-database-spec.md
- Existing apps/web/app structure: `find apps/web/app -name page.tsx`

User preference: "Getting shit done in the most efficient and effective manner of all time." Prefer 3 small landable PRs over 1 monolithic one.
</context>

<task>
Produce exactly THREE deliverables, in order:

═══════════════════════════════════════════════════════════
DELIVERABLE 1 → /docs/planning/phase-2-scope.md
═══════════════════════════════════════════════════════════
Required sections:

<stories>
  3-5 user stories from PRD ranked for Phase 2. Each: PRD §reference, user-facing outcome (one sentence), PR count estimate (1-5), risk callouts (DB migrations? RLS? new external deps? touches ADR-0013?).
</stories>

<agent-assignments>
  Per story: 1-3 aitmpl agents best suited (reference by filename).
</agent-assignments>

<skill-plugins>
  Per story: which cowork skills plug in where. Natural checkpoints, not exhaustive.
</skill-plugins>

<sequencing>
  Suggested PR order with rationale (what unblocks what, what's safest first, shared schema changes that should land together).
</sequencing>

<out-of-scope>
  Explicit list of PRD items NOT in Phase 2 and why.
</out-of-scope>

═══════════════════════════════════════════════════════════
DELIVERABLE 2 → /docs/claude-code-prompts/phase-2-step-1.md
═══════════════════════════════════════════════════════════
Paste-ready prompt for the FIRST story in your sequencing. Model on /docs/claude-code-prompts/post-launch-hardening.md.

After drafting, invoke /prompt-engineer on YOUR OWN draft and apply refinements. The committed file is the polished version.

Required XML-tagged sections:
<resume-context>, <read-first>, <skills>, <agents>, <scope>, <done>, <out-of-scope>

═══════════════════════════════════════════════════════════
DELIVERABLE 3 → chat output (not a file)
═══════════════════════════════════════════════════════════
List of new aitmpl agents to install via `npx skills add` that would help Phase 2 but aren't in .claude/agents/ already. Reference https://aitmpl.com.
</task>

<output>
Two new files in one commit: `docs(phase-2): scope brief + step-1 prompt (post-prompt-engineer pass)`

Plus chat:
<recommended-agent-installs>
  | Agent | npx command | Helps Phase 2 story | Why |
  |-------|-------------|---------------------|-----|
</recommended-agent-installs>
</output>

<constraints>
- Do NOT begin implementation. Zero code changes outside docs/ this session.
- Do NOT pick stories that require ADR-0013 invariant changes. If a story would, drop it or call out the ADR-amendment PR as prereq.
- Do NOT pad agent-assignments. Padding signals uncertainty.
- Do NOT skip the /prompt-engineer pass on Deliverable 2. Highest-leverage artifact.
- Do NOT include code-reviewer/test-engineer in every story (implicit via cr-code-review + CI).

Quality bar self-check:
- Could a different engineer pick up step-1 in 4 weeks without re-reading this session? If no, prompt isn't done.
- PR sizes honest? "1 PR" for DB + API + UI is almost certainly wrong; split.
</constraints>

<verification>
Before commit:
1. /cr-code-review on both new .md files.
2. Walk through phase-2-step-1.md as if you were the implementer. Where does it under-specify? Address each gap.
3. Cross-check stories ↔ sequencing coverage.

After commit:
1. Push as feature branch + PR (not direct to main).
2. /cr-autofix CodeRabbit findings.
3. Merge clean.
4. Mark TASK 4 as ✅ in section 5 of this handoff doc.
</verification>
</task-4>

---

## 5. Task completion tracker

Update inline as you complete each task. Commit the update with the work.

- [~] TASK 1 — merge PR #76 + remove Greptile + verify prod
      _Done by prior session (2026-05-24): PR #76 merged (`a97676e`), 11/11 prod routes verified, Greptile config/decision logged. **Remaining:** Greptile GitHub App uninstall is a manual org-owner action (no user-token API) — still pending at `https://github.com/organizations/archerverified/settings/installations`._
- [ ] TASK 2 — post-launch hardening (smoke + Lighthouse + screenshots)
- [x] TASK 3 — .coderabbit.yaml config tuned to ADR-0013
      _Done 2026-05-24: PR #77 merged (`0a363f3`); guardrail proven via test PR #78 (closed unmerged); activities logged._
- [ ] TASK 4 — Phase 2 kickoff (planning docs only)

---

## 6. Anti-patterns from the deploy cycle (do not repeat)

These are concrete patterns that wasted commits during the deploy resolution. Avoid them.

- **Don't use `outputFileTracingIncludes` with `../../node_modules/.pnpm/*` paths.** Vercel rejects with "invalid deployment package — files in symlinked directories." Use direct deps in `apps/web/package.json` instead (see ADR-0013 Invariant 3b).
- **Don't trigger Vercel redeploys hoping a config change will magically apply.** Verify the PROJECT SETTINGS first via `mcp__vercel__get_project`. UI overrides take precedence over `vercel.json` and `next.config.ts` for some keys.
- **Don't pipe install scripts to a shell without inspecting them first** (CodeRabbit CLI install is fine; arbitrary scripts are not).
- **Don't pad bot-review trigger comments inside PR descriptions** — they don't execute. Post `@coderabbitai review` as a separate comment.
- **Don't open a PR with base = non-default-branch and expect CodeRabbit auto-review.** It will skip. Use a manual `@coderabbitai review` comment to force it.
- **Don't trust runtime log truncation in the Vercel MCP for full error messages.** Query by keyword (`svgo`, `engine`, etc.) and confirm matches; the truncated portion may be load-bearing.

---

## 7. Token rotation reminder

Two secrets were used during the deploy cycle and remain in chat transcript:
- Vercel personal token (`vcp_...`) — rotate at https://vercel.com/account/settings/tokens
- GitHub PAT (`github_pat_...`) — auto-expires in 7 days from issue date; user may rotate sooner

If you're starting a fresh session and these tokens are still in your env, either rotate or just don't echo them. Use env-var inline, never write to disk.

---

## 8. References

- Production URL: https://alphawolfedecals-app-web.vercel.app
- Repo: https://github.com/archerverified/alphawolfedecals-app
- ADR-0012 (deploy topology): /docs/adr/0012-production-deployment-architecture.md
- ADR-0013 (deploy contract): /docs/adr/0013-deploy-infrastructure-contract.md
- Post-launch hardening source: /docs/claude-code-prompts/post-launch-hardening.md
- aitmpl agents: /Users/ashton/Documents/AlphaWolfDecals-App/.claude/agents/ (29 agents)
