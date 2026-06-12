// 1/20-scale multi-view layout sheet builder (Goal 6 Template Studio).
//
// The publish artifact from docs/product/template-supply-strategy.md: the
// PVO-style sheet — vehicle name, AW-TPL code, the views with panel shading,
// per-view dimension callouts, and the scale block. Format mirrors the three
// existing Alpha Wolf wrapped sheets (1920×1080, dark header band, red-ruled
// footer with the bold title + "SCALE 1 : N").
//
// Pure string assembly; rasterisation (PNG) happens in storage.uploadLayoutSheet.

import { geometry } from '@alphawolf/canvas';
import { numberViews, VIEW_ORDER } from './numbering.js';
import { panelUnionBounds } from './qc-overlay.js';
import {
  annotationsForView,
  brand,
  dimensionCallout,
  escXml as esc,
  legendMetrics,
  r2,
  renderDimensionCallout,
  renderPanelLegend,
  renderPanelNumber,
  type DimensionAnnotation,
} from './theme.js';

const SHEET_W = 1920;
const SHEET_H = 1080;
const HEADER_H = 64;
const FOOTER_Y = 988;
const CONTENT = { x: 60, y: 100, w: SHEET_W - 120, h: FOOTER_Y - 140 };

/**
 * The AW sheet format, for consumers that draw against (or composite over)
 * sheets in this layout: canonical size plus the vertical band between the
 * header and the footer rule that content/annotations must stay inside.
 * Values are sheet px — scale by viewBoxHeight / SHEET_FORMAT.height when the
 * art's viewBox uses other units.
 */
export const SHEET_FORMAT = {
  width: SHEET_W,
  height: SHEET_H,
  contentBand: { top: HEADER_H + 6, bottom: FOOTER_Y - 4 },
} as const;

const INK = brand.ink;
const MUTED = '#8b93a7';
const PANEL_STROKE = '#15181d';
const WRAP_SAFE = '#2563eb';

export type LayoutSheetPanel = {
  name: string;
  outlinePath: string;
  wrapSafePath: string;
  installOrder: number;
};

export type LayoutSheetView = {
  view: string;
  /** Sheet placement (same transform the outline SVG uses). */
  translate: { x: number; y: number };
  panels: LayoutSheetPanel[];
  /** Dimension callouts for this view (theme.ts pattern-sheet style). */
  annotations?: DimensionAnnotation[];
};

export type LayoutSheetInput = {
  /** Bold footer title, e.g. "BMW X3". */
  title: string;
  /** Lighter prefix before the title, e.g. "2024". */
  yearLabel: string;
  /** AW-TPL-NNNN catalogue code (header right). Null for non-AW vehicles. */
  code: string | null;
  scaleDenom: number;
  /** Footer meta line, e.g. "4-View · Front / Driver / Back / Passenger". */
  viewsLine: string;
  views: LayoutSheetView[];
};

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

// --- assembly from panel rows -------------------------------------------------
// Panel rows store view-local geometry only (no sheet placement), so views are
// laid out in a row by content bbox — the same convention CanvasStage and the
// ZoneDiagram use — and the dimension callouts state the vehicle's REAL
// dimensions (the calibrated source of truth), not document units. Shared by
// the Studio publish action (apps/web) and the AW panel-authoring script.

const VIEW_GUTTER = 600;

export type LayoutSheetMeta = {
  title: string;
  yearLabel: string;
  code: string | null;
  scaleDenom: number;
  dims: { lengthMm: number; widthMm: number; heightMm: number; wheelbaseMm?: number | null };
};

