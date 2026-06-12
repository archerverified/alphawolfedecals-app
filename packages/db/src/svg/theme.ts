// Shared annotation theme for every sheet-rendering surface: QC overlays,
// 1/20 layout sheets, and future export PDFs. Token layering per the design
// system: one brand primitive (the Alpha Wolf annotation cyan), then semantic
// dimension-callout constants built on it. Renderers import these — never
// hardcode the hex — so a future surface picks up the identical style.
//
// Callout style (Archer, 2026-06-12): classic pattern-sheet dimensions OUTSIDE
// the vehicle art — extension lines + double-headed arrows in EXACTLY
// brand.cyan, labels in black, no boxes or fills behind text.

import { defaultAxisForView } from './calibrate.js';

export const brand = {
  /** Alpha Wolf annotation cyan. Dimension callouts draw in exactly this. */
  cyan: '#00AEEF',
  /** Sheet ink — header bands, titles, on-art panel labels. */
  ink: '#141b2d',
} as const;

// All linear values are sheet pixels at the canonical 1920-wide sheet.
// Renderers working in another unit space multiply by their own unitScale
// (drawing units per sheet pixel) — renderDimensionCallout does this for you.
export const dimensionCallout = {
  stroke: brand.cyan,
  strokeWidth: 2,
  /** Arrowhead length along the line / half-width across it. */
  arrowLength: 13,
  arrowHalfWidth: 4.5,
  /** Gap between the measured content edge and the start of an extension line. */
  extensionGap: 8,
  /** How far extension lines run past the dimension line. */
  extensionOvershoot: 7,
  /** Distance from the measured content edge to the dimension line. */
  offset: 26,
  /** Spacing between stacked dimension rows (overall length, then wheelbase). */
  rowGap: 40,
  label: {
    fill: '#000000',
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: 15,
    /** Distance from the dimension line to the label baseline. */
    gap: 21,
  },
} as const;

const fmtMm = (mm: number): string => mm.toLocaleString('en-US');
const mmToInches = (mm: number): string => (mm / 25.4).toFixed(1);
/** Canonical dimension label, e.g. "Overall length 4,708 mm · 185.4 in". */
export const dimensionText = (name: string, mm: number): string =>
  `${name} ${fmtMm(mm)} mm · ${mmToInches(mm)} in`;

// Shared SVG string helpers — one escaping/rounding policy for every
// annotation surface.
const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
export const escXml = (s: string): string => s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!);
export const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Pattern-sheet dimension annotation for one view. Geometry policy lives in
 * the renderers: `length` spans the view's measured content below it;
 * `wheelbase` and `height` carry calibrated ratios — wheelbase centred under
 * the length row, height as a vertical callout beside the view.
 */
export type DimensionAnnotation =
  | { kind: 'length'; label: string }
  | { kind: 'wheelbase'; label: string; ratio: number }
  | { kind: 'height'; label: string; ratio: number };

export type AnnotationDims = {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  wheelbaseMm?: number | null;
};

/**
 * Which annotations a view carries (Archer, 2026-06-12): overall length below
 * profile/top views (+ wheelbase when known), overall height beside front/rear
 * elevations. ONE policy for every surface — the QC overlay and the layout
 * sheet consume this same list so they can never disagree on what a view
 * shows; only fit/placement is per-surface.
 */
export function annotationsForView(view: string, dims: AnnotationDims): DimensionAnnotation[] {
  if (defaultAxisForView(view) === 'width') {
    return [
      {
        kind: 'height',
        label: dimensionText('Overall height', dims.heightMm),
        ratio: dims.heightMm / dims.widthMm,
      },
    ];
  }
  const out: DimensionAnnotation[] = [
    { kind: 'length', label: dimensionText('Overall length', dims.lengthMm) },
  ];
  if (dims.wheelbaseMm) {
    out.push({
      kind: 'wheelbase',
      label: dimensionText('Wheelbase', dims.wheelbaseMm),
      ratio: dims.wheelbaseMm / dims.lengthMm,
    });
  }
  return out;
}

