// End-to-end print-engine verification (Goal 22 / D5). Panels a realistic
// approved design to the owner's Roland VG3 profile (52.5 in effective, 0.5 in
// overlap, 0.25 in bleed) through the WHOLE pipeline: flat (panelPrintSizesIn) ->
// curvature-corrected true -> never-short safe -> tiled -> PDF. Proves the cardinal
// invariant (nothing short, no tile over media) on real geometry, and logs the
// panel math. Set PRINT_VERIFY_OUT=<path> to also write the actual PDF artifact.

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPrintPlan, type CurvatureData, type PrintPlanProfile } from '../lib/print/print-pack';
import { buildPrintPackPdf } from '../lib/print/print-pack-pdf';
import type { VehicleDims } from '../lib/brief/quality';
import type { BriefPanel } from '../components/brief/steps';

// A van side-wrap (driver view): the panel union maps to the vehicle length.
// Widths chosen so each panel's flat size lands in a realistic range.
const PANELS: BriefPanel[] = [
  {
    id: 'fdoor',
    name: 'Driver Front Door',
    view: 'driver',
    outlinePath: 'M0 0 L52 0 L52 56 L0 56 Z',
  },
  {
    id: 'rdoor',
    name: 'Driver Rear Door',
    view: 'driver',
    outlinePath: 'M52 0 L104 0 L104 56 L52 56 Z',
  },
  {
    id: 'quarter',
    name: 'Driver Rear Quarter',
    view: 'driver',
    outlinePath: 'M104 0 L150 0 L150 56 L104 56 Z',
  },
  {
    id: 'rocker',
    name: 'Driver Rocker',
    view: 'driver',
    outlinePath: 'M0 56 L150 56 L150 64 L0 64 Z',
  },
];
const DIMS: VehicleDims = { lengthMm: 5850, widthMm: 2030 }; // Transit 250 long wheelbase-ish

const PROFILE: PrintPlanProfile = {
  printerKey: 'roland_vg3',
  printerLabel: 'Roland TrueVIS VG3-540 (54 in)',
  nominalWidthIn: 54,
  effectiveWidthIn: 52.5,
  overlapIn: 0.5,
  bleedIn: 0.25,
};

// Front door is MEASURED (owner laid out the vinyl); the rest fall to van priors.
const CURV: CurvatureData = {
  bodyType: 'van',
  panels: [
    {
      id: 'fdoor',
      name: 'Driver Front Door',
      view: 'driver',
      factor: 1.1,
      source: 'measured_in_shop',
      margin: 0.02,
    },
  ],
  priors: [
    { bodyType: 'van', panelClass: 'door', viewAxis: 'length', k: 1.1, margin: 0.08 },
    { bodyType: 'van', panelClass: 'quarter', viewAxis: 'length', k: 1.15, margin: 0.08 },
    { bodyType: 'van', panelClass: 'rocker', viewAxis: 'length', k: 1.05, margin: 0.08 },
    { bodyType: 'van', panelClass: 'panel', viewAxis: 'length', k: 1.15, margin: 0.08 },
  ],
};

describe('D5 end-to-end: panel a real design to the Roland VG3, nothing short', () => {
  const plan = buildPrintPlan({ panels: PANELS, dims: DIMS, curvature: CURV, profile: PROFILE });

  it('produced a plan for every panel with derivable geometry', () => {
    expect(plan.panels.length).toBe(PANELS.length);
     
    console.log(
      '\n=== Goal 22 D5 panel math (Roland VG3, eff 52.5 in, overlap 0.5, bleed 0.25) ===',
    );
    for (const p of plan.panels) {
      const tiles = p.paneled.tiles
        .map((t) => `${t.widthIn.toFixed(1)}x${t.lengthIn.toFixed(1)}`)
        .join(', ');
       
      console.log(
        `${p.name.padEnd(22)} flat ${p.flatWidthIn.toFixed(1)}x${p.flatHeightIn.toFixed(1)}` +
          ` -> true(k${p.curvatureK.toFixed(3)}) ${p.trueWidthIn.toFixed(1)}x${p.trueHeightIn.toFixed(1)}` +
          ` -> safe ${p.safeWidthIn.toFixed(1)}x${p.safeHeightIn.toFixed(1)}` +
          ` | ${p.source} | tiles[${tiles}] | ${p.paneled.linearFeet.toFixed(1)} lin ft`,
      );
    }
     
    console.log(
      `TOTAL: ${plan.totalLinearFeet.toFixed(1)} linear ft, ~${plan.totalMediaAreaSqFt.toFixed(1)} sq ft` +
        ` | estimated=${plan.estimated} needsMeasurement=${plan.needsMeasurement}\n`,
    );
  });

  it('NEVER SHORT: safe >= true >= flat, and net tiled coverage >= the true extent', () => {
    for (const p of plan.panels) {
      expect(p.trueWidthIn).toBeGreaterThanOrEqual(p.flatWidthIn - 1e-9);
      expect(p.trueHeightIn).toBeGreaterThanOrEqual(p.flatHeightIn - 1e-9);
      expect(p.safeWidthIn).toBeGreaterThanOrEqual(p.trueWidthIn - 1e-9);
      expect(p.safeHeightIn).toBeGreaterThanOrEqual(p.trueHeightIn - 1e-9);
      const net = p.paneled.tiles.reduce(
        (s, t, i) => s + t.widthIn - (i > 0 ? t.overlapPrevIn : 0),
        0,
      );
      const trueAcross = p.paneled.acrossAxis === 'width' ? p.safeWidthIn : p.safeHeightIn;
      expect(net).toBeGreaterThanOrEqual(trueAcross - 1e-9);
    }
  });

  it('NO tile exceeds the effective media width', () => {
    for (const p of plan.panels) {
      for (const t of p.paneled.tiles) {
        expect(t.widthIn).toBeLessThanOrEqual(PROFILE.effectiveWidthIn + 1e-9);
      }
    }
  });

  it('the measured front door uses its measured factor (not estimated)', () => {
    const fdoor = plan.panels.find((p) => p.id === 'fdoor')!;
    expect(fdoor.source).toBe('measured_in_shop');
    expect(fdoor.estimated).toBe(false);
    expect(fdoor.curvatureK).toBeCloseTo(1.1, 3);
  });

  it('renders a Print Pack PDF that opens (and writes it when PRINT_VERIFY_OUT is set)', async () => {
    const bytes = await buildPrintPackPdf(plan, {
      projectName: 'D5 Verification Van',
      vehicleLabel: '2024 Ford Transit 250 (long)',
      generatedAtIso: '2026-06-23T00:00:00.000Z',
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(2000);
    const out = process.env.PRINT_VERIFY_OUT;
    if (out) {
      writeFileSync(out, bytes);
       
      console.log(`wrote Print Pack PDF -> ${out} (${bytes.byteLength} bytes)`);
    }
  });
});
