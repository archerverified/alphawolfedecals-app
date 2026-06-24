// Print Pack PDF builder (Goal 22 / D3). Renders a PrintPlan into a print-ready
// PDF: page 1 = the panel-layout sheet (printer + media, per-panel tile table,
// totals, never-short + confidence banner); pages 2..N = one schematic per panel
// (tiles drawn to scale with exact physical dims, overlap + bleed marked).

import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildPrintPackPdf } from '../lib/print/print-pack-pdf';
import { buildPrintPlan, type CurvatureData, type PrintPlanProfile } from '../lib/print/print-pack';
import type { VehicleDims } from '../lib/brief/quality';
import type { BriefPanel } from '../components/brief/steps';

const PANELS: BriefPanel[] = [
  { id: 'door', name: 'Driver Door', view: 'driver', outlinePath: 'M0 0 L100 0 L100 60 L0 60 Z' },
  {
    id: 'quarter',
    name: 'Rear Quarter',
    view: 'driver',
    outlinePath: 'M100 0 L160 0 L160 60 L100 60 Z',
  },
];
const DIMS: VehicleDims = { lengthMm: 5531, widthMm: 2032 };
const PROFILE: PrintPlanProfile = {
  printerKey: 'roland_vg3',
  printerLabel: 'Roland TrueVIS VG3-540 (54 in)',
  nominalWidthIn: 54,
  effectiveWidthIn: 52.5,
  overlapIn: 0.5,
  bleedIn: 0.25,
};
const CURV: CurvatureData = {
  bodyType: 'van',
  panels: [],
  priors: [
    { bodyType: 'van', panelClass: 'door', viewAxis: 'length', k: 1.1, margin: 0.08 },
    { bodyType: 'van', panelClass: 'panel', viewAxis: 'length', k: 1.15, margin: 0.08 },
  ],
};

function plan() {
  return buildPrintPlan({ panels: PANELS, dims: DIMS, curvature: CURV, profile: PROFILE });
}

const META = {
  projectName: 'Test Wrap',
  vehicleLabel: '2024 Ford Transit 250',
  generatedAtIso: '2026-06-23T00:00:00.000Z',
};

describe('buildPrintPackPdf', () => {
  it('produces a valid PDF', async () => {
    const bytes = await buildPrintPackPdf(plan(), META);
    expect(bytes.byteLength).toBeGreaterThan(800);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('has one layout-sheet page plus one page per paneled panel', async () => {
    const p = plan();
    const doc = await PDFDocument.load(await buildPrintPackPdf(p, META));
    expect(doc.getPageCount()).toBe(1 + p.panels.length);
  });

  it('embeds optional per-view art without throwing, and never throws on junk bytes', async () => {
    const art = new Map<string, { bytes: Uint8Array; kind: 'png' | 'jpg' }>([
      ['driver', { bytes: new Uint8Array([1, 2, 3, 4]), kind: 'png' }], // junk -> skipped, no throw
    ]);
    const bytes = await buildPrintPackPdf(plan(), { ...META, artByView: art });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('carries PDF metadata (title)', async () => {
    const doc = await PDFDocument.load(await buildPrintPackPdf(plan(), META));
    expect(doc.getTitle() ?? '').toMatch(/print pack/i);
  });

  it('renders even when nothing is paneled (all skipped)', async () => {
    const empty = buildPrintPlan({
      panels: [{ id: 'x', name: 'No Path', view: 'driver' }],
      dims: DIMS,
      curvature: CURV,
      profile: PROFILE,
    });
    const doc = await PDFDocument.load(await buildPrintPackPdf(empty, META));
    expect(doc.getPageCount()).toBe(1); // just the summary sheet
  });
});
