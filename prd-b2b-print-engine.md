# PRD: Alpha Wolf Print Engine (B2B)

## 1. Product overview

### 1.1 Document title and version
- PRD: Alpha Wolf Print Engine (B2B)
- Version: 1.0
- Last updated: 2026-06-22
- Author: Cowork orchestration session, from the 2026-06-18 owner call and pivot decision
- Status: ACTIVE product definition. Supersedes prd.md (v1.1) and prd-b2c-guided-design-flow.md (v1.2), which are retained for history.

### 1.2 Product summary
Alpha Wolf is a subscription tool for wrap shops and freelance wrap designers. A design comes in, AI-generated or customer-supplied, and a print-ready, panel-accurate, vectorized file comes out, sized and paneled for that shop's own printer and media. It removes the step shops pay overseas designers for today: turning an approved wrap concept into a production file that prints correctly the first time.

## 2. Problem and opportunity
From the 2026-06-18 owner call:
- The consumer wrap-preview space is crowded (3M and others let a customer preview a wrap on their car). No one produces print-ready commercial-wrap files from AI design.
- The real, paid pain sits with shops: customers bring AI-designed wraps, and the shop must recreate them as print-ready, paneled, vectorized files, today by paying outside designers. Reference pattern: the Pen Designn Studioo workflow (AI design to vectorized print-ready files).
- A short print is catastrophic: it forces a reprint, "a lot of money out the door." Accuracy is the product.

## 3. Target users
- Primary: independent and small wrap shops that run their own printer (for example a Roland VG3) and want to skip outsourced file prep.
- Secondary: freelance wrap designers who produce print-ready files for multiple shops.
- Not the customer anymore: the end vehicle owner. The consumer flow survives only as an intake surface, not as the business.

## 4. What they pay for (value proposition)
An approved design plus the shop's printer profile plus the vehicle's true (curvature-corrected) dimensions, turned into:
- Panels tiled to the shop's effective media width, with the configured overlap and bleed, seams placed at body breaks where possible.
- A print-ready or vectorized export per panel, plus a panel-layout sheet and total linear feet.
- A file that never prints short.

## 5. Scope

### 5.1 In scope (v1)
- The design-intake front end (reused B2C flow): vehicle select, brief, AI generation, editor, the template-based spec pack. It feeds the engine; it is not rebuilt.
- A per-account shop print profile (printer, effective media width, default overlap, media/plan type).
- Curvature-corrected true panel dimensions per make/model/trim, with a confidence/tolerance field (pending the spike outcome).
- The paneling/tiling engine (effective width, overlap, bleed, seam placement, per-panel dimensions, linear feet, layout sheet).
- The print-ready/vectorized per-panel export, packaged for the shop.

### 5.2 Out of scope (v1)
- Running the physical printer or RIP for the shop.
- A consumer marketplace or consumer-billed flow.
- Automated curvature for every make/model on day one (the spike defines coverage and confidence; gaps are flagged as estimates, not silently shipped).

## 6. Product surface (requirements)

### 6.1 Design-intake front end
The existing flow becomes the way a clean design plus the customer's vehicle enters the engine. Goal 21 (photo-render plus multi-view showcase) is reframed here as intake polish, lower priority than the engine.

### 6.2 Shop print profile
Per-account, RLS-scoped: printer model and nominal media width, effective printable width (auto-derived for known printers like the Roland VG3, or manual override), default panel overlap (0.5 inch, editable, with a per-curve override), media/plan type.

### 6.3 Curvature-corrected dimensions
The engine consumes true, curvature-aware dimensions, not flat 2D template numbers, so nothing prints short. Sourcing and accuracy are de-risked by the spike (prompts/25) before the engine relies on them. Each dimension carries a confidence/tolerance so the engine can warn when a value is estimated.

### 6.4 Paneling and tiling engine
Input: approved design plus true panel dimensions plus the shop profile. Output: each wrap panel tiled to the effective media width with the configured overlap and bleed, seams aligned to body breaks where feasible, plus per-panel dimensions, total linear feet, and a panel-layout sheet. Hard rule: never emit a layout that prints short or mis-paneled.

### 6.5 Print-ready export
Per-panel print-ready files (vector where the design allows, else high-DPI raster at print resolution) plus the layout sheet, packaged for the shop, validated (pdf-expert).

## 7. Hard constraints (owner-supplied)
- Printer: Roland VG3, 54-inch nominal, about 52 to 53-inch effective (rollers consume 1 to 2 inches). Always panel to the effective width.
- Overlap: default 0.5 inch between vinyl panels, configurable per shop; allow more on tight curves (vinyl stretch).
- Curvature: 2D templates undercount real vinyl (an F-150 rear door is 52 inches flat, about 60 inches real). The owner has come up about 4 inches short on a large vehicle.

## 8. Business model (open)
- Subscription to shops and freelance designers; the owner floated $200 to $400/month. Final pricing, tiers, and trial terms are open (section 12).
- The owner offered to test accuracy live in his shop once there is something to test, which is the primary v1 validation channel.

## 9. Success metrics
- Print accuracy: paneled output matches the real vehicle within the stated tolerance; zero short prints in shop validation.
- Time saved: a shop produces a print-ready file without outsourcing.
- Activation: a shop configures its print profile and exports a first real job.
- Retention: shops keep the subscription month over month.

## 10. Dependencies and sequencing
- Curvature spike (prompts/25, research-only) first; it returns a go/no-go and a confidence model.
- Print engine (prompts/24, Goal 22) builds on the spike's corrected dimensions.
- Goal 20 fix-it (prompts/26) lands before the engine reaches real shops, so shops can sign in and receive orders.
- Build model: scoped subagents plus the section 3 gate (CLAUDE.md sections 3 and 4).

## 11. Risks
- Curvature accuracy is the make-or-break risk; the spike exists to quantify it before any promise to paying shops.
- Coverage gaps across makes/models; mitigate with the confidence field and explicit estimate warnings.
- Vector vs raster fidelity for AI-raster designs; resolve per design type in the engine.
- Treating a marketing/photo render as a print file; the render_target discriminator (Goal 21) keeps photo renders out of the export path.

## 12. Open questions
- Subscription price, tiers, and trial terms.
- First shop testers and the live-accuracy validation plan.
- Curvature source and target accuracy (spike output).
- Vector vs raster output per design type; seam-placement policy (auto vs shop-adjustable); print profile scope (per-shop, per-printer, or per-user).

## 13. Supersession and change log
- 2026-06-22 v1.0: created on the B2B pivot (docs/product/2026-06-18-pivot-decision-b2b.md). Supersedes prd.md (v1.1, B2C-plus-shop framing) and prd-b2c-guided-design-flow.md (v1.2, consumer guided design). Those documents are retained for history and carry a supersession banner.
