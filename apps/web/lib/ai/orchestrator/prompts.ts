// Orchestrator prompts (Goal 7 D3, PRD §10). VERSIONED — the version string is
// recorded in run provenance so a regenerated concept can always be traced to
// the exact prompt that produced it. Editing ANY prompt text below requires
// bumping ORCHESTRATOR_PROMPT_VERSION.
//
// Server-side only: prompts describe our production pipeline contract and never
// ship to the client. Customer-facing chip labels live in ./chips (no
// server-only) so the gallery UI can import them.

import 'server-only';

import { VIEW_ORDER } from '@alphawolf/db';

import type { BriefData } from '@/lib/brief/schema';
import { MATERIAL_TIERS } from '@/lib/brief/schema';

// v3 (Goal 16): fix the two Goal-15 export carryovers at the controllable layer.
//   * Carryover A (white-box on doors): the reserved logo clear-space is now the
//     BASE WRAP COLOR, not an arbitrary/white background — so a reserved area
//     with no composited logo blends invisibly into the wrap instead of reading
//     as a stark white rectangle (root cause: hard rule 2 said "a single
//     background color"; the model rendered it white).
//   * Carryover B (front photoreal vs sides flat): every view of a direction
//     must render in the SAME visual style and level of photographic realism —
//     never mix a photoreal render with a flat/cel-shaded one across views.
// v4 (Goal 17): the SUPPORTING half of the cross-view coherence fix (the primary
//   half is architectural, derived views are now conditioned on a shared anchor
//   render in run-pipeline.ts). The prompt layer pins ONE design signature that
//   every view restates verbatim, and maps a directional gradient to a single
//   front→rear flow so each view renders its correct end of the gradient instead
//   of drifting to a flat or reversed color. Bump THIS version + the hash-pin test
//   whenever the prompt text below changes.
// v5 (Goal 18): the gradient DIRECTION was still model-variable. Goal-18 proved
//   (real-fal) that the image model ignores BOTH anatomical and image-space
//   direction TEXT and paints the gradient by its own prior, so prose alone can
//   never pin it. The fix is a deterministic gradient GUIDE image composited into
//   the FINAL render conditioning (run-pipeline.ts). For that, each direction now
//   ALSO emits a STRUCTURED `gradient` descriptor ({ directional, frontHex,
//   rearHex }, front = the vehicle's front end) so the pipeline can build the
//   guide deterministically. The prose direction stays for the draft preview.
export const ORCHESTRATOR_PROMPT_VERSION = 'v5';

// ---------------------------------------------------------------------------
// Inputs (shared with index.ts — defined here because they are exactly what
// the prompt builders consume).
// ---------------------------------------------------------------------------

export interface OrchestratorVehicle {
  year: number | string;
  make: string;
  model: string;
  bodyType: string;
}

export interface CompileBriefInput {
  /** Validated brief snapshot (briefSchema shape). */
  briefData: BriefData;
  vehicle: OrchestratorVehicle;
  /** Views to generate, e.g. ['front', 'driver', 'back', 'passenger']. */
  views: string[];
  /** Panel NAMES per view, for zone-aware prompt language. */
  panelsByView?: Record<string, string[]>;
  /** Panel/zone NAMES the customer assigned their logo to. */
  logoZones?: string[];
}

export interface CompileIterationInput {
  /** The chosen concept's customer-facing summary. */
  conceptSummary: string;
  /** The chosen concept's CURRENT per-view image prompts. */
  viewPrompts: Record<string, string>;
  /** Customer free text or an iteration chip instruction. */
  instruction: string;
  /** All views that exist for this concept. */
  views: string[];
}

// ---------------------------------------------------------------------------
// System prompt — brief → 3 concept directions
// ---------------------------------------------------------------------------

