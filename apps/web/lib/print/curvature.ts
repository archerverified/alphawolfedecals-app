// Curvature correction (Goal 22 / D4) - the print-engine's "never print short"
// dimension layer. Consumes the landed spike decision
// (docs/product/2026-06-22-spike-curvature-correction.md, GO conditional).
//
// WHY: a flat 2D template is the SHADOW of a curved 3D body. Curved panels need
// more vinyl than their shadow (an F-150 rear door is ~52 in flat but ~60 in of
// real vinyl, +15.4%). Printing the flat number is a guaranteed reprint. No
// off-the-shelf source publishes true curvature-aware panel dimensions, so we
// apply a conservative per-(body, panel-class) multiplier k, biased UP, plus a
// one-sided safety margin keyed on how confident we are in k.
//
// HONEST CLAIM: "never short, with a known and shrinking over-cut margin." NOT
// "accurate." Every estimated dimension carries a confidence label + warning.
// Real shop measurements promote a panel from `class_prior` to `measured_in_shop`
// and shrink its margin.
//
// Pure module - unit-tested in tests/print-curvature.test.ts. No I/O, no DB.

export type CurvatureSource = 'measured_in_shop' | 'calibrated_sibling' | 'class_prior' | 'unknown';

// One-sided never-short margins by confidence (D-4). Tighter as confidence rises;
// the print path never falls below true·(1+margin).
export const CURVATURE_MARGINS: Record<CurvatureSource, number> = {
  measured_in_shop: 0.02,
  calibrated_sibling: 0.05,
  class_prior: 0.08,
  unknown: 0.1,
};

// Conservative worst-case fallback for the `unknown` case (D-3). Anchored on the
// largest compound-curve prior the spike modelled (deep front bumper k≈1.27) so
// an unmeasured panel is NEVER short, but it is loudly flagged needsMeasurement.
export const UNKNOWN_FALLBACK_K = 1.27;
export const UNKNOWN_FALLBACK_MARGIN = 0.1;

export interface CurvatureClassPrior {
  bodyType: string;
  panelClass: string;
  viewAxis: 'length' | 'width';
  /** Conservative multiplier, biased up. */
  k: number;
  /** One-sided never-short margin for this prior. */
  margin: number;
}

// Per-panel curvature carried on vehicle_panels (curvature_factor/source/margin).
export interface PanelCurvature {
  factor: number | null;
  source: CurvatureSource;
  margin: number | null;
}

export interface ResolvedCurvature {
  k: number;
  margin: number;
  source: CurvatureSource;
  /** false only when a real shop measurement set the factor. */
  estimated: boolean;
  /** true only for `unknown` - no factor, no sibling, no prior. */
  needsMeasurement: boolean;
  /** Human-readable caution, null when measured. */
  warning: string | null;
}

const WARNINGS: Record<CurvatureSource, string | null> = {
  measured_in_shop: null,
  calibrated_sibling: 'Estimated from a measured sibling panel. Verify before printing.',
  class_prior:
    'Estimated from a class prior (no measured data for this panel). Never short, but measure to confirm.',
  unknown:
    'No curvature data for this panel. Using a conservative worst-case estimate. MEASURE before printing.',
};

/** Never let curvature SHRINK a panel: a k < 1 (bad data) is clamped up to 1. */
function clampK(k: number): number {
  if (!Number.isFinite(k) || k < 1) return 1;
  return k;
}

/** Margin is one-sided and additive; a negative value would print short. */
function clampMargin(m: number): number {
  if (!Number.isFinite(m) || m < 0) return 0;
  return m;
}

/**
 * Resolve the curvature multiplier + margin + confidence for one panel, in the
 * conservative resolution order from the spike §5:
 *   1. a panel-level curvature_factor (label/margin driven by its source),
 *   2. else a measured sibling of the same (body, panel-class) -> calibrated,
 *   3. else the (body, panel-class, axis) class prior -> warn estimated,
 *   4. else unknown -> conservative fallback so it is never short + loud warning.
 */
