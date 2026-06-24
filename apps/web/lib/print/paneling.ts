// Paneling / tiling engine (Goal 22 / D2) — the safety-critical core.
//
// Given a shop's EFFECTIVE printable width and per-wrap-panel curvature-corrected
// dimensions, split each panel into print tiles that the roll-fed printer can
// physically lay down: every tile width <= effective media width, adjacent tiles
// share a configurable overlap (vinyl is lapped at the seam), and a bleed margin
// extends the art past the trim edge.
//
// CARDINAL INVARIANT: never short. For each panel the union of tiles, net of
// overlaps, covers at least the panel's true (already curvature-safe) extent on
// the tiled axis, plus bleed. No tile ever exceeds the effective media width.
//
// Seam policy (D-6): each wrap "panel" is a body part, so panel-to-panel seams
// already fall on body breaks; we never tile across a body break. Interior seams
// (a panel wider than the media) are even splits; overlap is shop-configurable.
//
// Orientation (D-8): we tile across whichever physical axis yields the FEWEST
// tiles (the other axis runs down the unlimited roll feed), tie-broken by least
// media area. Fewer tiles = fewer seams = fewer failure points.
//
// Pure module — unit-tested in tests/print-paneling.test.ts. No I/O, no DB.

import type { CurvatureSource } from './curvature';

const EPS = 1e-9;

export interface ShopPrintProfileInput {
  /** Tile to THIS width, never the nominal media width. */
  effectiveWidthIn: number;
  /** Overlap between adjacent tiles (the lapped seam). >= 0, < effective width. */
  overlapIn: number;
  /** Art margin added to the outer edges so the print extends past the cut. >= 0. */
  bleedIn: number;
}

export interface WrapPanelInput {
  id: string;
  name: string;
  view: string;
  /** Curvature-corrected, never-short physical width (across the view). */
  safeWidthIn: number;
  /** Curvature-corrected, never-short physical height (down the view). */
  safeHeightIn: number;
  source?: CurvatureSource;
  estimated?: boolean;
  needsMeasurement?: boolean;
  warning?: string | null;
}

export interface PrintTile {
  /** 1-based strip index within the panel. */
  index: number;
  /** Across-media width of this tile (<= effective width). */
  widthIn: number;
  /** Feed-direction length of this tile. */
  lengthIn: number;
  /** Position of this tile within the panel's bleed-extended across span. */
  acrossStartIn: number;
  acrossEndIn: number;
  /** Overlap shared with the previous / next tile (0 at the panel edges). */
  overlapPrevIn: number;
  overlapNextIn: number;
}

export interface PaneledPanel {
  id: string;
  name: string;
  view: string;
  /** Which physical axis runs ACROSS the media. */
  acrossAxis: 'width' | 'height';
  /** Tiled dimension + 2·bleed. */
  acrossExtentIn: number;
  /** Non-tiled dimension + 2·bleed (runs down the roll feed). */
  feedExtentIn: number;
  tiles: PrintTile[];
  /** Media consumed for this panel: n_tiles · feedExtent / 12 (D-10, conservative). */
  linearFeet: number;
  /** Sum of tile area in sq ft (includes overlap + bleed waste). */
  mediaAreaSqFt: number;
  source?: CurvatureSource;
  estimated: boolean;
  needsMeasurement: boolean;
  warning: string | null;
}

export interface PanelizeResult {
  effectiveWidthIn: number;
  overlapIn: number;
  bleedIn: number;
  panels: PaneledPanel[];
  skipped: Array<{ id: string; name: string; reason: string }>;
  totalLinearFeet: number;
  totalMediaAreaSqFt: number;
  estimated: boolean;
  needsMeasurement: boolean;
}

interface Tiling {
  count: number;
  tileWidthIn: number;
  acrossExtentIn: number;
  feedExtentIn: number;
  mediaAreaSqFt: number;
}

/**
 * Tile an across-extent A (already bleed-extended) into strips <= media width M
 * with overlap o. Equal strips of width w where n·w - (n-1)·o = A, so the union
 * net of overlaps is EXACTLY A (never short). Returns null if A needs a strip
 * wider than M can ever provide (shouldn't happen for valid inputs).
 */
function tileAcross(acrossTotal: number, feedTotal: number, M: number, o: number): Tiling | null {
  let count: number;
  let tileWidthIn: number;
  if (acrossTotal <= M + EPS) {
    count = 1;
    tileWidthIn = acrossTotal;
  } else {
    // n = ceil((A - M) / (M - o)) + 1, then equal strips.
    const step = M - o;
    count = Math.ceil((acrossTotal - M) / step - EPS) + 1;
    tileWidthIn = (acrossTotal + (count - 1) * o) / count;
  }
  if (!(tileWidthIn > 0) || tileWidthIn > M + EPS) return null;
  return {
    count,
    tileWidthIn,
    acrossExtentIn: acrossTotal,
    feedExtentIn: feedTotal,
    mediaAreaSqFt: (count * tileWidthIn * feedTotal) / 144,
  };
}

