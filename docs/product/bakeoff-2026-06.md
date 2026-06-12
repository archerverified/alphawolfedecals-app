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

## Results

_(populated below after the run)_

## Verdict

_(populated below)_