export const ORCHESTRATOR_SYSTEM_PROMPT = `You are the design orchestrator for Alpha Wolf Wrap Studio, a vehicle-wrap design service. You are a senior wrap art director: you read a customer's design brief and compile it into image-generation prompts that a structure-conditioned image model will render onto photos of the customer's exact vehicle.

# Your task

Produce exactly THREE distinct concept directions from the one brief, in this order:

1. "literal" — exactly what the brief says, executed cleanly. No additions, no reinterpretation. If the brief is sparse, keep it simple rather than inventing detail.
2. "bolder" — the SAME brief, amplified. Stronger contrast, larger shapes, more energy and visual movement. Push scale and color intensity, not new themes: it must still read as the same brief, turned up.
3. "minimal" — the SAME brief, reduced to its calmest essential. Fewer elements, more negative space, restrained accents. The quietest design that still honors the brief's colors and intent.

All three directions use the brief's colors and style inputs. They must be visibly DIFFERENT from each other at a glance, yet a customer should recognize their brief in every one.

For each direction, write one image prompt PER REQUESTED VIEW, plus a customer-facing title (max 40 characters, plain language, no jargon) and summary (max 140 characters, plain language — write like you're talking to a small-business owner, not a designer).

# Read the brief's INTENT first (MOST IMPORTANT — do this before writing any prompt)

Decide two things from the brief and apply them to EVERY view of EVERY direction:

1. THE BASE COLOR — the single color that covers most of the wrapped bodywork. Choose it in this priority: (a) the customer's OWN WORDS win — if they say "gloss black base", "red wrap", "matte grey", etc., that color is the base; (b) else a color marked with the "primary" role; (c) else the FIRST color listed. The base color fully covers every wrapped panel on every view. NEVER keep the vehicle's original factory paint as the base, and NEVER default to white just because the studio render shows a white vehicle — the customer is REPLACING that paint. A "black base" brief that comes back white or mostly-white is WRONG.

2. THE ACCENTS — the remaining colors, laid OVER the base as stripes, shapes, panels, and details.

Every concept must read at a glance as a vehicle FULLY WRAPPED in the base color with the accents applied over it.

# ONE design signature, restated on every view (cross-view cohesion — do this for EVERY direction)

Before writing any view prompt, fix the direction's DESIGN SIGNATURE in a single sentence: its base color, its accent colors, and its finish — plus, when the design is directional (a gradient, fade, ombré, or color-to-color flow), the direction of that flow. Then RESTATE that same signature, in the same concrete words and hex codes, inside EVERY view prompt. All views of a direction must describe ONE identical design, never three independent interpretations: the renderer derives the other views from a shared reference render, so any drift between prompts shows up as views that disagree on base color or finish.

For EVERY direction you ALSO output a structured "gradient" descriptor that captures this directional flow as data (a deterministic post-process uses it to pin the rendered direction, since the renderer cannot be trusted to read direction from prose):
- If the design is a directional gradient, fade, ombré, or any color-to-color flow along the vehicle: set "directional": true, "frontHex": the exact hex of the color at the FRONT of the vehicle (grille/hood/front bumper), and "rearHex": the exact hex of the color at the REAR (tailgate/rear bumper). These MUST match the front→rear flow you describe in the prose prompts.
- If the design is NOT directional (a single solid base color, or non-directional graphics): set "directional": false and repeat the single base color hex in both "frontHex" and "rearHex".
- Use the brief's exact hex codes. Never invent a color for this descriptor that is not in the design.

GRADIENT / DIRECTIONAL designs — map the ONE flow onto each view (this is what keeps the views coherent):
- Default direction: the FRONT of the vehicle is one gradient endpoint and the REAR is the other (e.g. gloss black at the front flowing to bright cyan at the rear). State the exact gradient endpoints (hex codes) and the front→rear direction in EVERY view prompt.
- "front": render the FRONT END of the gradient (its start color) across the hood and front fascia.
- "back": render the REAR END of the gradient (its finish color).
- "driver": show the FULL front-to-rear transition flowing across the doors and panels.
- "passenger": the exact MIRROR of the driver side — the identical transition, same endpoints — so both sides match.
- "top": carry the same front-to-rear transition along the roof.
Never let one view collapse to a single flat color or reverse the flow.

# How the image model works (write every prompt for this)

Each prompt is used for STRUCTURE-CONDITIONED img2img against a clean studio render of that exact view of the vehicle. Every single view prompt MUST:

- Instruct the model to follow the vehicle's actual body panels and geometry exactly — the wrap design conforms to the real surfaces.
- Instruct the model to keep windows, wheels, tires, headlights, taillights, mirrors, grille, and the plain light studio background completely unchanged. Only painted/wrapped body surfaces change.
- Describe the design in concrete visual language: colors (use the exact hex codes and film names given), shapes, where elements sit on which panels, finish (gloss/matte/satin/chrome/color-shift/carbon texture).
- Be 60–120 words. Dense and concrete. No meta commentary, no "imagine", no instructions about file formats.

# Hard rules (never break these, in any direction, in any view)

1. NO TEXT OF ANY KIND in the generated image. Every prompt must explicitly forbid text, letters, words, numbers, logos, emblems, badges, brandmarks, and typography of any kind. Misspelled AI text ruins a concept.
2. THE CUSTOMER'S LOGO IS NEVER RENDERED BY THE IMAGE MODEL. Never describe the logo, its contents, its colors as a logo, or its file. The real logo file is composited as a separate layer later. Where the brief assigns logo placement zones, every prompt covering those zones must instead reserve CLEAR SPACE there: a clean, calm, low-detail area painted in the SAME BASE WRAP COLOR as the surrounding panel (never white, never a contrasting block) with no busy pattern, sized generously on that panel, so the logo can be placed on it afterward AND so that if no logo is added the reserved area blends invisibly into the wrap rather than reading as a stray white box.
3. RESPECT EXCLUSIONS — but WRAP what is included. On a partial wrap, the WRAPPED panels still get the full design: the base color and accents cover them. ONLY the panels the customer excluded keep factory paint — say that explicitly for those panels ("the [excluded zone] keeps its original factory paint, untouched"). Never leave a wrapped panel in factory paint.
4. Use ONLY the colors provided in the brief. Black, white, and grey may be used as supporting or balancing tones, but NEVER as the dominant base color unless the customer explicitly chose that color as their base. Do not invent new brand colors.

# Per-view guidance

- "front": hood, front bumper, front fascia. The face of the design — strongest brand color statement. Keep grille and lights untouched.
- "driver": full left side. The largest canvas: this is where the main design motion lives, flowing front to rear across doors and panels.
- "passenger": full right side. MIRROR the driver side's design so the vehicle reads as one coherent wrap — describe it as the mirrored continuation of the same side design.
- "back": rear doors/tailgate and rear bumper. Simpler than the sides; carries the design to a clean conclusion. Keep taillights and glass untouched.
- "top": roof, viewed from above. Usually the simplest surface — base color or a single bold graphic element; mention roof-only treatments here if the brief asks for them.

Keep the design CONTINUOUS across views: same palette, same motif, same finish story on every view of a direction. RENDER-STYLE CONSISTENCY (critical): every view of a direction MUST render in the SAME visual style and the SAME level of photographic realism — pick one treatment (a clean photographic studio look) and apply it identically to all of front, driver, passenger, back, and top. NEVER return one view as a photorealistic photo and another as a flat or cel-shaded illustration; all views must look like one matched set shot the same way.

# Output

Return ONLY JSON matching the provided schema: { "directions": [ { "key", "title", "summary", "gradient", "viewPrompts" } ] } with keys exactly "literal", "bolder", "minimal" in that order, gradient = { "directional", "frontHex", "rearHex" }, and viewPrompts containing exactly the requested views.`;

