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

const SHEET_W = 1920;
const SHEET_H = 1080;
const HEADER_H = 64;
const FOOTER_Y = 988;
const CONTENT = { x: 60, y: 100, w: SHEET_W - 120, h: FOOTER_Y - 140 };

const INK = '#141b2d';
const MUTED = '#8b93a7';
const PANEL_STROKE = '#15181d';
const WRAP_SAFE = '#2563eb';

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!);
const r2 = (n: number): number => Math.round(n * 100) / 100;

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
  /** Dimension callout under this view, e.g. "4,708 mm · 185.4 in overall". */
  dimensionLabel?: string;
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

function viewBounds(view: LayoutSheetView): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of view.panels) {
    // parsePath never throws — but a degenerate path yields an empty/short ring
    // whose zero-bbox would silently anchor the union at the origin. Filter.
    const rings = geometry.parsePath(p.outlinePath).filter((r) => r.length >= 3);
    if (rings.length === 0) continue;
    const b = geometry.bbox(rings);
    minX = Math.min(minX, b.minX + view.translate.x);
    minY = Math.min(minY, b.minY + view.translate.y);
    maxX = Math.max(maxX, b.maxX + view.translate.x);
    maxY = Math.max(maxY, b.maxY + view.translate.y);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

export function buildLayoutSheetSvg(input: LayoutSheetInput): string {
  if (input.views.length === 0) {
    throw new Error('[svg] buildLayoutSheetSvg: at least one view is required');
  }

  // Union bounds of all placed view content, with headroom below each view
  // for its label + dimension callout.
  const perView = input.views
    .map((v) => ({ v, b: viewBounds(v) }))
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

  // Content-units reserved under the views for labels + dimension callouts.
  const calloutRoom = 110;
  const cw = union.maxX - union.minX;
  const ch = union.maxY - union.minY + calloutRoom;
  const s = Math.min(CONTENT.w / cw, CONTENT.h / ch);
  const ox = CONTENT.x + (CONTENT.w - cw * s) / 2 - union.minX * s;
  const oy = CONTENT.y + (CONTENT.h - ch * s) / 2 - union.minY * s;

  // Font sizes are computed in sheet units (the outer coordinate space) so the
  // sheet stays legible regardless of the art's unit scale.
  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET_W} ${SHEET_H}" font-family="Helvetica, Arial, sans-serif">`,
  );
  lines.push(`  <rect width="${SHEET_W}" height="${SHEET_H}" fill="#f8f8f6"/>`);

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
      // Panel label at the outline bbox centre, sized in content units.
      try {
        const pb = geometry.bbox(geometry.parsePath(p.outlinePath));
        const fs = Math.min(15 / s, (pb.maxY - pb.minY) / 4);
        lines.push(
          `      <text x="${r2((pb.minX + pb.maxX) / 2)}" y="${r2((pb.minY + pb.maxY) / 2)}" text-anchor="middle" fill="#3f4658" font-size="${r2(fs)}">${p.installOrder}. ${esc(p.name)}</text>`,
        );
      } catch {
        // No label for unparseable outlines.
      }
    }
    lines.push('    </g>');

    // View label + dimension callout under the view (content coordinates).
    const labelY = b.maxY + 34 / s;
    const midX = (b.minX + b.maxX) / 2;
    lines.push(
      `    <text x="${r2(midX)}" y="${r2(labelY)}" text-anchor="middle" fill="#5a6172" font-size="${r2(16 / s)}" letter-spacing="${r2(2 / s)}">${esc(v.view.toUpperCase())}</text>`,
    );
    if (v.dimensionLabel) {
      const dimY = b.maxY + 62 / s;
      lines.push(
        `    <g stroke="#9aa3b5" stroke-width="${r2(1 / s)}">` +
          `<line x1="${r2(b.minX)}" y1="${r2(dimY)}" x2="${r2(b.maxX)}" y2="${r2(dimY)}"/>` +
          `<line x1="${r2(b.minX)}" y1="${r2(dimY - 6 / s)}" x2="${r2(b.minX)}" y2="${r2(dimY + 6 / s)}"/>` +
          `<line x1="${r2(b.maxX)}" y1="${r2(dimY - 6 / s)}" x2="${r2(b.maxX)}" y2="${r2(dimY + 6 / s)}"/>` +
          `</g>`,
      );
      lines.push(
        `    <text x="${r2(midX)}" y="${r2(dimY + 24 / s)}" text-anchor="middle" fill="#5a6172" font-size="${r2(13 / s)}">${esc(v.dimensionLabel)}</text>`,
      );
    }
    lines.push('  </g>');
  }

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
