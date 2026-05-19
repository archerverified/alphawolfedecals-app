# Phase 1 Readiness Checklist

Run this before pasting the kickoff prompt into Claude Code. Every box should be checked, or you'll get blocked mid-session waiting on access you don't have. Budget 60-90 minutes.

## Accounts & access

- [ ] **GitHub repo** — `archerverified/alphawolfedecals-app` cloned locally, `gh auth status` returns authenticated.
- [ ] **Issues seeded** — ran `./scripts/create-github-issues.sh`; verified 22 issues at https://github.com/archerverified/alphawolfedecals-app/issues with `[GH-001]` through `[GH-022]` titles and the right phase labels.
- [ ] **Branch protection on `main`** — Settings → Branches → require PR before merge, require status checks (CI not green yet, set up post-Phase-1-week-1), require linear history.
- [ ] **Supabase project** created in the closest US region (us-west-1 for Oregon). Free tier is fine for Phase 1. Capture: project URL, anon key, service role key (treat the service role key like a password).
- [ ] **Resend account** created. Sender domain decision made (see Domain section). DNS records prepped to add once domain is locked.
- [ ] **Anthropic API key** generated, billing card on file. (Used by the Python AI service starting Phase 2 — okay to defer to end of Phase 1.)
- [ ] **Vercel project** linked to the GitHub repo. Choose framework auto-detection. Don't deploy yet.
- [ ] **Sentry project** created (free tier covers Phase 1 volume).
- [ ] **PostHog project** created.
- [ ] **Cloudflare account** with the chosen domain (see Domain section). Skip if not on Cloudflare yet — can land in Phase 4.

## Domain

- [ ] Decided on production app domain (recommended: `app.alphawolfwrap.com` since `alpha-wolf-decals.vercel.app` is the marketing surface — separate concerns).
- [ ] Decided on staging domain (recommended: `staging.alphawolfwrap.com`).
- [ ] DNS records prepped for: app domain (CNAME to Vercel), email SPF/DKIM/DMARC (per Resend's setup wizard).

## Secrets management

Don't paste secrets into the kickoff prompt. Add them to your local `.env.local` and to the Vercel + Fly.io project environments. The repo's `.env.example` should list every required var with no values.

- [ ] `DATABASE_URL` (Supabase pooled connection string)
- [ ] `DIRECT_URL` (Supabase direct connection, for migrations)
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `AUTH_SECRET` (generate: `openssl rand -base64 32`)
- [ ] `RESEND_API_KEY`
- [ ] `RESEND_FROM_EMAIL` (e.g., `no-reply@alphawolfwrap.com`)
- [ ] `SENTRY_DSN`
- [ ] `POSTHOG_KEY`
- [ ] `ANTHROPIC_API_KEY` (defer to Phase 2 if needed)

## Repo hygiene before kickoff

- [ ] `prd.md`, `activities.md`, `journey-and-architecture.html`, `docs/`, `scripts/` all committed and pushed to `main`.
- [ ] `.gitignore` covers `.env*`, `node_modules/`, `.next/`, `dist/`, `.turbo/`, `__pycache__/`, `.venv/`.
- [ ] PR template exists at `.github/pull_request_template.md` requiring: linked issue, AC checklist, ADR link if applicable, screenshot/screencap if UI.
- [ ] CODEOWNERS file points all PRs to you at minimum.

## Team & cadence

- [ ] Demo cadence decided. Recommended: every Friday, 30 min, recorded, dropped into `/activities.md`.
- [ ] Daily standup mechanism (Slack thread, Loom, written-only — pick one, stick to it).
- [ ] Decision-rights clear: Archer is the product owner; engineers ship without waiting on Archer for non-PRD-changing calls; PRD changes require Archer sign-off.

## Vehicle DB pre-Phase-1 work

While Phase 1 dev runs, the vehicle template specialist starts building Tier 1 (20 vehicles, see `docs/vehicle-database-spec.md` §4). Goal: 5 vehicles ready by end of Phase 1 week 2 so the demo flow has real templates.

- [ ] Template specialist identified (Mara, contractor, or both).
- [ ] Initial 5 priority vehicles selected from Tier 1 for first wave (recommended: Transit 250 148"WB High Roof, F-150 Crew Cab Std Bed, Silverado 1500 Crew Std, Sprinter 2500 144" High Roof, ProMaster 2500 159" High Roof — that's a fair commercial-fleet cross-section).
- [ ] Tracing workspace set up (Illustrator or Inkscape, with the SVG template skeleton from §3 of the vehicle DB spec).
- [ ] Counsel email sent re: copyright on traced manufacturer technical drawings (vehicle DB spec §8, decision 3).

## Legal & policy (defer-okay, but track)

- [ ] ToS draft started (asset upload IP acknowledgement language per GH-022).
- [ ] Privacy policy draft started (PII handling per PRD §8.2 — name, email, phone, address, optional VIN).
- [ ] DMCA/takedown email alias provisioned (e.g., `legal@alphawolfwrap.com`).

## Final verification before kickoff

- [ ] `gh issue list --repo archerverified/alphawolfedecals-app --limit 30` returns 22 issues.
- [ ] `git log --oneline -1` shows latest PRD/docs commit on `main`.
- [ ] `cat prd.md | wc -l` returns >500 lines (sanity check the file isn't truncated).
- [ ] You can `cd` into the repo, run `gh repo view --web`, and see all the docs rendered correctly on GitHub.

When every box is checked, open Claude Code in the repo and paste the kickoff prompt from `docs/claude-code-kickoff.md`.
