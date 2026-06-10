// Brief document schema (Goal 5 / B2C-002). The DB stores `data` as opaque
// JSONB; THIS is the validation boundary — every server action that writes a
// brief parses through briefSchema first (mirror of the canvas_state pattern,
// where @alphawolf/canvas validates before the JSONB write).
//
// Every field is optional by design: the wizard's only required input is the
// vehicle, which the project already pins (PRD §3 step 3). Steps fill in their
// slice as the customer progresses; later PRs (zones SVG, logo gate, colors,
// tint) enrich the UI without changing this shape contract.

import { z } from 'zod';

export const BRIEF_STYLE_PRESETS = [
  'Clean',
  'Aggressive',
  'Luxury',
  'Construction',
  'Racing',
  'Minimalist',
] as const;

export const MATERIAL_TIERS = [
  {
    id: 'standard_cast',
    label: 'Standard cast vinyl',
    cost: '$$',
    blurb: 'Solid everyday choice. 5–7 year outdoor life.',
  },
  {
    id: 'premium_cast',
    label: 'Premium cast vinyl',
    cost: '$$$',
    blurb: 'Top-shelf conformability and color depth. 7–10 years.',
  },
  {
    id: 'color_shift',
    label: 'Color-shift film',
    cost: '$$$$',
    blurb: 'Changes color with viewing angle. Show-stopper looks.',
  },
  {
    id: 'chrome',
    label: 'Chrome film',
    cost: '$$$$',
    blurb: 'Mirror finish. Demanding install, dramatic result.',
  },
  {
    id: 'carbon_look',
    label: 'Carbon-look film',
    cost: '$$$',
    blurb: 'Textured carbon-fiber effect for accents or full panels.',
  },
] as const;

export type MaterialTierId = (typeof MATERIAL_TIERS)[number]['id'];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// One chosen color: always a hex; optionally anchored to a real film SKU
// (B2C-005 fills brand/sku/finish from the film library).
export const briefColorSchema = z.object({
  hex: hexColor,
  role: z.enum(['primary', 'secondary', 'accent']).optional(),
  brand: z.string().max(60).optional(),
  sku: z.string().max(60).optional(),
  name: z.string().max(120).optional(),
  finish: z.string().max(40).optional(),
});

export const briefSchema = z
  .object({
    // B2C-003. null/absent = full wrap (the default); otherwise the panel ids
    // the customer explicitly included.
    zones: z
      .object({
        includedPanelIds: z.array(z.string().uuid()).max(64).nullable().optional(),
      })
      .optional(),

    // B2C-004 / B2C-012. Reference photos of the customer's REAL vehicle.
    photos: z
      .array(
        z.object({
          assetId: z.string().uuid(),
          note: z.string().max(500).optional(),
        }),
      )
      .max(12)
      .optional(),

    // B2C-004. Uploaded logo + where it goes.
    logo: z
      .object({
        assetId: z.string().uuid().optional(),
        fileName: z.string().max(200).optional(),
        zonePanelIds: z.array(z.string().uuid()).max(64).optional(),
      })
      .optional(),

    // B2C-005.
    colors: z
      .object({
        picks: z.array(briefColorSchema).max(8).optional(),
        extractedFromLogo: z.array(hexColor).max(8).optional(),
      })
      .optional(),

    style: z
      .object({
        presets: z.array(z.enum(BRIEF_STYLE_PRESETS)).max(6).optional(),
        prompt: z.string().max(2000).optional(),
      })
      .optional(),

    // Per-included-zone instructions, keyed by panel id.
    zoneNotes: z.record(z.string().uuid(), z.string().max(500)).optional(),

    materials: z
      .object({
        tier: z
          .enum(['standard_cast', 'premium_cast', 'color_shift', 'chrome', 'carbon_look'])
          .optional(),
      })
      .optional(),

    // B2C-006.
    tint: z
      .object({
        state: z.string().length(2).optional(),
        perWindow: z.record(z.string().max(40), z.number().int().min(0).max(100)).optional(),
      })
      .optional(),

    extras: z
      .object({
        chromeDelete: z.boolean().optional(),
        roofOnlyColorChange: z.boolean().optional(),
        pinstripeAccent: z.boolean().optional(),
        ppfZones: z.boolean().optional(),
        dotNumber: z.string().max(40).optional(),
      })
      .optional(),

    aiNotes: z.string().max(4000).optional(),
  })
  .strict();

export type BriefData = z.infer<typeof briefSchema>;

// Guard against JSONB bloat from a hostile/buggy client. The schema's own
// max() caps make this nearly unreachable; this is the backstop.
export const BRIEF_MAX_BYTES = 64 * 1024;

export type BriefParseResult = { ok: true; data: BriefData } | { ok: false };

export function parseBriefData(input: unknown): BriefParseResult {
  try {
    if (JSON.stringify(input).length > BRIEF_MAX_BYTES) return { ok: false };
  } catch {
    return { ok: false };
  }
  const parsed = briefSchema.safeParse(input);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false };
}

// Wizard step registry (B2C-002). Steps activate as their PR lands — `enabled:
// false` steps are hidden from the rail, so every merge ships a coherent
// wizard. Order matches PRD §3 step 3.
export const BRIEF_STEPS = [
  { key: 'zones', label: 'Zones', enabled: true },
  { key: 'photos', label: 'Your vehicle', enabled: false },
  { key: 'logo', label: 'Logo', enabled: false },
  { key: 'colors', label: 'Colors', enabled: false },
  { key: 'style', label: 'Style & ideas', enabled: true },
  { key: 'zoneNotes', label: 'Zone notes', enabled: true },
  { key: 'materials', label: 'Materials', enabled: true },
  { key: 'tint', label: 'Tint', enabled: false },
  { key: 'extras', label: 'Extras', enabled: true },
  { key: 'aiNotes', label: 'Notes', enabled: true },
  { key: 'review', label: 'Review', enabled: true },
] as const;

export type BriefStepKey = (typeof BRIEF_STEPS)[number]['key'];

export function enabledBriefSteps() {
  return BRIEF_STEPS.filter((s) => s.enabled);
}
