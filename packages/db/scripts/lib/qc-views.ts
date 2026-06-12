// Shared QC-view assembly for the authoring and regen scripts: group panel
// rows by view, build the QC panel shapes, then replace the panel-union
// bounds with the measured ink extent of each view's art. ONE implementation
// so the overlay produced at authoring time and the one regenerated from DB
// rows cannot drift.

import type { Bounds, QcOverlayView } from '../../src/svg/index.js';
import { panelUnionBounds, viewScanWindows } from '../../src/svg/index.js';
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
