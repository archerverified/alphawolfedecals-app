// Print-pack planner (Goal 22 / D2+D3+D4 bridge). Turns a project's flat template
// panels + vehicle curvature + shop profile into a never-short paneling plan:
// flat -> curvature-corrected true -> safe -> tiled. Pure (no DB, no PDF), so the
// repo result shape is passed structurally.

import { describe, expect, it } from 'vitest';
import { buildPrintPlan, type CurvatureData, type PrintPlanProfile } from '../lib/print/print-pack';
import type { VehicleDims } from '../lib/brief/quality';
import type { BriefPanel } from '../components/brief/steps';

// Two panels on the driver side (their union maps to the vehicle length).
const PANELS: BriefPanel[] = [
  { id: 'door', name: 'Driver Door', view: 'driver', outlinePath: 'M0 0 L100 0 L100 60 L0 60 Z' },
  {
    id: 'quarter',
    name: 'Rear Quarter',
    view: 'driver',
    outlinePath: 'M100 0 L160 0 L160 60 L100 60 Z',
  },
];
const DIMS: VehicleDims = { lengthMm: 5531, widthMm: 2032 }; // Transit-ish

const PROFILE: PrintPlanProfile = {
  printerKey: 'roland_vg3',
  printerLabel: 'Roland TrueVIS VG3-540 (54 in)',
  nominalWidthIn: 54,
  effectiveWidthIn: 52.5,
  overlapIn: 0.5,
  bleedIn: 0.25,
};

const curvature = (over: Partial<CurvatureData> = {}): CurvatureData => ({
  bodyType: 'van',
  panels: [],
  priors: [
    { bodyType: 'van', panelClass: 'door', viewAxis: 'length', k: 1.1, margin: 0.08 },
    { bodyType: 'van', panelClass: 'quarter', viewAxis: 'length', k: 1.15, margin: 0.08 },
    { bodyType: 'van', panelClass: 'panel', viewAxis: 'length', k: 1.15, margin: 0.08 },
  ],
  ...over,
});

describe('buildPrintPlan - curvature correction is applied and never short', () => {
  it('produces safe dims >= true >= flat for each panel', () => {
    const plan = buildPrintPlan({
      panels: PANELS,
      dims: DIMS,
      curvature: curvature(),
      profile: PROFILE,
    });
    expect(plan.panels.length).toBe(2);
    for (const p of plan.panels) {
      expect(p.trueWidthIn).toBeGreaterThanOrEqual(p.flatWidthIn);
      expect(p.safeWidthIn).toBeGreaterThanOrEqual(p.trueWidthIn);
      expect(p.trueHeightIn).toBeGreaterThanOrEqual(p.flatHeightIn);
      expect(p.safeHeightIn).toBeGreaterThanOrEqual(p.trueHeightIn);
    }
  });

  it('uses the per-panel class prior (door 1.10, quarter 1.15)', () => {
    const plan = buildPrintPlan({
      panels: PANELS,
      dims: DIMS,
      curvature: curvature(),
      profile: PROFILE,
    });
    const door = plan.panels.find((p) => p.id === 'door')!;
    const quarter = plan.panels.find((p) => p.id === 'quarter')!;
    expect(door.trueWidthIn).toBeCloseTo(door.flatWidthIn * 1.1, 3);
    expect(quarter.trueWidthIn).toBeCloseTo(quarter.flatWidthIn * 1.15, 3);
    expect(door.source).toBe('class_prior');
    expect(door.estimated).toBe(true);
  });

  it('a measured panel factor wins over the prior, not estimated', () => {
    const cd = curvature({
      panels: [
        {
          id: 'door',
          name: 'Driver Door',
          view: 'driver',
          factor: 1.2,
          source: 'measured_in_shop',
          margin: 0.02,
        },
      ],
    });
    const plan = buildPrintPlan({ panels: PANELS, dims: DIMS, curvature: cd, profile: PROFILE });
    const door = plan.panels.find((p) => p.id === 'door')!;
    expect(door.trueWidthIn).toBeCloseTo(door.flatWidthIn * 1.2, 3);
    expect(door.source).toBe('measured_in_shop');
    expect(door.estimated).toBe(false);
  });

  it('every tile fits the effective media width and panel coverage is never short', () => {
    const plan = buildPrintPlan({
      panels: PANELS,
      dims: DIMS,
      curvature: curvature(),
      profile: PROFILE,
    });
    for (const p of plan.panels) {
      for (const t of p.paneled.tiles)
        expect(t.widthIn).toBeLessThanOrEqual(PROFILE.effectiveWidthIn + 1e-9);
      const net = p.paneled.tiles.reduce(
        (s, t, i) => s + t.widthIn - (i > 0 ? t.overlapPrevIn : 0),
        0,
      );
      const trueAcross = p.paneled.acrossAxis === 'width' ? p.safeWidthIn : p.safeHeightIn;
      expect(net).toBeGreaterThanOrEqual(trueAcross - 1e-9);
    }
  });
});

describe('buildPrintPlan - no curvature data falls back to conservative + warns', () => {
  it('with curvature=null every panel is unknown/needsMeasurement but never short', () => {
    const plan = buildPrintPlan({ panels: PANELS, dims: DIMS, curvature: null, profile: PROFILE });
    expect(plan.estimated).toBe(true);
    expect(plan.needsMeasurement).toBe(true);
    for (const p of plan.panels) {
      expect(p.source).toBe('unknown');
      expect(p.warning).toMatch(/measure/i);
      expect(p.trueWidthIn).toBeGreaterThan(p.flatWidthIn); // k=1.27 fallback
    }
  });
});

describe('buildPrintPlan - totals + restriction', () => {
  it('totals match the sum of paneled panels', () => {
    const plan = buildPrintPlan({
      panels: PANELS,
      dims: DIMS,
      curvature: curvature(),
      profile: PROFILE,
    });
    const lf = plan.panels.reduce((s, p) => s + p.paneled.linearFeet, 0);
    expect(plan.totalLinearFeet).toBeCloseTo(lf, 6);
    expect(plan.printer.effectiveWidthIn).toBe(52.5);
  });

  it('includedPanelIds restricts which panels are paneled', () => {
    const plan = buildPrintPlan({
      panels: PANELS,
      dims: DIMS,
      curvature: curvature(),
      profile: PROFILE,
      includedPanelIds: ['door'],
    });
    expect(plan.panels.map((p) => p.id)).toEqual(['door']);
  });

  it('skips panels with no derivable flat size rather than printing nonsense', () => {
    const bad: BriefPanel[] = [{ id: 'nopath', name: 'No Path', view: 'driver' }];
    const plan = buildPrintPlan({
      panels: bad,
      dims: DIMS,
      curvature: curvature(),
      profile: PROFILE,
    });
    expect(plan.panels).toHaveLength(0);
    expect(plan.skipped.length).toBeGreaterThanOrEqual(1);
  });
});
