// AI generation launch config (Goal 7, PRD §10). Tunable data, deliberately kept
// out of the schema and out of feature code — same doctrine as credit-config.ts:
// change a value here, ship, done. Model IDs and prices verified against fal.ai
// model pages 2026-06-12; the bake-off (docs/product/bakeoff-2026-06.md) picks
// the defaults.
//
// MONEY WARNING: fal.ai has NO per-key spend cap — the provider-side $10/month
// cap on the key is the only external backstop. Every limit in this file is a
// real-dollar control; loosening one must be a deliberate, logged decision.

// How a model bills. fal rounds megapixels UP per image (1080×1920 bills as 2 MP).
export type AiModelPricing =
  | { kind: 'per_image'; usd: number }
  | { kind: 'per_megapixel'; usd: number }
  // FLUX.2 [pro] meters input+output MP: first output MP flat, then per extra MP.
  | { kind: 'flux2_pro_metered'; firstMpUsd: number; extraMpUsd: number };

export interface AiModelConfig {
  /** fal endpoint id, e.g. "fal-ai/flux-kontext/dev" */
  id: string;
  /** which adapter operation this model serves */
  op: 'generate' | 'edit' | 'upscale';
  /**
   * Which input field carries the conditioning/source image(s) on this fal
   * endpoint. NOT uniform across the catalog — this is config, not convention.
   */
  imageField: 'control_lora_image_url' | 'image_url' | 'image_urls' | 'none';
  pricing: AiModelPricing;
  label: string;
}

// The candidate catalog. Keys are OUR stable names; fal endpoint ids stay
// swappable underneath (PRD §10: "models swappable by config").
export const AI_MODELS = {
  // Depth-conditioned generation (PRD §10 draft pick). preprocess_depth=true
  // lets us pass the template view render directly; fal computes the depth map.
  flux_depth_dev: {
    id: 'fal-ai/flux-control-lora-depth',
    op: 'generate',
    imageField: 'control_lora_image_url',
    pricing: { kind: 'per_megapixel', usd: 0.04 },
    label: 'FLUX.1 [dev] Control LoRA Depth',
  },
  // FLUX.2 [dev] — supports reference images; cheapest draft candidate.
  flux2_dev: {
    id: 'fal-ai/flux-2',
    op: 'generate',
    imageField: 'image_urls',
    pricing: { kind: 'per_megapixel', usd: 0.012 },
    label: 'FLUX.2 [dev]',
  },
  // Gemini image edit on fal — restyles the template render it is given.
  nano_banana_edit: {
    id: 'fal-ai/nano-banana/edit',
    op: 'edit',
    imageField: 'image_urls',
    pricing: { kind: 'per_image', usd: 0.039 },
    label: 'Nano Banana (Gemini) edit',
  },
  // Composition-preserving iteration model (PRD §10 "the margin engine").
  kontext_dev: {
    id: 'fal-ai/flux-kontext/dev',
    op: 'edit',
    imageField: 'image_url',
    pricing: { kind: 'per_megapixel', usd: 0.025 },
    label: 'FLUX.1 Kontext [dev]',
  },
  // Stubborn-edit escalation (config-swappable, not wired by default).
  kontext_pro: {
    id: 'fal-ai/flux-pro/kontext',
    op: 'edit',
    imageField: 'image_url',
    pricing: { kind: 'per_image', usd: 0.04 },
    label: 'FLUX.1 Kontext [pro]',
  },
  // Export-quality final pass (PRD §10).
  flux2_pro_edit: {
    id: 'fal-ai/flux-2-pro/edit',
    op: 'edit',
    imageField: 'image_urls',
    pricing: { kind: 'flux2_pro_metered', firstMpUsd: 0.03, extraMpUsd: 0.015 },
    label: 'FLUX.2 [pro] edit',
  },
  // Optional export upscale (PRD §10, only if export resolution demands it).
  recraft_crisp_upscale: {
    id: 'fal-ai/recraft/upscale/crisp',
    op: 'upscale',
    imageField: 'image_url',
    pricing: { kind: 'per_image', usd: 0.004 },
    label: 'Recraft Crisp Upscale',
  },
} as const satisfies Record<string, AiModelConfig>;

export type AiModelKey = keyof typeof AI_MODELS;

export const AI_CONFIG = {
  // Defaults per pipeline stage. `draft` is set by the 2026-06 bake-off
  // (docs/product/bakeoff-2026-06.md); the others follow PRD §10.
  defaults: {
    draft: 'flux_depth_dev' as AiModelKey,
    iteration: 'kontext_dev' as AiModelKey,
    final: 'flux2_pro_edit' as AiModelKey,
    upscale: 'recraft_crisp_upscale' as AiModelKey,
  },
  // Haiku 4.5 orchestrator (PRD §10): brief → per-view generation instructions.
  orchestrator: {
    model: 'claude-haiku-4-5',
    // $/MTok, for the spend ledger + cost tracking (verified 2026-06-12).
    inputUsdPerMTok: 1.0,
    outputUsdPerMTok: 5.0,
    maxTokens: 4096,
  },
  // Draft render geometry. ~1 MP keeps per-MP models at their floor price.
  draftImage: { width: 1024, height: 768 },
  // Export-quality final render geometry (2 MP — flux-2-pro bills 0.03+0.015).
  finalImage: { width: 1600, height: 1200 },
  // Watermarked preview width served to the gallery (originals never leave
  // owner-scoped signed URLs pre-selection).
  previewWidth: 1024,
  // HARD daily spend ceiling across ALL users, USD, enforced server-side
  // beneath credits (D7). Trips → runs blocked + PostHog `ai_spend_cap_hit`.
  dailySpendCapUsd: 5,
  // PRD v1.1 §4.4 abuse ceiling beneath credits. rate-limit.ts denies at
  // attempts >= threshold, so 31 yields an effective 30/day.
  customerRunsPerDay: 31,
  // Bake-off harness self-caps (the rails of PR D don't exist when the
  // harness first ships — these are ITS OWN rails; see pipeline design §G1).
  bakeoff: {
    maxImagesPerInvocation: 6,
    maxTotalImages: 24,
    maxTotalUsd: 2.5,
  },
} as const;

/**
 * Estimated USD cost of one output at the given pixel dimensions.
 * fal bills megapixels rounded UP per image.
 */
export function estimateImageCostUsd(
  pricing: AiModelPricing,
  width: number,
  height: number,
): number {
  const mp = Math.max(1, Math.ceil((width * height) / 1_000_000));
  switch (pricing.kind) {
    case 'per_image':
      return pricing.usd;
    case 'per_megapixel':
      return pricing.usd * mp;
    case 'flux2_pro_metered':
      return pricing.firstMpUsd + pricing.extraMpUsd * (mp - 1);
  }
}
