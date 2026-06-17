# Goal 19 - Dependency Triage + Pre-Launch Carryover Riders (clear the 12 Dependabot PRs safely, plus 3 Goal-18 carryovers; a launch gate)

Drafted 2026-06-16 by Cowork orchestration via /prompt-engineer + /superpowers. Executor: **Claude in Claude Code**, autonomous single run (may span sessions; ship per-PR). Recommended effort: **max/xhigh**. Goal: get the dependency tree current and secure WITHOUT breaking the locked deploy invariants. Merge the safe bumps in a batch; handle the four risky majors individually with migration testing + ADR amendments where they touch locked config; merge what's clean, document a plan for anything that can't land this goal. Audit-first, §3 every merge, net-zero (no prod writes - this is code + deps). This goal also folds in three pre-launch carryover riders from Goal 18 (see D5): a Sentry observability truth-up, retiring the empty duplicate Sentry org, and a bounded attempt at the draft-model smooth-gradient fix.

**To run:** fresh `claude` session in `/Users/ashton/Documents/AlphaWolfDecals-App` with `--dangerously-skip-permissions`, then:

```
/goal prompts/21-goal-19-dependency-triage.md
```

If `/goal` expects inline text, paste everything below the `---`.

---

## ROLE

You are Claude in Claude Code executing Goal 19: triage 12 open Dependabot PRs. You separate trivially-safe bumps from breaking majors, you NEVER let a dependency bump silently mutate a locked deploy invariant, you test every major against build + deploy + the DB split + prod smoke before merge, and you leave the tree current, secure, and green - or a documented, prioritized plan for any major too large to land safely in this goal.

## 🔴 HARD STOP - SECRET HANDLING (read first)

Reference env-var NAMES only, never values. **Never `echo`, `print`, `cat`, `env`, or log secret values or `.env.local`.** (Some keys were exposed in Goal 16 and rotated after Goal 17 - never re-expose any key.)

## AUDIT-FIRST (do this before touching anything - CLAUDE.md §1)

The 12 open Dependabot PRs (verified by Cowork 2026-06-16):

**Tier A - safe (dev-only / CI / minor-patch; merge in a batch after CI green + quick review):**
- #112 `@commitlint/config-conventional` 19→21 (dev) · #113 `lint-staged` 15→17 (dev) · #176 `actions/checkout` 4→6 (CI) · #177 `gitleaks/gitleaks-action` 2→3 (CI - **confirm secret-scanning still runs after the bump; it's the §3 secret guard**) · #187 `minor-and-patch` group (9 updates).

**Tier B - major dev tooling (merge individually; can break lint/test config, not runtime):**
- #182 `eslint` 9→10 (flat-config breakage risk) · #184 `@vitest/coverage-v8` 2→4 (**must match the vitest core version - bump together or peer-mismatch**) · #183 `@types/node` 22→25 (may surface new type errors) · #179 `@vercel/analytics` 1→2 (runtime, small; check API).

**Tier C - risky runtime majors (individual, full migration testing, ADR amendments where they touch locked config):**
- #181 **`next` 15.5→16.2** - collides with **ADR-0013** (`outputFileTracingRoot`, hoisted externals svgo, deploy guardrails). Requires an amendment ADR + a Vercel preview deploy + prod-smoke verification before merge.
- #180 **`@prisma/client` 5.22→7.8** (two majors) - collides with **ADR-0013** (Prisma `binaryTargets`, hoisted `@prisma/client` external) + the DB split. Requires an amendment ADR, `prisma generate`/`migrate` against a LOCAL throwaway DB, the `withUser`/`withSystem` split + RLS re-verified, and deploy verification.
- #108 **`resend` 4.8→6.12** (two majors) - email transport; OTP delivery is launch-critical. Verify the send path + `RESEND_FROM_EMAIL` + a real OTP delivery (Resend MCP) before merge.

Confirm this list is still current (`gh pr list --author app/dependabot`) before acting - Dependabot may have opened/closed PRs since.

## ACTIVATE (skills + agents + connectors)