/** Build the per-tile records for a chosen tiling. */
function buildTiles(t: Tiling, o: number): PrintTile[] {
  const tiles: PrintTile[] = [];
  const stride = t.tileWidthIn - o;
  for (let i = 0; i < t.count; i++) {
    const start = i * stride;
    tiles.push({
      index: i + 1,
      widthIn: t.tileWidthIn,
      lengthIn: t.feedExtentIn,
      acrossStartIn: start,
      acrossEndIn: start + t.tileWidthIn,
      overlapPrevIn: i > 0 ? o : 0,
      overlapNextIn: i < t.count - 1 ? o : 0,
    });
  }
  return tiles;
}

function panelizeOne(
  panel: WrapPanelInput,
  M: number,
  o: number,
  bleed: number,
): PaneledPanel | { skip: string } {
  const w = panel.safeWidthIn;
  const h = panel.safeHeightIn;
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return { skip: 'missing_dimensions' };
  }
  const widthTotal = w + 2 * bleed;
  const heightTotal = h + 2 * bleed;

  // Option 1: width runs across the media, height down the feed.
  const optWidth = tileAcross(widthTotal, heightTotal, M, o);
  // Option 2: height runs across the media, width down the feed.
  const optHeight = tileAcross(heightTotal, widthTotal, M, o);

  if (!optWidth && !optHeight) return { skip: 'untileable' };

  // Choose fewest tiles, tie-break least media area, final tie prefer the
  // orientation whose tiled axis is the smaller physical dimension (longer side
  // runs down the unlimited roll).
  let acrossAxis: 'width' | 'height';
  let chosen: Tiling;
  if (!optHeight || (optWidth && pickWidth(optWidth, optHeight, w, h))) {
    acrossAxis = 'width';
    chosen = optWidth!;
  } else {
    acrossAxis = 'height';
    chosen = optHeight;
  }

  const tiles = buildTiles(chosen, o);
  return {
    id: panel.id,
    name: panel.name,
    view: panel.view,
    acrossAxis,
    acrossExtentIn: chosen.acrossExtentIn,
    feedExtentIn: chosen.feedExtentIn,
    tiles,
    linearFeet: (chosen.count * chosen.feedExtentIn) / 12,
    mediaAreaSqFt: chosen.mediaAreaSqFt,
    source: panel.source,
    estimated: panel.estimated ?? false,
    needsMeasurement: panel.needsMeasurement ?? false,
    warning: panel.warning ?? null,
  };
}

/** True when the width-across option should win over the height-across option. */
function pickWidth(width: Tiling, height: Tiling, w: number, h: number): boolean {
  if (width.count !== height.count) return width.count < height.count;
  if (Math.abs(width.mediaAreaSqFt - height.mediaAreaSqFt) > EPS) {
    return width.mediaAreaSqFt < height.mediaAreaSqFt;
  }
  return w <= h; // tiled axis is the smaller physical dimension
}

export function panelize(input: {
  profile: ShopPrintProfileInput;
  panels: WrapPanelInput[];
}): PanelizeResult {
  const { effectiveWidthIn: M, overlapIn: o, bleedIn: bleed } = input.profile;
  if (!(M > 0) || !Number.isFinite(M)) {
    throw new Error('panelize: effectiveWidthIn must be positive');
  }
  if (!(o >= 0) || o >= M) {
    throw new Error('panelize: overlapIn must be >= 0 and < effectiveWidthIn');
  }
  if (!(bleed >= 0)) {
    throw new Error('panelize: bleedIn must be >= 0');
  }

  const panels: PaneledPanel[] = [];
  const skipped: PanelizeResult['skipped'] = [];
  for (const p of input.panels) {
    const out = panelizeOne(p, M, o, bleed);
    if ('skip' in out) {
      skipped.push({ id: p.id, name: p.name, reason: out.skip });
    } else {
      panels.push(out);
    }
  }

  const totalLinearFeet = panels.reduce((s, p) => s + p.linearFeet, 0);
  const totalMediaAreaSqFt = panels.reduce((s, p) => s + p.mediaAreaSqFt, 0);
  return {
    effectiveWidthIn: M,
    overlapIn: o,
    bleedIn: bleed,
    panels,
    skipped,
    totalLinearFeet,
    totalMediaAreaSqFt,
    estimated: panels.some((p) => p.estimated),
    needsMeasurement: panels.some((p) => p.needsMeasurement),
  };
}
