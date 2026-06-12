# Session handoff — Cowork orchestration, Goal 4 cycle (2026-06-09 → 06-10)

**Session:** Fable 5 in Cowork (orchestrator) + Opus 4.8 in Claude Code (executor, `--dangerously-skip-permissions`, 2h31m autonomous run).
**Supersedes:** `alphawolf-decals-app_session-handoff_v1.md` (2026-06-05, Opus 4.7). Read THIS first; the v1 handoff has known-stale sections listed below.

## 1. State at end of session (all independently verified)

| Surface | State |
|---|---|
| main HEAD | `8541602` (#117 merge) |
| Prod | https://alphawolfedecals-app-web.vercel.app — 200, UptimeRobot monitor live (5-min, /vehicles) |
| Goal 4 | **COMPLETE + verified.** PRs #101 (hardening), #116 (RLS recursion fix), #117 (handoff package + docs). Investor package in `dist/mvp-handoff/` (md/docx/pdf/pptx + 12 screenshots) |
| Security | Both audits PASS. Supabase advisor WARNs 4 → 2 (`app_is_admin` EXECUTE exposures fixed in #116; remaining: `users_block_account_type_change` search_path, `pg_trgm` in public — both Low) |
| Smoke | mvp-flow green vs prod (CC local run, DELIVERABLE 0.5). CI smoke was mis-gated (ran vs Render URLs + SSO-walled deployment URLs) — fix in **PR #118** (reviewed, awaiting CI + merge) |
| Smoke accounts | Seeded on prod via real auth path; SMOKE_* secrets + SMOKE_INCLUDE_SHOP set on repo |
| Open PRs | #118 (smoke gating). Branch `tmp/rebase-99` holds unpushed `30e1f02` (code-simplifier agent) — Archer's call |

## 2. Decisions made this cycle (binding)

1. **CodeRabbit RETIRED** (out of credits; Archer approved swap 2026-06-09). Review protocol now: fresh-context `/code-review` (or code-reviewer skill / fresh Opus subagent) + CI green + advisor-style second opinion on RLS/auth/deploy-config PRs; verdict recorded in PR description. Codified in repo `CLAUDE.md` §3. `.coderabbit.yaml` stays until ADR-0014 guardrail migration completes (#117 shipped the amendment).
2. **advisor() substitute in CC sessions without the tool:** fresh-context Opus subagent, clean context (diff + question only), verdict recorded verbatim, reconcile pass on conflict. Worked well across Goal 4 (RLS fix + audits).
3. **PVO license boundary held:** panel seeding for AW templates from PVO-derived outlines explicitly forbidden; panels must be authored in-house/licensed.
4. **B2C product decisions** (see `prd-b2c-guided-design-flow.md` §9): free initial design + free export; purchased credits for post-initial edits; Stripe (credit packs only) ships Phase 2 with the AI build; 2 free vehicle slots; tint/PPF/chrome-delete are free brief inputs; payments digital-goods-only, never materials/quotes.

## 3. Corrections to the v1 handoff (stale — do not act on these in v1)

- `prompts/06-goal-4-handoff.md` did NOT exist; regenerated 2026-06-09, now committed (and Goal 4 is done — historical).
- The 5 audit skills were NOT in `.claude/skills/` as claimed; the two DELIVERABLE-0 skills now live at `prompts/skills/*.SKILL.md` (copy into `.claude/skills/` if slash-command form is wanted).
- The 3a/3b/3c worktrees were never removed (closeout ritual step 4 skipped 3×); cleaned up in Goal 4 SETUP.
- Smoke spec was stale vs shipped editor instrumentation (3c wrote asserts against testids 3a never shipped); rewritten in #116 to drive the shipped flow.
- Render MCP connector + API-key auth: see §5.

## 4. Open items (ranked)

**Archer (human):**
1. **Panel data authoring for the 3 AW catalog templates** (BMW X3, Bass Boat, Crown Coach) — #1 launch blocker. Editor proven on Ford Transit (6 panels); catalog templates have ZERO `vehicle_panels` rows (Goal 2a seeded wrapped SVGs, never panel geometry). Never from PVO. Same data unblocks B2C-003 (zone selector).
2. Artwork upload button errors on prod (flagged by CC; needs a look — possibly quick).
3. GH-016 final step: one real test email send, confirm in Resend dashboard.
4. Upstash env vars on Vercel for edge rate-limiting (runbook in repo from #101).
5. Real Terms/Privacy copy (stubs shipped in #101).
6. Backup restore drill before first real signup.
7. Merge PR #118 when CI greens; decide on `30e1f02`.

**Next goals:**
- **Goal 5 candidate:** B2C guided design flow Phase 1 (`prd-b2c-guided-design-flow.md` — decision-complete, stories B2C-001..013). Run through /prompt-engineer; CC Opus 4.8 + advisor pattern.
- Monetization strategy doc: `docs/product/monetization-hormozi-review.md` (lead-routing + shop SaaS = the revenue engine; B2C credits = lead-magnet gas money).
- Nightly smoke via Managed Agent (v1 handoff §14 idea) — more attractive now that smoke is green + gated correctly.

## 5. Connector + environment state (Cowork)

- **Working:** Vercel, Supabase, GitHub (PAT in session — rotate eventually), Firecrawl, Sentry (OAuth dashboard), PostHog (OAuth dashboard), Render (config-file, API key), UptimeRobot (config-file, read-only API key).
- **Config-file connectors live in `claude_desktop_config.json`** (`~/Library/Application Support/Claude/`). GOTCHAS learned hard: (a) invalid JSON → app silently RESETS the file to defaults, wiping all custom MCP entries — keep `claude_desktop_config.backup.json` current; (b) the dashboard "Add custom connector" UI only supports OAuth servers — Render + UptimeRobot use API-key headers and MUST go in the config file; Sentry + PostHog are OAuth and MUST go through the dashboard; (c) validate JSON before saving (paste to the orchestrator first).
- Supabase standing permission to `restore_project` on auto-pause: still in force.
- Repo `.claude/` dir is write-protected for Cowork sessions — stage skill files via `prompts/` or have Archer/CC place them.

## 6. Memory-file deltas for next session

The v1 memory files (`code-review-stack.md` etc.) live in the OLD session's space and are unreachable from new sessions. Their content is superseded by: repo `CLAUDE.md` (review protocol, gotchas) + this doc. If the `Documents/Claude/Projects/alphawolf-decals-app` folder gets mounted, update its `CLAUDE.md` working agreement #5 (still says "CodeRabbit only") to match repo CLAUDE.md §3.

## Addendum (2026-06-12)
- Goals 5 + 6 COMPLETE and independently verified (B2C Phase 1 wizard/export; Template Studio + AW panel data — launch blocker closed). PR #134 closed the silent email-failure class.
- Env state: RESEND_FROM_EMAIL + UPSTASH_REDIS_REST_URL/TOKEN added to Vercel 2026-06-12 (this commit triggers the activating deploy); RESEND_FROM_EMAIL pending a Render alphawolf-api manual deploy if added after 02:06 UTC.
- Verification finding: Goal 6 e2e left 5 Studio test vehicles in the prod catalog (4 published, 1 draft) — retired via SQL 2026-06-12. RULE FOR FUTURE PROMPTS: prod e2e must never leave published artifacts; cleanup is part of the test.
- Review-trail drift: Goal 6 PRs #137–#139 lack explicit verdicts in PR bodies (#135/#136 have them). Reinforce "verdict text in EVERY PR body incl. data/docs PRs" in future prompts.
- CodeRabbit GitHub app is still installed and posting rate-limited noise comments — Archer to uninstall (protocol retired it 2026-06-09).
- Roadmap: docs/product/roadmap-goals-6-10.md. Next: Goal 7 (AI generation) — needs fal.ai key + spend cap + Anthropic key from Archer.
