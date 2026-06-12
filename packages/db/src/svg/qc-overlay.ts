// QC overlay builder (Template Studio). Renders a vehicle's authored panel
// set as a transparent SVG that composites 1:1 over the template art, so a
// human can eyeball every boundary against the artwork.
//
// Style (Archer, 2026-06-12): NO boxes over the vehicle art. Panels keep the
// blue zone rendering (translucent fill + dashed wrap-safe inset); dimensions
// are classic pattern-sheet callouts OUTSIDE the art — extension lines +
// double-headed arrows in brand.cyan, black labels (see theme.ts). Overall
// length sits below profile views, overall height beside front/rear views,
// wheelbase (when known) as a second row under the length.
//
// Panel labeling (Archer, 2026-06-12): no text inside the vehicle art. Each
// panel carries only a subtle low-opacity numeral (stable numbering from
// numbering.ts) and a legend strip mapping number → part name is APPENDED
// below the art — the overlay's viewBox is taller than the art by
// `legendMetrics(panelCount).height * (viewBox.width / 1920)`; compositors
// extend the base canvas by the same amount (see scripts).
//
// Callouts anchor on `artBounds` — the measured ink extent of each view's
// art, not the panel union (panels stop short of bumpers/roof/wheels). The
// raster measurement lives with the scripts (it needs sharp); this module is
// pure string assembly.

import { geometry } from '@alphawolf/canvas';
import { panelNumbers } from './numbering.js';
import {
  annotationsForView,
  dimensionCallout,
  escXml,
  legendMetrics,
  r2,
  renderDimensionCallout,
  renderPanelLegend,
  renderPanelNumber,
} from './theme.js';

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export type QcPanel = {
  name: string;
  outlinePath: string;
  wrapSafePath: string;
  installOrder: number;
};

export type QcOverlayView = {
  view: string;
  /** Sheet placement of this view's panel geometry (0,0 = sheet-absolute). */
  translate?: { x: number; y: number };
  panels: QcPanel[];
  /** Measured ink bounds of this view's art, in sheet coordinates. */
  artBounds: Bounds;
};

export type QcOverlayInput = {
  viewBox: { width: number; height: number };
  dims: {
    lengthMm: number;
    widthMm: number;
    heightMm: number;
    wheelbaseMm?: number | null;
  };
  views: QcOverlayView[];
  /** Vertical band callouts must stay inside (excludes header/footer chrome). */
  contentBand?: { top: number; bottom: number };
};

const PANEL_FILL = '#2563eb';

