// SVG path `d` -> polygon rings (ADR-0006 §0.2, §6).
//
// Panel paths are simple M/L/Z in practice, but this parser also flattens
// C (cubic), Q (quadratic), and A (arc) commands via adaptive subdivision so
// it's correct for arbitrary wrap-safe paths. Output rings are number[][] of
// [x, y]; closed rings do NOT repeat the first point. Coordinates are
// panel-local (mm×10). Pure TS — no DOM/Path2D.

/** A polygon ring: an ordered list of [x, y] vertices. */
export type Ring = number[][];

/** Max recursion depth for adaptive curve subdivision. */
const MAX_SUBDIV_DEPTH = 18;
/** Flatness tolerance in coordinate units (mm×10). ~0.25 mm. */
const FLATNESS = 2.5;

interface Cursor {
  x: number;
  y: number;
}

/**
 * Tokenize a path `d` string into [command, ...numbers] runs. Handles commas,
 * whitespace, signed/exponent numbers, and implicit repeated commands.
 */
function tokenize(d: string): Array<{ cmd: string; args: number[] }> {
  const out: Array<{ cmd: string; args: number[] }> = [];
  // Match a single command letter or a number (incl. scientific / leading '.').
  const re = /([astvzqmhlc])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/gi;
  let m: RegExpExecArray | null;
  let cur: { cmd: string; args: number[] } | null = null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) {
      if (cur) out.push(cur);
      cur = { cmd: m[1], args: [] };
    } else if (m[2] !== undefined) {
      if (!cur) continue; // numbers before any command — ignore
      cur.args.push(Number(m[2]));
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Flatten a cubic Bézier into points (excluding p0, including p3). */
function flattenCubic(
  ring: Ring,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  depth: number,
): void {
  if (depth >= MAX_SUBDIV_DEPTH) {
    ring.push([x3, y3]);
    return;
  }
  // Flatness: distance of control points from the chord p0->p3.
  const d1 = pointLineDist(x1, y1, x0, y0, x3, y3);
  const d2 = pointLineDist(x2, y2, x0, y0, x3, y3);
  if (d1 + d2 <= FLATNESS) {
    ring.push([x3, y3]);
    return;
  }
  // de Casteljau subdivision at t=0.5.
  const x01 = (x0 + x1) / 2;
  const y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2;
  const y12 = (y1 + y2) / 2;
  const x23 = (x2 + x3) / 2;
  const y23 = (y2 + y3) / 2;
  const xa = (x01 + x12) / 2;
  const ya = (y01 + y12) / 2;
  const xb = (x12 + x23) / 2;
  const yb = (y12 + y23) / 2;
  const xm = (xa + xb) / 2;
  const ym = (ya + yb) / 2;
  flattenCubic(ring, x0, y0, x01, y01, xa, ya, xm, ym, depth + 1);
  flattenCubic(ring, xm, ym, xb, yb, x23, y23, x3, y3, depth + 1);
}

/** Flatten a quadratic Bézier (excluding p0, including p2). */
function flattenQuadratic(
  ring: Ring,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  depth: number,
): void {
  if (depth >= MAX_SUBDIV_DEPTH) {
    ring.push([x2, y2]);
    return;
  }
  const d = pointLineDist(cx, cy, x0, y0, x2, y2);
  if (d <= FLATNESS) {
    ring.push([x2, y2]);
    return;
  }
  const x01 = (x0 + cx) / 2;
  const y01 = (y0 + cy) / 2;
  const x12 = (cx + x2) / 2;
  const y12 = (cy + y2) / 2;
  const xm = (x01 + x12) / 2;
  const ym = (y01 + y12) / 2;
  flattenQuadratic(ring, x0, y0, x01, y01, xm, ym, depth + 1);
  flattenQuadratic(ring, xm, ym, x12, y12, x2, y2, depth + 1);
}

/** Perpendicular distance from (px,py) to the line through (ax,ay)-(bx,by). */
function pointLineDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs((px - ax) * dy - (py - ay) * dx) / len;
}

