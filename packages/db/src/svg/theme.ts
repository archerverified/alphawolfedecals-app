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
  /** Sheet ink — header bands, titles, legend numbers. */
  ink: '#141b2d',
} as const;

// Panel labeling (Archer, 2026-06-12): NO text inside the vehicle art. Each
// panel carries only a barely-visible numeral — low-opacity black, centred —
// and a legend strip below the views maps number → part name. All linear
// values are sheet pixels at the canonical 1920-wide sheet (multiply by the
// renderer's unitScale, like dimensionCallout).
export const panelNumber = {
  fill: '#000000',
  /** Barely visible per the spec's 35–45% window. */
  opacity: 0.4,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'Helvetica, Arial, sans-serif',
  /** Approximate glyph advance per digit, as a fraction of fontSize. */
  digitWidth: 0.62,
  /** bbox must clear the numeral by these factors or the leader kicks in. */
  fit: { width: 1.6, height: 1.8 },
  /**
   * White casing under the glyph, inside the same low-opacity group: invisible
   * on light panels, keeps the numeral perceptible over dark wrapped art
   * (QC backdrops put panel centres on wheels/door frames).
   */
  halo: { stroke: '#ffffff', width: 3 },
  /** Tiny/thin panels: tick from the panel edge to a numeral just outside. */
  leader: { length: 9, gap: 4, strokeWidth: 1 },
} as const;

