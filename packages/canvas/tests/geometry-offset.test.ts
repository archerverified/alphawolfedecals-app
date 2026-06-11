// Unit tests for polygon inset + calibrated area (Goal 6 Template Studio).

import { describe, expect, test } from 'vitest';
import { insetRingPath, parsePath, pathArea, pathAreaScaled } from '../src/geometry';

/** Vertex list of the first ring of `d`, for geometric assertions. */
function ringOf(d: string): number[][] {
  return parsePath(d)[0]!;
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

  test('insets a triangle inward (area strictly shrinks, stays positive)', () => {
    const out = insetRingPath('M0 0 L100 0 L50 90 Z', 8);
    expect(pathArea(out)).toBeGreaterThan(0);
    expect(pathArea(out)).toBeLessThan(pathArea('M0 0 L100 0 L50 90 Z'));
  });

  test('handles a mildly non-convex (L-shaped) panel', () => {
    const L = 'M0 0 L100 0 L100 40 L60 40 L60 100 L0 100 Z';
    const out = insetRingPath(L, 5);
    expect(pathArea(out)).toBeGreaterThan(0);
    expect(pathArea(out)).toBeLessThan(pathArea(L));
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
