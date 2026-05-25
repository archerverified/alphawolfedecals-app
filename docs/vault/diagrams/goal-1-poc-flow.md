---
type: diagram
date: 2026-05-25
diagram_kind: flowchart
related_step: 'STEP C — Goal 1'
tags:
  - diagram
  - goal-1
  - license-gate
---

# Goal 1 PoC pipeline — scrape → parse → insert → verify (gated at STEP 1)

The intended PoC pipeline is scrape → parse → insert → verify. Goal 1 **halted at the
license gate (STEP 1)**: the Pro Vehicle Outlines EULA is RESTRICTIVE, so STEPs 2–5 were
**not executed**. The diagram shows the gate firing and the downstream steps gated off.

```mermaid
flowchart TD
    Start([Goal 1: 2024 Ford Transit 250 PoC]) --> S1["STEP 1 — License check<br/>read PVO EULA + subscription terms<br/>(public docs, no login, no scrape)"]
    S1 --> Gate{"License grants commercial<br/>redistribution + derivative-works<br/>rights, IP to AlphaWolf?"}

    Gate -->|"NO — RESTRICTIVE<br/>(actual result)"| Stop["⛔ STOP at STEP 1<br/>per goal rule + spec §5.3"]
    Stop --> Doc["docs/legal/template-source-license.md<br/>verdict: RESTRICTIVE"]
    Doc --> Human(["STEP D — human checkpoint (Archer)<br/>pick a sourcing path"])

    Human --> P1["Pivot A — build in-house<br/>(spec §5.1/§5.2, the moat)"]
    Human --> P2["Pivot B — negotiate explicit<br/>commercial license w/ provider"]
    Human --> P3["Pivot C — neutral data<br/>(NHTSA/OEM + in-house tracing)"]

    Gate -.->|"only if YES (did not occur)"| S2

    subgraph GATED ["Gated off — NOT executed this goal"]
        direction TB
        S2["STEP 2 — Scrape outline files →<br/>apps/web/public/vehicle-templates/2024/ford/transit/250/"]
        S3["STEP 3 — apps/web/scripts/parse-vehicle-svg.ts<br/>+ vitest panel tests"]
        S4["STEP 4 — insert db.vehicle (published) + panels<br/>via @alphawolf/db withSystem"]
        S5["STEP 5 — verify /vehicles/:id on local dev"]
        S2 --> S3 --> S4 --> S5
    end

    classDef stop fill:#7f1d1d,stroke:#ef4444,color:#ffffff;
    classDef gated fill:#3a1414,stroke:#b91c1c,color:#fca5a5;
    classDef ok fill:#14532d,stroke:#22c55e,color:#dcfce7;
    class Gate,Stop stop;
    class S2,S3,S4,S5 gated;
    class Doc,P1,P2,P3 ok;
```

**Legend** — red: the gate and the stop. dark-red: steps gated off (never ran). green: what
actually shipped (the license doc) and the pivot options for the human checkpoint.
