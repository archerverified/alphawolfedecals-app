# Spike - Vehicle curvature correction (2D template to true print dimensions)

Drafted 2026-06-18 by Cowork orchestration via /prompt-engineer + /superpowers. This is a SPIKE: a time-boxed investigation that ends in a written recommendation plus prototype evidence, NOT a shipped feature. It de-risks the hardest part of the B2B print engine (see `docs/product/2026-06-18-pivot-decision-b2b.md`). Runs in Claude Code.

## 0. SKILL CHECK FIRST
Invoke `/superpowers`. Read current SKILL.md for any skill used. This is research-first; use `deep-research` / `firecrawl` for source hunting.

## ROLE
You are Claude in Claude Code running a curvature-correction spike. The problem: 2D vehicle templates undercount real vinyl because they ignore body curvature, so panels print short. Your job is to find the most reliable way to turn a make/model/trim into TRUE print dimensions (curvature included), prototype it on known examples, and recommend a path. You produce evidence and a recommendation, not production code.

## CONTEXT (the problem, from the owner call)
- 2D templates do not account for curvature. Example: an F-150 rear door is 52 inches on the flat 2D model but ~60 inches of real vinyl once the door curve is included.
- Printing short is catastrophic: reprint, "a lot of money out the door." The owner has come up ~4 inches short on a large vehicle.
- Idea raised on the call: when a user enters make/model (e.g., 2024 F-150 Platinum), pull true dimensions/curvature from the owner's manual, the manufacturer site, or a maintained source, and auto-correct.
- The owner will test accuracy live in his shop once there is something to test.

## TASK - time-boxed investigation
1. **Source hunt.** Evaluate candidate sources for true (curvature-aware) panel dimensions per make/model/trim: manufacturer specs and owner's manuals, body-panel dimension datasets, paid template providers (does ProVehicleOutlines or a competitor expose 3D or true-surface dimensions?), 3D vehicle model libraries (surface-area extraction), photogrammetry from the customer's uploaded vehicle photos, and an empirical correction-factor model (per body-style curvature multipliers calibrated from real measurements). For each: coverage, accuracy, cost, licensing, and integration effort.
2. **Prototype.** Pick the most promising 1 to 2 approaches and test on 2 to 3 known cases: the F-150 door (52 flat -> ~60 real), the owner's BMW X3, and a Sprinter van. Compare predicted vs the owner's real numbers. Quantify error.
3. **Data model.** Define how corrected dimensions would be stored and consumed by the paneling engine (Goal 22), including a confidence/tolerance field so the engine can warn when a dimension is estimated.
4. **Honest accuracy + risk.** State expected accuracy, where it will fail, and what must be validated by live shop testing before it is promised to paying shops.

## CONSTRAINTS
- Spike only: no production changes, no schema migrations on prod. Net-zero. No em-dashes.
- Recommendation must be evidence-backed (show the prototype numbers), with explicit accuracy caveats. Do not overclaim; short prints cost real money.

## OUTPUT / DEFINITION OF DONE
A written spike report (committed under `docs/product/` or `docs/adr/`) covering: the source evaluation table, the prototype results vs real numbers, a recommended approach with accuracy estimate and effort, the proposed data model, and the list of things that need live shop validation. A go / no-go recommendation for building curvature correction into Goal 22.
