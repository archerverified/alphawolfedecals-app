// Sample wrap-safe rings for geometry unit tests. Coordinates are panel-local,
// unit mm×10, mirroring the seed vehicle SVG (e.g. driver panel `M60 360...`).

import type { Ring } from '../path-parse';

/** A simple axis-aligned rectangle 0,0 -> 1000,600. Area = 600_000 unit². */
export const RECT_RING: Ring = [
  [0, 0],
  [1000, 0],
  [1000, 600],
  [0, 600],
];

/** Path `d` for the rectangle above (M/L/Z form, as the validator sees). */
export const RECT_PATH = 'M0 0 L1000 0 L1000 600 L0 600 Z';

/**
 * A concave L-shape (notch removed from the top-right). Outer boundary only.
 *
 *   (0,0) ------------- (600,0)
 *     |                    |
 *     |        (600,400)---+
 *     |           |
 *   (0,1000) -- (400,1000)
 *
 * Actual ring (clockwise): an L where the top-right quadrant is cut out.
 */
export const L_SHAPE_RING: Ring = [
  [0, 0],
  [600, 0],
  [600, 400],
  [400, 400],
  [400, 1000],
  [0, 1000],
];

export const L_SHAPE_PATH = 'M0 0 L600 0 L600 400 L400 400 L400 1000 L0 1000 Z';

/**
 * A rectangle with a rectangular hole (donut), to exercise even-odd / signed
 * area. Outer 0,0->1000,1000 (CW), hole 250,250->750,750 (CCW).
 * Net area = 1_000_000 - 250_000 = 750_000 unit².
 */
export const DONUT_PATH = 'M0 0 L1000 0 L1000 1000 L0 1000 Z M250 250 L250 750 L750 750 L750 250 Z';

/** A rounded-rect-ish path using cubic curves, ~1000x600 with rounded corners. */
export const ROUNDED_PATH =
  'M100 0 L900 0 C955 0 1000 45 1000 100 L1000 500 C1000 555 955 600 900 600 ' +
  'L100 600 C45 600 0 555 0 500 L0 100 C0 45 45 0 100 0 Z';