/**
 * Flatten an SVG elliptical arc (A/a) into line segments appended to `ring`.
 * Implements the endpoint -> center parameterization from the SVG 2 spec.
 */
function flattenArc(
  ring: Ring,
  x0: number,
  y0: number,
  rxIn: number,
  ryIn: number,
  xAxisRotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x: number,
  y: number,
): void {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    ring.push([x, y]); // degenerate -> straight line
    return;
  }
  const phi = (xAxisRotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: compute (x1', y1').
  const dx2 = (x0 - x) / 2;
  const dy2 = (y0 - y) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Correct out-of-range radii.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  // Step 2: compute (cx', cy').
  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  let num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  if (num < 0) num = 0;
  const denom = rxSq * y1pSq + rySq * x1pSq;
  const coef = (largeArc !== sweep ? 1 : -1) * Math.sqrt(denom === 0 ? 0 : num / denom);
  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (coef * -(ry * x1p)) / rx;

  // Step 3: compute (cx, cy).
  const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;

  // Step 4: compute start angle and sweep angle.
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const lenU = Math.hypot(ux, uy);
    const lenV = Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / (lenU * lenV))));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  // Sample the arc at a resolution proportional to its angular span.
  const segments = Math.max(2, Math.ceil(Math.abs(dTheta) / (Math.PI / 32)));
  for (let i = 1; i <= segments; i++) {
    const t = theta1 + (dTheta * i) / segments;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    const px = cosPhi * rx * cosT - sinPhi * ry * sinT + cx;
    const py = sinPhi * rx * cosT + cosPhi * ry * sinT + cy;
    ring.push([px, py]);
  }
}

/** Drop a trailing vertex that duplicates the first (closed-ring normalize). */
function normalizeRing(ring: Ring): Ring {
  if (ring.length >= 2) {
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (Math.abs(first[0]! - last[0]!) < 1e-9 && Math.abs(first[1]! - last[1]!) < 1e-9) {
      ring.pop();
    }
  }
  return ring;
}

/**
 * Parse a path `d` into one or more rings. Each `M`/`m` starts a new ring; `Z`
 * closes the current ring (the ring is also implicitly closed at the next `M`).
 */
