# Goal 17 — Cross-View Coherence

How the AI wrap is made to read as ONE cohesive design across all four export views
(the fix for Goal-16 carryover B, where the views disagreed on base colour).

## Root cause → fix

Goal-16: each view was an **independent img2img call** (per-view seed, only its own
structure conditioning, no shared visual anchor) → base colour + style diverged.
v3's _text_ coherence directives provably failed on real fal. The lever is the
**conditioning layer** (a shared visual anchor), not the prompt.

```mermaid
flowchart TD
  Brief["Customer brief\nvehicle · colours · style · logo zones"] --> Orch["Haiku orchestrator v4\none restated design signature\n+ directional front→rear gradient contract"]

  Orch -->|"3 directions · per-view prompts"| DraftPhase{{"DRAFT (initial) — per concept"}}
  DraftPhase --> Anchor["ANCHOR view first\n(driver side; structure-only conditioning;\nshared per-concept seed)"]
  Anchor -->|"signed render = colour / gradient / finish donor"| Derived["Derived views (gated on anchor image)\nimageUrls = [own structure, anchor render]\n+ coherence directive · same seed"]
  Derived --> Concepts["3 COHERENT concept galleries"]

  Concepts -->|"customer selects · iterates"| FinalPhase{{"FINAL (export) — chosen concept"}}
  FinalPhase --> Donor["resolveApprovedDonors:\nlatest render per view across the\nfinal → iteration* → draft lineage"]
  Donor --> FinalViews["each view: imageUrls = [own structure, APPROVED-DRAFT render]\n→ reproduces the approved coherent design\n(closes the draft→final drift gap)"]

  FinalViews --> Logo["sharp compositor (Goal 15)\nreal logo on both doors + hood\nNEVER AI-rendered"]
  Logo --> Export["Spec-pack PDF\n4 views = ONE cohesive wrap"]

  subgraph Safety["Preserved invariants"]
    Geo["imageUrls[0] = each view's OWN structure\n→ per-view geometry → editor handoff + logo compositing intact"]
    Money["cost estimate counts 2 inputs for final\n→ daily spend cap stays a true upper bound"]
    CAS["donor URL signed BEFORE claimJob\n+ jobs-only anchor cascade-fail\n→ no stranded/double-submit; idempotent refund"]
  end
```

## Proven (real fal, 3 briefs — battle-tested, not one-shot)

| Brief       | Design                                | Views agree?                                   |
| ----------- | ------------------------------------- | ---------------------------------------------- |
| Locked (X3) | gloss black→cyan gradient             | ✅ one gloss black+cyan gradient on every view |
| Eval B (X3) | solid deep-red + white racing stripes | ✅ same red base + white stripes, both sides   |
| Eval C (X3) | grey→purple gradient                  | ✅ one grey↔purple gradient on every view      |

**Before (Goal 16):** driver = gloss-black + cyan wireframe; passenger = solid cyan — sides disagreed on base colour.
**After (Goal 17):** every brief's four views share one base treatment; the disagreement is gone.

**Documented residual:** the gradient _direction_ (which end is darkest) is model-variable
(correct in grey→purple, reversed in black→cyan) — a refinement, not the coherence fix.
