# Goal 15 — Generation & Export Correctness

The core value chain (brief → AI → export) and where each deliverable landed.
The export IS the product: a brief must produce a recognizably-that design, with
the customer's logo ON the vehicle, across multiple views.

```mermaid
flowchart TD
    Brief["Customer brief<br/>(colors, style prose, logo zone)"]

    subgraph ORCH["Orchestrator (Haiku) — brief → concepts"]
        D1["**D1** prompt v1→v2:<br/>derive BASE COLOR<br/>(words > primary > first pick);<br/>never default to white vehicle"]
    end

    Brief --> ORCH
    ORCH -->|per-view prompts| FAL["fal image model<br/>nano-banana-edit (draft)<br/>edits the WHITE view render"]

    FAL -->|3 concepts| STUDIO
    subgraph STUDIO["Generation studio (client)"]
        D5["**D5** bind first rendered<br/>view + skeleton (never blank)"]
        D6["**D6** shadcn Cards, hover;<br/>final concept = cyan ring"]
    end

    STUDIO -->|pick + iterate + final| FINAL["final renders<br/>flux2-pro-edit"]

    FINAL --> FINALIZE
    subgraph FINALIZE["Final handoff → editor canvas"]
        D3["**D3** render fills EVERY<br/>panel of a view<br/>(was: 1 fragment)"]
        D2a["**D2** logo layer on its<br/>zone (default driver door)"]
    end

    FINAL --> EXPORT
    subgraph EXPORT["Spec-pack PDF (the money artifact)"]
        D2b["**D2** sharp composites the<br/>logo ONTO each view render;<br/>spec table Logo = clean 'Yes'"]
        D4["**D4** every view in a grid,<br/>strong hero (driver/front),<br/>never the bare rear"]
    end

    EXPORT --> PDF["Wrap Spec Pack PDF<br/>gloss-black X3 + cyan +<br/>logo on car, 4 views"]

    Brief -.->|logo / photo upload| PARSE["Parse worker (BullMQ)"]
    PARSE --- D8["**D8** verify+pin Redis<br/>noeviction (silent-drop guard);<br/>'still processing' UI"]

    classDef fix fill:#35B6E8,stroke:#0b7,color:#000;
    class D1,D2a,D2b,D3,D4,D5,D6,D8 fix;
```

## Root cause (D1) — proven, not guessed

`systematic-debugging` overturned the prompt's hypothesis ("nano-banana-edit too
conservative"). On real fal the image model is **faithful** — a black-base prompt
renders a black car, a white-base prompt renders a white car. Goal-13 came back
WHITE because the **orchestrator had no base-color contract**: an unroled palette
containing white + a white conditioning vehicle + a "partial wrap / select panels"
framing led Haiku to default to a white base. The fix foregrounds an explicit,
deterministic base color so the customer's intent governs every concept.

## Proof (D9)

`docs/deployment/screenshots/2026-06-16-goal-15/goal-15-export-pack.pdf` — the
before/after vs the Goal-13 white-car export, produced by a vertical slice through
the real code on real fal (net-zero: no DB / live-storage writes).
