// Pure-TS polygon math (ADR-0006 §0.2, §6). No DOM / Path2D / Canvas2D.

import type { Ring } from './path-parse.js';

/** Axis-aligned bounding box. */
export interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Ray-casting point-in-polygon for a single ring. Points exactly on an edge
 * (including vertices) are considered INSIDE — important so an element snapped
 * flush to the printable boundary is not flagged out-of-bounds.
 */
export function pointInRing(px: number, py: number, ring: Ring): boolean {
  const n = ring.length;
  if (n < 3) return false;

  // On-edge test first (inclusive boundary).
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (pointOnSegment(px, py, a[0]!, a[1]!, b[0]!, b[1]!)) return true;
  }

  // Ray cast to +x.
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const ay = a[1]!;
    const by = b[1]!;
    const ax = a[0]!;
    const bx = b[0]!;
    const intersects = ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** True when (px,py) lies on segment (ax,ay)-(bx,by) within an epsilon. */
function pointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const EPS = 1e-7;
  // Collinearity via cross product.
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  const segLen = Math.hypot(bx - ax, by - ay);
  if (segLen === 0) {
    return Math.abs(px - ax) < EPS && Math.abs(py - ay) < EPS;
  }
  if (Math.abs(cross) / segLen > EPS) return false;
  // Within the segment bounds (dot product in [0, len^2]).
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  if (dot < -EPS) return false;
  const sq = segLen * segLen;
  return dot <= sq + EPS;
}

/**
 * Point-in-polygon for a multi-ring polygon using the even-odd fill rule:
 * a point inside an odd number of rings is inside (so holes work). Boundary
 * points on any ring are inside.
 */
export function pointInPolygon(px: number, py: number, rings: Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    if (pointInRing(px, py, ring)) {
      // On-boundary short-circuits to inside regardless of parity.
      if (isOnAnyEdge(px, py, ring)) return true;
      inside = !inside;
    }
  }
  return inside;
}

function isOnAnyEdge(px: number, py: number, ring: Ring): boolean {
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (pointOnSegment(px, py, a[0]!, a[1]!, b[0]!, b[1]!)) return true;
  }
  return false;
}

/** Bounding box of one ring. Returns a zero-box for an empty ring. */
export function ringBbox(ring: Ring): Bbox {
  if (ring.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    const x = p[0]!;
    const y = p[1]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Bounding box spanning all rings. */
export function bbox(rings: Ring[]): Bbox {
  if (rings.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    const b = ringBbox(ring);
    if (ring.length === 0) continue;
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** True when two axis-aligned bboxes overlap (touching counts as intersect). */
export function bboxIntersects(a: Bbox, b: Bbox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** True when (px,py) is within bbox `b` (inclusive). */
export function pointInBbox(px: number, py: number, b: Bbox): boolean {
  return px >= b.minX && px <= b.maxX && py >= b.minY && py <= b.maxY;
}

/**
 * Signed area of a single ring (shoelace). Positive/negative depends on winding
 * (CW vs CCW); use the sign to distinguish outer rings from holes.
 */
export function ringSignedArea(ring: Ring): number {
  const n = ring.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    sum += (b[0]! + a[0]!) * (b[1]! - a[1]!);
  }
  return sum / 2;
}

/**
 * Total enclosed area of a multi-ring polygon, accounting for holes via signed
 * area. Outer rings and holes have opposite winding in well-formed paths, so
 * summing |signed areas| over-counts; instead we sum SIGNED areas and take the
 * absolute value, which subtracts opposite-wound holes.
 */
export function polygonArea(rings: Ring[]): number {
  let total = 0;
  for (const ring of rings) {
    total += ringSignedArea(ring);
  }
  return Math.abs(total);
}
