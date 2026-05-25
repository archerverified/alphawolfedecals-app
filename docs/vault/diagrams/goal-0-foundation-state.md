---
type: diagram
date: 2026-05-25
diagram_type: c4-context
related_step: 'Goal 0 — foundation setup'
tags:
  - diagram
  - c4
  - goal-0
---

# Goal 0 — foundation state (C4 context)

System-context view of Alpha Wolf Wrap Studio **at the moment the autonomous `/goal`
chain begins**: the operator, the deployed system + repo, every connected service Goal 0
verified, and the build-loop the foundation enables. Solid blue = the system under build;
grey = external platforms. Created at Goal 0 closeout (STEP B).

```mermaid
C4Context
    title Alpha Wolf Wrap Studio — system context at start of the autonomous goal chain (Goal 0)

    Person(archer, "Archer (solo founder)", "Approves CODEOWNERS-gated PRs, runs the daily monitoring check-in, completes the manual-steps UI items")
    Person_Ext(customer, "Customer & Shop users", "Design a wrap / manage orders — capabilities arrive in Goals 3a-3c")

    Enterprise_Boundary(b0, "Alpha Wolf Wrap Studio") {
        System(agent, "Autonomous /goal agent", "Claude Code sessions (one worktree per goal). Builds Goals 1-4 unattended, opens PRs as @archerverified")
        System(web, "Web app (apps/web)", "Next.js 15 + React 19 on Vercel sfo1. LIVE: 11 routes 200. Editor + dashboard ship in Goals 3a/3b")
        SystemDb(repo, "Monorepo (GitHub)", "pnpm + Turborepo. Protected main: 4 required CI checks + CODEOWNERS. ADR-0013 invariants + .coderabbit.yaml guardrails")
        System(services, "Backend services (Render Oregon)", "services/parse (Node) + ai/paneling (FastAPI). /health only at Phase 1")
    }

    System_Ext(github, "GitHub Actions + CodeRabbit", "CI (Node + Python matrix), branch protection, CodeRabbit ADR-0013 guardrail review")
    System_Ext(vercel, "Vercel", "Build + preview/prod deploys, Preview Comments check, deployment protection")
    SystemDb_Ext(supabase, "Supabase Postgres", "App data + RLS (app.current_user_id). pgcrypto in extensions schema")
    SystemDb_Ext(upstash, "Upstash Redis", "BullMQ queues: parse / ai / paneling")
    System_Ext(sentry, "Sentry", "Error monitoring — DSN valid; prod CSP fix pending for regional ingest")
    System_Ext(posthog, "PostHog", "Product analytics — funnel to be built (manual-steps 7)")
    System_Ext(resend, "Resend", "Transactional email (Goal 3c) — key send-only; domain verify pending")
    System_Ext(figma, "Figma", "Design source for Goals 3a/3b — MCP authed as non-Archer account (caveat)")
    System_Ext(scrape, "provehicleoutlines.com", "Vehicle-template source — Goal 1 PoC scrape, license gate at STEP D")

    Rel(archer, agent, "Fires goals, approves invariant PRs, monitors")
    Rel(customer, web, "Will use", "HTTPS")

    Rel(agent, repo, "Commits, opens PRs", "git + gh PAT")
    Rel(agent, scrape, "Scrapes outlines (Goal 1+)", "Control Chrome MCP")
    Rel(repo, github, "Triggers CI + review", "Actions / webhooks")
    Rel(github, vercel, "Deploy on merge/PR", "Git integration")
    Rel(vercel, web, "Hosts", "Fluid Compute")
    Rel(web, supabase, "Reads/writes", "Prisma (connection_limit=1)")
    Rel(web, sentry, "Reports errors", "DSN / ingest")
    Rel(web, posthog, "Emits events", "phc_ token")
    Rel(services, supabase, "Reads/writes", "Prisma")
    Rel(services, upstash, "Consumes jobs", "BullMQ")
    Rel(web, resend, "Sends email (Goal 3c)", "API")
    Rel(agent, figma, "Pulls design tokens (Goal 3a/3b)", "Figma MCP")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

## What this diagram asserts (Goal 0 closeout)

- **Protected path:** `agent → repo → GitHub CI → Vercel → web` is the merge-to-deploy pipeline the foundation guards. The hard gates are the **4 required CI checks** + **CodeRabbit's ADR-0013 guardrails**; CODEOWNERS is a _soft_ gate (see `manual-steps.md`).
- **Verified reachable in Goal 0:** GitHub, Vercel, Supabase, Sentry, PostHog, Resend, Figma (10 PASS / 1 FAIL — Control Chrome is desktop-only). See `mcp-smoke-checklist.md`.
- **Not yet built (arrives later in the chain):** the editor + dashboard surfaces of `web` (Goals 3a/3b), email dispatch via Resend (Goal 3c), and the vehicle catalog fed by the `provehicleoutlines.com` scrape (Goals 1-2, behind the STEP D license gate).
