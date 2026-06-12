// Unit tests for the Studio half of the SVG toolchain (Goal 6): outline
// builder (proved by round-tripping through the validator), calibration math,
// and the layout-sheet builder.

import { parseSync } from 'svgson';
import { describe, expect, test } from 'vitest';
import { buildOutlineSvg, type BuildOutlineInput } from '../src/svg/build-outline';
import { defaultAxisForView, mmPerUnitFor } from '../src/svg/calibrate';
import { buildLayoutSheetSvg, type LayoutSheetInput } from '../src/svg/layout-sheet';
import { validateOutlineSvg } from '../src/svg/validate';

const BOAT_INPUT: BuildOutlineInput = {
  viewBox: { width: 1920, height: 1080 },
  vehicleSlug: '2024-contender-bass-boat',
  metadata: 'Authored in Template Studio from Alpha Wolf owned art (aa000002/wrapped.svg).',
  views: [
    {
      view: 'driver',
      translate: { x: 0, y: 60 },
      panels: [
        {
          name: 'Port Hull — Bow & Mid',
          outlinePath: 'M100 300 L800 300 L800 460 L100 460 Z',
          wrapSafePath: 'M110 310 L790 310 L790 450 L110 450 Z',
          finishHint: 'gloss',
          installOrder: 1,
        },
      ],
      noWrapPaths: ['M820 300 L880 300 L880 460 L820 460 Z'],
    },
    {
      view: 'passenger',
      translate: { x: 0, y: 560 },
      panels: [
        {
          name: 'Starboard Hull',
          outlinePath: 'M100 300 L800 300 L800 460 L100 460 Z',
          wrapSafePath: 'M110 310 L790 310 L790 450 L110 450 Z',
          finishHint: 'satin',
          installOrder: 2,
          notes: 'Keep registration numbers clear',
        },
      ],
    },
  ],
};

describe('buildOutlineSvg', () => {
  test('round-trips through validateOutlineSvg with declared views', () => {
    const svg = buildOutlineSvg(BOAT_INPUT);
    const result = validateOutlineSvg(
      svg,
      { lengthMm: 11125, heightMm: 2400 },
      { views: ['driver', 'passenger'] },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.panels).toHaveLength(2);
      const port = result.panels.find((p) => p.view === 'driver')!;
      expect(port.name).toBe('Port Hull — Bow & Mid');
      expect(port.outlinePath).toBe('M100 300 L800 300 L800 460 L100 460 Z');
      expect(port.wrapSafePath).toBe('M110 310 L790 310 L790 450 L110 450 Z');
      expect(port.finishHint).toBe('gloss');
      expect(port.installOrder).toBe(1);
      const starboard = result.panels.find((p) => p.view === 'passenger')!;
      expect(starboard.finishHint).toBe('satin');
      expect(starboard.notes).toBe('Keep registration numbers clear');
    }
  });

  test('escapes XML-hostile characters in names and metadata', () => {
    const svg = buildOutlineSvg({
      ...BOAT_INPUT,
      metadata: 'Traced from <our> photos & "owned" art',
      views: [
        {
          view: 'driver',
          panels: [
            {
              name: 'Door & "Quarter" <left>',
              outlinePath: 'M0 0 L10 0 L10 10 Z',
              wrapSafePath: 'M1 1 L9 1 L9 9 Z',
            },
          ],
        },
      ],
    });
    expect(() => parseSync(svg)).not.toThrow();
    expect(svg).toContain('data-name="Door &amp; &quot;Quarter&quot; &lt;left&gt;"');
  });

  test('requires provenance metadata and at least one view', () => {
    expect(() => buildOutlineSvg({ ...BOAT_INPUT, metadata: '  ' })).toThrow(/provenance/);
    expect(() => buildOutlineSvg({ ...BOAT_INPUT, views: [] })).toThrow(/at least one view/);
  });

  test('auto-numbers install order when omitted', () => {
    const svg = buildOutlineSvg({
      ...BOAT_INPUT,
      views: BOAT_INPUT.views.map((v) => ({
        ...v,
        panels: v.panels.map((p) => ({ ...p, installOrder: undefined })),
      })),
    });
    const result = validateOutlineSvg(
      svg,
      { lengthMm: 11125, heightMm: 2400 },
      { views: ['driver', 'passenger'] },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.panels.map((p) => p.installOrder).sort()).toEqual([1, 2]);
    }
  });
});

describe('calibration', () => {
  test('profile views span length; front/back span width', () => {
    expect(defaultAxisForView('driver')).toBe('length');
    expect(defaultAxisForView('passenger')).toBe('length');
    expect(defaultAxisForView('top')).toBe('length');
    expect(defaultAxisForView('front')).toBe('width');
    expect(defaultAxisForView('back')).toBe('width');
    expect(() => defaultAxisForView('underside')).toThrow(/unknown view/);
  });

  test('mmPerUnitFor divides the real dimension by the document span', () => {
    const dims = { lengthMm: 11125, widthMm: 3050, heightMm: 2400 };
    expect(mmPerUnitFor(dims, { spanUnits: 1390, axis: 'length' })).toBeCloseTo(8.0036, 3);
    expect(mmPerUnitFor(dims, { spanUnits: 610, axis: 'width' })).toBeCloseTo(5.0, 3);
  });

  test('rejects bad spans and missing dimensions', () => {
    const dims = { lengthMm: 11125, widthMm: 0, heightMm: 2400 };
    expect(() => mmPerUnitFor(dims, { spanUnits: 0, axis: 'length' })).toThrow(/positive/);
    expect(() => mmPerUnitFor(dims, { spanUnits: 100, axis: 'width' })).toThrow(/missing/);
  });
});

describe('buildLayoutSheetSvg', () => {
  const SHEET: LayoutSheetInput = {
    title: "Contender 36.5' Bass Boat",
    yearLabel: '2024',
    code: 'AW-TPL-0002',
    scaleDenom: 20,
    viewsLine: '2-View · Port / Starboard profile',
    views: BOAT_INPUT.views.map((v) => ({
      view: v.view,
      translate: v.translate ?? { x: 0, y: 0 },
      panels: v.panels.map((p, i) => ({
        name: p.name,
        outlinePath: p.outlinePath,
        wrapSafePath: p.wrapSafePath,
        installOrder: p.installOrder ?? i + 1,
      })),
      dimensionLabel: '11,125 mm · 437.9 in overall',
    })),
  };

  test('renders a well-formed sheet with code, title, scale and callouts', () => {
    const svg = buildLayoutSheetSvg(SHEET);
    expect(() => parseSync(svg)).not.toThrow();
    expect(svg).toContain('AW-TPL-0002');
    expect(svg).toContain('1 : 20');
    expect(svg).toContain('ALPHA WOLF');
    expect(svg).toContain('11,125 mm · 437.9 in overall');
    expect(svg).toContain('DRIVER');
    expect(svg).toContain('NOT FOR REDISTRIBUTION');
  });

  test('throws on empty input', () => {
    expect(() => buildLayoutSheetSvg({ ...SHEET, views: [] })).toThrow(/at least one view/);
  });
});
