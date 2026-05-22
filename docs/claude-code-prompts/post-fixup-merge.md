# Post-fixup merge orchestration — PR #38 → PR #39 → main

Paste-ready prompt for a **fresh** Claude Code session. Single execution flow: file two small follow-up issues, squash-merge PR #38, rebase PR #39 onto main resolving three known conflicts, squash-merge PR #39. No new feature work; pure orchestration.

---

## Pre-flight (run on your Mac, in the repo root)

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App
find .git -name "*.lock" -print -delete
find .git -name "*.lock"
git checkout main
git pull --ff-only
git status --short
```

Expected: lock sweep prints any stale `.lock` files and deletes them; second `find` prints nothing; `git status` clean; on `main` matching `origin/main`. If `git status` shows anything unexpected, paste it and stop here.

---

## Prompt to paste into a fresh Claude Code session

````
Execute the post-fixup merge orchestration for PR #38 + PR #39. Pure git/gh work — no new feature code, no scope expansion. Single session, one batched commit message at the end of activities.md.

## Resume context — important
You are starting fresh after two prior sessions. Both PR branches are green on CI and ready to merge.

- **PR #38** (`feat/gh-005-008-asset-upload-canvas-editor`) — Step 5 asset upload + canvas editor. Last commit `7079b00` is the review fixup (Toaster mount, OOB cue a11y, keyboard nav, autosave race, MIME sniff, SVG sanitiser, slider a11y). CI green on all 3 required contexts.
- **PR #39** (`feat/observability-posthog-sentry`) — PostHog + Sentry. Last fixup commit `af34b2a` adds the `@alphawolf/observability` PII scrubber + ESLint guard; commit `de336e3` is the activities.md log entry for the 21 review-follow-up issues batch-opened (#40–#60). CI green.
- **Merge order is non-negotiable**: PR #38 merges first. PR #39 was branched off `main` (not Step 5), so it needs to be rebased onto the new `main` (with #38's content) before its second merge. Three files conflict; exact resolutions are spelled out below.
- **Manual task NOT yours**: Archer will capture the `/debug-sentry` → Sentry UI screenshot for PR #39's description before merging #39. Do not attempt to drive a browser to Sentry. Your responsibility ends at "rebased, pushed, CI green, ready to merge"; Archer hits the merge button on #39 after the screenshot lands in the PR description.

## Read first
- /docs/claude-code-prompts/post-fixup-merge.md (this prompt persisted to disk)
- /activities.md (most recent two entries — gives the merge-order context)
- /docs/vault/70-quick-reference.md "Observability" section (the rules PR #39 codifies)
- /packages/observability/src/sentry-scrub.ts (so the two new follow-up issues are accurate)

## Skills and agents to activate

**Skills**:
- `code-reviewer` (sanity-check the rebase result — no half-merged conflict markers, no dropped externals)
- `senior-architect` (verify the merge preserves both PRs' architectural decisions: #38's externals + queue seam, #39's instrument-first ordering + scrubber boundary)
- `systematic-debugging` (if anything goes sideways during the rebase, do not improvise — diagnose, then act)

No frontend/design skills needed; no code changes beyond conflict resolution.

## Scope — execute in order

### Step 1: File two small follow-up issues (#61 and #62)

Use the same `gh issue create` pattern Claude Code used for the 21-issue batch in `de336e3`. Both are small one-line-of-code fixes that came out of the PR #39 fixup review.

```bash
gh issue create \
  --title "Tech-debt: redact only token params in event.request.query_string, not the whole string" \
  --label "tech-debt,observability" \
  --body "**Context:** \`packages/observability/src/sentry-scrub.ts\` lines 73-75 wholesale-replace \`event.request.query_string\` with \`'[redacted]'\` whenever it's present. The companion field \`event.request.url\` uses regex redaction that preserves non-token params (\`?token=[redacted]&foo=bar&utm_source=…\`). Today \`query_string\` loses analytics value (utm params, feature flags, non-sensitive filters) with no security benefit since the URL is already scrubbed.

**Scope:**
- Apply the same \`redactUrl\` regex pass to \`query_string\` instead of wholesale replacement.
- Add a unit test in \`packages/observability/tests/sentry-scrub.test.ts\` asserting \`query_string='token=abc&foo=bar'\` → \`'token=[redacted]&foo=bar'\` (matches the URL redaction behavior).

**Done definition:** unit test passes; \`pnpm turbo run lint typecheck test\` green; no behavior change beyond the one field.

Surfaced by: review of PR #39 fixup (commit \`af34b2a\`)."

gh issue create \
  --title "Tech-debt: tighten @alphawolf/observability peerDependencies to @sentry/core >= 10" \
  --label "tech-debt,observability" \
  --body "**Context:** \`packages/observability/package.json\` declares \`peerDependencies: { '@sentry/core': '>=8' }\` but the scrubber's type imports use v10 event shapes. The generic \`<T extends Event>\` masks this at runtime, but if a future consumer pins v8 the types would mismatch in ways the generic doesn't help.

**Scope:**
- Change the peerDep range from \`>=8\` to \`>=10\`.
- Update the comment block in \`packages/observability/src/sentry-scrub.ts\` if it references v8/v9 compatibility.

**Done definition:** \`pnpm install\` succeeds; no consumer-package regression.

Surfaced by: review of PR #39 fixup."
````

After both `gh issue create` calls succeed, confirm with `gh issue list --label observability --limit 5` — expect at least 4 hits including the two new ones.

### Step 2: Merge PR #38

```bash
# Confirm mergeability before attempting
gh pr view 38 --json mergeable,mergeStateStatus,reviewDecision

