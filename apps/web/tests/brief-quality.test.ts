// Logo quality gate math (Goal 5 / B2C-004). Pure-function coverage; the UI
// wiring is exercised by e2e/brief-wizard.spec.ts.
//
// Unit model (post PR #125 review): doc units have NO physical meaning — each
// view's panel-union is scaled to the real vehicle extent that view faces
// (front/back → width_mm, side/top → length_mm), panels sized proportionally.

import { describe, expect, it } from 'vitest';
import {
  dpiVerdict,
  effectiveDpi,
  panelPrintWidthsIn,
  readUploadMeta,
  MIN_LOGO_DPI,
  type VehicleDims,
} from '../lib/brief/quality';
import type { BriefPanel } from '../components/brief/steps';

// Transit-like dims: 5531 mm long, 2032 mm wide (~217.8 in / ~80 in).
const DIMS: VehicleDims = { lengthMm: 5531, widthMm: 2032 };

const rect = (x: number, w: number) => `M ${x} 0 L ${x + w} 0 L ${x + w} 40 L ${x} 40 Z`;

const FASCIA = 'aaaaaaaa-0000-4000-8000-000000000001';
const CAB_DOOR = 'aaaaaaaa-0000-4000-8000-000000000002';
const CARGO = 'aaaaaaaa-0000-4000-8000-000000000003';
const NO_PATH = 'aaaaaaaa-0000-4000-8000-000000000004';

// Front view: one panel spanning the full drawing → full vehicle WIDTH (80 in).
// Driver view: door (0..300) + cargo (300..900): union 900 units → vehicle
// LENGTH (217.8 in); door = 300/900 → ~72.6 in, cargo = 600/900 → ~145.2 in.
const panels: BriefPanel[] = [
  { id: FASCIA, name: 'Front Fascia', view: 'front', outlinePath: rect(0, 960) },
  { id: CAB_DOOR, name: 'Cab Door', view: 'driver', outlinePath: rect(0, 300) },
  { id: CARGO, name: 'Cargo Panel', view: 'driver', outlinePath: rect(300, 600) },
  { id: NO_PATH, name: 'No Path', view: 'back' },
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
    expect(meta.contentBbox).toEqual({ left: 1, top: 2, width: 3, height: 4 });
    expect(meta.rembg).toEqual({ requested: true, removed: false, error: 'no token' });
  });

  it('never throws on junk; defaults opaque to null (no false warnings)', () => {
    for (const junk of [
      null,
      undefined,
      'x',
      42,
      [],
      { opaque: 'yes', rembg: 'no', contentBbox: [1, 2] },
    ]) {
      const meta = readUploadMeta(junk);
      expect(meta.opaque).toBeNull();
      expect(meta.contentBbox).toBeNull();
      expect(meta.rembg.requested).toBe(false);
    }
  });
});

describe('panelPrintWidthsIn', () => {
  it('scales each view union to the real vehicle extent', () => {
    const widths = panelPrintWidthsIn(panels, DIMS);
    // Front: full union → full width: 2032 mm = 80 in.
    expect(widths.get(FASCIA)!).toBeCloseTo(80, 0);
    // Driver: union 900 units = 5531 mm; door 300 units → 5531/3 mm ≈ 72.6 in.
    expect(widths.get(CAB_DOOR)!).toBeCloseTo(72.6, 0);
    expect(widths.get(CARGO)!).toBeCloseTo(145.2, 0);
  });

  it('drops unparseable panels and implausible results', () => {
    const widths = panelPrintWidthsIn(panels, DIMS);
    expect(widths.has(NO_PATH)).toBe(false);
    // A 40 m "vehicle" makes every panel implausible → nothing reported.
    const silly = panelPrintWidthsIn(panels, { lengthMm: 40_000_000, widthMm: 40_000_000 });
    expect(silly.size).toBe(0);
  });

  it('handles unknown views and zero dims silently', () => {
    const weird: BriefPanel[] = [
      { id: FASCIA, name: 'X', view: 'underside', outlinePath: rect(0, 100) },
    ];
    expect(panelPrintWidthsIn(weird, DIMS).size).toBe(0);
    expect(panelPrintWidthsIn(panels, { lengthMm: 0, widthMm: 0 }).size).toBe(0);
  });
});

describe('effectiveDpi / dpiVerdict', () => {
  it('px across inches', () => {
    expect(effectiveDpi(1500, 10)).toBe(150);
    expect(effectiveDpi(0, 10)).toBeNull();
    expect(effectiveDpi(100, 0)).toBeNull();
  });

  it('flags a small raster across the widest relevant panel, math shown', () => {
    // 800 px over the cargo panel (~145.2 in) ≈ 5 DPI.
    const v = dpiVerdict(800, panels, DIMS, null);
    expect(v).not.toBeNull();
    expect(v!.ok).toBe(false);
    expect(v!.panelName).toBe('Cargo Panel');
    expect(v!.widthIn).toBe(145);
    expect(v!.dpi).toBe(5); // floor(800 px / ~145.2 in)
    expect(v!.dpi).toBeLessThan(MIN_LOGO_DPI);
  });

  it('passes a big-enough file on the assigned (smaller) zone', () => {
    // Cab door ≈ 72.6 in → 12000 px ≈ 165 DPI.
    const v = dpiVerdict(12_000, panels, DIMS, [CAB_DOOR]);
    expect(v!.ok).toBe(true);
    expect(v!.panelName).toBe('Cab Door');
  });

  it('floors the displayed DPI so a warning never reads "150"', () => {
    // 149.9 DPI on the fascia (80 in): 80 × 149.9 = 11992 px.
    const v = dpiVerdict(11_992, panels, DIMS, [FASCIA]);
    expect(v!.ok).toBe(false);
    expect(v!.dpi).toBeLessThanOrEqual(149);
  });

  it('returns null when it cannot judge (no width, no sizable panels)', () => {
    expect(dpiVerdict(null, panels, DIMS, null)).toBeNull();
    expect(dpiVerdict(800, [], DIMS, null)).toBeNull();
    expect(dpiVerdict(800, panels, DIMS, [NO_PATH])).toBeNull();
  });
});