export const legendStyle = {
  caption: 'PANEL LEGEND',
  captionFill: '#5a6172',
  captionSize: 10,
  captionSpacing: 2,
  /** Hairline above the strip, separating it from the views. */
  rule: { stroke: '#d8dbe3', width: 1 },
  numberFill: brand.ink,
  nameFill: '#3f4658',
  fontSize: 13,
  lineHeight: 22,
  /** Hanging-number column width; names start after numberGap more. */
  numberWidth: 22,
  numberGap: 10,
  columnWidth: 380,
  /** Strip paddings: rule → caption baseline, caption → first row baseline. */
  padTop: 18,
  captionToRows: 24,
  padBottom: 8,
  /** Two columns when a template has more than this many panels. */
  maxRowsPerColumn: 8,
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

export type PanelNumberSpec = {
  /** Outline bbox of the panel, in the caller's drawing units. */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  n: number;
  /** Drawing units per sheet pixel (default 1). */
  unitScale?: number;
  /** Drawable limits (view band) — a leader that would escape them flips side. */
  clamp?: { minX: number; minY: number; maxX: number; maxY: number };
};

/**
 * The subtle panel numeral: centred in the panel when it fits; on tiny/thin
 * panels, a leader tick from the panel edge to the numeral just outside, in
 * the same low-opacity treatment. Flat strips lead off their LEFT end at the
 * band's own centreline — stacked thin bands keep distinct y's, so leaders
 * can never collide (an above-the-edge numeral would land inside the
 * neighbouring band). Tall slivers lead off their right edge. Returns one <g>.
 */
export function renderPanelNumber(spec: PanelNumberSpec): string {
  const t = panelNumber;
  const u = spec.unitScale ?? 1;
  const fs = t.fontSize * u;
  const text = String(spec.n);
  const textW = fs * t.digitWidth * text.length;
  const { minX, minY, maxX, maxY } = spec.bbox;
  const w = maxX - minX;
  const h = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const numeral = (x: number, y: number, anchor: 'start' | 'middle' | 'end'): string => {
    const base = `x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" font-family="${t.fontFamily}" font-size="${r2(fs)}" font-weight="${t.fontWeight}"`;
    // Casing first, glyph second — two elements, not paint-order, so every
    // rasteriser renders it.
    return (
      `<text ${base} fill="none" stroke="${t.halo.stroke}" stroke-width="${r2(t.halo.width * u)}" stroke-linejoin="round">${text}</text>` +
      `<text ${base} fill="${t.fill}">${text}</text>`
    );
  };

  if (w >= textW * t.fit.width && h >= fs * t.fit.height) {
    return `<g opacity="${t.opacity}">${numeral(cx, cy + fs * 0.35, 'middle')}</g>`;
  }

  const len = t.leader.length * u;
  const gap = t.leader.gap * u;
  const sw = r2(t.leader.strokeWidth * u);
  const tick = (x1: number, y1: number, x2: number, y2: number): string =>
    `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${t.fill}" stroke-width="${sw}"/>`;
  if (h <= w) {
    // Flat strip: numeral off the left end at the band's centreline (right
    // end when clamped on the left).
    const left = !spec.clamp || minX - (len + gap + textW) >= spec.clamp.minX;
    const edge = left ? minX : maxX;
    const dir = left ? -1 : 1;
    return `<g opacity="${t.opacity}">${tick(edge, cy, edge + dir * len, cy)}${numeral(edge + dir * (len + gap), cy + fs * 0.35, left ? 'end' : 'start')}</g>`;
  }
  // Tall sliver: numeral beside the right edge (left when clamped).
  const right = !spec.clamp || maxX + len + gap + textW <= spec.clamp.maxX;
  const edge = right ? maxX : minX;
  const dir = right ? 1 : -1;
  return `<g opacity="${t.opacity}">${tick(edge, cy, edge + dir * len, cy)}${numeral(edge + dir * (len + gap), cy + fs * 0.35, right ? 'start' : 'end')}</g>`;
}

export type LegendEntry = { n: number; name: string };

/**
 * Legend strip metrics in sheet pixels. ONE placement rule everywhere
 * (Archer, 2026-06-12): a full-width strip below the views — the layout sheet
 * reserves it above its footer; the QC overlay appends it under the art.
 * Two columns once a template outgrows one (>8 panels), filled top-to-bottom.
 */
export function legendMetrics(count: number): { rows: number; cols: number; height: number } {
  const t = legendStyle;
  const cols = Math.max(1, Math.ceil(count / t.maxRowsPerColumn));
  const rows = Math.ceil(count / cols);
  const height = t.padTop + t.captionToRows + (rows - 1) * t.lineHeight + t.padBottom;
  return { rows, cols, height };
}

export type LegendSpec = {
  entries: LegendEntry[];
  /** Top-left of the strip, in the caller's drawing units. */
  x: number;
  y: number;
  /** Strip width in drawing units (the hairline spans it). */
  width: number;
  /** Drawing units per sheet pixel (default 1). */
  unitScale?: number;
};

/** The number → part-name legend strip. Returns one <g>. */
export function renderPanelLegend(spec: LegendSpec): string {
  const t = legendStyle;
  const u = spec.unitScale ?? 1;
  const { rows } = legendMetrics(spec.entries.length);
  const parts: string[] = [`<g font-family="${panelNumber.fontFamily}">`];
  parts.push(
    `<line x1="${r2(spec.x)}" y1="${r2(spec.y)}" x2="${r2(spec.x + spec.width)}" y2="${r2(spec.y)}" stroke="${t.rule.stroke}" stroke-width="${r2(t.rule.width * u)}"/>`,
  );
  parts.push(
    `<text x="${r2(spec.x)}" y="${r2(spec.y + t.padTop * u)}" fill="${t.captionFill}" font-size="${r2(t.captionSize * u)}" letter-spacing="${r2(t.captionSpacing * u)}">${t.caption}</text>`,
  );
  const fs = r2(t.fontSize * u);
  const firstRowY = spec.y + (t.padTop + t.captionToRows) * u;
  const sorted = [...spec.entries].sort((a, z) => a.n - z.n);
  sorted.forEach((e, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const colX = spec.x + col * t.columnWidth * u;
    const y = r2(firstRowY + row * t.lineHeight * u);
    parts.push(
      `<text x="${r2(colX + t.numberWidth * u)}" y="${y}" text-anchor="end" fill="${t.numberFill}" font-size="${fs}" font-weight="700">${e.n}</text>`,
    );
    parts.push(
      `<text x="${r2(colX + (t.numberWidth + t.numberGap) * u)}" y="${y}" fill="${t.nameFill}" font-size="${fs}">${escXml(e.name)}</text>`,
    );
  });
  parts.push('</g>');
  return parts.join('');
}
