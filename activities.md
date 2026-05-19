# Alpha Wolf Wrap Studio — Project Activities Log

Append-only event log for the build. Every architectural decision, story completion, and meaningful working session gets a new entry at the top. Do not edit prior entries — corrections are new entries that reference the original.

Companion to the Obsidian vault at `/docs/vault/`. The in-app per-project activities log (PRD section 4.10, story GH-013) is a separate concept — this file is the project-level dev log.

---

## 2026-05-18 — Archer + Claude (PRD draft)

- **Decision**: Adopted Core MVP scope for v1 (Auth + vehicle selector + AI generation + print paneling + detailed export). Defer customer portal, installer mode, material estimator to v1.1/v2.
- **Decision**: Hybrid AI architecture — Claude Sonnet 4.6 for orchestration, Flux/Higgsfield for image generation. Router chooses per generation based on cost/quality.
- **Decision**: Two-sided user model (Customer + Shop) with project token handoff. Alpha Wolf is the default routing shop at launch.
- **Decision**: Proprietary vehicle template DB. Top 50 vehicles in v1. Build > license for moat.
- **Decision**: Next.js 15 + Node/Express + Postgres + Python AI microservice. Mobile via React Native in Phase 6.
- **Decision**: Pricing deferred; data model accommodates `subscription_status` + `plan_tier` from day one.
- **Decision**: Export PDF carries full metadata (vehicle, design, print production, project tracking) on cover sheet plus embedded as PDF/X structured data.
- **Followups**:
  - Phase 1 kickoff requires: codified design system (use `creative-design/ui-design-system` skill), data model spike, vehicle template schema review.
  - Need legal review of ToS for customer-uploaded brand assets before public launch (open question in PRD §12).
  - Decide AI cost transparency to customers — recommend absorb in v1.
- **Artifacts produced**: `prd.md` v1.0, `activities.md` (this file), `journey-and-architecture.html`.
