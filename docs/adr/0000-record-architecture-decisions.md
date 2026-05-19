# ADR-0000: Record architecture decisions using MADR-format ADRs

- **Status**: Accepted
- **Date**: 2026-05-18
- **Deciders**: Archer
- **Related stories**: n/a
- **Supersedes**: n/a

## Context

Alpha Wolf Wrap Studio is a multi-month build with multiple contributors (humans and AI) and a contractually-tight spec (`prd.md`). Decisions made in week 2 will be questioned in week 22. Without a durable record of *why* a choice was made, future contributors waste time re-litigating settled questions or, worse, silently reverse decisions they don't understand.

We need a lightweight, version-controlled, human-readable format for capturing architecturally significant decisions next to the code they describe.

## Decision

We use MADR-format Architecture Decision Records, stored as markdown files in `/docs/adr/`, named `NNNN-kebab-case-title.md`, numbered sequentially starting at 0001 (this meta-ADR is 0000).

Each ADR uses the template at `/docs/adr/template.md`. Every architecturally significant decision — anything that shapes the system's structure, dependencies, interfaces, or operational characteristics — gets one. Tactical decisions (variable naming, single-function refactors) do not.

Every ADR is committed in the PR that introduces the decision it describes. Every ADR creation, status change, or supersession is also recorded as a new entry at the top of `/activities.md`.

## Alternatives considered

- **No formal record**: relies on commit messages and memory. Decisions decay within weeks, especially across contributors. Rejected — the cost of a misunderstood decision in production wrap printing (wasted media, missed deadlines) is too high.
- **Confluence / Notion**: hosted, searchable, but lives outside the repo. Drifts out of sync with the codebase. The ADR for a service should be reachable from the service's directory, not a separate tool that may or may not be checked.
- **Heavyweight RFC process**: full RFC + review + numbering + status workflow. Overkill for a four-person team. We may graduate to this in v2 if team size warrants it.
- **Per-PR design docs**: useful for big features but not searchable as a corpus. Doesn't replace ADRs.

## Consequences

**Positive**
- Future contributors (and Claude Code in future sessions) can reconstruct *why* the architecture looks the way it does.
- Trade-offs are documented at decision time, not reverse-engineered later.
- Ties decisions to PRs and stories, making the audit trail navigable.

**Negative**
- One more file to write per significant decision. Mitigated by keeping the template short and the discipline simple.
- Risk of over-ADR-ing: every micro-decision becoming a doc. Mitigated by the "architecturally significant" filter — if you're unsure, it's probably not significant.

**Follow-ups**
- Add a CI check that fails PRs introducing new top-level packages or services without a corresponding ADR.
- Add ADR creation to the PR template.

## References

- [MADR project](https://adr.github.io/madr/)
- /docs/adr/template.md