export type LayoutPanelRow = {
  name: string;
  view: string;
  svgPath: string;
  wrapSafeZone: unknown;
  installOrder: number;
};

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function assembleLayoutSheetFromRows(
  meta: LayoutSheetMeta,
  panels: LayoutPanelRow[],
): LayoutSheetInput {
  const byView = new Map<string, LayoutPanelRow[]>();
  for (const p of panels) {
    const arr = byView.get(p.view) ?? [];
    arr.push(p);
    byView.set(p.view, arr);
  }
  // Same view ranking as panelNumbers — unknown views go LAST (indexOf's -1
  // would put them first, inverting the sheet order against the numbering).
  const viewRank = (v: string): number => {
    const i = VIEW_ORDER.indexOf(v);
    return i === -1 ? VIEW_ORDER.length : i;
  };
  const ordered = [...byView.keys()].sort(
    (a, b) => viewRank(a) - viewRank(b) || a.localeCompare(b),
  );

  const views: LayoutSheetInput['views'] = [];
  let cursorX = 0;
  for (const view of ordered) {
    const vp = byView.get(view)!;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    for (const p of vp) {
      // Same degenerate-path filter as viewBounds (zero-bbox anchors the fit).
      const rings = geometry.parsePath(p.svgPath).filter((r) => r.length >= 3);
      if (rings.length === 0) continue;
      const b = geometry.bbox(rings);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
    }
    if (!Number.isFinite(minX)) continue;
    views.push({
      view,
      translate: { x: cursorX - minX, y: -minY },
      panels: vp.map((p) => ({
        name: p.name,
        outlinePath: p.svgPath,
        wrapSafePath: (p.wrapSafeZone as { clip_path?: string } | null)?.clip_path ?? p.svgPath,
        installOrder: p.installOrder,
      })),
      annotations: annotationsForView(view, meta.dims),
    });
    cursorX += maxX - minX + VIEW_GUTTER;
  }

  return {
    title: meta.title,
    yearLabel: meta.yearLabel,
    code: meta.code,
    scaleDenom: meta.scaleDenom,
    viewsLine: `${ordered.length}-View · ${ordered.map(titleCase).join(' / ')}`,
    views,
  };
}