export function resolveCurvature(input: {
  panel?: PanelCurvature | null;
  siblingMeasured?: { factor: number } | null;
  prior?: CurvatureClassPrior | null;
}): ResolvedCurvature {
  const { panel, siblingMeasured, prior } = input;

  if (panel && panel.factor != null && Number.isFinite(panel.factor)) {
    const source = panel.source;
    const margin = clampMargin(panel.margin ?? CURVATURE_MARGINS[source]);
    return {
      k: clampK(panel.factor),
      margin,
      source,
      estimated: source !== 'measured_in_shop',
      needsMeasurement: source === 'unknown',
      warning: WARNINGS[source],
    };
  }

  if (siblingMeasured && Number.isFinite(siblingMeasured.factor)) {
    return {
      k: clampK(siblingMeasured.factor),
      margin: CURVATURE_MARGINS.calibrated_sibling,
      source: 'calibrated_sibling',
      estimated: true,
      needsMeasurement: false,
      warning: WARNINGS.calibrated_sibling,
    };
  }

  if (prior && Number.isFinite(prior.k)) {
    return {
      k: clampK(prior.k),
      margin: clampMargin(prior.margin ?? CURVATURE_MARGINS.class_prior),
      source: 'class_prior',
      estimated: true,
      needsMeasurement: false,
      warning: WARNINGS.class_prior,
    };
  }

  return {
    k: UNKNOWN_FALLBACK_K,
    margin: UNKNOWN_FALLBACK_MARGIN,
    source: 'unknown',
    estimated: true,
    needsMeasurement: true,
    warning: WARNINGS.unknown,
  };
}

export interface CorrectedSize {
  flatIn: number;
  /** flat · k - the estimated true developed-surface extent. */
  trueIn: number;
  /** true · (1 + margin) - the never-short dimension the engine cuts to. */
  safeIn: number;
  source: CurvatureSource;
  estimated: boolean;
  needsMeasurement: boolean;
  warning: string | null;
}

/** Apply a resolved curvature to one flat dimension (inches). Never short. */
export function applyCurvature(flatIn: number, resolved: ResolvedCurvature): CorrectedSize {
  const flat = Number.isFinite(flatIn) && flatIn > 0 ? flatIn : 0;
  const trueIn = flat * resolved.k;
  const safeIn = trueIn * (1 + resolved.margin);
  return {
    flatIn: flat,
    trueIn,
    safeIn,
    source: resolved.source,
    estimated: resolved.estimated,
    needsMeasurement: resolved.needsMeasurement,
    warning: resolved.warning,
  };
}

/** Which real-world extent a view spans (matches lib/brief/quality.ts viewSpanMm). */
export function viewAxisFor(view: string): 'length' | 'width' | null {
  switch (view) {
    case 'front':
    case 'back':
      return 'width';
    case 'driver':
    case 'passenger':
    case 'top':
      return 'length';
    default:
      return null;
  }
}

// Keyword -> panel class, longest/most-specific first. Used to look up a class
// prior when a panel has no measured factor. Order matters: 'quarter' before the
// generic fallback, 'bumper'/'fascia' grouped, van 'slab side' before 'side'.
const PANEL_CLASS_RULES: Array<{ re: RegExp; cls: string }> = [
  { re: /\bquarter\b/i, cls: 'quarter' },
  { re: /\b(bumper|fascia)\b/i, cls: 'bumper' },
  { re: /\b(hood|bonnet)\b/i, cls: 'hood' },
  { re: /\broof\b/i, cls: 'roof' },
  { re: /\b(fender|wing)\b/i, cls: 'fender' },
  { re: /\b(rocker|sill)\b/i, cls: 'rocker' },
  { re: /\b(tailgate|liftgate|hatch)\b/i, cls: 'tailgate' },
  { re: /\bslab[\s-]?side\b/i, cls: 'slabside' },
  { re: /\bdoor\b/i, cls: 'door' },
  { re: /\b(bed|box)\b/i, cls: 'bed' },
  { re: /\bcab\b/i, cls: 'cab' },
  { re: /\bpillar\b/i, cls: 'pillar' },
];

/** Best-effort panel class from a human panel name; 'panel' when nothing matches. */
export function classifyPanel(name: string): string {
  for (const { re, cls } of PANEL_CLASS_RULES) {
    if (re.test(name)) return cls;
  }
  return 'panel';
}
