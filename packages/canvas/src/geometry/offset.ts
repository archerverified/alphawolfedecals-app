// Polygon inset + calibrated area (Template Studio, Goal 6). Pure TS, same
// constraints as the rest of geometry/ (ADR-0006 §0.2): no DOM / Path2D.
//
// insetRingPath generates a panel's wrap-safe path from its outline by
// offsetting every edge toward the interior. Join model (per the PR #135
// review findings):
//   * convex corners take the exact miter — for an INSET the two offset lines
//     meet inside the polygon, so the miter is the geometrically correct
//     vertex no matter how sharp the corner (a clamp here was the bug: it
//     emitted points OUTSIDE the panel);
//   * reflex corners take a bevel at exactly `inset` distance — the true
//     offset there is an arc; the bevel chord cuts slightly INTO the interior,
//     which is the conservative direction for a wrap-safe boundary;
//   * the output ring is then checked for self-intersection (segment pairs)
//     and same-winding/strictly-smaller area. Features narrower than 2×inset
//     produce a bowtie and are REJECTED, not repaired — callers treat the
//     throw as "inset too large for this panel".
// Input must be a single hole-free ring; multi-ring paths are rejected.
//
// pathAreaScaled is the calibrated sibling of pathAreaMm2: template documents
// are display-scaled (their unit is NOT mm×10), so a real-world area needs the
// document's mm-per-unit calibration factor, derived from the vehicle's stated
// dimensions (Studio calibration stage).

import { parsePath, type Ring } from './path-parse';
import { polygonArea, ringSignedArea } from './polygon';
import { segmentsProperlyCross } from './hit-test';

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

type Edge = {
  /** Original edge start vertex (the junction with the previous edge). */
  vx: number;
  vy: number;
  /** Edge direction (unnormalised). */
  dx: number;
  dy: number;
  /** Inward unit normal. */
  nx: number;
  ny: number;
};

/** True when the output ring has any properly-crossing non-adjacent segment pair. */
function ringSelfIntersects(ring: Ring): boolean {
  const m = ring.length;
  for (let i = 0; i < m; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % m]!;
    for (let j = i + 1; j < m; j++) {
      // Skip adjacent segments (they share an endpoint), including the
      // first/last wrap-around pair.
      if (j === i + 1 || (i === 0 && j === m - 1)) continue;
      const c = ring[j]!;
      const d = ring[(j + 1) % m]!;
      if (segmentsProperlyCross(a[0]!, a[1]!, b[0]!, b[1]!, c[0]!, c[1]!, d[0]!, d[1]!)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Inset (shrink) the single ring of a path `d` by `inset` document units and
 * return the result as an `M … L … Z` path. Throws when the input is not a
 * single hole-free ring, when the inset collapses or self-intersects the
 * polygon, or when the result would be degenerate.
 */
export function insetRingPath(d: string, inset: number): string {
  if (!Number.isFinite(inset) || inset <= 0) {
    throw new Error('[geometry] insetRingPath: inset must be a positive number');
  }
  const rings = parsePath(d);
  if (rings.length > 1) {
    throw new Error(
      '[geometry] insetRingPath: multi-ring paths (holes) are not supported — pass a single hole-free outline',
    );
  }
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
  // A corner is convex (interior angle < 180°) when its turn direction matches
  // the ring's winding: cross(dPrev, dCur) × sign(area) < 0 in this convention
  // (verified for both windings of an axis-aligned square).
  const areaSign = Math.sign(area);

  const n = ring.length;
  const edges: Edge[] = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = ring[i]! as [number, number];
    const [bx, by] = ring[(i + 1) % n]! as [number, number];
    const ex = bx - ax;
    const ey = by - ay;
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue; // skip zero-length edges (duplicate vertices)
    edges.push({
      vx: ax,
      vy: ay,
      dx: ex,
      dy: ey,
      nx: (interiorSign * -ey) / len,
      ny: (interiorSign * ex) / len,
    });
  }
  if (edges.length < 3) {
    throw new Error('[geometry] insetRingPath: too few usable edges');
  }

  const m = edges.length;
  const out: Ring = [];
  const push = (x: number, y: number): void => {
    const last = out[out.length - 1];
    if (last && Math.hypot(last[0]! - x, last[1]! - y) < 1e-6) return; // drop dupes
    out.push([x, y]);
  };

  for (let i = 0; i < m; i++) {
    const prev = edges[(i - 1 + m) % m]!;
    const cur = edges[i]!;
    // The junction vertex between prev and cur is cur's start vertex.
    const { vx, vy } = cur;
    const cross = prev.dx * cur.dy - prev.dy * cur.dx;

    if (Math.abs(cross) < 1e-9) {
      // Collinear continuation: a single offset point suffices.
      push(vx + cur.nx * inset, vy + cur.ny * inset);
      continue;
    }

    const convex = cross * areaSign < 0;
    if (convex) {
      // Exact miter: offset lines of an inset always meet inside the polygon
      // at a convex corner.
      const hit = lineIntersect(
        prev.vx + prev.nx * inset,
        prev.vy + prev.ny * inset,
        prev.dx,
        prev.dy,
        vx + cur.nx * inset,
        vy + cur.ny * inset,
        cur.dx,
        cur.dy,
      );
      if (hit) {
        push(hit[0], hit[1]);
        continue;
      }
      // Numerically parallel despite the cross check: fall through to bevel.
    }
    // Reflex corner (or degenerate miter): bevel at exactly `inset` distance.
    push(vx + prev.nx * inset, vy + prev.ny * inset);
    push(vx + cur.nx * inset, vy + cur.ny * inset);
  }

  // Wrap-around dedupe: first and last may coincide after bevels.
  if (out.length >= 2) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(first[0]! - last[0]!, first[1]! - last[1]!) < 1e-6) out.pop();
  }
  if (out.length < 3) {
    throw new Error('[geometry] insetRingPath: inset collapses the polygon (inset too large?)');
  }

  if (ringSelfIntersects(out)) {
    throw new Error(
      '[geometry] insetRingPath: inset self-intersects the polygon — a feature is narrower than 2× the inset',
    );
  }

  const insetArea = ringSignedArea(out);
  // Same winding, strictly smaller: anything else means the inset collapsed.
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
