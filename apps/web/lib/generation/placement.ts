// Pure placement math for the final-run editor handoff (Goal 7 D6). Server
// and unit tests share these; no DB or storage imports.
//
// Coordinate model (ADR-0006 + CanvasStage): element x/y are "panel-local" in
// the schema's words, but panel groups add NO translation of their own — the
// per-view <Group> carries the only offset. So element coordinates live in the
// TEMPLATE's SVG space (mm×10), shared by every panel of the same view. A
// generated view render therefore covers the view when placed at the view's
// content-bbox origin and uniformly scaled to cover the bbox.

import { geometry } from '@alphawolf/canvas';

export type PanelGeom = {
  id: string;
  view: string;
  svgPath: string;
  printableAreaMm2: number;
};

export type Box = { minX: number; minY: number; width: number; height: number };

function panelBbox(p: PanelGeom): Box | null {
  try {
    const rings = geometry.parsePath(p.svgPath);
    if (rings.length === 0) return null;
    const b = geometry.bbox(rings);
    const width = b.maxX - b.minX;
    const height = b.maxY - b.minY;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    return { minX: b.minX, minY: b.minY, width, height };
  } catch {
    return null;
  }
}

/** Union content bbox of a view's panels (template space, mm×10). */
export function viewBbox(panels: PanelGeom[]): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of panels) {
    const b = panelBbox(p);
    if (!b) continue;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.minX + b.width > maxX) maxX = b.minX + b.width;
    if (b.minY + b.height > maxY) maxY = b.minY + b.height;
  }
  if (!Number.isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) return null;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The panel a view's generated render is parented to: largest by precomputed
 * printable area; 0 is a "not computed" sentinel (schema note), so fall back
 * to outline-bbox area when areas are missing.
 */
export function largestPanel(panels: PanelGeom[]): PanelGeom | null {
  if (panels.length === 0) return null;
  const withRealArea = panels.filter((p) => p.printableAreaMm2 > 0);
  if (withRealArea.length > 0) {
    return withRealArea.reduce((a, b) => (b.printableAreaMm2 > a.printableAreaMm2 ? b : a));
  }
  let best: PanelGeom | null = null;
  let bestArea = -1;
  for (const p of panels) {
    const b = panelBbox(p);
    const area = b ? b.width * b.height : 0;
    if (area > bestArea) {
      bestArea = area;
      best = p;
    }
  }
  return best ?? panels[0] ?? null;
}

export type Placement = { x: number; y: number; scale: number };

/**
 * Uniform "cover" placement: scale so the image covers the box in both axes
 * (preserving aspect — the box's longer-relative side wins), anchored at the
 * box origin. Overflow clips against the panel's wrap-safe clipFunc on render.
 */
export function coverPlacement(box: Box, naturalW: number, naturalH: number): Placement {
  const w = Math.max(1, naturalW);
  const h = Math.max(1, naturalH);
  const scale = Math.max(box.width / w, box.height / h);
  return { x: box.minX, y: box.minY, scale };
}

/**
 * Centered "contain" placement at a fraction of the box width (logo drop:
 * visible, obviously movable, never wall-to-wall).
 */
export function centeredPlacement(
  box: Box,
  naturalW: number,
  naturalH: number,
  widthFraction = 0.45,
): Placement {
  const w = Math.max(1, naturalW);
  const h = Math.max(1, naturalH);
  const target = box.width * widthFraction;
  const scale = Math.min(target / w, box.height / h);
  return {
    x: box.minX + (box.width - w * scale) / 2,
    y: box.minY + (box.height - h * scale) / 2,
    scale,
  };
}