# Expected: mergeable=MERGEABLE, mergeStateStatus=CLEAN, reviewDecision can be null/APPROVED/REVIEW_REQUIRED — Archer is the sole reviewer

# Squash-merge with branch delete (the project convention — see PRs #34/#35/#36/#37)
gh pr merge 38 --squash --delete-branch --auto

# Update local main and confirm #38's content landed
git checkout main
git pull --ff-only
git log --oneline -3  # expect a new squash commit at HEAD with title "[GH-005/008] Asset upload pipeline + base canvas editor (#38)"
```

If `gh pr merge` fails because of an unresolved review thread or a stale required check, stop. Do not force-merge. Report the failure with the exact error, and Archer will resolve in GitHub UI.

### Step 3: Rebase PR #39 on the new main and resolve the three known conflicts

```bash
git checkout feat/observability-posthog-sentry
git pull --ff-only
git fetch origin main:main  # update local main pointer
git rebase main
```

Expect three conflicts. Each resolution below is exact — apply mechanically, do not improvise.

#### Conflict A — `apps/web/next.config.ts`

PR #38's version has `serverExternalPackages` listing `@node-rs/argon2`, `svgo`, `sharp`, `canvas`, `bullmq`, `ioredis`, `replicate`, plus a `webpack.externals` regex that catches the same native modules. PR #39's version wraps the export with `withSentryConfig(nextConfig, sentryOpts)`.

**Resolution:**

- Keep PR #38's full `nextConfig` body (every line of `serverExternalPackages` and the `webpack` config block).
- The final line of the file changes from `export default nextConfig;` to `export default withSentryConfig(nextConfig, { … });` using #39's exact `withSentryConfig` call shape (silent, hideSourceMaps, etc.).
- `withSentryConfig` composes the webpack config — it does not replace it. The externals survive.

After resolving, run `pnpm --filter @alphawolf/web build` to prove the bundle still builds (this catches the regression of accidentally dropping #38's externals — if any native module gets bundled by webpack the build fails fast).

#### Conflict B — `services/parse/src/index.ts`

PR #38's version is a full Express server with the parse worker boot (`startWorker()`), BullMQ wiring, queue export, health endpoint reporting `queue: 'bullmq' | 'inline'`. PR #39's version adds `import './instrument'` as the first import, `Sentry.setupExpressErrorHandler(app)` before listen, and a dev-only `/debug-sentry` route.

**Resolution:**

- Keep PR #38's full file.
- Prepend `import './instrument';` as the **very first** import of the file (above the existing imports). The instrument-first pattern requires this — Sentry must initialize before any other module loads.
- Find the existing `if (process.env.NODE_ENV !== 'production') { … }` dev-only block (PR #38 has one for the dev API surface). Add the `/debug-sentry` route inside that block:
  ```ts
  app.get('/debug-sentry', () => {
    throw new Error('Sentry test error (parse)');
  });
  ```
  If there's no existing dev-only block, create one before the `app.listen(...)` call.
- Add `Sentry.setupExpressErrorHandler(app)` immediately before `app.listen(...)`. This must be the last middleware registered.
- Add `import * as Sentry from '@sentry/node';` next to the other imports (after `import './instrument';`).

After resolving, run `pnpm --filter @alphawolf/parse build` (or `pnpm --filter @alphawolf/parse typecheck` if there's no build step).

#### Conflict C — `services/parse/package.json`

PR #38 added `bullmq`, `ioredis`, `replicate`, `sharp`, `file-type`. PR #39 added `@sentry/node`, `@sentry/profiling-node`, `@alphawolf/observability` (workspace dep).

**Resolution:**

- Keep BOTH sets of dependencies. The three-way merge usually handles this cleanly — if a manual merge marker appears, union the two `"dependencies": { … }` blocks.
- Run `pnpm install` (NOT `--frozen-lockfile` yet — the lockfile needs to update).
- After install completes, run `pnpm install --frozen-lockfile` as a sanity check to confirm the resolved lockfile is stable.

### Step 4: Verify the rebase, push, wait for CI

```bash
# After all three conflicts resolved
git status  # should show "rebase in progress, all conflicts fixed"
git rebase --continue

# If rebase prompts for an editor on each commit, accept the message unchanged with :wq or equivalent

# Local verification before push — same gates CI runs
pnpm install --frozen-lockfile
pnpm turbo run lint typecheck test

