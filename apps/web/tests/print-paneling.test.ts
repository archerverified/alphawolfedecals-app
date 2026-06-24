// Paneling / tiling engine (Goal 22 / D2) — the safety-critical core.
// Splits each curvature-corrected wrap panel into print tiles that fit the
// EFFECTIVE media width, with a configurable overlap between tiles and a bleed
// margin on the outer edges. The cardinal invariant: NEVER SHORT. The union of
// tiles (net of overlaps) must cover at least the panel's true extent, and no
// tile may exceed the effective media width.

import { describe, expect, it } from 'vitest';
import { panelize, type WrapPanelInput, type ShopPrintProfileInput } from '../lib/print/paneling';

const PROFILE: ShopPrintProfileInput = { effectiveWidthIn: 52.5, overlapIn: 0.5, bleedIn: 0.25 };

const panel = (over: Partial<WrapPanelInput> = {}): WrapPanelInput => ({
  id: 'p1',
  name: 'Panel',
  view: 'driver',
  safeWidthIn: 30,
  safeHeightIn: 40,
  estimated: false,
  needsMeasurement: false,
  warning: null,
  ...over,
});

// Net across-coverage of a panel's tiles = sum(width) - sum(interior overlaps).
function netAcross(tiles: { widthIn: number; overlapPrevIn: number }[]): number {
  return tiles.reduce((s, t, i) => s + t.widthIn - (i > 0 ? t.overlapPrevIn : 0), 0);
}

describe('panelize — single tile when the panel fits the media', () => {
  it('a small panel produces one seam-free tile within the media width', () => {
    const r = panelize({
      profile: PROFILE,
      panels: [panel({ safeWidthIn: 30, safeHeightIn: 40 })],
    });
    expect(r.panels).toHaveLength(1);
    const p = r.panels[0]!;
    expect(p.tiles).toHaveLength(1);
    expect(p.tiles[0]!.widthIn).toBeLessThanOrEqual(PROFILE.effectiveWidthIn);
    // bleed adds 2·0.25 to the tiled-across extent; coverage is never short.
    expect(netAcross(p.tiles)).toBeGreaterThanOrEqual(Math.min(30, 40));
  });
});

describe('panelize — orientation minimises seams', () => {
  it('a 60x40 door rotates so the 40 in axis crosses the media: ONE tile, no seam', () => {
    // 60 wide would need 2 strips at 52.5 media, but 40 fits in one. Pick the
    // orientation with fewer tiles.
    const r = panelize({
      profile: PROFILE,
      panels: [panel({ safeWidthIn: 60, safeHeightIn: 40 })],
    });
    const p = r.panels[0]!;
    expect(p.tiles).toHaveLength(1);
    expect(p.acrossAxis).toBe('height');
    expect(p.tiles[0]!.widthIn).toBeLessThanOrEqual(PROFILE.effectiveWidthIn);
    expect(p.feedExtentIn).toBeGreaterThanOrEqual(60); // the 60 in runs down the roll
  });
});

describe('panelize — multi-tile, never short, no tile over media', () => {
  it('a panel larger than media on both axes tiles correctly', () => {
    const r = panelize({
      profile: PROFILE,
      panels: [panel({ safeWidthIn: 80, safeHeightIn: 70 })],
    });
    const p = r.panels[0]!;
    expect(p.tiles.length).toBeGreaterThanOrEqual(2);
    for (const t of p.tiles) {
      expect(t.widthIn).toBeLessThanOrEqual(PROFILE.effectiveWidthIn + 1e-9);
      expect(t.widthIn).toBeGreaterThan(0);
      expect(t.lengthIn).toBeGreaterThan(0);
    }
    // Never short on the tiled axis (net of overlaps) vs the true extent.
    expect(netAcross(p.tiles)).toBeGreaterThanOrEqual(Math.min(80, 70));
    // Adjacent tiles share the configured overlap.
    expect(p.tiles[1]!.overlapPrevIn).toBeCloseTo(PROFILE.overlapIn, 9);
    // Contiguous: tile2 starts overlap before tile1 ends.
    expect(p.tiles[1]!.acrossStartIn).toBeCloseTo(p.tiles[0]!.acrossEndIn - PROFILE.overlapIn, 6);
  });

  it('a long van side (173x80) tiles into 2 strips down the roll', () => {
    const r = panelize({
      profile: PROFILE,
      panels: [panel({ safeWidthIn: 173, safeHeightIn: 80 })],
    });
    const p = r.panels[0]!;
    expect(p.tiles).toHaveLength(2); // 80 -> 2 strips across; 173 runs down the feed
    expect(p.acrossAxis).toBe('height');
    expect(p.feedExtentIn).toBeGreaterThanOrEqual(173);
    expect(netAcross(p.tiles)).toBeGreaterThanOrEqual(80);
  });

  it('a very large panel needs 3 tiles, each within media, still never short', () => {
    const r = panelize({
      profile: PROFILE,
      panels: [panel({ safeWidthIn: 200, safeHeightIn: 120 })],
    });
    const p = r.panels[0]!;
    expect(p.tiles).toHaveLength(3);
    for (const t of p.tiles) expect(t.widthIn).toBeLessThanOrEqual(PROFILE.effectiveWidthIn + 1e-9);
    expect(netAcross(p.tiles)).toBeGreaterThanOrEqual(120);
  });
});

