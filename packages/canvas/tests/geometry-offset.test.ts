// Unit tests for polygon inset + calibrated area (Goal 6 Template Studio).
// The bowtie and convex-spike cases are the PR #135 review repros — they pin
// the reject-don't-repair contract.

import { describe, expect, test } from 'vitest';
import { insetRingPath, parsePath, pathArea, pathAreaScaled, pointInRing } from '../src/geometry';

/** Vertex list of the first ring of `d`, for geometric assertions. */
function ringOf(d: string): number[][] {
  return parsePath(d)[0]!;
}

/** Every vertex of `insetD` must lie inside (or on) the ring of `inputD`. */
function expectContained(insetD: string, inputD: string): void {
  const input = ringOf(inputD);
  for (const [x, y] of ringOf(insetD)) {
    expect(pointInRing(x!, y!, input), `vertex (${x}, ${y}) escaped the input ring`).toBe(true);
  }
}

function pointSegmentDist(
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

/**
 * Dense clearance check (the verification round's catch): EVERY point along
 * the inset boundary — not just vertices — must be at least `inset` from the
 * input boundary. A bevel chord at a reflex corner under-clears between its
 * endpoints; this sampler catches what vertex containment cannot.
 */
function expectClearance(insetD: string, inputD: string, inset: number): void {
  const input = ringOf(inputD);
  const out = ringOf(insetD);
  const SAMPLES = 24;
  for (let i = 0; i < out.length; i++) {
    const [ax, ay] = out[i]! as [number, number];
    const [bx, by] = out[(i + 1) % out.length]! as [number, number];
    for (let s = 0; s <= SAMPLES; s++) {
      const px = ax + ((bx - ax) * s) / SAMPLES;
      const py = ay + ((by - ay) * s) / SAMPLES;
      let min = Infinity;
      for (let j = 0; j < input.length; j++) {
        const [cx, cy] = input[j]! as [number, number];
        const [dx2, dy2] = input[(j + 1) % input.length]! as [number, number];
        min = Math.min(min, pointSegmentDist(px, py, cx, cy, dx2, dy2));
      }
      expect(min, `boundary point (${px.toFixed(1)}, ${py.toFixed(1)}) clearance`).toBeGreaterThan(
        inset - 0.02,
      );
    }
  }
}

describe('insetRingPath', () => {
  test('insets an axis-aligned rectangle exactly (CW winding)', () => {
    // 100×80 rect, visually clockwise in y-down coords.
    const out = insetRingPath('M0 0 L100 0 L100 80 L0 80 Z', 10);
    const ring = ringOf(out);
    const xs = ring.map((p) => p[0]!).sort((a, b) => a - b);
    const ys = ring.map((p) => p[1]!).sort((a, b) => a - b);
    expect(Math.min(...xs)).toBeCloseTo(10, 5);
    expect(Math.max(...xs)).toBeCloseTo(90, 5);
    expect(Math.min(...ys)).toBeCloseTo(10, 5);
    expect(Math.max(...ys)).toBeCloseTo(70, 5);
  });

  test('winding direction does not matter', () => {
    const cw = insetRingPath('M0 0 L100 0 L100 80 L0 80 Z', 10);
    const ccw = insetRingPath('M0 0 L0 80 L100 80 L100 0 Z', 10);
    expect(pathArea(cw)).toBeCloseTo(pathArea(ccw), 5);
    expect(pathArea(cw)).toBeCloseTo(80 * 60, 5);
  });

  test('insets a triangle inward (contained, area strictly shrinks)', () => {
    const tri = 'M0 0 L100 0 L50 90 Z';
    const out = insetRingPath(tri, 8);
    expect(pathArea(out)).toBeGreaterThan(0);
    expect(pathArea(out)).toBeLessThan(pathArea(tri));
    expectContained(out, tri);
  });

  test('handles a mildly non-convex (L-shaped) panel, fully contained', () => {
    const L = 'M0 0 L100 0 L100 40 L60 40 L60 100 L0 100 Z';
    const out = insetRingPath(L, 5);
    expect(pathArea(out)).toBeGreaterThan(0);
    expect(pathArea(out)).toBeLessThan(pathArea(L));
    expectContained(out, L);
  });

  test('VERIFY REPRO: clearance ≥ inset along the WHOLE boundary (reflex corners too)', () => {
    // The reflex bevel regression under-cleared to 3.54 on this shape at
    // inset 5; the reflex miter keeps every boundary point ≥ 5 away.
    const L = 'M0 0 L100 0 L100 40 L60 40 L60 100 L0 100 Z';
    expectClearance(insetRingPath(L, 5), L, 5);
    const notch = 'M0 0 L120 0 L120 50 L80 50 L80 100 L0 100 Z';
    expectClearance(insetRingPath(notch, 6), notch, 6);
    const rect = 'M0 0 L100 0 L100 80 L0 80 Z';
    expectClearance(insetRingPath(rect, 10), rect, 10);
    const tri = 'M0 0 L100 0 L50 90 Z';
    expectClearance(insetRingPath(tri, 8), tri, 8);
    const bow = 'M0 0 L70 0 L100 40 L70 80 L0 80 Z';
    expectClearance(insetRingPath(bow, 8), bow, 8);
  });

  test('VERIFY REPRO: an exactly-retraced zero-width spur is rejected', () => {
    // Anti-parallel collinear corner: the overlap is collinear, so the
    // self-intersection check (proper crossings only) cannot see it — the
    // dot-product guard must.
    const spur = 'M0 0 L100 0 L100 80 L50 80 L50 95 L50 80 L0 80 Z';
    expect(() => insetRingPath(spur, 5)).toThrow(/zero-width|self-intersects|collapses/);
  });

  test('a shallow dent is carved around with full clearance (reflex miters are exact)', () => {
    // Brute-force-verified: the result bumps inward around the dent and the
    // worst boundary clearance is exactly the inset.
    const dent = 'M0 0 L200 0 L200 80 L101 80 L100 79.2 L99 80 L0 80 Z';
    const out = insetRingPath(dent, 6);
    expectClearance(out, dent, 6);
    expectContained(out, dent);
  });

  test('an interior needle (near-180° reflex) is rejected, not deep-cut', () => {
    // 2-wide, 60-deep spur into the interior: the reflex tip miter explodes
    // (inset/cos(turn/2) ≫ 8×inset) — reject per the cap.
    const needle = 'M0 0 L200 0 L200 80 L101 80 L100 20 L99 80 L0 80 Z';
    expect(() => insetRingPath(needle, 6)).toThrow(
      /reflex corner|self-intersects|collapses|zero-width|under-clears/,
    );
  });

  test('REVIEW REPRO: rejects a narrow limb (bowtie self-intersection), not silently corrupts', () => {
    // Limb is 12 units tall; inset 7 → 2×7 > 12 → the limb inverts.
    expect(() => insetRingPath('M0 0 L200 0 L200 80 L120 80 L120 12 L0 12 Z', 7)).toThrow(
      /self-intersects|collapses/,
    );
  });

  test('REVIEW REPRO: L-shape with inset wider than its arm is rejected', () => {
    // Horizontal arm is 40 tall; inset 25 → 2×25 > 40 → bowtie.
    expect(() => insetRingPath('M0 0 L100 0 L100 40 L60 40 L60 100 L0 100 Z', 25)).toThrow(
      /self-intersects|collapses/,
    );
  });

  test('REVIEW REPRO: a spike narrower than 2×inset is rejected (never escapes the panel)', () => {
    // The 4-unit-wide spike cannot contain a 5-unit inset — the old clamp
    // emitted vertices OUTSIDE the panel here; the contract is to reject.
    const spike = 'M0 0 L100 0 L100 80 L52 80 L50 95 L48 80 L0 80 Z';
    expect(() => insetRingPath(spike, 5)).toThrow(
      /self-intersects|collapses|under-clears|zero-width/,
    );
  });

  test('a pointed bow wider than 2×inset takes the exact miter, contained', () => {
    const bow = 'M0 0 L70 0 L100 40 L70 80 L0 80 Z';
    const out = insetRingPath(bow, 8);
    expectContained(out, bow);
    expect(pathArea(out)).toBeLessThan(pathArea(bow));
    expect(pathArea(out)).toBeGreaterThan(0);
  });

  test('reflex corners bevel at exactly the inset distance, contained', () => {
    // Plus-sign-ish concave shape: reflex corners at the notch.
    const notch = 'M0 0 L120 0 L120 50 L80 50 L80 100 L0 100 Z';
    const out = insetRingPath(notch, 6);
    expectContained(out, notch);
  });

  test('rejects multi-ring (hole) input', () => {
    const withHole = 'M0 0 L100 0 L100 100 L0 100 Z M40 40 L60 40 L60 60 L40 60 Z';
    expect(() => insetRingPath(withHole, 5)).toThrow(/multi-ring/);
  });

  test('throws when the inset collapses the polygon', () => {
    expect(() => insetRingPath('M0 0 L100 0 L100 80 L0 80 Z', 50)).toThrow(/collapses/);
  });

  test('throws on degenerate input', () => {
    expect(() => insetRingPath('M0 0 L10 0 Z', 1)).toThrow();
    expect(() => insetRingPath('M0 0 L100 0 L100 80 L0 80 Z', 0)).toThrow(/positive/);
    expect(() => insetRingPath('M0 0 L100 0 L100 80 L0 80 Z', -3)).toThrow(/positive/);
  });

  test('output is a well-formed closed path consumable by parsePath', () => {
    const out = insetRingPath('M0 0 L100 0 L100 80 L0 80 Z', 10);
    expect(out).toMatch(/^M[\d. L-]+Z$/);
    expect(ringOf(out).length).toBeGreaterThanOrEqual(4);
  });
});

describe('pathAreaScaled', () => {
  test('scales document-unit area by mmPerUnit squared', () => {
    // 100×80 units; at 2 mm/unit the real area is 200mm × 160mm = 32,000 mm².
    expect(pathAreaScaled('M0 0 L100 0 L100 80 L0 80 Z', 2)).toBeCloseTo(32_000, 5);
  });

  test('mmPerUnit = 1 matches raw document-unit area', () => {
    const d = 'M0 0 L100 0 L100 80 L0 80 Z';
    expect(pathAreaScaled(d, 1)).toBeCloseTo(pathArea(d), 5);
  });

  test('rejects non-positive calibration factors', () => {
    expect(() => pathAreaScaled('M0 0 L10 0 L10 10 Z', 0)).toThrow(/positive/);
    expect(() => pathAreaScaled('M0 0 L10 0 L10 10 Z', -1)).toThrow(/positive/);
  });
});
