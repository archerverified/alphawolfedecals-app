# Goal 7 — AI Generation (B2C Phase 2) — architecture

Shipped 2026-06-12 across PRs #143 (adapter + bake-off harness), #144 (panel-number rider), #145/#146 (deploy/MIME fixes), #147 (orchestrator), #148/#149 (data layer + money rails), #150 (pipeline runtime), #151 (bake-off verdict), #152/#153 (merge-interaction test fixes), #154 (generation studio UI).

```mermaid
flowchart TB
    subgraph customer["Customer (browser)"]
        REVIEW["Brief wizard Review step<br/>'Generate 3 concepts — uses 1 credit'"]
        STUDIO["Generation studio<br/>gallery · iteration chips · balance header<br/>waitlist sheet · before/after slider"]
    end

    subgraph actions["Server actions (Vercel, ≤60s, withUser RLS)"]
        START["startGenerationRunAction<br/>1 rate limit (30/day) → 2 global spend cap →<br/>3 atomic credits+monthly gate (advisory lock)"]
        ADV["advanceGenerationAction<br/>THE CLIENT POLL DRIVES THE PIPELINE"]
        ITER["startIterationAction (1 credit)"]
        FINAL["startFinalAction (0 credits,<br/>lineage-checked, once per concept)"]
    end

    subgraph pipeline["advanceRun — bounded CAS slices"]
        ORCH["orchestrating: Haiku 4.5 compiles brief snapshot →<br/>3 directions × per-view prompts (zod-validated,<br/>logo NEVER AI-rendered — clear space reserved)"]
        REND["rendering: per job —<br/>claim (pending→submitting) → fal submit →<br/>persist request id → harvest by id (NEVER resubmit)<br/>→ store original + watermarked preview"]
        SETTLE["settle: all terminal → true-up cost → complete<br/>any failure/deadline → fail + REFUND (idempotent)"]
    end

    subgraph data["Postgres (Supabase) — RLS owner-only, FORCE"]
        RUNS[("generation_runs<br/>client_token unique · one active per project+kind ·<br/>final once per concept (excl. failed)")]
        JOBS[("generation_jobs<br/>claim/submit state machine · request id")]
        IMGS[("generation_images<br/>immutable provenance · unique per job")]
        LEDGER[("credit_ledger (append-only)<br/>spend/refund ONLY via SECURITY DEFINER fns:<br/>app_spend_credits · app_refund_credits ·<br/>app_generation_spend_today")]
        SNAP[("brief_snapshots<br/>label 'generation_run' — every run traceable<br/>to the exact brief version")]
    end

    subgraph providers["Providers (keys: Vercel env only, never logged)"]
        FAL["fal.ai hosted queue<br/>draft: nano-banana-edit (bake-off winner —<br/>edits the template's own view render)<br/>iterate: Kontext dev · final: FLUX.2 pro edit"]
        HAIKU["Anthropic Haiku 4.5<br/>structured outputs · 20s timeout"]
        MOCK["MOCK provider (CI/dev default —<br/>fail-closed selection; prod tripwire event)"]
    end

    subgraph rails["Money rails / ops"]
        CAP["daily spend cap (config $5) →<br/>PostHog ai_spend_cap_hit"]
        SWEEP["cron sweeper */15min<br/>(x-vercel-cron / CRON_SECRET)<br/>stale runs → fail + refund"]
        COND["pre-generated conditioning renders<br/>vehicle-templates/views/&lt;vehicle&gt;/&lt;view&gt;.png<br/>(pnpm db:render-views)"]
    end

    subgraph downstream["Downstream (existing pipelines)"]
        EDITOR["Editor: final renders as locked<br/>ImageElements + customer LOGO composited<br/>as its own layer (brand fidelity)"]
        EXPORT["Export pack: chosen concept hero +<br/>AI provenance in PDF metadata"]
    end

    REVIEW --> START --> RUNS
    START --> SNAP
    STUDIO <-->|poll 2.5s| ADV --> ORCH --> REND --> SETTLE
    ORCH --> HAIKU
    REND --> FAL
    REND -.CI/dev.-> MOCK
    REND --> COND
    REND --> JOBS
    SETTLE --> IMGS
    START & ITER & FINAL --> LEDGER
    SETTLE -->|refund| LEDGER
    START --> CAP
    SWEEP --> RUNS
    STUDIO --> ITER & FINAL
    FINAL --> EDITOR --> EXPORT
```

**Locked invariants carried forward:** two-connection DB split (`withSystem` only in the sweeper + global-spend scalar read); credit_ledger append-only with app_user INSERT revoked; grant-only credits (waitlist sheet, NO Stripe); ADR-0013 deploy config untouched; `maxDuration ≤ 60` everywhere (hobby plan rejects deploys above it — learned the hard way).
