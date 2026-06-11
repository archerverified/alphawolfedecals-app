// Logo quality gate math (Goal 5 / B2C-004). Pure-function coverage; the UI
// wiring is exercised by e2e/brief-wizard.spec.ts.

import { describe, expect, it } from 'vitest';
import {
  dpiVerdict,
  effectiveDpi,
  largestPanel,
  panelWidthIn,
  readUploadMeta,
  MIN_LOGO_DPI,
} from '../lib/brief/quality';
import type { BriefPanel } from '../components/brief/steps';

// 100×40 doc-unit rectangle. At 1:20 that's 2000 mm ≈ 78.74 in wide.
const RECT_100 = 'M 0 0 L 100 0 L 100 40 L 0 40 Z';
// 50×40 — half as wide.
const RECT_50 = 'M 0 0 L 50 0 L 50 40 L 0 40 Z';

const panels: BriefPanel[] = [
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    name: 'Cargo Panel',
    view: 'driver',
    outlinePath: RECT_100,
  },
  {
    id: 'aaaaaaaa-0000-4000-8000-000000000002',
    name: 'Cab Door',
    view: 'driver',
    outlinePath: RECT_50,
  },
  { id: 'aaaaaaaa-0000-4000-8000-000000000003', name: 'No Path', view: 'front' },
];

describe('readUploadMeta', () => {
  it('reads the worker metadata shape', () => {
    const meta = readUploadMeta({
      naturalWidth: 800,
      naturalHeight: 600,
      contentBbox: { left: 1, top: 2, width: 3, height: 4 },
      opaque: true,
      rembg: { requested: true, removed: false, error: 'no token' },
    });
    expect(meta.naturalWidth).toBe(800);
    expect(meta.opaque).toBe(true);
    expect(meta.rembg).toEqual({ requested: true, removed: false, error: 'no token' });
  });

  it('never throws on junk and defaults opaque to null (no false warnings)', () => {
    for (const junk of [null, undefined, 'x', 42, [], { opaque: 'yes', rembg: 'no' }]) {
      const meta = readUploadMeta(junk);
      expect(meta.opaque).toBeNull();
      expect(meta.rembg.requested).toBe(false);
    }
  });
});

describe('panelWidthIn', () => {
  it('converts doc units at drawing scale to physical inches', () => {
    // 100 units × 20 = 2000 mm = 78.74 in
    expect(panelWidthIn(RECT_100, 20)!).toBeCloseTo(78.74, 1);
  });

  it('returns null on junk paths and non-positive scales', () => {
    expect(panelWidthIn('not a path', 20)).toBeNull();
    expect(panelWidthIn(RECT_100, 0)).toBeNull();
    expect(panelWidthIn('', 20)).toBeNull();
  });
});

describe('largestPanel', () => {
  it('picks the physically widest panel', () => {
    expect(largestPanel(panels, 20)?.panel.name).toBe('Cargo Panel');
  });

  it('restricts to assigned ids when given', () => {
    const got = largestPanel(panels, 20, ['aaaaaaaa-0000-4000-8000-000000000002']);
    expect(got?.panel.name).toBe('Cab Door');
  });

  it('skips panels without a parseable outline; null when none qualify', () => {
    expect(largestPanel(panels, 20, ['aaaaaaaa-0000-4000-8000-000000000003'])).toBeNull();
    expect(largestPanel([], 20)).toBeNull();
  });
});

describe('effectiveDpi / dpiVerdict', () => {
  it('px across inches', () => {
    expect(effectiveDpi(1500, 10)).toBe(150);
    expect(effectiveDpi(0, 10)).toBeNull();
    expect(effectiveDpi(100, 0)).toBeNull();
  });

  it('flags a small raster across the big zone and shows the math inputs', () => {
    // 800 px over 78.74 in ≈ 10 DPI — way under the gate.
    const v = dpiVerdict(800, panels, 20, null);
    expect(v).not.toBeNull();
    expect(v!.ok).toBe(false);
    expect(v!.panelName).toBe('Cargo Panel');
    expect(v!.dpi).toBe(Math.round(800 / 78.74));
    expect(v!.dpi).toBeLessThan(MIN_LOGO_DPI);
  });

  it('passes a big-enough file on the assigned (smaller) zone', () => {
    // Cab Door: 50 units × 20 = 1000 mm ≈ 39.37 in → 8000 px ≈ 203 DPI.
    const v = dpiVerdict(8000, panels, 20, ['aaaaaaaa-0000-4000-8000-000000000002']);
    expect(v!.ok).toBe(true);
    expect(v!.panelName).toBe('Cab Door');
  });

  it('returns null when it cannot judge (no width, no panels)', () => {
    expect(dpiVerdict(null, panels, 20, null)).toBeNull();
    expect(dpiVerdict(800, [], 20, null)).toBeNull();
  });
});
