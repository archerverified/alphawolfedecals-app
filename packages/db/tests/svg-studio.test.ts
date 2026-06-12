// Unit tests for the Studio half of the SVG toolchain (Goal 6): outline
// builder (proved by round-tripping through the validator), calibration math,
// and the layout-sheet builder.

import { parseSync } from 'svgson';
import { describe, expect, test } from 'vitest';
import { buildOutlineSvg, type BuildOutlineInput } from '../src/svg/build-outline';
import { defaultAxisForView, mmPerUnitFor } from '../src/svg/calibrate';
import {
  assembleLayoutSheetFromRows,
  buildLayoutSheetSvg,
  type LayoutSheetInput,
} from '../src/svg/layout-sheet';
import { buildQcOverlaySvg, viewScanWindows } from '../src/svg/qc-overlay';
import { brand, dimensionText, renderDimensionCallout } from '../src/svg/theme';
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
      annotations: [{ kind: 'length' as const, label: 'Overall length 11,125 mm · 437.9 in' }],
    })),
  };

  test('renders a well-formed sheet with code, title, scale and callouts', () => {
    const svg = buildLayoutSheetSvg(SHEET);
    expect(() => parseSync(svg)).not.toThrow();
    expect(svg).toContain('AW-TPL-0002');
    expect(svg).toContain('1 : 20');
    expect(svg).toContain('ALPHA WOLF');
    expect(svg).toContain('Overall length 11,125 mm · 437.9 in');
    expect(svg).toContain('DRIVER');
    expect(svg).toContain('NOT FOR REDISTRIBUTION');
  });

  test('dimension callouts use the brand cyan with black labels — no red boxes', () => {
    const svg = buildLayoutSheetSvg(SHEET);
    expect(svg).toContain(brand.cyan);
    // Label text is black with no box/fill behind it.
    expect(svg).toMatch(/fill="#000000"[^>]*>Overall length/);
    // The retired styles: red panel boxes and the old grey tick-line callout.
    expect(svg).not.toContain('#dc2626');
    expect(svg).not.toContain('#9aa3b5"><line');
  });

  test('throws on empty input', () => {
    expect(() => buildLayoutSheetSvg({ ...SHEET, views: [] })).toThrow(/at least one view/);
  });
});

describe('assembleLayoutSheetFromRows annotations', () => {
  const ROWS = [
    {
      name: 'Hood',
      view: 'front',
      svgPath: 'M0 0 L200 0 L200 100 L0 100 Z',
      wrapSafeZone: { clip_path: 'M10 10 L190 10 L190 90 L10 90 Z' },
      installOrder: 1,
    },
    {
      name: 'Door',
      view: 'driver',
      svgPath: 'M0 0 L500 0 L500 100 L0 100 Z',
      wrapSafeZone: { clip_path: 'M10 10 L490 10 L490 90 L10 90 Z' },
      installOrder: 2,
    },
  ];
  const META = {
    title: 'BMW X3',
    yearLabel: '2024',
    code: 'AW-TPL-0001',
    scaleDenom: 20,
    dims: { lengthMm: 4708, widthMm: 1891, heightMm: 1676, wheelbaseMm: 2864 },
  };

  test('profile views get length + wheelbase; elevations get height beside', () => {
    const sheet = assembleLayoutSheetFromRows(META, ROWS);
    const front = sheet.views.find((v) => v.view === 'front')!;
    expect(front.annotations).toEqual([
      {
        kind: 'height',
        label: 'Overall height 1,676 mm · 66.0 in',
        ratio: 1676 / 1891,
      },
    ]);
    const driver = sheet.views.find((v) => v.view === 'driver')!;
    expect(driver.annotations?.map((a) => a.kind)).toEqual(['length', 'wheelbase']);
    expect(driver.annotations?.[1]?.label).toBe('Wheelbase 2,864 mm · 112.8 in');
    const svg = buildLayoutSheetSvg(sheet);
    expect(() => parseSync(svg)).not.toThrow();
    expect(svg).toContain('Wheelbase 2,864 mm');
    expect(svg).toContain('Overall height 1,676 mm');
  });

  test('no wheelbase row when the vehicle has none', () => {
    const sheet = assembleLayoutSheetFromRows(
      { ...META, dims: { ...META.dims, wheelbaseMm: null } },
      ROWS,
    );
    const driver = sheet.views.find((v) => v.view === 'driver')!;
    expect(driver.annotations?.map((a) => a.kind)).toEqual(['length']);
  });
});

