// Polygon inset + calibrated area (Template Studio, Goal 6). Pure TS, same
// constraints as the rest of geometry/ (ADR-0006 §0.2): no DOM / Path2D.
//
// insetRingPath generates a panel's wrap-safe path from its outline by
// offsetting every edge toward the interior. It is exact for convex polygons
// and correct for the mildly non-convex outlines panels use in practice
// (miter-joined, clamped at deep reflex corners). It is NOT a general-purpose
// polygon offset: self-intersecting results from extreme insets are rejected
// rather than repaired.
//
// pathAreaScaled is the calibrated sibling of pathAreaMm2: template documents
// are display-scaled (their unit is NOT mm×10), so a real-world area needs the
// document's mm-per-unit calibration factor, derived from the vehicle's stated
// dimensions (Studio calibration stage).

import { parsePath, type Ring } from './path-parse';
import { polygonArea, ringSignedArea } from './polygon';

/** Intersection of two infinite lines given by point + direction. Null when parallel. */
function lineIntersect(
  px: number,
  py: number,
  dx: number,
  dy: number,
  qx: number,
  qy: number,
  ex: number,
  ey: number,
): [number, number] | null {
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((qx - px) * ey - (qy - py) * ex) / denom;
  return [px + t * dx, py + t * dy];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Inset (shrink) the OUTER ring of a path `d` by `inset` document units and
 * return the result as an `M … L … Z` path. Throws when the input has no
 * usable ring, when the inset collapses the polygon, or when the result would
 * be degenerate — callers treat that as "inset too large for this panel".
 */
export function insetRingPath(d: string, inset: number): string {
  if (!Number.isFinite(inset) || inset <= 0) {
    throw new Error('[geometry] insetRingPath: inset must be a positive number');
  }
  const rings = parsePath(d);
  const ring = rings[0];
  if (!ring || ring.length < 3) {
    throw new Error('[geometry] insetRingPath: path has no polygon ring');
  }

  const area = ringSignedArea(ring);
  if (Math.abs(area) < 1e-6) {
    throw new Error('[geometry] insetRingPath: ring has no area');
  }
  // Which side of a directed edge the interior lies on follows from the sign
  // of the shoelace sum (pure algebra — holds regardless of the y-down SVG
  // convention). ringSignedArea uses the trapezoid form: positive sum means
  // the interior is to the RIGHT of directed edges.
  const interiorSign = area > 0 ? -1 : 1;

  const n = ring.length;
  // Per-edge inward unit normals + a point on each offset line.
  const offsetLines: Array<{ px: number; py: number; dx: number; dy: number }> = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = ring[i]! as [number, number];
    const [bx, by] = ring[(i + 1) % n]! as [number, number];
    const ex = bx - ax;
    const ey = by - ay;
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue; // skip zero-length edges (duplicate vertices)
    const nx = (interiorSign * -ey) / len;
    const ny = (interiorSign * ex) / len;
    offsetLines.push({ px: ax + nx * inset, py: ay + ny * inset, dx: ex, dy: ey });
  }
  if (offsetLines.length < 3) {
    throw new Error('[geometry] insetRingPath: too few usable edges');
  }

  const m = offsetLines.length;
  const out: Ring = [];
  for (let i = 0; i < m; i++) {
    const prev = offsetLines[(i - 1 + m) % m]!;
    const cur = offsetLines[i]!;
    const hit = lineIntersect(prev.px, prev.py, prev.dx, prev.dy, cur.px, cur.py, cur.dx, cur.dy);
    if (hit) {
      // Miter clamp: a deep reflex corner can throw the join arbitrarily far.
      const dist = Math.hypot(hit[0] - cur.px, hit[1] - cur.py);
      if (dist <= inset * 4) {
        out.push([hit[0], hit[1]]);
        continue;
      }
    }
    // Parallel edges or clamped miter: fall back to the offset edge start.
    out.push([cur.px, cur.py]);
  }

  const insetArea = ringSignedArea(out);
  // Same winding, strictly smaller: anything else means the inset collapsed
  // or self-intersected the ring.
  if (Math.sign(insetArea) !== Math.sign(area) || Math.abs(insetArea) >= Math.abs(area)) {
    throw new Error('[geometry] insetRingPath: inset collapses the polygon (inset too large?)');
  }

  return `M${out.map(([x, y]) => `${round2(x!)} ${round2(y!)}`).join(' L')} Z`;
}

/**
 * Area enclosed by path `d` in real square millimetres, for documents whose
 * unit is NOT the canonical mm×10: `mmPerUnit` is how many real millimetres
 * one document unit represents (Studio scale calibration). Holes subtract,
 * matching pathArea.
 */
export function pathAreaScaled(d: string, mmPerUnit: number): number {
  if (!Number.isFinite(mmPerUnit) || mmPerUnit <= 0) {
    throw new Error('[geometry] pathAreaScaled: mmPerUnit must be a positive number');
  }
  return polygonArea(parsePath(d)) * mmPerUnit * mmPerUnit;
}