describe('panelize — NEVER SHORT property across many shapes', () => {
  it('for every panel, net tiled coverage >= the smaller true extent and no tile exceeds media', () => {
    const panels: WrapPanelInput[] = [];
    let i = 0;
    for (const w of [10, 33, 52, 53, 64, 100, 150, 240]) {
      for (const h of [12, 40, 52.5, 70, 96, 180]) {
        panels.push(panel({ id: `p${i++}`, safeWidthIn: w, safeHeightIn: h }));
      }
    }
    const r = panelize({ profile: PROFILE, panels });
    expect(r.panels).toHaveLength(panels.length);
    for (const p of r.panels) {
      const trueAcross =
        p.acrossAxis === 'width'
          ? panels.find((x) => x.id === p.id)!.safeWidthIn
          : panels.find((x) => x.id === p.id)!.safeHeightIn;
      expect(netAcross(p.tiles)).toBeGreaterThanOrEqual(trueAcross - 1e-9);
      for (const t of p.tiles)
        expect(t.widthIn).toBeLessThanOrEqual(PROFILE.effectiveWidthIn + 1e-9);
    }
  });
});

describe('panelize — totals + confidence roll-up', () => {
  it('sums linear feet and media area, and rolls up estimated/needsMeasurement', () => {
    const r = panelize({
      profile: PROFILE,
      panels: [
        panel({ id: 'a', safeWidthIn: 40, safeHeightIn: 30, estimated: false }),
        panel({ id: 'b', safeWidthIn: 80, safeHeightIn: 70, estimated: true, warning: 'est' }),
        panel({
          id: 'c',
          safeWidthIn: 60,
          safeHeightIn: 96,
          needsMeasurement: true,
          estimated: true,
        }),
      ],
    });
    const sumLf = r.panels.reduce((s, p) => s + p.linearFeet, 0);
    expect(r.totalLinearFeet).toBeCloseTo(sumLf, 6);
    expect(r.totalLinearFeet).toBeGreaterThan(0);
    expect(r.totalMediaAreaSqFt).toBeGreaterThan(0);
    expect(r.estimated).toBe(true); // any estimated -> true
    expect(r.needsMeasurement).toBe(true); // any needsMeasurement -> true
  });
});

describe('panelize — guards', () => {
  it('skips a panel with missing/zero dimensions (printable_area sentinel)', () => {
    const r = panelize({
      profile: PROFILE,
      panels: [panel({ id: 'z', safeWidthIn: 0, safeHeightIn: 40 })],
    });
    expect(r.panels).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.id).toBe('z');
  });

  it('throws on an invalid profile (overlap >= effective width)', () => {
    expect(() =>
      panelize({ profile: { effectiveWidthIn: 10, overlapIn: 10, bleedIn: 0 }, panels: [panel()] }),
    ).toThrow();
  });

  it('throws on a non-positive effective width', () => {
    expect(() =>
      panelize({ profile: { effectiveWidthIn: 0, overlapIn: 0, bleedIn: 0 }, panels: [panel()] }),
    ).toThrow();
  });
});
