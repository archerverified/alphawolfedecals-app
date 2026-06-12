// Polygon inset + calibrated area (Template Studio, Goal 6). Pure TS, same
// constraints as the rest of geometry/ (ADR-0006 §0.2): no DOM / Path2D.
//
// insetRingPath generates a panel's wrap-safe path from its outline by
// offsetting every edge toward the interior. Join model (per the PR #135
// review + verification findings):
//   * EVERY corner takes the exact miter. Convex: the inset offset lines meet
//     inside the polygon (a clamp here emitted points OUTSIDE the panel — the
//     original bug). Reflex: the miter sits BEYOND the true inset arc, so
//     clearance from the panel edge is ≥ inset everywhere (a bevel chord here
//     is a secant of the arc and under-clears the corner — the verification
//     regression). Exploding reflex miters (corner → 180°) are rejected.
//   * the output ring is then checked for self-intersection (segment pairs)
//     and same-winding/strictly-smaller area. Features narrower than 2×inset
//     produce a bowtie and are REJECTED, not repaired — callers treat the
//     throw as "inset too large for this panel". Exactly-retraced zero-width
//     spurs (anti-parallel collinear corners) are rejected explicitly.
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

const orient2 = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** Collinear non-adjacent segments that OVERLAP (a doubled-back ring section). */
function segmentsCollinearOverlap(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const EPS = 1e-6;
  if (
    Math.abs(orient2(ax, ay, bx, by, cx, cy)) > EPS ||
    Math.abs(orient2(ax, ay, bx, by, dx, dy)) > EPS
  ) {
    return false;
  }
  // Project onto the dominant axis and test 1-D range overlap.
  const horizontal = Math.abs(bx - ax) >= Math.abs(by - ay);
  const [a1, b1] = horizontal ? [ax, bx] : [ay, by];
  const [c1, d1] = horizontal ? [cx, dx] : [cy, dy];
  const lo1 = Math.min(a1, b1);
  const hi1 = Math.max(a1, b1);
  const lo2 = Math.min(c1, d1);
  const hi2 = Math.max(c1, d1);
  return Math.min(hi1, hi2) - Math.max(lo1, lo2) > EPS;
}

/**
 * True when the output ring has any properly-crossing OR collinear-overlapping
 * non-adjacent segment pair (the latter is how reflex miters on flush edges
 * double back — proper-crossing tests are blind to collinear overlap).
 */
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
      if (
        segmentsProperlyCross(a[0]!, a[1]!, b[0]!, b[1]!, c[0]!, c[1]!, d[0]!, d[1]!) ||
        segmentsCollinearOverlap(a[0]!, a[1]!, b[0]!, b[1]!, c[0]!, c[1]!, d[0]!, d[1]!)
      ) {
        return true;
      }
    }
  }
  return false;
}

function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const CLEARANCE_SAMPLES = 16;
// Output coordinates are rounded to 2 decimals; allow that much slack.
const CLEARANCE_TOLERANCE = 0.02;

/**
 * The wrap-safe CONTRACT, enforced rather than assumed: every point along the
 * inset boundary (sampled densely, not just vertices) must be at least `inset`
 * away from the input boundary. Pure mitering can under-clear near features
 * shallower than the inset (e.g. a sub-inset dent whose shoulder miters span
 * it) — those results are rejected here instead of shipping silently.
 */
function ringUnderClears(out: Ring, input: Ring, inset: number): boolean {
  const m = out.length;
  const n = input.length;
  for (let i = 0; i < m; i++) {
    const [ax, ay] = out[i]! as [number, number];
    const [bx, by] = out[(i + 1) % m]! as [number, number];
    for (let s = 0; s <= CLEARANCE_SAMPLES; s++) {
      const px = ax + ((bx - ax) * s) / CLEARANCE_SAMPLES;
      const py = ay + ((by - ay) * s) / CLEARANCE_SAMPLES;
      let min = Infinity;
      for (let j = 0; j < n; j++) {
        const [cx, cy] = input[j]! as [number, number];
        const [dx, dy] = input[(j + 1) % n]! as [number, number];
        min = Math.min(min, pointSegmentDistance(px, py, cx, cy, dx, dy));
        if (min < inset - CLEARANCE_TOLERANCE) return true;
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
      // Collinear: distinguish straight continuation from a 180° REVERSAL —
      // an exactly-retraced zero-width spur is by definition narrower than
      // 2× any inset, and its overlap is collinear so the self-intersection
      // check (proper crossings only) cannot catch it downstream.
      if (prev.dx * cur.dx + prev.dy * cur.dy < 0) {
        throw new Error(
          '[geometry] insetRingPath: zero-width spur (exactly retraced edge) — reject',
        );
      }
      push(vx + cur.nx * inset, vy + cur.ny * inset);
      continue;
    }

    // Exact miter at EVERY corner. Convex: the inset offset lines meet inside
    // the polygon — exact and contained (a too-long convex miter implies a
    // sub-2×inset feature, caught by the self-intersection check). Reflex: the
    // miter sits on the angle bisector at inset/cos(turn/2) from the vertex —
    // BEYOND the true inset arc, i.e. clearance ≥ inset everywhere (a bevel
    // chord here would be a secant of the arc and under-clear the corner).
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
    if (!hit) {
      // Numerically parallel despite the cross check — treat as straight.
      push(vx + cur.nx * inset, vy + cur.ny * inset);
      continue;
    }
    const convex = cross * areaSign < 0;
    if (!convex) {
      // The reflex miter explodes as the corner approaches 180°; such a
      // corner bounds a feature effectively narrower than the inset — reject
      // rather than emit a deep sliver cut (8× ≈ a 165.5° reflex turn).
      const dist = Math.hypot(hit[0] - vx, hit[1] - vy);
      if (dist > inset * 8) {
        throw new Error(
          '[geometry] insetRingPath: reflex corner too shallow for this inset — reject',
        );
      }
    }
    push(hit[0], hit[1]);
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

  if (ringUnderClears(out, ring, inset)) {
    throw new Error(
      '[geometry] insetRingPath: result under-clears the panel edge — a feature is shallower than the inset',
    );
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
