import { describe, expect, it } from 'vitest';
import { geometry, factory } from '../src/index';
import {
  RECT_RING,
  RECT_PATH,
  L_SHAPE_RING,
  L_SHAPE_PATH,
  DONUT_PATH,
  ROUNDED_PATH,
} from '../src/geometry/__fixtures__/rings';

const {
  parsePath,
  pointInPolygon,
  pointInRing,
  bbox,
  bboxIntersects,
  isElementInsideClip,
  elementBbox,
  pathArea,
  pathAreaMm2,
  polygonArea,
} = geometry;

describe('parsePath', () => {
  it('parses an M/L/Z rectangle into one closed ring (no repeated first point)', () => {
    const rings = parsePath(RECT_PATH);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toEqual(RECT_RING);
  });

  it('parses multi-subpath donut into two rings', () => {
    const rings = parsePath(DONUT_PATH);
    expect(rings).toHaveLength(2);
  });

  it('flattens cubic curves into polyline vertices', () => {
    const rings = parsePath(ROUNDED_PATH);
    expect(rings).toHaveLength(1);
    // Rounded corners produce many more vertices than the 8 straight ones.
    expect(rings[0]!.length).toBeGreaterThan(12);
    // Bounds stay within the nominal 0..1000 x 0..600 box.
    const b = bbox(rings);
    expect(b.minX).toBeGreaterThanOrEqual(-0.5);
    expect(b.maxX).toBeLessThanOrEqual(1000.5);
    expect(b.minY).toBeGreaterThanOrEqual(-0.5);
    expect(b.maxY).toBeLessThanOrEqual(600.5);
  });

  it('handles relative commands and curves consistently with absolute', () => {
    const abs = parsePath('M0 0 L100 0 L100 100 L0 100 Z');
    const rel = parsePath('m0 0 l100 0 l0 100 l-100 0 z');
    expect(abs).toEqual(rel);
  });
});

describe('point-in-polygon: rectangle ring', () => {
  it('point clearly inside', () => {
    expect(pointInRing(500, 300, RECT_RING)).toBe(true);
  });
  it('point clearly outside', () => {
    expect(pointInRing(2000, 300, RECT_RING)).toBe(false);
    expect(pointInRing(-5, 300, RECT_RING)).toBe(false);
  });
  it('point exactly on an edge is inside (inclusive boundary)', () => {
    expect(pointInRing(500, 0, RECT_RING)).toBe(true); // top edge
    expect(pointInRing(1000, 300, RECT_RING)).toBe(true); // right edge
  });
  it('point exactly on a vertex is inside', () => {
    expect(pointInRing(0, 0, RECT_RING)).toBe(true);
    expect(pointInRing(1000, 600, RECT_RING)).toBe(true);
  });
});

describe('point-in-polygon: concave L-shape', () => {
  it('inside the top-right horizontal arm', () => {
    expect(pointInRing(500, 200, L_SHAPE_RING)).toBe(true);
  });
  it('inside the left vertical arm', () => {
    expect(pointInRing(200, 800, L_SHAPE_RING)).toBe(true);
  });
  it('inside the notch is OUTSIDE', () => {
    expect(pointInRing(500, 700, L_SHAPE_RING)).toBe(false);
  });
  it('on the concave corner edge is inside', () => {
    expect(pointInRing(400, 700, L_SHAPE_RING)).toBe(true); // on the inner vertical edge
  });
});

describe('even-odd polygon with hole (donut)', () => {
  it('inside outer ring but outside hole is inside', () => {
    const rings = parsePath(DONUT_PATH);
    expect(pointInPolygon(100, 100, rings)).toBe(true);
  });
  it('inside the hole is outside', () => {
    const rings = parsePath(DONUT_PATH);
    expect(pointInPolygon(500, 500, rings)).toBe(false);
  });
});

describe('bbox + bboxIntersects', () => {
  it('computes the spanning bbox of rings', () => {
    expect(bbox([RECT_RING])).toEqual({
      minX: 0,
      minY: 0,
      maxX: 1000,
      maxY: 600,
    });
  });
  it('detects overlapping and disjoint boxes', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const b = { minX: 5, minY: 5, maxX: 15, maxY: 15 };
    const c = { minX: 20, minY: 20, maxX: 30, maxY: 30 };
    expect(bboxIntersects(a, b)).toBe(true);
    expect(bboxIntersects(a, c)).toBe(false);
    // Touching edges count as intersecting.
    expect(bboxIntersects(a, { minX: 10, minY: 0, maxX: 20, maxY: 10 })).toBe(true);
  });
});