export function parsePath(d: string): Ring[] {
  const tokens = tokenize(d);
  const rings: Ring[] = [];
  let ring: Ring = [];
  const cur: Cursor = { x: 0, y: 0 };
  // Subpath start, for Z.
  let startX = 0;
  let startY = 0;
  // Last control point, for smooth S/T (not commonly used but supported).
  let lastCtrlX = 0;
  let lastCtrlY = 0;
  let prevCmd = '';

  const finishRing = (): void => {
    if (ring.length >= 3) rings.push(normalizeRing(ring));
    ring = [];
  };

  for (const { cmd, args } of tokens) {
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    switch (C) {
      case 'M': {
        // First pair = moveto; subsequent pairs = implicit lineto.
        for (let i = 0; i + 1 < args.length; i += 2) {
          const ax = args[i]!;
          const ay = args[i + 1]!;
          if (i === 0) {
            finishRing();
            cur.x = rel ? cur.x + ax : ax;
            cur.y = rel ? cur.y + ay : ay;
            startX = cur.x;
            startY = cur.y;
            ring.push([cur.x, cur.y]);
          } else {
            cur.x = rel ? cur.x + ax : ax;
            cur.y = rel ? cur.y + ay : ay;
            ring.push([cur.x, cur.y]);
          }
        }
        break;
      }
      case 'L': {
        for (let i = 0; i + 1 < args.length; i += 2) {
          cur.x = rel ? cur.x + args[i]! : args[i]!;
          cur.y = rel ? cur.y + args[i + 1]! : args[i + 1]!;
          ring.push([cur.x, cur.y]);
        }
        break;
      }
      case 'H': {
        for (const a of args) {
          cur.x = rel ? cur.x + a : a;
          ring.push([cur.x, cur.y]);
        }
        break;
      }
      case 'V': {
        for (const a of args) {
          cur.y = rel ? cur.y + a : a;
          ring.push([cur.x, cur.y]);
        }
        break;
      }
      case 'C': {
        for (let i = 0; i + 5 < args.length; i += 6) {
          const x1 = rel ? cur.x + args[i]! : args[i]!;
          const y1 = rel ? cur.y + args[i + 1]! : args[i + 1]!;
          const x2 = rel ? cur.x + args[i + 2]! : args[i + 2]!;
          const y2 = rel ? cur.y + args[i + 3]! : args[i + 3]!;
          const ex = rel ? cur.x + args[i + 4]! : args[i + 4]!;
          const ey = rel ? cur.y + args[i + 5]! : args[i + 5]!;
          flattenCubic(ring, cur.x, cur.y, x1, y1, x2, y2, ex, ey, 0);
          lastCtrlX = x2;
          lastCtrlY = y2;
          cur.x = ex;
          cur.y = ey;
        }
        break;
      }
      case 'S': {
        for (let i = 0; i + 3 < args.length; i += 4) {
          // Reflect previous control point if last command was C/S.
          const reflect = prevCmd === 'C' || prevCmd === 'S';
          const x1 = reflect ? 2 * cur.x - lastCtrlX : cur.x;
          const y1 = reflect ? 2 * cur.y - lastCtrlY : cur.y;
          const x2 = rel ? cur.x + args[i]! : args[i]!;
          const y2 = rel ? cur.y + args[i + 1]! : args[i + 1]!;
          const ex = rel ? cur.x + args[i + 2]! : args[i + 2]!;
          const ey = rel ? cur.y + args[i + 3]! : args[i + 3]!;
          flattenCubic(ring, cur.x, cur.y, x1, y1, x2, y2, ex, ey, 0);
          lastCtrlX = x2;
          lastCtrlY = y2;
          cur.x = ex;
          cur.y = ey;
        }
        break;
      }
      case 'Q': {
        for (let i = 0; i + 3 < args.length; i += 4) {
          const cx = rel ? cur.x + args[i]! : args[i]!;
          const cy = rel ? cur.y + args[i + 1]! : args[i + 1]!;
          const ex = rel ? cur.x + args[i + 2]! : args[i + 2]!;
          const ey = rel ? cur.y + args[i + 3]! : args[i + 3]!;
          flattenQuadratic(ring, cur.x, cur.y, cx, cy, ex, ey, 0);
          lastCtrlX = cx;
          lastCtrlY = cy;
          cur.x = ex;
          cur.y = ey;
        }
        break;
      }
      case 'T': {
        for (let i = 0; i + 1 < args.length; i += 2) {
          const reflect = prevCmd === 'Q' || prevCmd === 'T';
          const cx = reflect ? 2 * cur.x - lastCtrlX : cur.x;
          const cy = reflect ? 2 * cur.y - lastCtrlY : cur.y;
          const ex = rel ? cur.x + args[i]! : args[i]!;
          const ey = rel ? cur.y + args[i + 1]! : args[i + 1]!;
          flattenQuadratic(ring, cur.x, cur.y, cx, cy, ex, ey, 0);
          lastCtrlX = cx;
          lastCtrlY = cy;
          cur.x = ex;
          cur.y = ey;
        }
        break;
      }
      case 'A': {
        for (let i = 0; i + 6 < args.length; i += 7) {
          const rx = args[i]!;
          const ry = args[i + 1]!;
          const rot = args[i + 2]!;
          const largeArc = args[i + 3]! !== 0;
          const sweep = args[i + 4]! !== 0;
          const ex = rel ? cur.x + args[i + 5]! : args[i + 5]!;
          const ey = rel ? cur.y + args[i + 6]! : args[i + 6]!;
          flattenArc(ring, cur.x, cur.y, rx, ry, rot, largeArc, sweep, ex, ey);
          cur.x = ex;
          cur.y = ey;
        }
        break;
      }
      case 'Z': {
        cur.x = startX;
        cur.y = startY;
        finishRing();
        break;
      }
      default:
        break; // unknown command — ignore
    }
    prevCmd = C;
  }

  finishRing();
  return rings;
}
