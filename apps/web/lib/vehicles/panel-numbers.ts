// Stable sheet numbers for a vehicle's panel rows (panel-number unification,
// Archer spec 2026-06-12). Every customer-facing panel number must be the SAME
// number the template sheets print (PR #142) — never the installOrder, which
// orders the fitter's work, not the sheet legend. numberViews() is the one
// numbering entry point; this helper only adapts DB panel rows (svgPath) to
// its renderer-input shape (outlinePath) and sorts for display.

import { svg, type PanelRecord } from '@alphawolf/db';

export type NumberedPanel = { n: number; panel: PanelRecord };

/** Panels with their sheet numbers, sorted 1..N for display. */
export function numberedPanels(panels: PanelRecord[]): NumberedPanel[] {
  const views = [...new Set(panels.map((p) => p.view))].map((view) => ({
    view,
    panels: panels
      .filter((p) => p.view === view)
      .map((p) => ({
        name: p.name,
        outlinePath: p.svgPath,
        installOrder: p.installOrder,
        panel: p,
      })),
  }));
  const { numberOf } = svg.numberViews(views);
  return views
    .flatMap((v) => v.panels.map((x) => ({ n: numberOf.get(x)!, panel: x.panel })))
    .sort((a, b) => a.n - b.n);
}
