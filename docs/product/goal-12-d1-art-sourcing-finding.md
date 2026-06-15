# Goal 12 · D1 — Vehicle-art finding & spend ledger (2026-06-15)

**Verdict: the BMW X3 now renders as a recognizable BMW X3 — and it required ZERO
AI generation, because recognizable, rights-clear art already existed.** This is
the evidenced report the goal's Definition of Done #1 explicitly allows ("OR a
clear, evidenced report that in-house AI couldn't clear the bar + what was tried").
Honesty over completion: AI image generation was **not** the missing piece, and it
is **blocked in this environment** anyway. The fix was D2 (render the art the
editor was ignoring), not D1.

## The premise vs. the verified reality

The prompt's premise (Cowork, 2026-06-14): _"our templates are panel geometry
(segmentation boxes), not vehicle artwork… generate the vehicle artwork in-house
with AI."_ Verified against the live Supabase `vehicle-templates` bucket + DB, that
premise is **wrong for the live catalogue**:

| Vehicle (published)                           | `svg_storage_key` (wrapped art) | Recognizable?                                 | Panels/Views |
| --------------------------------------------- | ------------------------------- | --------------------------------------------- | ------------ |
| **BMW X3** `aa000001…0001`                    | ✅ `…/wrapped.svg`              | **Yes** — grille, headlights, wheels, 4 views | 15 / 4       |
| **Contender 36.5' Bass Boat** `aa000002…0002` | ✅ `…/wrapped.svg`              | Yes — hull, T-top, outboard, 2 views          | 6 / 2        |
| **Crown Super Coach (1973)** `aa000003…0003`  | ✅ `…/wrapped.svg`              | Yes — coach body, windows, wheels, 3 views    | 12 / 3       |
| **Ford Transit 250** `a0000000…0001`          | ❌ null — **boxes only**        | No                                            | 6 / 4        |

(7 `Studio E2E …` Ford rows are retired test artifacts — ignored.)

So **3 of 4 published vehicles already had recognizable, rights-clear, AW-owned
artwork** (provenance in the SVG metadata: _"Authored over Alpha Wolf owned wrapped
art … in-house BMW X3 sheet"_). The editor simply never rendered it — it drew the
`vehicle_panels` segmentation boxes instead. Evidence: `docs/deployment/screenshots/
2026-06-15-goal-12/07-*` (the existing art) and `08-*` (art ↔ panel registration).

## Quality gate

The gate (recognizable as make/model · correctly proportioned · clean to design on ·
aligned to panel zones) is **passed by the existing art** for the BMW X3, Contender,
and Crown — confirmed visually and by the coordinate-registration overlay (the panel
zones land on the right body of the right view). No generated art was needed to
clear it, so nothing was shipped that "still looks wrong."

## Why in-house AI generation was not pursued (evidenced)

1. **Not needed** for the proof vehicle (or 2 of the other 3) — art already exists.
2. **Environmentally blocked.** Real generation needs `FAL_KEY`. It is not in the
   local env; the provider is fail-closed (`AI_PROVIDER=fal` + blank key throws by
   design — `apps/web/lib/ai/provider.ts`); the key lives write-only on Vercel and
   cannot be read back. So no real fal spend was possible in this session.
3. **Wrong engine for synthesis.** The Goal 7 default `nano_banana_edit` _edits an
   existing view render_ (that is why it won the bake-off — it preserves the input
   vehicle's geometry). Fed the Transit's boxes, it would preserve boxes. Only a
   text-to-image model (`flux2_dev`) could synthesize a vehicle from scratch — with
   real recognizability/IP risk for a specific branded model, the same wall the
   PVO/license rule guards against.
4. **A proven rights-clean path already exists:** owned-art authoring in the Studio
   (how the X3/Contender/Crown got their art), not AI.

## The one real gap — Ford Transit 250

The Transit is the only published vehicle with no art. Recommended (Archer's call):

- **Preferred:** author/import AW-owned Transit art via the Studio, exactly as the
  other three were done → it then renders identically in the rebuilt editor (the
  editor already falls back to outlined zone boxes when art is absent, so the Transit
  is functional today, just not pretty).
- **Alternative:** a one-off AI generation run **on production** (where `FAL_KEY`
  exists) using `flux2_dev` text-to-image behind the documented quality gate +
  human approval before publish — accepting the recognizability/IP risk noted above.
  Do not ship AI output that does not clearly read as a Transit.

## Spend ledger

| Provider  | Budgeted | Spent     | Note                                                                                  |
| --------- | -------- | --------- | ------------------------------------------------------------------------------------- |
| fal.ai    | $8       | **$0.00** | No generation run — recognizable art already existed; fal blocked locally.            |
| Anthropic | $2       | **$0.00** | Orchestrator not invoked (no generation).                                             |
| **Total** | **$10**  | **$0.00** | Goal delivered under budget; the budget was for art that turned out to already exist. |

## What needs Archer's call

1. **Transit art** — author owned art (preferred) or approve a prod AI run (above).
2. **Sourcing decision revisit** — the 2026-06-14 "generate art with AI" decision is
   not needed for the current catalogue; owned-art authoring is the cheaper, safer,
   already-working path. Keep AI generation as the _customer-facing wrap-design_
   feature (Goal 7, surfaced in-editor by D3) rather than for base vehicle artwork.
