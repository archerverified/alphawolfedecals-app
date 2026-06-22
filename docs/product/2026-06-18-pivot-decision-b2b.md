# DECISION - 2026-06-18 - Full pivot to B2B (print-ready engine for shops)

Decider: Archer (relaying the owner), this session. Status: ACCEPTED, direction-setting. This is a product-strategy pivot; `prd.md` and `prd-b2c-guided-design-flow.md` are now superseded in framing and need an amendment (see Follow-ups).

## The decision
Alpha Wolf pivots **fully to B2B**. The consumer-facing "design your own car wrap" path is dropped as the business. The product is a tool **sold to wrap shops and freelance wrap designers on a subscription** (owner floated $200 to $400/month). What they pay for: **AI-generated or customer-supplied wrap design in, print-ready, panel-accurate, vectorized file out**, tailored to the shop's own printer and media.

## Why (from the 2026-06-18 owner call)
- The consumer preview space is crowded (3M and others let you plug in a car and preview a wrap). "No one has anything on commercial wraps and having the AI produce print-ready files."
- The real, paid pain: shops receive AI-designed wraps from customers and must recreate them as print-ready files, today by paying overseas designers. The app removes that step. (Reference: the Pen Designn Studioo post, AI design to vectorized print-ready files, is exactly this service.)

## What carries over (audit-first, do not rebuild)
- The existing design flow (vehicle select, brief, AI generation, editor, the template-based spec pack) becomes the **design-intake front end** that feeds the print engine. It is reusable, not thrown away.
- The BMW X3 template spec pack is validated by the owner as the right shape of output for shops.

## What is now core (was deferred)
1. **Print-ready paneling engine + shop print profile** (was deferred Goal 8 / PRD v2). Now the differentiator. Scoped in `prompts/24-goal-22-print-ready-paneling-engine.md`.
2. **Curvature correction** (2D template -> true print dimensions). The riskiest piece; spike first. Scoped in `prompts/25-spike-curvature-correction.md`.

## Hard constraints captured from the owner
- Printer: Roland VG3, 54-inch nominal, ~52 to 53-inch effective (rollers consume 1 to 2 inches). Use effective width.
- Panel overlap: default 0.5 inch between vinyl panels, configurable per shop; more on tight curves due to vinyl stretch.
- Curvature: 2D templates undercount (F-150 door 52 inches flat, ~60 inches real). Short prints force reprints, "a lot of money out the door." Non-negotiable accuracy requirement.

## Re-sequencing of prior work
- **Goal 21 (photo-render + showcase):** reframed as the B2B design-intake front end (less about consumer wow, more about getting a clean design + the customer's vehicle into the engine). Priority drops behind the print engine.
- **Goal 20 fix-it goal:** still valid for app health, but the strictly B2C-consumer findings (e.g., consumer sign-in-after-verify UX) drop in importance versus the shop-facing flow. Re-triage under the B2B lens before building.
- **PRD:** amend to B2B. Recommend a new `prd-b2b-print-engine.md` as the product definition, with `prd.md` / `prd-b2c-guided-design-flow.md` marked superseded.

## Follow-ups (await Archer)
- Amend the PRD to B2B (draft `prd-b2b-print-engine.md`).
- Commit this decision as an `activities.md` top entry.
- Confirm the subscription model details (price, who the first shop testers are; owner offered to test accuracy live in his shop).