- **Security framing:** `vulnerability-scanner` + `security-best-practices` - rank the bumps by actual vuln exposure (a dependency goal is also a security goal); confirm none introduce a known-bad version.
- **Implementation:** `senior-backend` (Prisma 7, resend 6 - DB + email paths), `senior-architect` (the ADR-0013/0014 amendments for Next 16 + Prisma 7 - these are LOCKED invariants per §2; an amendment ADR is REQUIRED, not optional), `supabase-postgres-best-practices` (Prisma 7 + the DB split), `senior-frontend` (Next 16 app-router/caching breakage).
- **Verify:** the **`test-automator` agent** + `webapp-testing` (regression suite green per merge), `code-reviewer` (§3 every PR), `vercel-deployment-specialist` (deploy + prod-smoke verification on every Tier-C major), **graphify** (PR-impact on the affected subsystem before each major merge - §8).
- **Connectors:** GitHub (the Dependabot PRs), Vercel (preview + prod-smoke per major), Supabase (Prisma migration + RLS re-verify on local DB), Sentry (0-new after each deploy), Resend MCP (OTP delivery for #108).

## DECISION POLICY (unchanged)

Never ask; choose the recommended option, log it (DECISIONS in `activities.md`); surface notable calls in the report. Failing test/review/deploy = fix or hold-with-plan, not silent merge. **Hard stops:** SECRET HANDLING; **ADR-0013/0014 locked invariants - any change needs an amendment ADR** (§2); `withSystem` for user-scoped queries; `PII_ENCRYPTION_KEY` rotation; force-push main; no Stripe. A major that can't be made green within this goal is **held with a documented upgrade plan** - never force-merged red.

## BUDGET

Dependency work is no-fal: minimal Anthropic (review + migration reasoning). The cost there is care, not spend. The ONE exception is rider R2 (draft-model smooth gradient), which carries a small real-fal allowance (~$2 cap) for end-to-end verification; if R2 needs more than that, hold it for its own goal (see R2).

## ENVIRONMENT (net-zero - code + deps only)

Standard worktree off `origin/main`. CI builds each PR. Tier-C majors additionally get: a LOCAL build + the regression suite, a **Vercel preview deploy** (verify the ADR-0013 invariants hold - build logs present, no preflight reject per §6), Prisma majors get `migrate`/`generate` against a **LOCAL throwaway Postgres - NEVER prod** + the DB-split/RLS re-verify, and #108 gets a real OTP delivery check via Resend. **No prod data writes** - net-zero is inherent; confirm Sentry 0-new after any prod deploy.

## SETUP

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App
git fetch origin main
git worktree add -b goal/19-dependency-triage ../alphawolf-goal-19 origin/main
cd ../alphawolf-goal-19
gh pr list --author 'app/dependabot' --state open
```

(Confirm PR #194 (Goal 17) - and Goal 18 if run - are merged to main first, so triage happens on the current tree.)

## CONTEXT (read in order)

1. `CLAUDE.md` (esp. §2 locked invariants, §3 review protocol, §6 deploy gotchas, §8 graphify) + `activities.md` top entries.
2. **ADR-0013 + ADR-0014** (`docs/adr/`) - the LOCKED deploy invariants Next 16 + Prisma 7 will collide with. Read before touching #180/#181.
3. `package.json` / lockfile + the CI workflows (`.github/workflows/`) - the gitleaks workflow (#177 touches it), the Node lint/type/test jobs.
4. The release notes / migration guides for Next 16, Prisma 7, resend 6 (and eslint 10, vitest 4) - `firecrawl`/web for the breaking-change lists.

## TASK - deliverables in order

### D1 - Audit + security rank
Confirm the live Dependabot list; for each PR pull the version delta + breaking-change notes; rank by vuln exposure (`vulnerability-scanner`). Produce the triage table (Tier A/B/C + a one-line risk + plan each) as a DECISION in `activities.md`.

### D2 - Tier A batch
Rebase each onto current main, confirm CI green, quick `code-reviewer` pass, merge. **Special-case #177 (gitleaks):** after merge, confirm the secret-scanning job still executes and passes on a subsequent PR - do not blind-merge the security scanner.

### D3 - Tier B majors (individual)
eslint 10 (fix flat-config breakage), vitest-coverage 4 (**bump vitest core to match - resolve the peer set together**), @types/node 25 (fix surfaced type errors), @vercel/analytics 2 (verify API). Each: suite green + §3 + merge, or hold-with-plan if it cascades.

### D4 - Tier C runtime majors (individual, full gate)
For #181 Next 16, #180 Prisma 7, #108 resend 6 - in priority order, each:
1. graphify PR-impact on the affected subsystem.
2. Apply the migration guide; for Next/Prisma, **write the ADR-0013 (and/or -0014) amendment** documenting the invariant change - this is required by §2.
3. Local build + full regression suite + (Prisma) migrate on local DB + DB-split/RLS re-verify + (resend) real OTP delivery.
4. Vercel **preview** deploy verified (per §6: build logs present, no preflight reject) → §3 review **with the `advisor()` second opinion** (these touch deploy/DB/auth) → merge → prod deploy → **prod smoke + Sentry 0-new**.
5. If any can't be made green within scope, **hold it with a written upgrade plan** (what breaks, the migration steps, the test matrix) and move on - do not force-merge.

### D5 - Carryover riders (Goal 18 handoff)

Three pre-launch items carried from Goal 18, independent of the dependency work. Do them in any order, each with a §3 review. R1 is light and no-fal; R2 needs a small fal budget.

**R1 - Sentry observability truth-up (no fal, launch-gate hygiene).**
- Ground truth (verified by Cowork 2026-06-17): the app reports to `alphawolfdecals / node` (project id 4511425986756608), confirmed via `next.config.ts` (`SENTRY_ORG=alphawolfdecals`, `SENTRY_PROJECT=node`) and live traffic (95 errors over 30 days). A second org `alphawolfdecals-1c / sentry-awd` (project 4511441290461184) is EMPTY and unused.
- Triage the open issues in `node`: group them, assign root cause, fix or deliberately suppress the noise, and establish a clean, documented 0-new baseline the launch gate can actually measure against. Until now "Sentry 0-new" risked being read off the empty duplicate, which is meaningless.
- Retire the empty `sentry-awd` / `alphawolfdecals-1c` org/project (or document why it stays), after confirming nothing reports to it, so no one reads a falsely-clean dashboard again.
- DoD: node issues triaged to a written baseline; the duplicate retired or kept-with-reason; the launch-gate "Sentry 0-new" explicitly points at `alphawolfdecals / node`.

**R2 - Draft-model smooth gradient (generation quality; small fal budget).**
- Carryover from Goal 18: the draft model (nano-banana-edit) renders gradient briefs as accent linework, not a smooth ombre, so the integrated journey export is not yet a true gradient. Direction is already fixed and proven on the EXPORT model via the Goal 18 guide image; this is the draft-stage interpretation gap, not a direction bug.
- Form a theory first (systematic-debugging), then pick per evidence: (a) steer the draft model toward a smooth gradient for gradient briefs (prompt/conditioning), or (b) for pure-gradient briefs, condition the FINAL directly on the directional guide so the smooth fade survives into the export.
- Verify on real fal: one gradient brief renders a smooth black-to-cyan ombre end-to-end (draft through export), the logo still composited (never AI-rendered), four-view coherence intact, direction correct. Net-zero: LOCAL throwaway DB + live storage purged after, exactly like Goal 18.
- SCOPE ESCAPE (honest bound): if this needs more than the ~$2 fal allowance or a structural pipeline change, STOP and hold it as its own goal (Goal 20) with a written plan (the approach, the test matrix, a cost estimate). This rider is the quick-win attempt, not an open-ended generation project.
- DoD: either a proven smooth-gradient export (evidence in `docs/deployment/screenshots/`) OR a documented hold with the Goal-20 plan.

### D6 - Close out
`activities.md` TOP entry + the triage outcome (merged vs held + why) + DECISIONS; mermaid `docs/vault/diagrams/goal-19-dependency-triage.md`; **`graphify update .`**; worktree removed / branch deleted. Report what's now current, what's held + its plan, and whether the dependency launch-gate is cleared.

## CONSTRAINTS
- SECRET-HANDLING hard stop governs everything.
- **No locked-invariant change without an amendment ADR** (ADR-0013/0014, §2). Next 16 + Prisma 7 almost certainly touch them - amend, don't silently mutate.
- Every merge: CI green + §3 review (verdict in the PR body); Tier-C majors get the `advisor()` second opinion + deploy/prod-smoke + Sentry 0-new before they're considered done.
- vitest core + coverage versions move together. The gitleaks scanner must keep working after #177.
- Net-zero (no prod data writes); never force-push main; held majors get a documented plan, never a red merge.

## OUTPUT / DEFINITION OF DONE
1. Triage table committed (Tier A/B/C + risk + plan) as a DECISION.
2. Tier A merged (CI green, reviewed); gitleaks secret-scanning confirmed still running post-#177.
3. Tier B handled individually (merged or held-with-plan); vitest peer set consistent.
4. Tier C: Next 16 / Prisma 7 / resend 6 each either merged (ADR amendment written where invariants changed, advisor-reviewed, deploy + prod-smoke + Sentry 0-new verified) OR held with a written upgrade plan.
5. Full suite + regression green on the resulting main; no locked invariant silently changed; net-zero; no secret values emitted.
6. Closeout incl. graphify refreshed; all merges reviewed + CI-green; worktree/branch cleaned.
7. Carryover riders (D5) resolved: Sentry `node` triaged to a documented 0-new baseline; the empty `sentry-awd` duplicate retired or kept-with-reason; the draft-model smooth gradient either proven on real fal (evidence committed) or held with a written Goal-20 plan.
8. Final report to Archer ≤10 lines: what merged, what's held + its plan + why, any ADR amendments written, the rider outcomes, whether the dependency launch-gate is cleared, and the remaining human gates (legal copy, domain migration, indexing flip).
