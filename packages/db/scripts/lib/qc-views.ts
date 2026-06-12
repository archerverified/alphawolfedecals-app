// Shared QC-view assembly + compositing for the authoring and regen scripts:
// group panel rows by view, build the QC panel shapes, replace the panel-union
// bounds with the measured ink extent of each view's art, and composite the
// overlay onto the base raster. ONE implementation so the overlay produced at
// authoring time and the one regenerated from DB rows cannot drift.

import sharp from 'sharp';
import type { Bounds, QcOverlayView } from '../../src/svg/index.js';
import { brand, legendMetrics, panelUnionBounds, viewScanWindows } from '../../src/svg/index.js';
import { measureArtBounds } from './art-bounds.js';

export type QcPanelRow = {
  name: string;
  view: string;
  svgPath: string;
  wrapSafeZone: unknown;
  installOrder: number;
};

export async function buildMeasuredQcViews(opts: {
  panels: QcPanelRow[];
  viewBox: { width: number; height: number };
  band: { top: number; bottom: number };
  /** The rendered art the overlay will composite over (measurement source). */
  basePng: Buffer;
  /** Per-view placement transforms (outline-art backdrops); omit for sheet-absolute panels. */
  translates?: Record<string, { x: number; y: number }>;
}): Promise<QcOverlayView[]> {
  const byView = new Map<string, QcPanelRow[]>();
  for (const p of opts.panels) {
    byView.set(p.view, [...(byView.get(p.view) ?? []), p]);
  }
  const views: QcOverlayView[] = [];
  for (const [view, vp] of byView) {
    const qcPanels = vp.map((p) => ({
      name: p.name,
      outlinePath: p.svgPath,
      wrapSafePath: (p.wrapSafeZone as { clip_path?: string } | null)?.clip_path ?? p.svgPath,
      installOrder: p.installOrder,
    }));
    const translate = opts.translates?.[view] ?? { x: 0, y: 0 };
    const bounds = panelUnionBounds(qcPanels, translate);
    if (!bounds) continue;
    views.push({ view, translate, panels: qcPanels, artBounds: bounds });
  }
  const windows = viewScanWindows(
    views.map((v) => ({ view: v.view, bounds: v.artBounds })),
    opts.viewBox,
    opts.band,
  );
  const measured = await measureArtBounds(opts.basePng, opts.viewBox, windows);
  for (const v of views) {
    v.artBounds = (measured[v.view] ?? v.artBounds) as Bounds;
  }
  return views;
}

/**
 * Composite a QC overlay SVG onto its base art raster. The overlay's viewBox
 * is taller than the art by the legend strip (see buildQcOverlaySvg), so the
 * base canvas extends by the same amount — derived HERE from the same views
 * the overlay rendered (a row count from elsewhere can disagree when a view
 * is dropped for degenerate geometry) and scaled to the raster width (the
 * sheet-px == raster-px identity only holds at 1920).
 */
export async function compositeQcOverlayPng(opts: {
  basePng: Buffer;
  overlaySvg: string;
  views: QcOverlayView[];
  rasterWidth: number;
  rasterHeight: number;
}): Promise<Buffer> {
  const count = opts.views.reduce((n, v) => n + v.panels.length, 0);
  const legendPx = Math.round((legendMetrics(count).height * opts.rasterWidth) / 1920);
  const overlay = await sharp(Buffer.from(opts.overlaySvg), { density: 96 })
    .resize(opts.rasterWidth, opts.rasterHeight + legendPx, { fit: 'fill' })
    .png()
    .toBuffer();
  return sharp(opts.basePng)
    .extend({ bottom: legendPx, background: brand.paper })
    .composite([{ input: overlay }])
    .png()
    .toBuffer();
}
