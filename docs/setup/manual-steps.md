# Manual steps — things Goal 0 could not automate

These require **Archer** to act in a dashboard/UI. Goal 0 set up everything automatable
(CODEOWNERS, branch protection, vault scaffolding, MCP probes). The items below gate one or
more of Goals 1-4 — **complete the ⛔-marked ones before the goal they block.**

Companion docs: `mcp-smoke-checklist.md` (what's reachable), `github-branch-protection.json`
(the protection payload), `/Users/ashton/Documents/Claude/Projects/alphawolf-decals-app/mvp-execution-playbook.md` (the orchestration).

---

## 1. Anthropic console — daily token cap

- **Do:** Anthropic Console → Billing/Limits → set a **daily spend cap of $50/day** to start (raise once Goal 2's scrape cadence is known).
- **Why:** Goals 2-4 run mostly unattended for days. A runaway loop or parallel worktrees can burn budget fast; the cap is the circuit breaker.
- **Blocks:** every goal (cost safety). Set before STEP C.

## 2. Claude Code — Auto mode

- **Do:** Claude Code → Settings → enable **Auto mode** (per-tool approval off) for the goal sessions.
- **Why:** `/goal` runs unattended; per-tool prompts would stall it on the first Bash/MCP call.
- **Blocks:** unattended operation of every goal. Set before STEP C.

## 3. Fresh Claude Code session per goal

- **Do:** Start **a new Claude Code session for each goal** (don't reuse this one).
- **Why:** Keeps context windows clean and goal Stop-hooks independent; a stale session carries another goal's condition + memory pressure.
- **Blocks:** none hard, but degrades reliability. Habit for STEP C onward.

## 4. One git worktree per goal

- **Do:** `git worktree add ../alphawolf-goal-N goal/N-topic` and open Claude Code in that worktree. (Goal 0 stayed on `main` by design; Goals 1+ get their own worktree.)
  - Goal 1: `git worktree add ../alphawolf-goal-1 goal/1-single-vehicle-poc`
  - Goal 2: `git worktree add ../alphawolf-goal-2 goal/2-catalog-ingest`
  - Goal 3a/3b/3c, Goal 4: same pattern.
- **Why:** Lets goals run in parallel without branch collisions and keeps `main` clean for CI/preview deploys.
- **Blocks:** parallel execution (STEP G can parallel 3b/3c). Use from STEP C.

## 5. ⛔ Resend domain verification

- **Do:** Resend dashboard → verify `alphawolfwrap.com` → set SPF/DKIM/DMARC → switch `RESEND_FROM_EMAIL` to `no-reply@alphawolfwrap.com`. Also note: the current `RESEND_API_KEY` is **send-only** (smoke probe returned `restricted_api_key`); that's fine for sending, but domain management needs the dashboard (or a full-access key).
- **Why:** Goal 3c sends 4 transactional emails (order submit + 3 status transitions). Phase 1 used `onboarding@resend.dev` (only delivers to `archer@1stimpression.co`). Production order notifications to real customers/shops need a verified domain. Tracked as **GH-016**.
- **Blocks:** **Goal 3c (STEP H)** — it fails at email send without this. Do before STEP H.

## 6. ⛔ Sentry alert rules

- **Do:** Sentry → Alerts → create a rule: **P0/unhandled errors notify `archer@1stimpression.co` immediately**.
  - **Also fix the prod CSP** so Sentry actually receives events: `connect-src` must allow the regional ingest host `o4511425978630144.ingest.us.sentry.io` (the wildcard `*.ingest.sentry.io` does **not** match `.ingest.us.sentry.io`). Logged in `activities.md` (2026-05-25).
- **Why:** During the unattended chain, a goal can ship a broken deploy. Sentry P0 alerts are the early-warning that a real production bug landed (vs a goal-session hiccup). Without the CSP fix, client errors never reach Sentry and the alert rule sees nothing.
- **Blocks:** safe unattended operation of Goals 3a-4 (the daily monitoring loop relies on it). Do before STEP F.

## 7. PostHog funnel dashboard

- **Do:** PostHog → new funnel: `landing → signup → editor_opened → design_saved → submit_clicked → order_completed`.
- **Why:** Goal 3a instruments 4 editor events; Goal 4 verifies them. The funnel is how you confirm the customer flow actually fires end-to-end on prod. (env var is `POSTHOG_KEY`, `phc_…`.)
- **Blocks:** Goal 3a verification + Goal 4 handoff metrics. Optional but do before STEP F.

## 8. Figma file URLs (+ account caveat)

- **Do:** Paste any Figma file URLs for canvas/dashboard designs into **`/docs/setup/figma-files.md`**. **Caveat:** the Figma MCP currently authenticates as `Tee` (`saiphyowaiyan_1@cmu.ac.th`), **not Archer** — Alpha Wolf design files must be shared with that account, or re-auth the Figma MCP to Archer's account, or Goal 3a/3b can't pull them.
- **Why:** Goal 3a/3b pull design tokens + screens via the Figma MCP before writing JSX. No URLs (or an account that can't see them) → the canvas is designed in code and takes ~50% longer.
- **Blocks:** soft — only the Figma-driven design path of **Goal 3a/3b (STEP F/G)**. Do before STEP F if you have designs.

---

## Branch protection — important finding (act before relying on the CODEOWNERS gate)

The branch protection from Deliverable 2 is applied and **does** hard-block on the 4 required
status checks (`Node — lint + typecheck + test`, `Python — lint + test (ai)`,
`Python — lint + test (paneling)`, `Vercel Preview Comments`) with `strict: true`.

**But the CODEOWNERS code-owner review is a _soft_ gate under the current config**, for two
reasons discovered during the throwaway-PR verification (PR #81):

1. `required_approving_review_count: 0` — GitHub only **enforces** code-owner approval when the
   count is **≥ 1**. With 0, CODEOWNERS only _auto-requests_ the owner as reviewer; it does not
   block merge. (PR #81 went `BLOCKED` → `UNSTABLE`/mergeable as soon as the required checks
   passed — no review was required.)
2. The autonomous agent commits as **`@archerverified`, who is the _sole_ code owner** — GitHub
   never requests/requires a PR author to review their own PR, so even the soft request is a no-op
   for agent-authored PRs.

**What actually protects the ADR-0013 invariants today:** the `.coderabbit.yaml` guardrails
(verified firing in PR #78) + the 4 required CI checks. CODEOWNERS is currently
documentation + (human-authored PRs only) review-request.

**Decide one (none done by Goal 0 — all change the agreed constraints, so they're yours):**

- **(a) Accept the soft gate** — rely on CodeRabbit guardrails + CI as the automated enforcement, and eyeball invariant PRs in the daily check-in. _(current state; lowest friction, matches the "don't block the solo dev" constraint)_
- **(b) Add `CodeRabbit` as a required status check** — makes the ADR-0013 guardrail review a hard merge gate without requiring a human approval. The Goal 0 spec's own reasoning says "rely on CodeRabbit-as-check," so this is the closest hard-gate to the intent. Risk: a CodeRabbit outage would block merges.
- **(c) Set `required_approving_review_count: 1`** — real code-owner hard-block, but then **every** PR needs an approval and you (solo) can't approve your own, so you'd admin-merge each one (`enforce_admins: false` allows it). Heaviest friction; breaks clean auto-merge.

### Re-apply the protection (if it ever gets wiped)

```bash
gh api --method PUT -H "Accept: application/vnd.github+json" \
  repos/archerverified/alphawolfedecals-app/branches/main/protection \
  --input docs/setup/github-branch-protection.json
```
