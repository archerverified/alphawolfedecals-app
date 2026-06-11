# .agents/skills — symlink targets for .claude/skills

Three entries in `.claude/skills/` are git symlinks into this directory: `shadcn`,
`supabase`, `supabase-postgres-best-practices`. As of 2026-06-11 the targets for
shadcn + supabase-postgres-best-practices are committed here so the symlinks
resolve in fresh worktrees (previously this dir was untracked and they dangled).

KNOWN ISSUES:
- `.claude/skills/supabase` symlink is DANGLING — its target was never present on
  disk. Restore from supabase/agent-skills upstream or remove the symlink (owner call).
- `skills-lock.json` (repo root) is DEPRECATED for version tracking: skills are now
  versioned by Archer via direct upgrades (2026-06-11 skillupdates drop), not pulled
  from the GitHub upstream sources the lock records. Its hashes are stale by design;
  kept for historical reference. Do not "fix" skills by re-syncing from upstream.
- Skill versions here may be NEWER than upstream. Treat this directory + .claude/skills
  as the source of truth.