describe('buildQcOverlaySvg', () => {
  const INPUT = {
    viewBox: { width: 1920, height: 1080 },
    dims: { lengthMm: 4708, widthMm: 1891, heightMm: 1676, wheelbaseMm: 2864 },
    contentBand: { top: 70, bottom: 980 },
    views: [
      {
        view: 'driver',
        panels: [
          {
            name: 'Front Door',
            outlinePath: 'M700 200 L1700 200 L1700 350 L700 350 Z',
            wrapSafePath: 'M710 210 L1690 210 L1690 340 L710 340 Z',
            installOrder: 1,
          },
        ],
        artBounds: { minX: 690, minY: 120, maxX: 1715, maxY: 420 },
      },
      {
        view: 'front',
        panels: [
          {
            name: 'Hood & Fascia',
            outlinePath: 'M230 645 L615 645 L615 845 L230 845 Z',
            wrapSafePath: 'M240 655 L605 655 L605 835 L240 835 Z',
            installOrder: 2,
          },
        ],
        artBounds: { minX: 228, minY: 560, maxX: 615, maxY: 900 },
      },
    ],
  };

  test('keeps blue zones, drops red boxes, draws cyan callouts outside the art', () => {
    const svg = buildQcOverlaySvg(INPUT);
    expect(() => parseSync(svg)).not.toThrow();
    // Blue zone rendering unchanged; red gone entirely.
    expect(svg).toContain('fill="#2563eb" fill-opacity="0.13"');
    expect(svg).not.toContain('#dc2626');
    // Callouts: brand cyan strokes, black labels, both dimensions + wheelbase.
    expect(svg).toContain(brand.cyan);
    expect(svg).toContain(dimensionText('Overall length', 4708));
    expect(svg).toContain(dimensionText('Wheelbase', 2864));
    expect(svg).toContain(dimensionText('Overall height', 1676));
    expect(svg).toMatch(/fill="#000000"[^>]*>Overall length/);
    // The length dimension line sits below the art, inside the content band.
    const dim = svg.match(/<line x1="690" y1="([\d.]+)" x2="1715" y2="([\d.]+)"\/>/);
    expect(dim).not.toBeNull();
    expect(Number(dim![1])).toBeGreaterThan(420);
    expect(Number(dim![1])).toBeLessThan(980);
    // XML-hostile panel names are escaped.
    expect(svg).toContain('Hood &amp; Fascia');
  });

  test('escapes label text and survives degenerate panel paths', () => {
    const svg = buildQcOverlaySvg({
      ...INPUT,
      views: [
        {
          ...INPUT.views[0]!,
          panels: [{ ...INPUT.views[0]!.panels[0]!, outlinePath: 'M0 0 Z' }],
        },
      ],
    });
    expect(() => parseSync(svg)).not.toThrow();
  });
});

describe('viewScanWindows', () => {
  test('clips neighbouring windows at the midline between panel bboxes', () => {
    const wins = viewScanWindows(
      [
        { view: 'back', bounds: { minX: 240, minY: 210, maxX: 600, maxY: 400 } },
        { view: 'front', bounds: { minX: 230, minY: 645, maxX: 615, maxY: 845 } },
      ],
      { width: 1920, height: 1080 },
      { top: 70, bottom: 980 },
    );
    // Vertically adjacent: both windows meet at the midline (between 400 and 645).
    expect(wins.back!.maxY).toBeLessThanOrEqual(522.5);
    expect(wins.front!.minY).toBeGreaterThanOrEqual(522.5);
    // And never escape the sheet's content band.
    expect(wins.back!.minY).toBeGreaterThanOrEqual(70);
    expect(wins.front!.maxY).toBeLessThanOrEqual(980);
  });
});

describe('renderDimensionCallout', () => {
  test('horizontal callout: extension lines, outward arrows, black label', () => {
    const g = renderDimensionCallout({
      orientation: 'horizontal',
      span: [100, 900],
      edge: 500,
      side: 1,
      label: 'Overall length 4,708 mm · 185.4 in',
    });
    expect(() => parseSync(`<svg>${g}</svg>`)).not.toThrow();
    expect(g).toContain(`stroke="${brand.cyan}"`);
    expect(g.match(/<polygon/g)).toHaveLength(2);
    expect(g).toMatch(/fill="#000000"/);
  });

  test('vertical callout rotates its label', () => {
    const g = renderDimensionCallout({
      orientation: 'vertical',
      span: [100, 400],
      edge: 200,
      side: -1,
      label: 'Overall height 1,676 mm · 66.0 in',
    });
    expect(g).toContain('rotate(-90');
  });
});
