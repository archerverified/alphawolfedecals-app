---
type: adr
adr_number:
status: proposed
date: <% tp.date.now("YYYY-MM-DD") %>
deciders: archer
related_stories:
supersedes:
tags:
  - adr
  - phase-1
---

# ADR-<% tp.system.prompt("ADR number (e.g. 0006)") %>: <% tp.system.prompt("Decision title — write as an assertive statement") %>

## Context

<!--
3-6 sentences. What's the situation? What constraint or opportunity triggered this decision?
Cite the relevant PRD section or open question if applicable. If a reader can't tell
*why* this decision needed to be made from this section, rewrite it.
-->

## Decision

<!--
Write as an assertive present-tense statement, not a future plan.
"We use X for Y" — not "we will explore X".
ADRs document decisions, not investigations.
-->

## Alternatives considered

<!--
List the real forks that were on the table, with one or two sentences each on why they were rejected.
If this section is empty or boilerplate, the decision wasn't a real fork and probably doesn't need an ADR.
-->

- **<Alternative A>**: <why not>
- **<Alternative B>**: <why not>

## Consequences

**Positive**

-

**Negative**

-

**Follow-ups**

<!-- Anything that must be done as a result of this decision: new ticket, doc update, monitoring, ESLint rule, etc. -->

-

## References

- /prd.md §X.Y
- /docs/adr/NNNN-related.md
- [[note-name]]
