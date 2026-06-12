// Stable per-template panel numbering (Archer change spec, 2026-06-12).
//
// Sheets stopped printing panel names on the art — each panel carries only a
// subtle numeral, and a legend maps number → part name. The numbers must be
// REUSABLE by any future surface (export pack, editor), so the assignment is
// a pure derivation from the panel rows alone: order views front → driver →
// back → passenger → top, then panels within a view in reading order — rows
// top-to-bottom, panels left-to-right within a row — ties by installOrder
// then name. Any consumer holding the same rows derives the same numbers —
// nothing extra is stored.
//
// Reading rows are clusters of panels whose vertical extents substantially
// overlap (transitively). Raw minX/minY ordering is NOT used across a whole
// view: on stacked full-length bands (the coach) a few px of nose curvature
// in each band's minX would scramble the vertical read, and on side-by-side
// door runs (the X3) roofline differences in minY would scramble the
// horizontal one. Row clustering keeps both reading naturally.
//
// Position is measured in VIEW-LOCAL path coordinates (before any sheet
// translate), which both renderers and the DB rows share, so the QC overlay,
// the layout sheet, and a future export can never disagree.

import { geometry } from '@alphawolf/canvas';

/** Canonical view ordering for sheet layout AND panel numbering. */
export const VIEW_ORDER = ['front', 'driver', 'back', 'passenger', 'top'];

export type NumberablePanel = {
  view: string;
  name: string;
  installOrder: number;
  /** View-local outline path (the DB row's svgPath). */
  outlinePath: string;
};

type Item = {
  i: number;
  viewIdx: number;
  b: { minX: number; minY: number; maxX: number; maxY: number } | null;
  installOrder: number;
  name: string;
  row: number;
};

/** Same reading row when the vertical overlap exceeds half the shorter panel. */
const sameRow = (a: NonNullable<Item['b']>, z: NonNullable<Item['b']>): boolean => {
  const overlap = Math.min(a.maxY, z.maxY) - Math.max(a.minY, z.minY);
  return overlap > 0.5 * Math.min(a.maxY - a.minY, z.maxY - z.minY);
};

/**
 * Panel numbers (1-based) for one template, aligned with the input by index.
 * Degenerate outlines (no parseable ring) sort after positioned panels within
 * their view; they still receive a number so the legend stays complete.
 */
export function panelNumbers(panels: NumberablePanel[]): number[] {
  const items: Item[] = panels.map((p, i) => {
    const rings = geometry.parsePath(p.outlinePath).filter((r) => r.length >= 3);
    const viewIdx = VIEW_ORDER.indexOf(p.view);
    return {
      i,
      viewIdx: viewIdx === -1 ? VIEW_ORDER.length : viewIdx,
      b: rings.length > 0 ? geometry.bbox(rings) : null,
      installOrder: p.installOrder,
      name: p.name,
      row: 0,
    };
  });

  // Cluster each view's panels into reading rows (transitive Y-overlap),
  // then key rows by the topmost edge of their cluster.
  const byView = new Map<number, Item[]>();
  for (const it of items) {
    const arr = byView.get(it.viewIdx) ?? [];
    arr.push(it);
    byView.set(it.viewIdx, arr);
  }
  for (const group of byView.values()) {
    const positioned = group.filter((it) => it.b !== null);
    const cluster = positioned.map((_, k) => k);
    const find = (k: number): number => (cluster[k] === k ? k : (cluster[k] = find(cluster[k]!)));
    for (let a = 0; a < positioned.length; a++) {
      for (let z = a + 1; z < positioned.length; z++) {
        if (sameRow(positioned[a]!.b!, positioned[z]!.b!)) cluster[find(a)] = find(z);
      }
    }
    const rowTop = new Map<number, number>();
    positioned.forEach((it, k) => {
      const root = find(k);
      rowTop.set(root, Math.min(rowTop.get(root) ?? Infinity, it.b!.minY));
    });
    positioned.forEach((it, k) => {
      it.row = rowTop.get(find(k))!;
    });
    // Degenerate outlines sort after every positioned row.
    for (const it of group) if (it.b === null) it.row = Infinity;
  }

  items.sort((a, z) => {
    if (a.viewIdx !== z.viewIdx) return a.viewIdx - z.viewIdx;
    if (a.row !== z.row) return a.row - z.row;
    const ax = a.b?.minX ?? Infinity;
    const zx = z.b?.minX ?? Infinity;
    if (ax !== zx) return ax - zx;
    const ay = a.b?.minY ?? Infinity;
    const zy = z.b?.minY ?? Infinity;
    if (ay !== zy) return ay - zy;
    if (a.installOrder !== z.installOrder) return a.installOrder - z.installOrder;
    return a.name.localeCompare(z.name);
  });
  const out = new Array<number>(panels.length);
  items.forEach((it, rank) => {
    out[it.i] = rank + 1;
  });
  return out;
}