export function buildLayoutSheetSvg(input: LayoutSheetInput): string {
  if (input.views.length === 0) {
    throw new Error('[svg] buildLayoutSheetSvg: at least one view is required');
  }

  // Union bounds of all placed view content, with headroom below each view
  // for its label + dimension callout.
  const perView = input.views
    .map((v) => ({ v, b: panelUnionBounds(v.panels, v.translate) }))
    .filter((x): x is { v: LayoutSheetView; b: Bounds } => x.b !== null);
  if (perView.length === 0) {
    throw new Error('[svg] buildLayoutSheetSvg: no drawable panel content');
  }
  const union: Bounds = {
    minX: Math.min(...perView.map(({ b }) => b.minX)),
    minY: Math.min(...perView.map(({ b }) => b.minY)),
    maxX: Math.max(...perView.map(({ b }) => b.maxX)),
    maxY: Math.max(...perView.map(({ b }) => b.maxY)),
  };

  // A height callout's calibrated span can overhang its view's bbox top and
  // bottom (front/rear panels cover a body band, not roof-to-ground). Expand
  // the union by that overhang (content units) before fitting.
  for (const { v, b } of perView) {
    const height = v.annotations?.find((x) => x.kind === 'height');
    if (!height) continue;
    const overhang = Math.max(0, ((b.maxX - b.minX) * height.ratio - (b.maxY - b.minY)) / 2);
    union.minY = Math.min(union.minY, b.minY - overhang);
    union.maxY = Math.max(union.maxY, b.maxY + overhang);
  }

  // Sheet-pixel room reserved around the content: below for the view labels +
  // horizontal dimension rows, left when the leftmost view carries a vertical
  // height callout. Derived from the theme tokens so a style tune cannot
  // outgrow the reservation; constants are sheet px, so the annotation style
  // stays the same size regardless of the art's unit scale.
  const t = dimensionCallout;
  const VIEW_LABEL_OFFSET = 30;
  const LENGTH_ROW_OFFSET = 56;
  const VERT_CALLOUT_ROOM = t.offset + t.extensionOvershoot + t.label.gap + t.label.fontSize + 11;
  const roomBottom = Math.max(
    ...perView.map(({ v }) => {
      const rows = v.annotations?.filter((x) => x.kind !== 'height').length ?? 0;
      return rows > 0
        ? LENGTH_ROW_OFFSET + (rows - 1) * t.rowGap + t.label.gap + t.label.fontSize + 10
        : VIEW_LABEL_OFFSET + 20;
    }),
  );
  const leftmost = perView.reduce((m, x) => (x.b.minX < m.b.minX ? x : m), perView[0]!);
  const roomLeft = leftmost.v.annotations?.some((x) => x.kind === 'height') ? VERT_CALLOUT_ROOM : 0;

  // Stable numbering + the legend strip (the ONE placement rule: a full-width
  // strip below the views, here reserved between the content and the footer).
  const { numberOf, bboxOf, entries } = numberViews(input.views);
  const LEGEND_GAP = 18;
  const legendH = legendMetrics(entries.length).height;
  const contentH = CONTENT.h - legendH - LEGEND_GAP;

  const cw = union.maxX - union.minX;
  const ch = union.maxY - union.minY;
  const s = Math.min((CONTENT.w - roomLeft) / cw, (contentH - roomBottom) / ch);
  const ox = CONTENT.x + roomLeft + (CONTENT.w - roomLeft - cw * s) / 2 - union.minX * s;
  const oy = CONTENT.y + (contentH - roomBottom - ch * s) / 2 - union.minY * s;

  // Font sizes are computed in sheet units (the outer coordinate space) so the
  // sheet stays legible regardless of the art's unit scale.
  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET_W} ${SHEET_H}" font-family="Helvetica, Arial, sans-serif">`,
  );
  lines.push(`  <rect width="${SHEET_W}" height="${SHEET_H}" fill="${brand.paper}"/>`);

  // Header band.
  lines.push(`  <rect width="${SHEET_W}" height="${HEADER_H}" fill="${INK}"/>`);
  lines.push(
    `  <text x="64" y="30" fill="#ffffff" font-size="17" font-weight="700" letter-spacing="4">ALPHA WOLF</text>`,
  );
  lines.push(
    `  <text x="64" y="48" fill="${MUTED}" font-size="10" letter-spacing="3">WRAP STUDIO · VEHICLE TEMPLATE</text>`,
  );
  if (input.code) {
    lines.push(
      `  <text x="${SHEET_W - 64}" y="30" text-anchor="end" fill="#ffffff" font-size="14" font-family="Menlo, monospace" letter-spacing="1">${esc(input.code)}</text>`,
    );
  }
  lines.push(
    `  <text x="${SHEET_W - 64}" y="48" text-anchor="end" fill="${MUTED}" font-size="10" letter-spacing="2">${esc(input.viewsLine.toUpperCase())}</text>`,
  );

  // Placed views.
  for (const { v, b } of perView) {
    lines.push(`  <g transform="translate(${r2(ox)},${r2(oy)}) scale(${r2(s)})">`);
    lines.push(`    <g transform="translate(${v.translate.x},${v.translate.y})">`);
    for (const p of v.panels) {
      lines.push(
        `      <path d="${esc(p.outlinePath)}" fill="#ffffff" stroke="${PANEL_STROKE}" stroke-width="3" vector-effect="non-scaling-stroke"/>`,
      );
      lines.push(
        `      <path d="${esc(p.wrapSafePath)}" fill="${WRAP_SAFE}" fill-opacity="0.05" stroke="${WRAP_SAFE}" stroke-width="1.5" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/>`,
      );
      // No names on the art — only the subtle numeral (legend carries names).
      // Degenerate outlines draw no numeral; their legend row still lists them.
      const pb = bboxOf.get(p);
      if (pb) {
        lines.push(
          '      ' + renderPanelNumber({ bbox: pb, n: numberOf.get(p)!, unitScale: 1 / s }),
        );
      }
    }
    lines.push('    </g>');

    // View label + dimension callouts (content coordinates; theme constants
    // are sheet px, so pass unitScale = 1/s).
    const u = 1 / s;
    const midX = (b.minX + b.maxX) / 2;
    const midY = (b.minY + b.maxY) / 2;
    lines.push(
      `    <text x="${r2(midX)}" y="${r2(b.maxY + VIEW_LABEL_OFFSET * u)}" text-anchor="middle" fill="#5a6172" font-size="${r2(16 * u)}" letter-spacing="${r2(2 * u)}">${esc(v.view.toUpperCase())}</text>`,
    );
    for (const ann of v.annotations ?? []) {
      if (ann.kind === 'length') {
        lines.push(
          '    ' +
            renderDimensionCallout({
              orientation: 'horizontal',
              span: [b.minX, b.maxX],
              edge: b.maxY,
              side: 1,
              label: ann.label,
              unitScale: u,
              offsetPx: LENGTH_ROW_OFFSET,
            }),
        );
      } else if (ann.kind === 'wheelbase') {
        // Calibrated span centred under the length row. Axle positions aren't
        // in the data model, so no extension lines — the row states the real
        // wheelbase without claiming anchor points on the drawing.
        const half = ((b.maxX - b.minX) * ann.ratio) / 2;
        lines.push(
          '    ' +
            renderDimensionCallout({
              orientation: 'horizontal',
              span: [midX - half, midX + half],
              edge: b.maxY,
              side: 1,
              label: ann.label,
              unitScale: u,
              offsetPx: LENGTH_ROW_OFFSET + dimensionCallout.rowGap,
              extensionLines: false,
            }),
        );
      } else {
        const half = ((b.maxX - b.minX) * ann.ratio) / 2;
        // Mid-row views live off the gutter, not the reserved left room —
        // squeeze the callout toward the view when the previous view is close
        // (large unit scales shrink the fixed content-unit gutter).
        let prevMaxX = -Infinity;
        for (const o of perView) {
          if (o.b.maxX <= b.minX) prevMaxX = Math.max(prevMaxX, o.b.maxX);
        }
        const availPx = Number.isFinite(prevMaxX) ? (b.minX - prevMaxX) * s - 8 : Infinity;
        const offsetPx =
          availPx < VERT_CALLOUT_ROOM
            ? Math.max(8, t.offset - (VERT_CALLOUT_ROOM - availPx))
            : undefined;
        lines.push(
          '    ' +
            renderDimensionCallout({
              orientation: 'vertical',
              span: [midY - half, midY + half],
              edge: b.minX,
              side: -1,
              label: ann.label,
              unitScale: u,
              offsetPx,
            }),
        );
      }
    }
    lines.push('  </g>');
  }

  // Legend strip: number → part name, pinned above the footer rule.
  lines.push(
    '  ' +
      renderPanelLegend({
        entries,
        x: CONTENT.x,
        y: CONTENT.y + contentH + LEGEND_GAP,
        width: CONTENT.w,
      }),
  );

  // Footer.
  lines.push(
    `  <line x1="0" y1="${FOOTER_Y}" x2="${SHEET_W}" y2="${FOOTER_Y}" stroke="#e0413d" stroke-width="2"/>`,
  );
  lines.push(
    `  <text x="64" y="${FOOTER_Y + 42}" fill="${INK}" font-size="30"><tspan font-weight="700">${esc(input.title)}</tspan> <tspan fill="#5a6172">${esc(input.yearLabel)}</tspan></text>`,
  );
  lines.push(
    `  <text x="64" y="${FOOTER_Y + 64}" fill="#5a6172" font-size="13">${esc(input.viewsLine)}</text>`,
  );
  lines.push(
    `  <text x="64" y="${FOOTER_Y + 82}" fill="#9aa3b5" font-size="10" letter-spacing="1">REFERENCE ONLY · NOT FOR REDISTRIBUTION · alphawolfdecals.com</text>`,
  );
  lines.push(
    `  <text x="${SHEET_W - 64}" y="${FOOTER_Y + 36}" text-anchor="end" fill="#9aa3b5" font-size="11" letter-spacing="3">SCALE</text>`,
  );
  lines.push(
    `  <text x="${SHEET_W - 64}" y="${FOOTER_Y + 74}" text-anchor="end" fill="${INK}" font-size="34" font-family="Menlo, monospace">1 : ${input.scaleDenom}</text>`,
  );
  lines.push('</svg>');
  return lines.join('\n');
}
