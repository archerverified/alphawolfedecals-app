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
import { panelNumbers } from '../src/svg/numbering';
import { buildQcOverlaySvg, viewScanWindows } from '../src/svg/qc-overlay';
import {
  brand,
  dimensionText,
  legendMetrics,
  panelNumber,
  renderDimensionCallout,
  renderPanelLegend,
  renderPanelNumber,
} from '../src/svg/theme';
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

  test('no panel names on the art — subtle numerals + a legend strip', () => {
    const svg = buildLayoutSheetSvg(SHEET);
    // Each name appears exactly once: in the legend, never inside a view group.
    expect(svg.match(/Port Hull — Bow &amp; Mid/g)).toHaveLength(1);
    expect(svg).toContain('PANEL LEGEND');
    // The on-art numeral is the bare number at the spec's subtle opacity.
    expect(svg).toContain(`<g opacity="${panelNumber.opacity}">`);
    expect(svg).not.toContain('1. Port Hull');
    // Legend numbers are spatial (driver before passenger here — same order).
    expect(svg).toMatch(/font-weight="700">1<\/text><text[^>]*>Port Hull — Bow &amp; Mid/);
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
    // XML-hostile panel names are escaped (in the legend — their only home).
    expect(svg).toContain('Hood &amp; Fascia');
  });

  test('panel names live only in the appended legend; numerals stay subtle', () => {
    const svg = buildQcOverlaySvg(INPUT);
    // viewBox grows by the legend strip (2 panels → one 2-row column).
    const legendH = legendMetrics(2).height;
    expect(svg).toContain(`viewBox="0 0 1920 ${1080 + legendH}"`);
    expect(svg).toContain('PANEL LEGEND');
    // One occurrence per name — the legend; nothing drawn over the art.
    expect(svg.match(/Front Door/g)).toHaveLength(1);
    expect(svg).not.toContain('1. Front Door');
    expect(svg).toContain(`<g opacity="${panelNumber.opacity}">`);
    // Numbering is spatial (front view first), NOT installOrder: the front
    // view's Hood & Fascia (installOrder 2) is panel 1.
    expect(svg).toMatch(/font-weight="700">1<\/text><text[^>]*>Hood &amp; Fascia/);
    expect(svg).toMatch(/font-weight="700">2<\/text><text[^>]*>Front Door/);
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

describe('panelNumbers', () => {
  const rect = (x: number, y: number, w = 100, h = 50): string =>
    `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;

  test('orders by view (front first), then reading rows top-to-bottom, left-to-right', () => {
    const panels = [
      { view: 'passenger', name: 'P-rear', installOrder: 9, outlinePath: rect(500, 0) },
      { view: 'driver', name: 'D-low', installOrder: 2, outlinePath: rect(100, 200) },
      { view: 'driver', name: 'D-high', installOrder: 3, outlinePath: rect(100, 50) },
      { view: 'driver', name: 'D-right', installOrder: 1, outlinePath: rect(400, 50) },
      { view: 'front', name: 'Hood', installOrder: 8, outlinePath: rect(0, 0) },
    ];
    expect(panelNumbers(panels)).toEqual([5, 4, 2, 3, 1]);
  });

  test('stacked bands number top-to-bottom even when lower bands start further left', () => {
    // The coach failure mode: full-length bands whose minX differs by nose
    // curvature — raw minX ordering would read 3,2,1 down the sheet.
    const panels = [
      { view: 'driver', name: 'Beltline', installOrder: 3, outlinePath: rect(15, 200, 900, 30) },
      { view: 'driver', name: 'Window', installOrder: 2, outlinePath: rect(30, 100, 880, 80) },
      { view: 'driver', name: 'Upper', installOrder: 1, outlinePath: rect(55, 40, 850, 50) },
    ];
    expect(panelNumbers(panels)).toEqual([3, 2, 1]);
  });

  test('side-by-side run stays left-to-right despite roofline minY differences', () => {
    const panels = [
      { view: 'driver', name: 'Quarter', installOrder: 1, outlinePath: rect(700, 90, 200, 200) },
      { view: 'driver', name: 'Door', installOrder: 2, outlinePath: rect(400, 140, 280, 150) },
      { view: 'driver', name: 'Fender', installOrder: 3, outlinePath: rect(100, 150, 280, 140) },
    ];
    expect(panelNumbers(panels)).toEqual([3, 2, 1]);
  });

  test('is stable: same rows in any input order derive the same numbers', () => {
    const panels = [
      { view: 'driver', name: 'A', installOrder: 1, outlinePath: rect(0, 0) },
      { view: 'front', name: 'B', installOrder: 2, outlinePath: rect(0, 0) },
      { view: 'back', name: 'C', installOrder: 3, outlinePath: rect(0, 0) },
    ];
    const byPanel = new Map(panelNumbers(panels).map((n, i) => [panels[i]!.name, n]));
    const reversed = [...panels].reverse();
    const byPanelRev = new Map(panelNumbers(reversed).map((n, i) => [reversed[i]!.name, n]));
    expect(byPanelRev).toEqual(byPanel);
  });

  test('degenerate outlines sort after positioned panels but stay numbered', () => {
    const panels = [
      { view: 'driver', name: 'Ghost', installOrder: 1, outlinePath: 'M0 0 Z' },
      { view: 'driver', name: 'Door', installOrder: 2, outlinePath: rect(0, 0) },
    ];
    expect(panelNumbers(panels)).toEqual([2, 1]);
  });

  test('unknown views sort after known views, by name, and never merge rows', () => {
    // Two non-canonical views whose local Y-extents overlap must not cluster
    // into one reading row — their coordinate spaces are unrelated.
    const panels = [
      { view: 'starboard', name: 'S1', installOrder: 1, outlinePath: rect(0, 0) },
      { view: 'port', name: 'P1', installOrder: 2, outlinePath: rect(500, 0) },
      { view: 'port', name: 'P2', installOrder: 3, outlinePath: rect(0, 0) },
      { view: 'driver', name: 'Known', installOrder: 4, outlinePath: rect(0, 0) },
    ];
    // driver first; then port (alphabetical) reading left-to-right; then starboard.
    expect(panelNumbers(panels)).toEqual([4, 3, 2, 1]);
  });
});

describe('renderPanelNumber', () => {
  const bigBox = { minX: 0, minY: 0, maxX: 300, maxY: 200 };

  test('centres a bare numeral at the spec opacity when the panel fits it', () => {
    const g = renderPanelNumber({ bbox: bigBox, n: 7 });
    expect(() => parseSync(`<svg>${g}</svg>`)).not.toThrow();
    expect(g).toContain(`opacity="${panelNumber.opacity}"`);
    expect(g).toContain('>7</text>');
    expect(g).not.toContain('<line');
  });

  test('thin strip leads off its left end at the band centreline', () => {
    const g = renderPanelNumber({ bbox: { minX: 50, minY: 100, maxX: 350, maxY: 110 }, n: 12 });
    expect(g).toContain('<line');
    // Numeral sits left of the panel at the band's own y — stacked bands keep
    // distinct centrelines, so leader numerals cannot collide.
    const x = Number(g.match(/<text x="([-\d.]+)"/)![1]);
    expect(x).toBeLessThan(50);
    const y = Number(g.match(/<text[^>]*y="([-\d.]+)"/)![1]);
    expect(y).toBeGreaterThan(100);
    expect(y).toBeLessThan(115);
  });

  test('thin strip clamped on the left flips the leader to the right end', () => {
    const g = renderPanelNumber({
      bbox: { minX: 10, minY: 100, maxX: 300, maxY: 110 },
      n: 3,
      clamp: { minX: 0, minY: 0, maxX: 1920, maxY: 1080 },
    });
    const x = Number(g.match(/<text x="([-\d.]+)"/)![1]);
    expect(x).toBeGreaterThan(300);
    expect(g).toContain('text-anchor="start"');
  });

  test('tall sliver puts the numeral beside the panel', () => {
    const g = renderPanelNumber({ bbox: { minX: 50, minY: 0, maxX: 60, maxY: 300 }, n: 4 });
    expect(g).toContain('text-anchor="start"');
    const x = Number(g.match(/<text x="([-\d.]+)"/)![1]);
    expect(x).toBeGreaterThan(60);
  });
});

describe('renderPanelLegend', () => {
  test('ellipsizes names past the column budget — overprint would destroy the mapping', () => {
    const g = renderPanelLegend({
      entries: [{ n: 1, name: 'A'.repeat(80) }],
      x: 0,
      y: 0,
      width: 1800,
    });
    expect(() => parseSync(`<svg>${g}</svg>`)).not.toThrow();
    expect(g).toContain('…');
    expect(g).not.toContain('A'.repeat(60));
  });

  test('shrinks column pitch when the token pitch would overflow the strip width', () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({ n: i + 1, name: `Panel ${i + 1}` }));
    const g = renderPanelLegend({ entries, x: 0, y: 0, width: 1000 });
    // 5 columns into 1000px → pitch 200; the last column starts inside the strip.
    const xs = [...g.matchAll(/text-anchor="end"[^>]*/g)];
    expect(xs.length).toBe(40);
    const numberXs = [...g.matchAll(/<text x="([\d.]+)" y="[\d.]+" text-anchor="end"/g)].map((m) =>
      Number(m[1]),
    );
    expect(Math.max(...numberXs)).toBeLessThan(1000);
  });
});