describe('isElementInsideClip', () => {
  const clip = [RECT_RING]; // 0..1000 x 0..600

  it('bbox fully inside -> true', () => {
    expect(isElementInsideClip({ minX: 100, minY: 100, maxX: 200, maxY: 200 }, clip)).toBe(true);
  });
  it('bbox fully outside -> false', () => {
    expect(isElementInsideClip({ minX: 2000, minY: 2000, maxX: 2100, maxY: 2100 }, clip)).toBe(
      false,
    );
  });
  it('bbox straddling the boundary -> false', () => {
    expect(isElementInsideClip({ minX: 900, minY: 100, maxX: 1100, maxY: 200 }, clip)).toBe(false);
  });
  it('bbox flush against the boundary -> true', () => {
    expect(isElementInsideClip({ minX: 0, minY: 0, maxX: 1000, maxY: 600 }, clip)).toBe(true);
  });
  it('concave clip: corners inside but an edge pokes through the notch -> false', () => {
    const lclip = [L_SHAPE_RING];
    // A box whose corners sit in valid regions but whose span crosses the notch.
    // Box 300..500 x 300..500: corner (300,300) inside arm, (500,300) inside
    // arm, but (500,500) and (300,500)... (300,500) is inside left arm,
    // (500,500) is in the notch -> should be false.
    expect(isElementInsideClip({ minX: 300, minY: 300, maxX: 500, maxY: 500 }, lclip)).toBe(false);
  });
  it('empty clip -> false', () => {
    expect(isElementInsideClip({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, [])).toBe(false);
  });
});

describe('elementBbox', () => {
  it('axis-aligned rect at origin', () => {
    const el = factory.newRect(
      {
        id: factory.elementId('e'),
        panelId: factory.panelId('p'),
        view: 'driver',
      },
      { x: 100, y: 50, width: 200, height: 80, scaleX: 1, scaleY: 1, rotation: 0 },
    );
    expect(elementBbox(el)).toEqual({
      minX: 100,
      minY: 50,
      maxX: 300,
      maxY: 130,
    });
  });
  it('accounts for scale', () => {
    const el = factory.newRect(
      {
        id: factory.elementId('e'),
        panelId: factory.panelId('p'),
        view: 'driver',
      },
      { x: 0, y: 0, width: 100, height: 100, scaleX: 2, scaleY: 3 },
    );
    expect(elementBbox(el)).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 300 });
  });
  it('accounts for 90-degree rotation', () => {
    const el = factory.newRect(
      {
        id: factory.elementId('e'),
        panelId: factory.panelId('p'),
        view: 'driver',
      },
      { x: 0, y: 0, width: 200, height: 100, rotation: 90 },
    );
    const b = elementBbox(el);
    // 200x100 rotated 90deg about origin -> spans x[-100,0], y[0,200].
    expect(b.minX).toBeCloseTo(-100, 5);
    expect(b.maxX).toBeCloseTo(0, 5);
    expect(b.minY).toBeCloseTo(0, 5);
    expect(b.maxY).toBeCloseTo(200, 5);
  });
});

describe('path area (printable area math)', () => {
  it('pathArea of a known rectangle in input units squared', () => {
    // 1000 x 600 (mm×10) = 600_000 unit².
    expect(pathArea(RECT_PATH)).toBe(600_000);
  });
  it('pathAreaMm2 divides by 100 to get real mm²', () => {
    // 600_000 unit² / 100 = 6_000 mm². (= 100mm x 60mm.)
    expect(pathAreaMm2(RECT_PATH)).toBe(6_000);
  });
  it('L-shape area subtracts the notch', () => {
    // Full 600x1000 = 600_000 minus bottom-right notch 200x600 = 120_000.
    expect(pathArea(L_SHAPE_PATH)).toBe(480_000);
  });
  it('donut area subtracts the hole via signed area', () => {
    // 1000x1000 - 500x500 = 1_000_000 - 250_000 = 750_000.
    expect(pathArea(DONUT_PATH)).toBe(750_000);
    expect(polygonArea(parsePath(DONUT_PATH))).toBe(750_000);
  });
});
