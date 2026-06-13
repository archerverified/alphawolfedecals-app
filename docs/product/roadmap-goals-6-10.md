# Build Roadmap — Goals 6–10 (the chain to full app)

Date: 2026-06-11 · Decided with Archer · Each goal = one autonomous CC session (Goal-5 pattern: no-questions decision policy, single run, review protocol, closeout ritual), verified independently by the Cowork orchestrator before the next fires.

**Stripe is PARKED** (Archer, 2026-06-11): no checkout in this chain. Everything credit/slot-related is built purchase-ready; checkout slots in later as a standalone mini-goal ("Goal S") with zero migration.

**Goal 8 is DEFERRED to post-launch** (Archer, 2026-06-13): the print paneling engine is the shop-side/B2B production half. The live product is B2C — the customer's deliverable is the portable export pack (`prd-b2c-guided-design-flow.md` §5), which the receiving shop panels in its own RIP. Per that PRD, shop-side production is an explicit v2 non-goal (§2.3), and `prd.md` §3 already says we don't build paneling/RIP. So printer info (model, media/laminate width, overlap, gutter) buys the B2C app nothing — it only matters if Alpha Wolf prints in-house or onboards partner shops. **Goal numbers are stable identities and are NOT renumbered** (prompts/activities reference them); only the execution order changes. Active chain is now **9 → 10 → launch**, with 8 and S running afterward.

Execution order (top = next): **9, 10**, then deferred **8, S**.

| Goal | Status | Scope | Unblocks | Pre-reqs from Archer | Est. |
|---|---|---|---|---|---|
| **6 — Template Studio** | ✅ SHIPPED | Internal authoring pipeline (photos/OEM drawings → vectorized outline → panel segmentation → wrap-safe zones → 1/20 sheet → publish). Author panel data for the 3 AW catalog templates from their OWNED art. Wire "Request this vehicle" queue to the Studio worklist. Operator runbook. | Editor on AW templates (the #1 launch blocker since Goal 4); B2C zone selector on real catalog; the template moat machine | none | done |
| **7 — AI generation (B2C Phase 2)** | ✅ SHIPPED | Provider adapter (fal.ai default) per PRD §10: Haiku orchestrator, Flux Depth Dev drafts (3 concepts × views), Kontext iterations, FLUX.2 Pro final, watermarked previews, logo compositing (never AI-rendered), grant-only credit metering + waitlist sheet, 20-brief bake-off harness. | The headline product feature | done (~$1.18 spend; nano-banana won bake-off) | done |
| **9 — Growth loops + polish** | ◀ NEXT | Share-for-feedback page (concept voting), referral credits (`referral` ledger source), shop locator handoff, before/after slider, theme/visual pass items. **Plus 3 hygiene riders folded in from the deferred Goal 8 prompt** (see below). | Viral mechanics on the export funnel | none | 1 session |
| **10 — Launch hardening** | queued | Full re-audit chain (website-security-audit + production-readiness as BLOCKING gate), Lighthouse re-baseline, real Terms/Privacy + tint disclaimer integration, robots.txt flip decision, investor package refresh, launch checklist. | Public launch | final legal copy; tint disclaimer legal pass | 1 session |
| *(deferred) 8 — Print paneling engine* | ⏸ POST-LAUNCH | PRD v1.1 §4.6: shop printer/media config, panel slicing with bleed/overlap/seam alignment, panel labels + install arrows, linear-feet/laminate/waste calc, multi-page 1:1 print PDF + cover map, pre-export validations. The shop-side money feature — build only when going in-house print or onboarding partner shops. | Shop Pro value prop; B2B monetization story | shop's printer model + media/laminate widths + preferred overlap (only needed at build time) | 1 session |
| *(parked) S — Stripe checkout* | ⏸ ANYTIME | Credit packs + vehicle slots, webhook-verified, no card data stored. One component swap (waitlist→checkout) + one webhook route. | Revenue switch-on | Stripe account + keys + pack pricing | 0.5 session |

### Goal 9 folded riders (rescued from the deferred Goal 8 prompt — 2026-06-13)
1. **Test-account retirement policy** — 69 test customers + **8 `is_admin=true` test accounts** accumulated in prod during the Goal 7 e2e/proof run (all created 2026-06-12 00:36–01:27, `account_type=customer`, own ~0 projects). Define and apply a retirement/cleanup policy; revoke admin on the 8; add a guard so e2e accounts never persist to prod with elevated flags.
2. **PostHog test-traffic filtering** — analytics are mostly smoke/e2e runs right now; add an internal-traffic / test-cohort filter so launch metrics are clean.
3. **PRD §10 truth-up** — record the bake-off outcome (nano-banana / Gemini edit won; original-plan model benched) in the PRD so the spec matches what shipped.

## Standing rules for every goal in the chain
- Prompt drafted fresh by the orchestrator AFTER the previous goal's verification (never pre-batched — each prompt carries the verified current state).
- Hard stops carried in every prompt: PVO/license wall, PII key, no force-push, DB split, ADR locks.
- Between goals: independent verification (PRs/CI/advisors/Sentry/PostHog/prod), dependabot batch triage, handoff doc updates.
- Ops items currently open (carry until cleared): RESEND_FROM_EMAIL on Vercel + Render, UPSTASH_* on Vercel, backup restore drill before first real signup.

## Sequencing rationale
6 before 7: AI generation composes per-view template renders — it needs real panel/view data to condition on. **7 → 9 → 10 is the B2C launch path:** the customer-side magic (7) now feeds growth loops on the export funnel (9), then launch hardening gates go-live (10). **Goal 8 (paneling) was originally sequenced 7→8 to feed a shop-side queue, but that queue is the B2B half — deferred to post-launch** (printer info is a build-time pre-req only when AW prints in-house or onboards partner shops). Stripe (S) anywhere after 7 — one paste away whenever Archer says go.
