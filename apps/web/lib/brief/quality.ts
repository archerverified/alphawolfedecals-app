// Logo quality gate math + parse-metadata reader (Goal 5 / B2C-004).
//
// Pure functions — unit-tested in tests/brief-quality.test.ts.
//
// PANEL PRINT SIZE — the honest version (PR #125 review finding #1): template
// doc units carry NO physical meaning (the seeded Transit SVG says
// "Coordinates are display-scaled; aspect matches stated dimensions"), so a
// fixed doc-unit→mm scale is wrong. What IS trustworthy: the vehicle's real
// overall dimensions (vehicles.length_mm/width_mm) and the panels' RELATIVE
// proportions within a view. We scale each view's panel-union to the vehicle
// extent that view faces (front/back → width, side/top → length) and size
// every panel proportionally. It's an estimate — the union of panels only
// approximately spans the vehicle — which is exactly right for a "this will
// look blurry" warning that shows its math with a "~".

import { geometry } from '@alphawolf/canvas';
import type { BriefPanel } from '@/components/brief/steps';

// Below this the print reads visibly soft at wrap viewing distance; the PRD's
// quality-gate threshold (§3 step 3).
export const MIN_LOGO_DPI = 150;

// A single wrapped panel wider than this is not a vehicle, it's a billboard —
// treat the estimate as broken and stay silent rather than print nonsense.
const MAX_PLAUSIBLE_PANEL_IN = 300;
const MIN_PLAUSIBLE_PANEL_IN = 4;

export interface UploadMeta {
  naturalWidth: number | null;
  naturalHeight: number | null;
  contentBbox: { left: number; top: number; width: number; height: number } | null;
  /** True = the FINAL png has no transparent pixel (drives the gate). */
  opaque: boolean | null;
  rembg: { requested: boolean; removed: boolean; error?: string };
}

// Defensive reader for ProjectAsset.parseMetadata (JSONB from the parse
// worker) — never trust the shape, never throw.
export function readUploadMeta(meta: unknown): UploadMeta {
  const empty: UploadMeta = {
    naturalWidth: null,
    naturalHeight: null,
    contentBbox: null,
    opaque: null,
    rembg: { requested: false, removed: false },
  };
  if (!meta || typeof meta !== 'object') return empty;
  const m = meta as Record<string, unknown>;
  const bbox = m.contentBbox as Record<string, unknown> | null | undefined;
  const bboxValid =
    bbox &&
    typeof bbox === 'object' &&
    typeof bbox.left === 'number' &&
    typeof bbox.top === 'number' &&
    typeof bbox.width === 'number' &&
    typeof bbox.height === 'number';
  const rembg =
    m.rembg && typeof m.rembg === 'object' ? (m.rembg as Record<string, unknown>) : null;
  return {
    naturalWidth: typeof m.naturalWidth === 'number' ? m.naturalWidth : null,
    naturalHeight: typeof m.naturalHeight === 'number' ? m.naturalHeight : null,
    contentBbox: bboxValid
      ? {
          left: bbox.left as number,
          top: bbox.top as number,
          width: bbox.width as number,
          height: bbox.height as number,
        }
      : null,
    opaque: typeof m.opaque === 'boolean' ? m.opaque : null,
    rembg: {
      requested: rembg?.requested === true,
      removed: rembg?.removed === true,
      error: typeof rembg?.error === 'string' ? rembg.error : undefined,
    },
  };
}

const MM_PER_INCH = 25.4;

export interface VehicleDims {
  lengthMm: number;
  widthMm: number;
}

/** The real-world extent (mm) a view faces across its drawing width. */
function viewSpanMm(view: string, dims: VehicleDims): number | null {
  switch (view) {
    case 'front':
    case 'back':
      return dims.widthMm > 0 ? dims.widthMm : null;
    case 'driver':
    case 'passenger':
    case 'top':
      return dims.lengthMm > 0 ? dims.lengthMm : null;
    default:
      return null;
  }
}

type PanelBox = { panel: BriefPanel; minX: number; maxX: number; minY: number; maxY: number };

function panelBoxes(panels: BriefPanel[]): PanelBox[] {
  const out: PanelBox[] = [];
  for (const panel of panels) {
    if (!panel.outlinePath) continue;
    try {
      const b = geometry.bbox(geometry.parsePath(panel.outlinePath));
      if (!b || !Number.isFinite(b.minX) || !Number.isFinite(b.maxX) || b.maxX <= b.minX) continue;
      if (!Number.isFinite(b.minY) || !Number.isFinite(b.maxY) || b.maxY <= b.minY) continue;
      out.push({ panel, minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY });
    } catch {
      // Unparseable outline → that panel just can't be sized.
    }
  }
  return out;
}

