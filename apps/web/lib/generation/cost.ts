// Pure run-cost estimation for the generation pipeline. Lives OUTSIDE the
// 'use server' action module (lib/actions/generation.ts) on purpose: a
// 'use server' file may only export async functions, so this synchronous cost
// math (and its callers' direct unit tests) belongs in a plain module. The
// estimate is a conservative pre-orchestration upper bound; trueUpRunCost
// replaces it with provider actuals once a run is terminal.

import {
  AI_CONFIG,
  AI_MODELS,
  estimateImageCostUsd,
  type AiModelKey,
  type GenerationRunKind,
} from '@alphawolf/db';

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

export function estimateRunCostUsd(
  modelKey: AiModelKey,
  kind: GenerationRunKind,
  views: number,
  opts?: { photoRenders?: number },
): number {
  const dims = kind === 'final' ? AI_CONFIG.finalImage : AI_CONFIG.draftImage;
  // A FINAL view conditions on up to 3 input images, which the metered final
  // model (flux2_pro) bills per input MP: the structure render, the approved-draft
  // donor (Goal 17 coherence), AND the directional gradient guide (Goal 18). The
  // pre-orchestration estimate counts the worst case so the daily spend cap stays a
  // true upper bound (a per-image draft model ignores input count, so the draft
  // estimate is unchanged). trueUpRunCost replaces this with actuals.
  const inputImages = kind === 'final' ? 3 : 1;
  const perImage = estimateImageCostUsd(
    AI_MODELS[modelKey].pricing,
    dims.width,
    dims.height,
    inputImages,
  );
  const directions = kind === 'initial' ? 3 : 1;
  const templateCost = perImage * directions * views;

  // Photo renders (on-photo i2i, one per direction/concept) add a flat per-image
  // cost at the photo model's pricing. The dims mirror the template dims selection
  // (draft dims for initial/iteration, final dims for final) so the cap stays a
  // conservative upper bound even when the photo model is per-image flat.
  const photoCount = opts?.photoRenders ?? 0;
  const photoCost =
    photoCount > 0
      ? photoCount *
        estimateImageCostUsd(AI_MODELS[AI_CONFIG.defaults.photo].pricing, dims.width, dims.height)
      : 0;

  return round4(templateCost + photoCost);
}