// ---------------------------------------------------------------------------
// System prompt — iteration parsing
// ---------------------------------------------------------------------------

export const ITERATION_SYSTEM_PROMPT = `You are the iteration parser for Alpha Wolf Wrap Studio's vehicle-wrap designer. A customer is looking at a generated wrap concept and asked for a change. Your job: figure out which views the change touches, and write ONE edit instruction for a composition-preserving image edit model (FLUX Kontext style).

# Rules

1. "affectedViews" must be the SMALLEST subset of the provided views whose appearance actually changes. A hood change touches the views where the hood is visible (typically "front" and "top"), not the sides. A whole-design change (e.g. "brighter colors overall") touches every view. Never include a view the edit leaves pixel-identical.
2. "editPrompt" is one Kontext-style instruction: state the specific change, then anchor everything else, e.g. "change the hood to matte black, keep everything else exactly the same". It is applied to each affected view's current image. 15–60 words. Concrete colors (hex if known from the current prompts), concrete panels, concrete finishes.
3. The edit must preserve composition: never instruct the model to move, add, or remove body panels, windows, wheels, lights, or the plain studio background.
4. NO TEXT, letters, words, numbers, logos, emblems, or brandmarks may be introduced by the edit — the customer's logo is composited separately and is never AI-rendered. If the request asks for text or a logo in the image, translate it into reserving clean clear space in that area instead.
5. "title" is a customer-facing label for this revision (max 40 characters, plain language, e.g. "Matte black hood").

Use the concept summary and the current view prompts to understand what is on each view today.

# Output

Return ONLY JSON matching the provided schema: { "affectedViews", "editPrompt", "title" }.`;

// ---------------------------------------------------------------------------
// User-message builders (deterministic, fully derived from the input — they
// are part of the versioned prompt surface).
// ---------------------------------------------------------------------------

// VIEW_ORDER is THE canonical order shared with the panel-numbering system
// (packages/db svg/numbering) — never redefine it here, or sheet numbering and
// prompt ordering drift apart. Unknown view names sort last, stably.
export function orderViews(views: string[]): string[] {
  return [...views].sort((a, b) => {
    const ia = VIEW_ORDER.indexOf(a);
    const ib = VIEW_ORDER.indexOf(b);
    return (ia === -1 ? VIEW_ORDER.length : ia) - (ib === -1 ? VIEW_ORDER.length : ib);
  });
}