# Push with --force-with-lease (safe force; refuses if remote moved)
git push --force-with-lease origin feat/observability-posthog-sentry

# Watch CI
gh pr checks 39 --watch
```

Expected: all three required contexts pass (Node — lint + typecheck + test, Python — lint + test (ai), Python — lint + test (paneling)). Supabase Preview skips as before — not a required gate.

If any required check fails, stop and report the exact failure. Do not attempt to fix CI failures by adding new commits unless the failure is clearly caused by the rebase (e.g., a typecheck error from a half-merged file).

### Step 5: Hand back to Archer for the screenshot + #39 merge

Do NOT merge PR #39. Archer's responsibility includes:

1. Capturing the `/debug-sentry` → Sentry UI screenshot (needs a live DSN + browser access to the Sentry dashboard).
2. Posting the screenshot as a collapsed `<details>` block in PR #39's description.
3. Hitting the merge button.

Your final action is a status report: post a comment on PR #39 saying "Rebased on main (commit <sha>), CI green on all required contexts. Ready to merge after Archer adds the /debug-sentry screenshot to the PR description."

```bash
LATEST_SHA=$(git rev-parse HEAD)
gh pr comment 39 --body "Rebased on main (\`$LATEST_SHA\`), CI green on all required contexts. Ready to merge after the \`/debug-sentry\` → Sentry UI screenshot is added to the PR description per the original Done definition."
```

## Done definition for this session

- Two follow-up issues (#61 and #62) opened with the exact bodies above
- PR #38 squash-merged to main; local main fast-forwarded
- PR #39 rebased on main; the three conflicts resolved per the exact instructions above
- `pnpm install --frozen-lockfile` succeeds locally after rebase
- `pnpm turbo run lint typecheck test` green locally
- `pnpm --filter @alphawolf/web build` succeeds (proves the webpack externals + withSentryConfig composition)
- Force-with-lease pushed to `origin/feat/observability-posthog-sentry`
- CI green on PR #39's rebased HEAD (all 3 required contexts)
- Status comment posted on PR #39
- /activities.md updated with one new entry summarizing the merge orchestration (issue numbers filed, rebase SHA, conflict resolutions applied)

## Hard constraints

- **No new code outside the three conflict files.** This session is orchestration, not feature work. The query_string fix from issue #61 is a separate follow-up PR; do not roll it into the rebase.
- **No force-push without `--with-lease`.** A plain `git push --force` could overwrite work pushed by another session. Use `--force-with-lease` only.
- **No `gh pr merge 39`.** Archer holds the merge button on #39 because the Done definition includes the manual screenshot.
- **No re-running the 21 follow-up issues.** Those are already opened (#40–#60). Adding #61 + #62 is the only issue work in this session.
- **No editing the scrubber.** Issues #61 and #62 document the small follow-ups; the actual fixes are out of scope for this session.
- **Lock-file pattern**: if any git command reports "Another git process seems to be running" / "Unable to create '.git/_.lock'", sweep with `find .git -name "_.lock" -print -delete` and retry. Do not improvise.
- **PR #38 must merge before #39 rebases.** If #38's merge fails for any reason, STOP — do not start the #39 rebase. Report the failure and wait for Archer.
- **Never paste real DSNs, real tokens, or real credentials into commit messages, PR comments, or issue bodies.** Use synthetic values (`https://[redacted]@sentry.io/0`, `Bearer test`).

## Commit message for the activities.md update (single new entry at top)

```
## YYYY-MM-DD — Archer + Claude (Post-fixup merge orchestration)

- **Issues opened**: #61 (query_string regex parity) and #62 (peerDependencies tighten to @sentry/core >=10) as observability tech-debt follow-ups from the PR #39 fixup review.
- **PR #38 merged**: squash-merge to main as commit <sha>. Editor/canvas work + the review fixup are now on main.
- **PR #39 rebased**: feat/observability-posthog-sentry rebased onto main (now containing #38's content). Three conflicts resolved:
  - apps/web/next.config.ts: kept #38's serverExternalPackages + webpack externals; wrapped the export with #39's withSentryConfig.
  - services/parse/src/index.ts: kept #38's full worker + Express server; prepended #39's `import './instrument'` as the first import; added Sentry.setupExpressErrorHandler before app.listen; placed /debug-sentry inside the existing dev-only block.
  - services/parse/package.json: unioned dependencies from both PRs; lockfile regenerated; --frozen-lockfile passes.
- **Verified locally**: pnpm install --frozen-lockfile, pnpm turbo run lint typecheck test, pnpm --filter @alphawolf/web build.
- **CI**: green on all 3 required contexts on the rebased HEAD <sha>.
- **Status comment posted to PR #39** announcing rebase + green CI; merge gated on Archer adding the /debug-sentry Sentry-UI screenshot to the PR description.
```

```

---

## Hand-off after this session

1. **Archer**: capture the `/debug-sentry` screenshot, paste into PR #39 description, hit merge.
2. **Next Claude Code session**: Step 6 prompt (Phase 1 demo + staging deploy) — Archer will request when both PRs are on main.
```
