// Element-vs-clip and path-area helpers (ADR-0006 §6).
//
// isElementInsideClip uses ray-casting point-in-polygon (pure TS, NO
// Path2D/Canvas2D) so the printable-area test is unit-testable headlessly.

import { parsePath, type Ring } from './path-parse.js';
import {
  bbox as ringsBbox,
  bboxIntersects,
  pointInPolygon,
  polygonArea,
  type Bbox,
} from './polygon.js';

/**
 * True when the element's axis-aligned bbox is fully inside the clip polygon.
 *
 * Strategy: all four bbox corners must be inside the clip (point-in-polygon),
 * AND no clip edge may cross any bbox edge. The corner test alone is unsound
 * for concave clips (a corner can be inside while an edge pokes through a
 * notch); the edge-crossing test closes that gap. Cheap for the common
 * rectangular wrap-safe area (4 point tests + edge scan).
 */
export function isElementInsideClip(elementBbox: Bbox, clipRings: Ring[]): boolean {
  if (clipRings.length === 0) return false;

  // Fast reject: bbox entirely outside the clip's own bbox.
  if (!bboxIntersects(elementBbox, ringsBbox(clipRings))) return false;

  const corners: Array<[number, number]> = [
    [elementBbox.minX, elementBbox.minY],
    [elementBbox.maxX, elementBbox.minY],
    [elementBbox.maxX, elementBbox.maxY],
    [elementBbox.minX, elementBbox.maxY],
  ];

  // 1) Every corner inside (boundary counts as inside).
  for (const [x, y] of corners) {
    if (!pointInPolygon(x, y, clipRings)) return false;
  }

  // 2) No clip edge crosses any bbox edge (guards concave notches).
  const bboxEdges: Array<[number, number, number, number]> = [
    [corners[0]![0], corners[0]![1], corners[1]![0], corners[1]![1]],
    [corners[1]![0], corners[1]![1], corners[2]![0], corners[2]![1]],
    [corners[2]![0], corners[2]![1], corners[3]![0], corners[3]![1]],
    [corners[3]![0], corners[3]![1], corners[0]![0], corners[0]![1]],
  ];
  for (const ring of clipRings) {
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      for (const e of bboxEdges) {
        if (segmentsProperlyCross(a[0]!, a[1]!, b[0]!, b[1]!, e[0]!, e[1]!, e[2]!, e[3]!)) {
          return false;
        }
      }
    }
  }

  return true;
}

/** Orientation sign of the triplet (ax,ay)->(bx,by)->(cx,cy). */
function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/**
 * True when segments p1-p2 and p3-p4 cross at an interior point (proper
 * intersection). Collinear/endpoint-touching does NOT count — an element edge
 * lying flush along the clip boundary is allowed. (Also used by offset.ts to
 * reject self-intersecting inset rings.)
 */
export function segmentsProperlyCross(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
  p4x: number,
  p4y: number,
): boolean {
  const d1 = orient(p3x, p3y, p4x, p4y, p1x, p1y);
  const d2 = orient(p3x, p3y, p4x, p4y, p2x, p2y);
  const d3 = orient(p1x, p1y, p2x, p2y, p3x, p3y);
  const d4 = orient(p1x, p1y, p2x, p2y, p4x, p4y);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Area enclosed by a path `d`, in INPUT coordinate units squared. Input is
 * mm×10, so the result is in (mm×10)² = mm²·100. Holes are subtracted via
 * signed area. Use {@link pathAreaMm2} for real square millimetres.
 */
export function pathArea(d: string): number {
  return polygonArea(parsePath(d));
}

/**
 * Printable area of a wrap-safe path `d` in real square millimetres.
 *
 * The SVG coordinate unit is mm×10, so 1 unit² = (0.1 mm)² = 0.01 mm², i.e.
 * area in unit² must be divided by 100 to get mm². A downstream PR populates
 * `vehicle_panels.printable_area_mm2` from this — keep the unit math exact.
 */
export function pathAreaMm2(d: string): number {
  return pathArea(d) / 100;
}
