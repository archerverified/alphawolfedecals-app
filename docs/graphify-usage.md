# graphify usage (project memory at code + doc scale)

A graphify knowledge graph of the codebase plus docs lives at `graphify-out/graph.json`
(gitignored). Use it instead of blind grepping. The always-on rule lives in CLAUDE.md
section 8; this file holds the operational detail.

## When to query

- **Audit-first (CLAUDE.md section 1):** before touching a subsystem, query it.
  `graphify query "how does X work?"` or the MCP tools (`query_graph`, `get_neighbors`,
  `shortest_path`, `god_nodes`, PR-impact). It surfaces dependencies a grep would miss.
- **Risk targeting:** highly-connected "god nodes" are blast-radius-heavy.
  `withUser`/`withSystem` (the section 2 DB-split boundary) and `captureServerEvent`
  (the analytics seam touching ~11 subsystems) are the big ones. Changes there get the
  section 3 second review. Run the PR-impact tools before merge to catch cross-subsystem
  ripples, the class of miss that caused the sharp-0.35 prod outage.
- **Closeout (CLAUDE.md section 5):** after merging code, run `graphify update .` or the
  graph goes stale and answers wrong.

## Availability in worktrees

Goal work runs in a worktree (CLAUDE.md section 4), and the graph file is gitignored so
it is absent there. The graphify MCP must be registered at **user scope** (it serves the
graph's absolute path) to be available in goal sessions:

```
claude mcp add --scope user graphify -- /Users/ashton/.local/bin/graphify-mcp /Users/ashton/Documents/AlphaWolfDecals-App/graphify-out/graph.json
```

If the tools are not present, fall back to the `graphify` CLI or normal file reads,
never block on it.
