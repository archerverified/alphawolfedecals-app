// Unit tests for the final-handoff placement math (Goal 7 D6).

import { describe, expect, it } from 'vitest';

import {
  centeredPlacement,
  coverPlacement,
  largestPanel,
  viewBbox,
  type PanelGeom,
} from '@/lib/generation/placement';

const SIDE_PANEL: PanelGeom = {
  id: 'p-side',
  view: 'driver',
  svgPath: 'M 100 200 L 4100 200 L 4100 2200 L 100 2200 Z', // 4000 × 2000 at (100,200)
  printableAreaMm2: 800_000,
};
const DOOR_PANEL: PanelGeom = {
  id: 'p-door',
  view: 'driver',
  svgPath: 'M 4200 200 L 5200 200 L 5200 2200 L 4200 2200 Z', // 1000 × 2000
  printableAreaMm2: 200_000,
};

describe('viewBbox', () => {
  it('unions panel outline bboxes', () => {
    const b = viewBbox([SIDE_PANEL, DOOR_PANEL])!;
    expect(b).toEqual({ minX: 100, minY: 200, width: 5100, height: 2000 });
  });

  it('returns null when no panel parses to real geometry', () => {
    expect(viewBbox([{ ...SIDE_PANEL, svgPath: 'not a path' }])).toBeNull();
    expect(viewBbox([])).toBeNull();
  });
});

describe('largestPanel', () => {
  it('prefers precomputed printable area', () => {
    expect(largestPanel([DOOR_PANEL, SIDE_PANEL])?.id).toBe('p-side');
  });

  it('falls back to outline bbox area when areas are the 0 sentinel', () => {
    const a = { ...SIDE_PANEL, printableAreaMm2: 0 };
    const b = { ...DOOR_PANEL, printableAreaMm2: 0 };
    expect(largestPanel([b, a])?.id).toBe('p-side');
  });

  it('handles empty input', () => {
    expect(largestPanel([])).toBeNull();
  });
});

describe('coverPlacement', () => {
  it('anchors at the box origin and scales to cover both axes', () => {
    const box = { minX: 100, minY: 200, width: 5100, height: 2000 };
    // 1024×768 image: width scale 4.98, height scale 2.6 → width wins (cover).
    const p = coverPlacement(box, 1024, 768);
    expect(p.x).toBe(100);
    expect(p.y).toBe(200);
    expect(p.scale).toBeCloseTo(5100 / 1024, 5);
    expect(1024 * p.scale).toBeGreaterThanOrEqual(box.width);
    expect(768 * p.scale).toBeGreaterThanOrEqual(box.height);
  });
});

describe('centeredPlacement', () => {
  it('contains the logo at the requested width fraction, centered', () => {
    const box = { minX: 0, minY: 0, width: 4000, height: 2000 };
    const p = centeredPlacement(box, 1000, 500, 0.45);
    expect(1000 * p.scale).toBeCloseTo(1800, 3); // 45% of 4000
    expect(p.x).toBeCloseTo((4000 - 1800) / 2, 3);
    expect(p.y).toBeCloseTo((2000 - 900) / 2, 3);
  });

  it('never overflows a short box vertically', () => {
    const box = { minX: 0, minY: 0, width: 4000, height: 300 };
    const p = centeredPlacement(box, 1000, 1000, 0.45);
    expect(1000 * p.scale).toBeLessThanOrEqual(300 + 1e-9);
  });
});