/** Union bbox of a view's panel outlines in sheet coordinates. Null if none parse. */
export function panelUnionBounds(
  panels: Array<{ outlinePath: string }>,
  translate?: { x: number; y: number },
): Bounds | null {
  const tx = translate?.x ?? 0;
  const ty = translate?.y ?? 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of panels) {
    // parsePath never throws — but a degenerate path yields an empty/short
    // ring whose zero-bbox would silently anchor the union at the origin.
    const rings = geometry.parsePath(p.outlinePath).filter((r) => r.length >= 3);
    if (rings.length === 0) continue;
    const b = geometry.bbox(rings);
    minX = Math.min(minX, b.minX + tx);
    minY = Math.min(minY, b.minY + ty);
    maxX = Math.max(maxX, b.maxX + tx);
    maxY = Math.max(maxY, b.maxY + ty);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/**
 * Per-view raster scan windows: each view's panel bbox grown sideways and the
 * full content band vertically (art runs far past panels — glasshouse above,
 * wheels below), clipped against neighbouring views at the midline between
 * their panel bboxes. The windows are ASSIGNMENT regions for the measured ink
 * components — midline clipping decides ownership, the component analysis
 * keeps protruding drawings whole (see scripts/lib/art-bounds.ts).
 */
export function viewScanWindows(
  views: Array<{ view: string; bounds: Bounds }>,
  viewBox: { width: number; height: number },
  contentBand?: { top: number; bottom: number },
): Record<string, Bounds> {
  const u = viewBox.width / 1920;
  const grow = (v: { view: string; bounds: Bounds }): Bounds => ({
    minX: Math.max(0, v.bounds.minX - 200 * u),
    minY: contentBand?.top ?? 0,
    maxX: Math.min(viewBox.width, v.bounds.maxX + 200 * u),
    maxY: contentBand?.bottom ?? viewBox.height,
  });
  const wins = views.map((v) => ({ view: v.view, b: v.bounds, w: grow(v) }));
  for (let i = 0; i < wins.length; i++) {
    for (let j = i + 1; j < wins.length; j++) {
      const A = wins[i]!;
      const B = wins[j]!;
      const overlapX = A.w.minX < B.w.maxX && B.w.minX < A.w.maxX;
      const overlapY = A.w.minY < B.w.maxY && B.w.minY < A.w.maxY;
      if (!overlapX || !overlapY) continue;
      // Clip along the axis where the panel bboxes are actually disjoint.
      if (A.b.maxX <= B.b.minX || B.b.maxX <= A.b.minX) {
        const [left, right] = A.b.minX <= B.b.minX ? [A, B] : [B, A];
        const mid = (left.b.maxX + right.b.minX) / 2;
        left.w.maxX = Math.min(left.w.maxX, mid);
        right.w.minX = Math.max(right.w.minX, mid);
      } else if (A.b.maxY <= B.b.minY || B.b.maxY <= A.b.minY) {
        const [top, bottom] = A.b.minY <= B.b.minY ? [A, B] : [B, A];
        const mid = (top.b.maxY + bottom.b.minY) / 2;
        top.w.maxY = Math.min(top.w.maxY, mid);
        bottom.w.minY = Math.max(bottom.w.minY, mid);
      }
    }
  }
  return Object.fromEntries(wins.map((x) => [x.view, x.w]));
}

function calloutsFor(view: QcOverlayView, input: QcOverlayInput, u: number): string {
  const t = dimensionCallout;
  const band = input.contentBand ?? { top: 0, bottom: input.viewBox.height };
  const art = view.artBounds;
  const anns = annotationsForView(view.view, input.dims);
  const length = anns.find((a) => a.kind === 'length');
  const wheelbase = anns.find((a) => a.kind === 'wheelbase');
  const height = anns.find((a) => a.kind === 'height');
  const parts: string[] = [];

  if (length) {
    // Obstruction limits above and below: the sheet chrome plus any
    // neighbouring view's art that horizontally overlaps this one.
    let floor = band.bottom;
    let ceiling = band.top;
    for (const w of input.views) {
      if (w === view) continue;
      const o = w.artBounds;
      const overlapsX = o.minX < art.maxX && art.minX < o.maxX;
      if (!overlapsX) continue;
      if (o.minY > art.maxY) floor = Math.min(floor, o.minY - 8 * u);
      if (o.maxY < art.minY) ceiling = Math.max(ceiling, o.maxY + 8 * u);
    }
    // Each extra row needs rowGap; a row's text needs label.gap + ~0.6 em
    // past its line. Prefer below the art (the classic spot); flip above only
    // when even a single row cannot fit below. The wheelbase row is dropped
    // on views too tight to fit it — it still renders wherever there is room
    // and always on the layout sheet.
    const minStack = (rows: number): number =>
      (8 + (rows - 1) * t.rowGap + t.label.gap + t.label.fontSize * 0.6) * u;
    const below = art.maxY + minStack(1) <= floor;
    const side: 1 | -1 = below ? 1 : -1;
    const edge = below ? art.maxY : art.minY;
    const room = below ? floor - art.maxY : art.minY - ceiling;
    const withWheelbase = Boolean(wheelbase) && minStack(2) <= room;
    const rows = withWheelbase ? 2 : 1;
    const stack = (t.offset + (rows - 1) * t.rowGap + t.label.gap + t.label.fontSize + 4) * u;
    const offset = Math.max(8, t.offset - Math.max(0, stack - room) / u);
    parts.push(
      renderDimensionCallout({
        orientation: 'horizontal',
        span: [art.minX, art.maxX],
        edge,
        side,
        label: length.label,
        unitScale: u,
        offsetPx: offset,
      }),
    );
    if (withWheelbase && wheelbase) {
      // Axle positions aren't in the data model, so the wheelbase row is a
      // calibrated span centred under the length — drawn without extension
      // lines so it doesn't claim specific anchor points on the art.
      const mid = (art.minX + art.maxX) / 2;
      const half = ((art.maxX - art.minX) * wheelbase.ratio) / 2;
      parts.push(
        renderDimensionCallout({
          orientation: 'horizontal',
          span: [mid - half, mid + half],
          edge,
          side,
          label: wheelbase.label,
          unitScale: u,
          offsetPx: offset + t.rowGap,
          extensionLines: false,
        }),
      );
    }
  }

  if (height) {
    // Free lateral room per side: the sheet edge or the nearest neighbouring
    // view's art that vertically overlaps this one. Prefer the left side;
    // take the right when it has the room (or more of it).
    let leftEdge = 0;
    let rightEdge = input.viewBox.width;
    for (const w of input.views) {
      if (w === view) continue;
      const o = w.artBounds;
      const overlapsY = o.minY < art.maxY && art.minY < o.maxY;
      if (!overlapsY) continue;
      if (o.maxX <= art.minX) leftEdge = Math.max(leftEdge, o.maxX + 8 * u);
      if (o.minX >= art.maxX) rightEdge = Math.min(rightEdge, o.minX - 8 * u);
    }
    const room = (t.offset + t.extensionOvershoot + t.label.gap + t.label.fontSize + 4) * u;
    const leftRoom = art.minX - leftEdge;
    const rightRoom = rightEdge - art.maxX;
    const side: 1 | -1 = leftRoom >= room || leftRoom >= rightRoom ? -1 : 1;
    const avail = side === -1 ? leftRoom : rightRoom;
    const offset = Math.max(8, t.offset - Math.max(0, room - avail) / u);
    parts.push(
      renderDimensionCallout({
        orientation: 'vertical',
        span: [art.minY, art.maxY],
        edge: side === -1 ? art.minX : art.maxX,
        side,
        label: height.label,
        unitScale: u,
        offsetPx: offset,
      }),
    );
  }
  return parts.join('');
}

export function buildQcOverlaySvg(input: QcOverlayInput): string {
  if (input.views.length === 0) {
    throw new Error('[svg] buildQcOverlaySvg: at least one view is required');
  }
  const u = input.viewBox.width / 1920;
  const band = input.contentBand ?? { top: 0, bottom: input.viewBox.height };

  // Stable numbering across the whole template (view order, then position).
  const flat = input.views.flatMap((v) =>
    v.panels.map((p) => ({
      view: v.view,
      name: p.name,
      installOrder: p.installOrder,
      outlinePath: p.outlinePath,
      panel: p,
    })),
  );
  const numbers = panelNumbers(flat);
  const numberOf = new Map(flat.map((f, i) => [f.panel, numbers[i]!]));

  const legendH = legendMetrics(flat.length).height * u;
  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${input.viewBox.width} ${r2(input.viewBox.height + legendH)}">`,
  );
  for (const v of input.views) {
    const tx = v.translate?.x ?? 0;
    const ty = v.translate?.y ?? 0;
    // The numeral's leader fallback must stay inside the drawable band,
    // expressed in this view's local coordinates.
    const clamp = {
      minX: -tx,
      minY: band.top - ty,
      maxX: input.viewBox.width - tx,
      maxY: band.bottom - ty,
    };
    lines.push(`<g transform="translate(${r2(tx)},${r2(ty)})">`);
    for (const p of v.panels) {
      // The blue zone rendering is unchanged by design — panel names moved
      // off the art entirely; only the subtle numeral remains.
      lines.push(`<path d="${escXml(p.outlinePath)}" fill="${PANEL_FILL}" fill-opacity="0.13"/>`);
      lines.push(
        `<path d="${escXml(p.wrapSafePath)}" fill="none" stroke="${PANEL_FILL}" stroke-width="${r2(1.5 * u)}" stroke-dasharray="${r2(7 * u)} ${r2(5 * u)}"/>`,
      );
      const rings = geometry.parsePath(p.outlinePath).filter((r) => r.length >= 3);
      if (rings.length > 0) {
        lines.push(
          renderPanelNumber({
            bbox: geometry.bbox(rings),
            n: numberOf.get(p)!,
            unitScale: u,
            clamp,
          }),
        );
      }
    }
    lines.push('</g>');
    lines.push(calloutsFor(v, input, u));
  }

  // Legend strip appended below the art (its own paper background — the strip
  // is new canvas, not vehicle art).
  lines.push(
    `<rect x="0" y="${input.viewBox.height}" width="${input.viewBox.width}" height="${r2(legendH)}" fill="#f8f8f6"/>`,
  );
  lines.push(
    renderPanelLegend({
      entries: flat.map((f, i) => ({ n: numbers[i]!, name: f.name })),
      x: 64 * u,
      y: input.viewBox.height,
      width: input.viewBox.width - 128 * u,
      unitScale: u,
    }),
  );
  lines.push('</svg>');
  return lines.join('\n');
}
