// Curvature correction (Goal 22 / D4). Consumes the spike decision
// (docs/product/2026-06-22-spike-curvature-correction.md): flat 2D template
// dims UNDERCOUNT a curved body, so multiply by a conservative per-(body,
// panel-class) factor k, then add a one-sided never-short safety margin keyed
// on confidence. Never short. Always label estimates and warn.

import { describe, expect, it } from 'vitest';
import {
  CURVATURE_MARGINS,
  UNKNOWN_FALLBACK_K,
  UNKNOWN_FALLBACK_MARGIN,
  resolveCurvature,
  applyCurvature,
  classifyPanel,
  viewAxisFor,
  type CurvatureClassPrior,
} from '../lib/print/curvature';

const prior = (over: Partial<CurvatureClassPrior> = {}): CurvatureClassPrior => ({
  bodyType: 'pickup',
  panelClass: 'door',
  viewAxis: 'length',
  k: 1.1,
  margin: 0.08,
  ...over,
});

describe('confidence margins (D-4, one-sided, never short)', () => {
  it('tighten as confidence rises', () => {
    expect(CURVATURE_MARGINS.measured_in_shop).toBeLessThan(CURVATURE_MARGINS.calibrated_sibling);
    expect(CURVATURE_MARGINS.calibrated_sibling).toBeLessThan(CURVATURE_MARGINS.class_prior);
    expect(CURVATURE_MARGINS.class_prior).toBeLessThanOrEqual(CURVATURE_MARGINS.unknown);
    expect(CURVATURE_MARGINS.measured_in_shop).toBe(0.02);
    expect(CURVATURE_MARGINS.class_prior).toBe(0.08);
  });
});

describe('resolveCurvature (spike §5 resolution order)', () => {
  it('1. a measured_in_shop panel factor wins, tight margin, not estimated', () => {
    const r = resolveCurvature({
      panel: { factor: 1.154, source: 'measured_in_shop', margin: null },
      prior: prior(),
    });
    expect(r.k).toBeCloseTo(1.154, 5);
    expect(r.source).toBe('measured_in_shop');
    expect(r.margin).toBe(0.02);
    expect(r.estimated).toBe(false);
    expect(r.needsMeasurement).toBe(false);
    expect(r.warning).toBeNull();
  });

  it('2. falls back to a measured sibling (calibrated), estimated + warned', () => {
    const r = resolveCurvature({
      panel: null,
      siblingMeasured: { factor: 1.12 },
      prior: prior(),
    });
    expect(r.k).toBeCloseTo(1.12, 5);
    expect(r.source).toBe('calibrated_sibling');
    expect(r.margin).toBe(CURVATURE_MARGINS.calibrated_sibling);
    expect(r.estimated).toBe(true);
    expect(r.warning).toBeTruthy();
  });

  it('3. falls back to the class prior, estimated + warned', () => {
    const r = resolveCurvature({ panel: null, prior: prior({ k: 1.15, margin: 0.08 }) });
    expect(r.k).toBeCloseTo(1.15, 5);
    expect(r.source).toBe('class_prior');
    expect(r.margin).toBe(0.08);
    expect(r.estimated).toBe(true);
    expect(r.warning).toMatch(/estimat/i);
  });

  it('4. unknown: conservative fallback so it is NEVER short, but loud warning', () => {
    const r = resolveCurvature({ panel: null, prior: null });
    expect(r.source).toBe('unknown');
    expect(r.k).toBe(UNKNOWN_FALLBACK_K);
    expect(r.margin).toBe(UNKNOWN_FALLBACK_MARGIN);
    expect(r.estimated).toBe(true);
    expect(r.needsMeasurement).toBe(true);
    expect(r.warning).toMatch(/measure/i);
  });

  it('never shrinks: a bogus k < 1 is clamped up to 1.0 (never short)', () => {
    const r = resolveCurvature({
      panel: { factor: 0.9, source: 'measured_in_shop', margin: null },
    });
    expect(r.k).toBe(1.0);
  });

  it('never negative margin: a bogus negative margin is clamped to 0', () => {
    const r = resolveCurvature({
      panel: { factor: 1.1, source: 'measured_in_shop', margin: -0.5 },
    });
    expect(r.margin).toBe(0);
  });
});

describe('applyCurvature (true = flat·k, safe = true·(1+margin))', () => {
  it('reproduces the F-150 rear-door anchor: 52 -> 60.0 -> 61.2', () => {
    const r = resolveCurvature({
      panel: { factor: 1.154, source: 'measured_in_shop', margin: null },
    });
    const c = applyCurvature(52, r);
    expect(c.trueIn).toBeCloseTo(60.0, 1);
    expect(c.safeIn).toBeCloseTo(61.2, 1);
    expect(c.estimated).toBe(false);
  });

  it('reproduces the F-150 hood class-prior case: 70 -> 78.4 -> 84.7', () => {
    const r = resolveCurvature({
      panel: null,
      prior: prior({ panelClass: 'hood', k: 1.12, margin: 0.08 }),
    });
    const c = applyCurvature(70, r);
    expect(c.trueIn).toBeCloseTo(78.4, 1);
    expect(c.safeIn).toBeCloseTo(84.7, 1);
  });

  it('never short: safe >= true >= flat for every confidence level', () => {
    for (const src of [
      'measured_in_shop',
      'calibrated_sibling',
      'class_prior',
      'unknown',
    ] as const) {
      const r =
        src === 'unknown'
          ? resolveCurvature({ panel: null, prior: null })
          : resolveCurvature({ panel: { factor: 1.05, source: src, margin: null } });
      const c = applyCurvature(40, r);
      expect(c.trueIn).toBeGreaterThanOrEqual(c.flatIn);
      expect(c.safeIn).toBeGreaterThanOrEqual(c.trueIn);
    }
  });
});

describe('panel classification + view axis (prior lookup keys)', () => {
  it('maps view to the spanned axis (front/back -> width, side/top -> length)', () => {
    expect(viewAxisFor('front')).toBe('width');
    expect(viewAxisFor('back')).toBe('width');
    expect(viewAxisFor('driver')).toBe('length');
    expect(viewAxisFor('passenger')).toBe('length');
    expect(viewAxisFor('top')).toBe('length');
    expect(viewAxisFor('weird')).toBeNull();
  });

  it('classifies common panel names by keyword', () => {
    expect(classifyPanel('Driver Front Door')).toBe('door');
    expect(classifyPanel('Hood')).toBe('hood');
    expect(classifyPanel('Front Bumper Fascia')).toBe('bumper');
    expect(classifyPanel('Rear Quarter Panel')).toBe('quarter');
    expect(classifyPanel('Roof')).toBe('roof');
    expect(classifyPanel('Cargo Slab Side')).toBe('slabside');
    expect(classifyPanel('Mystery Trim Bit')).toBe('panel'); // default
  });
});