export type DimensionCalloutSpec = {
  /** horizontal = measures along x (line is horizontal); vertical = along y. */
  orientation: 'horizontal' | 'vertical';
  /** Measured span in drawing units along the measured axis: [start, end]. */
  span: [number, number];
  /**
   * Cross-axis position of the content edge the extension lines spring from
   * (horizontal: the art's bottom y; vertical: the art's left or right x).
   */
  edge: number;
  /**
   * Which side of the content the callout sits on along the cross axis:
   * +1 = below / right of the content, -1 = above / left of it.
   */
  side: 1 | -1;
  label: string;
  /** Drawing units per sheet pixel (default 1). */
  unitScale?: number;
  /** Override the edge→line distance (sheet px), e.g. for stacked rows. */
  offsetPx?: number;
  /** Skip extension lines (stacked rows reuse the first row's). */
  extensionLines?: boolean;
};

/**
 * One classic pattern-sheet dimension callout: two extension lines springing
 * from the measured content edge, a dimension line with outward-pointing
 * arrowheads at both ends, and a black label centred on the far side of the
 * line. Pure string assembly; returns a single <g> element.
 */
export function renderDimensionCallout(spec: DimensionCalloutSpec): string {
  const t = dimensionCallout;
  const u = spec.unitScale ?? 1;
  const dir = spec.side;
  const [a, b] = spec.span[0] <= spec.span[1] ? spec.span : [spec.span[1], spec.span[0]];
  const line = spec.edge + dir * (spec.offsetPx ?? t.offset) * u;
  const extFrom = spec.edge + dir * t.extensionGap * u;
  const extTo = line + dir * t.extensionOvershoot * u;
  const labelPos = line + dir * t.label.gap * u;
  const sw = r2(t.strokeWidth * u);
  const aL = t.arrowLength * u;
  const aW = t.arrowHalfWidth * u;
  const mid = (a + b) / 2;

  const parts: string[] = [];
  const h = spec.orientation === 'horizontal';
  const L = (x1: number, y1: number, x2: number, y2: number): string =>
    `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}"/>`;
  const arrow = (tipMain: number, inward: 1 | -1): string => {
    // Tip on the dimension line at the span end, body pointing inward.
    const base = tipMain + inward * aL;
    const p = h
      ? `${r2(tipMain)},${r2(line)} ${r2(base)},${r2(line - aW)} ${r2(base)},${r2(line + aW)}`
      : `${r2(line)},${r2(tipMain)} ${r2(line - aW)},${r2(base)} ${r2(line + aW)},${r2(base)}`;
    return `<polygon points="${p}" fill="${t.stroke}" stroke="none"/>`;
  };

  parts.push(`<g stroke="${t.stroke}" stroke-width="${sw}" fill="none">`);
  if (spec.extensionLines !== false) {
    parts.push(h ? L(a, extFrom, a, extTo) : L(extFrom, a, extTo, a));
    parts.push(h ? L(b, extFrom, b, extTo) : L(extFrom, b, extTo, b));
  }
  parts.push(h ? L(a, line, b, line) : L(line, a, line, b));
  parts.push('</g>');
  parts.push(arrow(a, 1), arrow(b, -1));

  const fs = r2(t.label.fontSize * u);
  if (h) {
    // side -1 puts the label above the line; baseline shift keeps the gap true.
    const y = dir === 1 ? labelPos + fs * 0.35 : labelPos;
    parts.push(
      `<text x="${r2(mid)}" y="${r2(y)}" text-anchor="middle" fill="${t.label.fill}" font-family="${t.label.fontFamily}" font-size="${fs}">${escXml(spec.label)}</text>`,
    );
  } else {
    const x = dir === 1 ? labelPos + fs * 0.35 : labelPos;
    parts.push(
      `<text x="${r2(x)}" y="${r2(mid)}" text-anchor="middle" fill="${t.label.fill}" font-family="${t.label.fontFamily}" font-size="${fs}" transform="rotate(-90 ${r2(x)} ${r2(mid)})">${escXml(spec.label)}</text>`,
    );
  }
  return parts.join('');
}