function describeColor(c: NonNullable<NonNullable<BriefData['colors']>['picks']>[number]): string {
  const parts = [c.hex];
  if (c.role) parts.push(`(${c.role})`);
  const film = [c.brand, c.name, c.sku && `SKU ${c.sku}`].filter(Boolean).join(' ');
  if (film) parts.push(`— film: ${film}`);
  if (c.finish) parts.push(`— finish: ${c.finish}`);
  return parts.join(' ');
}

export function buildCompileUserMessage(input: CompileBriefInput): string {
  const { briefData: brief, vehicle, panelsByView, logoZones } = input;
  const views = orderViews(input.views);
  const lines: string[] = [];

  lines.push('# Vehicle');
  lines.push(`${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.bodyType})`);
  lines.push('');
  lines.push('# Views to generate');
  lines.push(views.join(', '));

  if (panelsByView && Object.keys(panelsByView).length > 0) {
    lines.push('');
    lines.push('# Panels visible per view');
    for (const view of views) {
      const panels = panelsByView[view];
      if (panels?.length) lines.push(`- ${view}: ${panels.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('# Wrap coverage');
  if (brief.zones?.includedPanelIds && brief.zones.includedPanelIds.length > 0) {
    lines.push(
      `PARTIAL wrap: the customer selected ${brief.zones.includedPanelIds.length} specific zone(s) to wrap. ` +
        'Every panel outside the selected zones keeps factory paint — state this explicitly in each prompt.',
    );
  } else {
    lines.push('FULL wrap: every painted body panel is wrapped.');
  }

  if (logoZones && logoZones.length > 0) {
    lines.push('');
    lines.push('# Logo placement (CLEAR-SPACE RULE APPLIES)');
    lines.push(
      `The customer's logo will be composited later onto: ${logoZones.join(', ')}. ` +
        'Do NOT render or describe the logo. In every prompt covering these zones, reserve clean, ' +
        'low-detail clear space painted in the SAME base wrap color as the surrounding panel (never ' +
        'white, never a contrasting block) so the reserved area blends into the wrap if no logo is added.',
    );
  }

  const picks = brief.colors?.picks ?? [];
  if (picks.length > 0) {
    lines.push('');
    lines.push('# Colors (use exactly these)');
    for (const c of picks) lines.push(`- ${describeColor(c)}`);
    // Base-color contract (Goal 15 D1): the orchestrator must establish ONE
    // dominant base color for the bodywork and never silently default to the
    // factory-white vehicle. Prefer an explicit 'primary' role; else the first
    // pick. The customer's own words (Style, below) can still override which
    // color is the base — the system prompt resolves that conflict.
    const basePick = picks.find((c) => c.role === 'primary') ?? picks[0];
    if (basePick) {
      lines.push('');
      lines.push(
        `BASE COLOR: ${basePick.hex} covers most of the wrapped bodywork on every view — unless ` +
          "the customer's own words below name a different base/dominant color, in which case that " +
          'wins. The remaining colors are accents (stripes, shapes, details) laid over the base. Do ' +
          'NOT leave wrapped panels in factory paint and do NOT default to white.',
      );
    }
  }
  if (brief.colors?.extractedFromLogo?.length) {
    lines.push(
      "Brand palette extracted from the customer's logo file (these are LOGO colors for reference " +
        `only — do NOT treat them as the wrap's base color): ${brief.colors.extractedFromLogo.join(', ')}`,
    );
  }

  if (brief.style?.presets?.length || brief.style?.prompt) {
    lines.push('');
    lines.push('# Style');
    if (brief.style.presets?.length) lines.push(`Presets: ${brief.style.presets.join(', ')}`);
    if (brief.style.prompt) lines.push(`Customer's own words: ${brief.style.prompt}`);
  }

  if (brief.materials?.tier) {
    const tier = MATERIAL_TIERS.find((t) => t.id === brief.materials?.tier);
    lines.push('');
    lines.push('# Material / finish');
    lines.push(tier ? `${tier.label} — ${tier.blurb}` : brief.materials.tier);
  }

  const zoneNotes = Object.values(brief.zoneNotes ?? {}).filter(Boolean);
  if (zoneNotes.length > 0) {
    lines.push('');
    lines.push('# Zone-specific instructions from the customer');
    for (const note of zoneNotes) lines.push(`- ${note}`);
  }

  // DELIBERATE omissions from the prompt: extras.dotNumber is TEXT (USDOT/MC
  // number) — the no-text rule forbids AI-rendering it; it is applied
  // downstream as document/layer text (export spec pack), like the logo.
  // brief.tint only affects window glass, which every prompt keeps unchanged.
  const extras = brief.extras;
  const extraLines: string[] = [];
  if (extras?.chromeDelete)
    extraLines.push('Chrome delete: factory chrome trim becomes gloss or satin black.');
  if (extras?.roofOnlyColorChange)
    extraLines.push('Roof-only color change: the roof gets its own solid color treatment.');
  if (extras?.pinstripeAccent)
    extraLines.push('Pinstripe accent: a thin accent pinstripe along the body line.');
  if (extras?.ppfZones)
    extraLines.push(
      'PPF zones: protective film areas are clear and do not change the visible design.',
    );
  if (extraLines.length > 0) {
    lines.push('');
    lines.push('# Extras');
    for (const l of extraLines) lines.push(`- ${l}`);
  }

  const photoNotes = (brief.photos ?? []).map((p) => p.note).filter((n): n is string => Boolean(n));
  if (photoNotes.length > 0) {
    lines.push('');
    lines.push("# Notes about the customer's real vehicle (from their photos)");
    for (const n of photoNotes) lines.push(`- ${n}`);
  }

  if (brief.aiNotes) {
    lines.push('');
    lines.push('# Customer notes for the designer');
    lines.push(brief.aiNotes);
  }

  lines.push('');
  lines.push(
    `Compile this brief into the three concept directions (literal, bolder, minimal), with one 60–120 word image prompt for each of: ${views.join(', ')}.`,
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Photo-render prompt (Goal 21 D2, plan D-B + D-D). Versioned independently
// from ORCHESTRATOR_PROMPT_VERSION so changes here do not bump the template
// orchestrator's provenance record. Editing the text below requires bumping
// PHOTO_PROMPT_VERSION so rendered photos are traceable to their exact prompt.
// ---------------------------------------------------------------------------

/**
 * Version string for the on-photo i2i render prompt. Recorded in run provenance
 * (via the job record) so any photo render can be traced to the exact instruction
 * that produced it. Decoupled from ORCHESTRATOR_PROMPT_VERSION: changes here do
 * NOT require a bump there, and vice versa.
 */
export const PHOTO_PROMPT_VERSION = 'p1';

/**
 * Build the image-to-image instruction that applies a concept's design summary
 * to the customer's REAL vehicle photo. The returned string is the "prompt"
 * field submitted to the nano-banana edit model (fal-ai/nano-banana/edit) with
 * the customer photo as imageUrls[0].
 *
 * Design rules enforced here (see plan D-B and D-D):
 * - Applies the concept's design, not a new creative interpretation.
 * - Preserves vehicle shape, perspective, lighting, and photo background exactly.
 * - No text, letters, numbers, logos, emblems, or badges are rendered.
 * - Clear space is reserved where a logo would sit; the real logo is composited
 *   after rendering (never AI-generated).
 * - Output stays photorealistic so the customer sees their actual vehicle wrapped.
 */
export function buildPhotoRenderPrompt(input: { summary: string }): string {
  return (
    `Apply this wrap design to the vehicle shown in the supplied photo: ${input.summary}. ` +
    `Restyle only the painted body panels to match the described wrap design. ` +
    `Preserve the vehicle's exact shape, body proportions, perspective, and all physical features. ` +
    `Preserve the photo's background, lighting direction, and shadows exactly as they appear. ` +
    `Leave windows, wheels, tires, headlights, taillights, mirrors, grille, and any non-body trim completely unchanged. ` +
    `Render NO text, letters, words, numbers, logos, emblems, badges, or brandmarks of any kind anywhere on the vehicle. ` +
    `Where a logo would sit (any large, calm, low-detail panel area), leave clean, uncluttered wrap-color space so a real logo can be composited afterward. ` +
    `Keep the result photorealistic: the output must look like a photograph of a real wrapped vehicle, not an illustration or rendering.`
  );
}

export function buildIterationUserMessage(input: CompileIterationInput): string {
  const views = orderViews(input.views);
  const lines: string[] = [];

  lines.push('# Chosen concept');
  lines.push(input.conceptSummary);
  lines.push('');
  lines.push('# Current view prompts');
  for (const view of views) {
    const prompt = input.viewPrompts[view];
    if (prompt) lines.push(`- ${view}: ${prompt}`);
  }
  lines.push('');
  lines.push('# Available views');
  lines.push(views.join(', '));
  lines.push('');
  lines.push("# Customer's change request");
  lines.push(input.instruction);

  return lines.join('\n');
}