export interface PanelSizeIn {
  widthIn: number;
  heightIn: number;
}

/**
 * Approximate physical print size (inches) per panel: each view's panel
 * union is scaled to the vehicle extent that view faces, panels sized
 * proportionally (height uses the same mm-per-unit as width — the drawing is
 * uniform scale). Implausible results are dropped, not reported.
 */
export function panelPrintSizesIn(
  panels: BriefPanel[],
  dims: VehicleDims,
): Map<string, PanelSizeIn> {
  const sizes = new Map<string, PanelSizeIn>();
  const byView = new Map<string, PanelBox[]>();
  for (const box of panelBoxes(panels)) {
    const list = byView.get(box.panel.view) ?? [];
    list.push(box);
    byView.set(box.panel.view, list);
  }
  for (const [view, boxes] of byView) {
    const spanMm = viewSpanMm(view, dims);
    if (spanMm === null) continue;
    const unionWidth =
      Math.max(...boxes.map((b) => b.maxX)) - Math.min(...boxes.map((b) => b.minX));
    if (!Number.isFinite(unionWidth) || unionWidth <= 0) continue;
    const mmPerUnit = spanMm / unionWidth;
    for (const b of boxes) {
      const widthIn = ((b.maxX - b.minX) * mmPerUnit) / MM_PER_INCH;
      const heightIn = ((b.maxY - b.minY) * mmPerUnit) / MM_PER_INCH;
      if (
        widthIn >= MIN_PLAUSIBLE_PANEL_IN &&
        widthIn <= MAX_PLAUSIBLE_PANEL_IN &&
        heightIn >= 1 &&
        heightIn <= MAX_PLAUSIBLE_PANEL_IN
      ) {
        sizes.set(b.panel.id, { widthIn, heightIn });
      }
    }
  }
  return sizes;
}

/** Width-only view of panelPrintSizesIn (the DPI gate's original shape). */
export function panelPrintWidthsIn(panels: BriefPanel[], dims: VehicleDims): Map<string, number> {
  const widths = new Map<string, number>();
  for (const [id, s] of panelPrintSizesIn(panels, dims)) widths.set(id, s.widthIn);
  return widths;
}

/** Effective DPI when `naturalWidthPx` is printed across `widthIn` inches. */
export function effectiveDpi(naturalWidthPx: number, widthIn: number): number | null {
  if (!Number.isFinite(naturalWidthPx) || naturalWidthPx <= 0) return null;
  if (!Number.isFinite(widthIn) || widthIn <= 0) return null;
  return naturalWidthPx / widthIn;
}

export interface DpiVerdict {
  dpi: number;
  widthIn: number;
  panelName: string;
  ok: boolean;
}

/**
 * Full gate: logo px width vs the physically widest panel among
 * `restrictToIds` (the logo's assigned zones, else the brief's included
 * zones, else every panel). null = can't judge → stay silent.
 */
export function dpiVerdict(
  naturalWidthPx: number | null,
  panels: BriefPanel[],
  dims: VehicleDims,
  restrictToIds?: string[] | null,
): DpiVerdict | null {
  if (naturalWidthPx === null) return null;
  const widths = panelPrintWidthsIn(panels, dims);
  const pool =
    restrictToIds && restrictToIds.length > 0
      ? panels.filter((p) => restrictToIds.includes(p.id))
      : panels;
  let best: { panel: BriefPanel; widthIn: number } | null = null;
  for (const panel of pool) {
    const widthIn = widths.get(panel.id);
    if (widthIn === undefined) continue;
    if (!best || widthIn > best.widthIn) best = { panel, widthIn };
  }
  if (!best) return null;
  const dpi = effectiveDpi(naturalWidthPx, best.widthIn);
  if (dpi === null) return null;
  // Floor so the displayed number can never read "150" inside a sub-150
  // warning (review NIT: round-vs-threshold mismatch at e.g. 149.6).
  return {
    dpi: Math.floor(dpi),
    widthIn: Math.round(best.widthIn),
    panelName: best.panel.name,
    ok: dpi >= MIN_LOGO_DPI,
  };
}
