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

export type Bbox = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Degenerate-safe outline bbox: rings of <3 points are dropped (their
 * zero-bbox would silently anchor at the origin); null when nothing drawable
 * remains. THE bbox policy for numbering and numeral placement — every
 * consumer must agree on what counts as degenerate.
 */
export function outlineBbox(d: string): Bbox | null {
  const rings = geometry.parsePath(d).filter((r) => r.length >= 3);
  return rings.length > 0 ? geometry.bbox(rings) : null;
}

type Item = {
  i: number;
  viewIdx: number;
  view: string;
  b: Bbox | null;
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
export function panelNumbers(
  panels: NumberablePanel[],
  bboxes?: ReadonlyArray<Bbox | null>,
): number[] {
  const items: Item[] = panels.map((p, i) => {
    const viewIdx = VIEW_ORDER.indexOf(p.view);
    return {
      i,
      viewIdx: viewIdx === -1 ? VIEW_ORDER.length : viewIdx,
      view: p.view,
      b: bboxes ? bboxes[i]! : outlineBbox(p.outlinePath),
      installOrder: p.installOrder,
      name: p.name,
      row: 0,
    };
  });

  // Cluster each view's panels into reading rows (transitive Y-overlap),
  // then key rows by the topmost edge of their cluster. Group by view NAME —
  // two non-canonical views must not merge into one cluster space (their
  // local coordinates are unrelated); among themselves they order by name.
  const byView = new Map<string, Item[]>();
  for (const it of items) {
    const arr = byView.get(it.view) ?? [];
    arr.push(it);
    byView.set(it.view, arr);
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
    if (a.view !== z.view) return a.view.localeCompare(z.view); // unknown views
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

export type NumberedViews<P> = {
  /** Panel object → its stable number. */
  numberOf: Map<P, number>;
  /** Panel object → degenerate-safe outline bbox (null = draw no numeral). */
  bboxOf: Map<P, Bbox | null>;
  /** Legend rows, one per panel. */
  entries: Array<{ n: number; name: string }>;
};

/**
 * The one numbering entry point for view-shaped renderer inputs: flattens,
 * numbers, and exposes the bboxes the derivation already computed so callers
 * don't re-parse paths. Both sheet renderers use this — the field mapping
 * that feeds panelNumbers must exist exactly once, or the sheets could
 * disagree on numbers.
 */
export function numberViews<P extends { name: string; outlinePath: string; installOrder: number }>(
  views: Array<{ view: string; panels: P[] }>,
): NumberedViews<P> {
  const flat = views.flatMap((v) =>
    v.panels.map((p) => ({
      view: v.view,
      name: p.name,
      installOrder: p.installOrder,
      outlinePath: p.outlinePath,
      panel: p,
    })),
  );
  const bboxes = flat.map((f) => outlineBbox(f.outlinePath));
  const numbers = panelNumbers(flat, bboxes);
  return {
    numberOf: new Map(flat.map((f, i) => [f.panel, numbers[i]!])),
    bboxOf: new Map(flat.map((f, i) => [f.panel, bboxes[i]!])),
    entries: flat.map((f, i) => ({ n: numbers[i]!, name: f.name })),
  };
}
