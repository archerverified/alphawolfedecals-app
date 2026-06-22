# Owner call - 2026-06-18 - project direction (synthesis)

Source: ~8 min call with the Alpha Wolf owner, relayed + recorded by Archer. Auto-transcribed (words-only, CPU Whisper; full transcript in `docs/product/calls/2026-06-18-owner-call-transcript.md`). This is the actionable synthesis. Owner verbatim where it matters.

## Headline: the model is shifting from B2C to B2B (sell to shops)

The team's working assumption was B2C: a consumer downloads the app, customizes a wrap on their car, and exports a file to take to a shop. The owner pushed back. His words: that is "not a bad idea, but a lot of companies already have that" (he cites 3M's tool where you plug in your car and preview it). "No one has anything on commercial wraps and having the AI produce print-ready files."

His actual vision: **sell the tool to other wrap shops and freelance wrap designers on a subscription** (he floated "$200 to $400 a month"). The wedge is a real, expensive pain: customers already bring shops AI-generated wrap designs (from ChatGPT and the like), and shops have to **recreate them as print-ready files**, today by paying overseas designers who "are not cheap." He sees people on Facebook constantly asking "who can recreate this for me." (The Pen Designn Studioo post Archer shared is exactly that service: AI-generated design to vectorized, print-ready files.) The app removes the designer step.

So the money is not the consumer design toy. It is: **AI-generated wrap design -> print-ready, panel-accurate, vectorized files, sold to shops.**

## What this validates and what it changes

- **Validates** the template-based spec pack (the BMW X3 report from Goal 7/20). The owner liked it: "it shows the vehicle template outlines, gave all the dimensions and details needed for a print." Asked if that report is ideal to hand a shop, he said yes, "if the template is accurate... we don't have to wait for the vehicle to get there. If we have a list, this side is 120 inches long and 72 tall, we drop in the drawing and hit print."
- **Changes the roadmap priority.** The print-ready paneling engine (was deferred to v2, old Goal 8) is now the core product, not a v2 nicety. The consumer-facing design flow becomes the front-end to a B2B print-output engine.

## The hard problem the owner flagged: 2D templates ignore curvature

This is the make-or-break technical issue, in his words. The vehicle templates are 2D, so they do not account for body curvature. Example: an F-150 rear door measures 52 inches on the flat 2D model, but because the door curves it is "almost 60 inches" of real vinyl. Printing short is "devastating": he has come up ~4 inches short on a large vehicle, which forced a reprint, "a lot of money out the door."

Direction discussed: when a user enters make/model (e.g., 2024 F-150 Platinum), the app should pull real dimensional/curvature data (owner's manual, manufacturer site, or a maintained list) and auto-account for the curvature, not just trust the flat 2D number. The owner wants to test accuracy live in the shop once there is something to test.

## New requirement: a shop print profile

The output must be tailored to the printing shop's setup. The shop (designer/owner) plugs in:
- **Printer / media width.** His printer: **Roland VG3, 54-inch.** Real printable width is ~52 to 53 inches because the rollers eat 1 to 2 inches of media. The app must use the effective width, not the nominal 54.
- **Overlap between vinyl panels.** A full wrap cannot print in one piece; it is tiled into panels. His shop's standard is a **0.5-inch overlap**; some shops use 1 inch; on tight curves they sometimes use more because the vinyl stretches. Make it configurable per shop.
- **Plan / media type.** Plug in what they run, and the program panels and lays out the file to fit.

In other words: the engine takes the approved design + the vehicle's true (curvature-corrected) dimensions + the shop's profile, and outputs a paneled, print-ready file the shop can "drop in and hit print."

## Feasibility

Owner: "to me it sounds doable, but I am not the programmer."

## Recommended impact on the plan

1. **Treat this as a PRD-level pivot** (B2C-first -> B2B shop-subscription), not just a feature. The current `prd.md` and `prd-b2c-guided-design-flow.md` are B2C-framed and should be amended once the direction is confirmed.
2. **Promote the print-ready engine to a near-term goal** (the old deferred Goal 8), covering: panel tiling to effective media width, configurable overlap, the shop print profile, and vectorized/print-ready export. This is now the differentiator.
3. **Add the curvature-correction problem as its own track** (make/model -> true dimensions). This is the riskiest piece and deserves a focused spike before it is promised.
4. **Goal 21 (photo-render + showcase) stays** as the design front-end, but its priority sits behind the print-ready engine for the B2B model. The photo wow sells; the print-ready file is what shops pay a subscription for.
5. **Business model note for later:** shop subscription ~$200 to $400/month, sold to shops and freelance designers.

## Open decisions for Archer (see chat)
- Confirm the B2C -> B2B pivot, and whether B2C stays as a secondary front door or is dropped.
- Whether to amend the PRD now.
- Sequencing: print-ready engine + curvature spike before, after, or instead of the Goal 20 fix-it goal and Goal 21.
