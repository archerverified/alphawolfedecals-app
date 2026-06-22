# Debugging gotchas

Learned the hard way. Read this when a deploy, env var, DB, or migration behaves
unexpectedly. Do not re-derive these.

## Vercel deploys

- Deploy finishes in under 2s with EMPTY build logs = preflight reject (region/config),
  NOT billing. `errorMessage` populated = billing. 30 to 120s with logs = real build
  failure. Always pull the deployment via MCP/API, never trust the CLI summary.
- "Missing env var" while the var "already exists" = empty or stale value. Edit it
  in place, then push a fresh commit.

## Supabase

- Free tier auto-pauses after 7 days idle. Resume via `restore_project`, standing
  permission granted, no need to ask.
- After `apply_migration` via the Supabase MCP, insert the row into `_prisma_migrations`
  with the SHA-256 checksum so `prisma migrate deploy` skips cleanly.

## Git / stacked PRs

- Stacked PRs after a squash-merge: retarget the base to main, rebase the head branch
  (it auto-detects applied commits), force-push the feature branch.
