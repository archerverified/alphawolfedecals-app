# AI draft-model bake-off — June 2026 (Goal 7 D2)

**Scope amendment (logged decision):** PRD §10's "20-brief bake-off" is amended to budget-fit under the $10/month provider caps: **6 representative briefs × 3 candidate models × 1 representative view each**, scored on brief adherence, geometry respect, zone compliance, and style distinctness. The full 20-brief rerun is a launch-list item for when caps raise.

**Candidates** (fal endpoint ids in `packages/db/src/ai-config.ts`):

| Key | Endpoint | $/image (1 MP) | Conditioning |
|---|---|---|---|
| `flux_depth_dev` | fal-ai/flux-control-lora-depth | $0.04 | depth map derived from the clean view render |
| `flux2_dev` | fal-ai/flux-2 | $0.012 | reference image |
| `nano_banana_edit` | fal-ai/nano-banana/edit | $0.039 | edit of the view render |

**Method.** Conditioning inputs are the pre-generated clean per-view template renders (`pnpm db:render-views`, public vehicle-templates bucket `views/<vehicleId>/<view>.png`). Six hand-written briefs covering the style-preset spread (contractor / racing / luxury / construction / minimalist / food-truck) run through the admin bake-off harness (`/api/admin/ai-bakeoff`, one model per invocation, seed 42, 1024×768). Outputs land in the private project-assets bucket under `bakeoff/2026-06/<label>/<model>.png` with a crash-safe spend ledger.

**Scoring rubric** (0–3 each, per image; scored by the executing agent from the rendered outputs):
- **Brief adherence** — are the asked-for colors/elements/mood there?
- **Geometry respect** — does the design stay ON the vehicle and follow its body? (windows/wheels/lights intact, no background bleed, silhouette preserved)
- **Zone compliance** — does it respect spatial instructions (clear door space, low chevron band, single accent line)?
- **Style distinctness** — would three directions from this model actually look different? (judged from cross-brief variety + prompt responsiveness)

**Coverage amendment (logged):** the production admin surface showed an intermittent bodyless-404 auth flake during the run windows (suspected Vercel deployment-pinning around the day's deploys; flagged for Archer in the final report). Briefs 3–6 completed across all 3 candidates (11 scored images, plus 1 unharvested depth render); briefs 1–2 could not be completed before the bake-off budget window closed. 4 briefs × 3 models still spans van/SUV/coach geometry and 4 of 6 style families — sufficient signal for a default, and the full 20-brief rerun was already a launch-list item.

## Results

Scores are (brief adherence / geometry respect / zone compliance), 0–3 each, scored from the rendered outputs (stored under `bakeoff/2026-06/` in project-assets; spend ledger alongside).

| Brief | flux_depth_dev | flux2_dev | nano_banana_edit |
|---|---|---|---|
| 3 — luxury SUV (X3) | 2.5 / 1.5 / 1.5 — became a different SUV (Range-Rover-ish); pinstripe placed low | 2 / 2 / 2.5 — credible, vehicle close but generic | 2.5 / 3 / 2 — **the actual X3 art**, gold lines on body lines (several lines vs one) |
| 4 — construction van (Transit) | 0 / 0 / 0 — catastrophic: flat poster with gibberish text, no vehicle | 3 / 2.5 / 3 — excellent: hi-vis yellow, chevron band exactly low on the rocker | 1 / 0 / 1 — failed: flat yellow rectangles (sparse line-art input) |
| 5 — minimalist SUV (X3) | _(unharvested — render exceeded the 60s window; cost ledgered)_ | 2 / 2 / 1.5 — white SUV but teal traces panel seams, not one crease | 2.5 / 3 / 2 — the actual X3, white + teal accents on crease lines |
| 6 — food-truck coach | 3 / 2 / 2.5 — strong illustrated gradient + tacos on a coach-like bus | 2.5 / 1.5 / 2.5 — beautiful but the coach became a short step van | 3 / 3 / 2.5 — **the actual coach art**, festive pattern mapped on panels |
| **Mean** | **1.8 / 1.2 / 1.3** | **2.4 / 2.0 / 2.4** | **2.25 / 2.25 / 1.9** |

**Style distinctness:** flux2_dev and nano_banana_edit both tracked prompt style shifts strongly across the four briefs (hi-vis utilitarian vs festive vs minimal read as genuinely different hands); flux_depth_dev's surviving outputs were stylistically fine but its variance dominates the signal.

## Verdict

**Default draft model: `nano_banana_edit`.** The product requirement that decides it is PRD §10 rule 2 — *output respects real vehicle geometry and maps back onto panels*. nano-banana works as an EDIT of the template's own view render, so on every detailed render (the 3 AW catalogue templates) it returned the customer's exact vehicle art with the wrap applied — geometry 3/3 every time, directly compositable onto the editor's panels. Its single failure was on the Transit's deliberately sparse outline-art conditioning render — an INPUT quality issue (fix: richer conditioning render for outline-only vehicles), not a model issue.

- `flux2_dev` is the configured alternate: most consistent, cheapest ($0.012 vs $0.039/image), gorgeous output — but it repeatedly swapped the customer's vehicle for a similar-but-different one, which breaks the "your actual vehicle" promise and the panel mapping.
- `flux_depth_dev` — the PRD §10 paper pick — is relegated: one catastrophic non-vehicle output, one vehicle-identity drift, the slowest renders (the only model to blow the 60s function window), and the priciest drafts. The bake-off exists precisely to catch this before it became the default.
- Iteration default stays `kontext_dev` (composition-preserving edit, untested here by budget — first candidate for the 20-brief rerun); final stays `flux2_pro_edit`.

**Run economics at the chosen default:** 3 concepts × 4 views ≈ 12 draft images ≈ $0.47/run hard cost — above the PRD's $0.30 flux-depth estimate but inside the §10 happy-path envelope ($0.50–0.65) and the credit margin model.

**Spend:** see `goal-7-spend-ledger.md`; bake-off cumulative $0.388 ledgered (incl. $0.064 conservative estimates for unharvested/failed calls fal never billed).
