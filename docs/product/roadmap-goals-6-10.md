# Build Roadmap — Goals 6–10 (the chain to full app)

Date: 2026-06-11 · Decided with Archer · Each goal = one autonomous CC session (Goal-5 pattern: no-questions decision policy, single run, review protocol, closeout ritual), verified independently by the Cowork orchestrator before the next fires.

**Stripe is PARKED** (Archer, 2026-06-11): no checkout in this chain. Everything credit/slot-related is built purchase-ready; checkout slots in later as a standalone mini-goal ("Goal S") with zero migration.

| Goal | Scope | Unblocks | Pre-reqs from Archer | Est. |
|---|---|---|---|---|
| **6 — Template Studio** | Internal authoring pipeline (photos/OEM drawings → vectorized outline → panel segmentation → wrap-safe zones → 1/20 sheet → publish). Author panel data for the 3 AW catalog templates from their OWNED art. Wire "Request this vehicle" queue to the Studio worklist. Operator runbook. | Editor on AW templates (the #1 launch blocker since Goal 4); B2C zone selector on real catalog; the template moat machine | none | 1 session |
| **7 — AI generation (B2C Phase 2)** | Provider adapter (fal.ai default) per PRD §10: Haiku orchestrator, Flux Depth Dev drafts (3 concepts × views), Kontext iterations, FLUX.2 Pro final, watermarked previews, logo compositing (never AI-rendered), grant-only credit metering + waitlist sheet, 20-brief bake-off harness. | The headline product feature | **fal.ai account + API key WITH spend cap; Anthropic API key with budget** | 1–2 sessions |
| **8 — Print paneling engine** | PRD v1.1 §4.6: shop printer/media config, panel slicing with bleed/overlap/seam alignment, panel labels + install arrows, linear-feet/laminate/waste calc, multi-page 1:1 print PDF + cover map, pre-export validations. The shop-side money feature. | Shop Pro value prop; B2B monetization story | shop's printer model + media/laminate widths + preferred overlap (Alpha Wolf Decals' real setup) | 1 session |
| **9 — Growth loops + polish** | Share-for-feedback page (concept voting), referral credits (`referral` ledger source), shop locator handoff, before/after slider, theme/visual pass items. | Viral mechanics on the export funnel | none | 1 session |
| **10 — Launch hardening** | Full re-audit chain (website-security-audit + production-readiness as BLOCKING gate), Lighthouse re-baseline, real Terms/Privacy + tint disclaimer integration, robots.txt flip decision, investor package refresh, launch checklist. | Public launch | final legal copy; tint disclaimer legal pass | 1 session |
| *(parked) S — Stripe checkout* | Credit packs + vehicle slots, webhook-verified, no card data stored. One component swap (waitlist→checkout) + one webhook route. | Revenue switch-on | Stripe account + keys + pack pricing | 0.5 session |

## Standing rules for every goal in the chain
- Prompt drafted fresh by the orchestrator AFTER the previous goal's verification (never pre-batched — each prompt carries the verified current state).
- Hard stops carried in every prompt: PVO/license wall, PII key, no force-push, DB split, ADR locks.
- Between goals: independent verification (PRs/CI/advisors/Sentry/PostHog/prod), dependabot batch triage, handoff doc updates.
- Ops items currently open (carry until cleared): RESEND_FROM_EMAIL on Vercel + Render, UPSTASH_* on Vercel, backup restore drill before first real signup.

## Sequencing rationale
6 before 7: AI generation composes per-view template renders — it needs real panel/view data to condition on. 7 before 8: the customer-side magic feeds the shop-side queue that paneling serves. 9 after the product is whole; 10 last because audits gate launch, not development. Stripe anywhere after 7 — it's one paste away whenever Archer says go.
