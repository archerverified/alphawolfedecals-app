// Panel-number unification (Archer spec 2026-06-12): the vehicle pages must
// show the SAME numbers the template sheets print (numberViews), never the
// installOrder — one number = one panel, everywhere.

import { describe, expect, it } from 'vitest';
import type { PanelRecord } from '@alphawolf/db';
import { numberedPanels } from '@/lib/vehicles/panel-numbers';

const rect = (x: number, y: number, w = 100, h = 50): string =>
  `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;

const panel = (
  over: Pick<PanelRecord, 'id' | 'name' | 'view' | 'svgPath' | 'installOrder'>,
): PanelRecord => ({
  wrapSafeZone: {},
  printableAreaMm2: 1,
  finishHint: 'gloss',
  notes: null,
  ...over,
});

describe('numberedPanels', () => {
  it('numbers panels by sheet order (numberViews), not installOrder', () => {
    // installOrder deliberately CONFLICTS with the sheet reading order:
    // front view comes first on the sheet, and within driver the upper row
    // reads before the lower row.
    const lowerDriver = panel({
      id: 'a',
      name: 'Rocker',
      view: 'driver',
      svgPath: rect(0, 60),
      installOrder: 1,
    });
    const upperDriver = panel({
      id: 'b',
      name: 'Door',
      view: 'driver',
      svgPath: rect(0, 0),
      installOrder: 2,
    });
    const front = panel({
      id: 'c',
      name: 'Bumper',
      view: 'front',
      svgPath: rect(0, 0),
      installOrder: 3,
    });

    const out = numberedPanels([lowerDriver, upperDriver, front]);

    expect(out.map((x) => x.n)).toEqual([1, 2, 3]); // sorted 1..N for display
    expect(out.map((x) => x.panel.name)).toEqual(['Bumper', 'Door', 'Rocker']);
    // The numbers shown are NOT the install orders.
    expect(out.map((x) => x.panel.installOrder)).toEqual([3, 2, 1]);
  });

  it('returns an empty list for templates with no panels', () => {
    expect(numberedPanels([])).toEqual([]);
  });
});
