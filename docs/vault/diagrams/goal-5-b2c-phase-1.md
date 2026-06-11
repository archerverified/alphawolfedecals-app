# Goal 5 — B2C Guided Design Flow, Phase 1 (brief wizard + export pack)

Shipped 2026-06-11 across PRs #119, #120, #121, #122, #123, #125, #126, #127, #128, #129, #130 (+ the smoke-promotion PR). Phase 2 (AI generation B2C-007/008, Stripe checkout B2C-013) builds on the seams marked below.

```mermaid
flowchart TD
    subgraph Account["Account (existing + B2C-001/011)"]
        SIGNUP["Sign up + OTP verify"] -->|grant 5 credits, idempotent| LEDGER[("credit_ledger<br/>append-only, RLS owner")]
        SIGNUP --> PLAN["users.plan = free"]
        PLAN -->|"2 vehicle slots, server-side<br/>(plan_gate_hit)"| GATE{{"vehicleSlotGate<br/>createProjectAction"}}
    end

    subgraph Wizard["Design-brief wizard /projects/:id/brief (B2C-002..006)"]
        BRIEF[("design_briefs JSONB<br/>autosave rev + resume step<br/>brief_snapshots versioned")]
        ZONES["Zones — clickable panel SVG<br/>(full wrap default)"] --> BRIEF
        PHOTOS["Your vehicle — photos + notes<br/>(B2C-012 scope)"] --> BRIEF
        LOGO["Logo — upload + quality gate<br/>opaque warning → 1-click rembg<br/>DPI-vs-zone math"] --> BRIEF
        COLORS["Colors — picker · extract-from-logo ·<br/>film SKU library (3M 2080 / Avery SW900)"] --> BRIEF
        STYLE["Style · zone notes · materials · extras · notes"] --> BRIEF
        TINT["Tint — per-window VLT +<br/>state-law verdict (51 jurisdictions)"] --> BRIEF
        REVIEW["Review — edit links<br/>SAVE BRIEF (snapshot vN)<br/>⚡ Phase 2 seam: Generate (1 credit)"] --> BRIEF
    end

    subgraph Upload["Asset pipeline (existing, fixed + extended this goal)"]
        UP["signed-URL direct PUT"] --> PARSE["parse worker (Render, BullMQ)<br/>rasterToPng + opaque detection<br/>rembg (Replicate, fallback-first)"]
        PARSE --> ASSETS[("project_assets<br/>parse_metadata")]
    end
    PHOTOS -.-> UP
    LOGO -.-> UP

    subgraph Export["Wrap Spec Pack (B2C-009/010)"]
        BUILD["buildSpecPack (pdf-lib)<br/>4 pages · QR · film SKUs · tint verdicts ·<br/>photos · blank shop-quote box · NO pricing"]
        BRIEF --> BUILD
        ASSETS --> BUILD
        BUILD --> DL["GET /projects/:id/export<br/>(download)"]
        BUILD --> MAILSELF["Email it to me"]
        BUILD --> MAILSHOP["Send to shop email<br/>(Reply-To = customer, rate-limited 5/15min)"]
        REVIEW --> SUBMIT["Submit to a shop on Alpha Wolf<br/>→ editor's Goal 3a submit flow"]
        SUBMIT --> ORDERS[("orders — existing pipeline")]
    end

    GATE --> Wizard
```

## Prod fixes shipped on the way (the B2C-004 triage)

```mermaid
flowchart LR
    A["Upload button 500<br/>(Goal 4 finding #3)"] -->|"stale legacy SUPABASE_SERVICE_ROLE_KEY<br/>on Vercel after sb_secret rotation"| F1["env fixed + e2e-verified<br/>(Sentry NODE-A resolved)"]
    B["Email retry worker dead<br/>on every Render boot"] -->|"next-auth beta.31 lib/env.js<br/>imports bare next/server (ESM)"| F2["@alphawolf/auth/email subpath<br/>(next-auth-free) — PR #123"]
    C["shadcn dialogs mis-positioned<br/>dev AND prod"] -->|"Tailwind v4 never scanned<br/>packages/ui"| F3["@source in globals.css — PR #125"]
    D["Smoke shop-loop red<br/>after every green run"] -->|one-way fixture consumption| F4["state-tolerant spec + reseed<br/>— PR #123"]
```
