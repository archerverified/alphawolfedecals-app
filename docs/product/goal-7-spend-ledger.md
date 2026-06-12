# Goal 7 — AI spend ledger (running)

Hard ceiling for this goal: **$6.00 fal + $3.00 Anthropic** (leaves headroom under the $10/month caps for Archer's own testing). CI and unit tests use the MOCK adapter — $0. Real calls only in: bake-off, pipeline integration verification, final prod proof run.

| # | When (UTC) | Provider | What | Est. cost | Cum. fal | Cum. Anthropic |
|---|---|---|---|---|---|---|
| 0 | 2026-06-12 07:24 | fal | Bake-off attempt #1: 18 invocations ALL refused before submit (ledger MIME bug; fail-closed rail held — zero provider calls, verified in runtime logs) | $0.00 | $0.00 | $0.00 |
| 1 | 2026-06-12 07:33–08:40 | fal | Bake-off rounds 2–3: 11 stored images (briefs 3–6 × 3 models), 1 unharvested depth render ($0.04 conservatively ledgered), 2 phantom auth-probe estimates that never reached fal ($0.024) | $0.388 ledgered (~$0.35 billed) | $0.39 | $0.00 |
| 2 | 2026-06-12 ~09:05 | Anthropic | Orchestrator integration test — ONE real Haiku call (1,740 in / 737 out tokens), schema-valid first attempt | $0.0054 | $0.39 | $0.01 |

| 3 | 2026-06-12 10:12–10:51 | Anthropic | Live local e2e of the full pipeline (mock image renders, REAL Haiku orchestrator): ~10 runs × 1 orchestrator call (PostHog: 4 initial + 3 iteration + 3 final) | ~$0.06 (conservative, ~$0.0055/call) | $0.39 | $0.07 |

**Totals: fal $0.39 / $6.00 · Anthropic $0.07 / $3.00** (server-side bake-off ledger in project-assets `bakeoff/2026-06/ledger.json` is the per-call source of truth for fal)
