---
type: pr-review
pr_number:
status: reviewed
verdict:
reviewer: archer
date: <% tp.date.now("YYYY-MM-DD") %>
tags:
  - pr-review
---

# PR #<% tp.system.prompt("PR number") %>: <% tp.system.prompt("PR title") %>

> Link: https://github.com/archerverified/alphawolfedecals-app/pull/<PR_NUMBER>

## Verdict

- [ ] approve
- [ ] approve with notes (non-blocking)
- [ ] request changes (blocking)
- [ ] reject

## Architecture

<!-- Senior-architect lens: does this fit the overall system shape?
Does it respect ADR-0001/0002/etc patterns? Does it expand scope sensibly? -->

## Code quality

<!-- code-reviewer lens: naming, structure, error handling, type safety,
test coverage on changed surface. Flag anti-patterns, not style nits. -->

## Tests

<!-- Are the right tests there? Mocks at framework boundaries are suspect
(see 00-START-HERE.md learnings). Playwright covers anything that crosses
client/server/db boundaries? -->

## Scope adherence

<!-- Did the PR stay in its lane, or did it absorb scope that should be a
separate PR? Both can be acceptable — note what was added and why. -->

## Follow-ups to log

<!-- What needs to go in activities.md and/or 90-open-questions.md? -->

-

## Decision notes

<!-- Anything that should become an ADR? Add to 10-architecture-decisions.md table. -->

## Merge sequence

```bash
gh pr merge <PR_NUMBER> --squash --delete-branch --repo archerverified/alphawolfedecals-app
git checkout main && git pull
```
