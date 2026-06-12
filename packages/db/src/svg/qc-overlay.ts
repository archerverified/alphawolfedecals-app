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
// Callouts anchor on `artBounds` — the measured ink extent of each view's
// art, not the panel union (panels stop short of bumpers/roof/wheels). The
// raster measurement lives with the scripts (it needs sharp); this module is
// pure string assembly.

import { geometry } from '@alphawolf/canvas';
import { defaultAxisForView } from './calibrate.js';
import { brand, dimensionCallout, dimensionText, renderDimensionCallout } from './theme.js';

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
const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!);
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Union bbox of a view's panel outlines in sheet coordinates. Null if none parse. */
export function panelUnionBounds(
  panels: QcPanel[],
  translate?: { x: number; y: number },
): Bounds | null {
  const tx = translate?.x ?? 0;
  const ty = translate?.y ?? 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of panels) {
    // Degenerate paths yield zero bboxes that would anchor the union at the
    // origin — same filter as the layout sheet's viewBounds.
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
 * Per-view raster scan windows: each view's panel bbox grown by a margin (art
 * extends past panels — wheels, roof, bumpers), clipped to the sheet and
 * against neighbouring views at the midline between their panel bboxes so one
 * view's wheels never leak into another view's measurement.
 */
export function viewScanWindows(
  views: Array<{ view: string; bounds: Bounds }>,
  viewBox: { width: number; height: number },
  contentBand?: { top: number; bottom: number },
): Record<string, Bounds> {
  const u = viewBox.width / 1920;
  const grow = (v: { view: string; bounds: Bounds }): Bounds => {
    // Art can run far past the panel union — wheels and bumpers below/beside
    // it, and the entire glasshouse above it (glass isn't a panel). Extend
    // each window the full content band vertically and generously sideways;
    // the midline clipping below is what actually separates neighbours.
    const mx = 200 * u;
    return {
      minX: Math.max(0, v.bounds.minX - mx),
      minY: contentBand?.top ?? 0,
      maxX: Math.min(viewBox.width, v.bounds.maxX + mx),
      maxY: contentBand?.bottom ?? viewBox.height,
    };
  };
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
  const { dims } = input;
  const band = input.contentBand ?? { top: 0, bottom: input.viewBox.height };
  const art = view.artBounds;
  const axis = defaultAxisForView(view.view);
  const parts: string[] = [];

  if (axis === 'length' || axis === 'height') {
    // Profile (and top) views: overall length below the art, wheelbase under it.
    // The callout stack must clear BOTH the sheet chrome and any view whose
    // art sits below this one (stacked profile views): the floor is the
    // highest such obstruction.
    let floor = band.bottom;
    for (const w of input.views) {
      if (w === view) continue;
      const o = w.artBounds;
      const overlapsX = o.minX < art.maxX && art.minX < o.maxX;
      if (overlapsX && o.minY > art.maxY) floor = Math.min(floor, o.minY - 8 * u);
    }
    // Each extra row needs rowGap; a row's text needs label.gap + ~0.6 em
    // below its line. Drop the wheelbase row on views too tight to fit it —
    // it still renders under any profile view with room.
    const minStack = (rows: number): number =>
      (8 + (rows - 1) * t.rowGap + t.label.gap + t.label.fontSize * 0.6) * u;
    const wheelbase = Boolean(dims.wheelbaseMm) && art.maxY + minStack(2) <= floor;
    const rows = wheelbase ? 2 : 1;
    const stack = (t.offset + (rows - 1) * t.rowGap + t.label.gap + t.label.fontSize + 4) * u;
    // Pull the first line up if the sheet leaves less room than the default
    // offset wants.
    const squeeze = Math.max(0, art.maxY + stack - floor);
    const offset = Math.max(8, t.offset - squeeze / u);
    parts.push(
      renderDimensionCallout({
        orientation: 'horizontal',
        span: [art.minX, art.maxX],
        edge: art.maxY,
        side: 1,
        label: dimensionText('Overall length', dims.lengthMm),
        unitScale: u,
        offsetPx: offset,
      }),
    );
    if (wheelbase && dims.wheelbaseMm) {
      // Axle positions aren't in the data model, so the wheelbase row is a
      // calibrated span centred under the length — drawn without extension
      // lines so it doesn't claim specific anchor points on the art.
      const ratio = dims.wheelbaseMm / dims.lengthMm;
      const mid = (art.minX + art.maxX) / 2;
      const half = ((art.maxX - art.minX) * ratio) / 2;
      parts.push(
        renderDimensionCallout({
          orientation: 'horizontal',
          span: [mid - half, mid + half],
          edge: art.maxY,
          side: 1,
          label: dimensionText('Wheelbase', dims.wheelbaseMm),
          unitScale: u,
          offsetPx: offset + t.rowGap,
          extensionLines: false,
        }),
      );
    }
  } else {
    // Front/rear elevations: overall height beside the art. Prefer the left
    // side; fall back to the right when the art sits at the sheet edge.
    const room = (t.offset + t.extensionOvershoot + t.label.gap + t.label.fontSize + 4) * u;
    const side: 1 | -1 = art.minX - room >= 0 ? -1 : 1;
    parts.push(
      renderDimensionCallout({
        orientation: 'vertical',
        span: [art.minY, art.maxY],
        edge: side === -1 ? art.minX : art.maxX,
        side,
        label: dimensionText('Overall height', dims.heightMm),
        unitScale: u,
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
  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${input.viewBox.width} ${input.viewBox.height}">`,
  );
  for (const v of input.views) {
    const tx = v.translate?.x ?? 0;
    const ty = v.translate?.y ?? 0;
    lines.push(`<g transform="translate(${r2(tx)},${r2(ty)})">`);
    for (const p of v.panels) {
      // The blue zone rendering is unchanged by design — only the red panel
      // boxes were removed and the label switched from red to sheet ink.
      lines.push(`<path d="${esc(p.outlinePath)}" fill="${PANEL_FILL}" fill-opacity="0.13"/>`);
      lines.push(
        `<path d="${esc(p.wrapSafePath)}" fill="none" stroke="${PANEL_FILL}" stroke-width="${r2(1.5 * u)}" stroke-dasharray="${r2(7 * u)} ${r2(5 * u)}"/>`,
      );
      const rings = geometry.parsePath(p.outlinePath).filter((r) => r.length >= 3);
      if (rings.length > 0) {
        const b = geometry.bbox(rings);
        lines.push(
          `<text x="${r2((b.minX + b.maxX) / 2)}" y="${r2((b.minY + b.maxY) / 2)}" text-anchor="middle" font-size="${r2(17 * u)}" font-family="Helvetica, Arial, sans-serif" font-weight="700" fill="${brand.ink}">${esc(`${p.installOrder}. ${p.name}`)}</text>`,
        );
      }
    }
    lines.push('</g>');
    lines.push(calloutsFor(v, input, u));
  }
  lines.push('</svg>');
  return lines.join('\n');
}
