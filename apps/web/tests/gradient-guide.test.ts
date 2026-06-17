// Goal 18 — gradient-guide builder unit tests. Pure + offline (sharp rasterizes
// an SVG; no network, no provider). The image model cannot be steered on gradient
// DIRECTION by prose (proven real-fal), so the final render is conditioned on a
// deterministic guide image whose left-to-right colour layout the export model
// (flux2_pro_edit) reliably reproduces. Orientation is derived from panel geometry.

import { describe, expect, it } from 'vitest';

import {
  buildGradientGuide,
  normalizeHex,
  panelEnd,
  viewOrientation,
  type GuidePanel,
} from '../lib/ai/gradient-guide';

// X3-shaped view-local svg paths (art space). Driver: front (Nose/Front*) on the
// RIGHT (high x), rear (Rear*) on the LEFT (low x). Passenger mirrors it.
const driverPanels: GuidePanel[] = [
  { name: 'Rear Quarter', view: 'driver', svgPath: 'M706 190 L830 185 L830 345 L706 345 Z' },
  { name: 'Rear Door', view: 'driver', svgPath: 'M830 185 L995 182 L995 340 L830 345 Z' },
  { name: 'Front Door', view: 'driver', svgPath: 'M995 182 L1345 185 L1345 340 L995 340 Z' },
  { name: 'Front Fender', view: 'driver', svgPath: 'M1345 185 L1490 195 L1490 340 L1345 340 Z' },
  {
    name: 'Nose & Front Bumper',
    view: 'driver',
    svgPath: 'M1490 195 L1700 215 L1700 350 L1490 340 Z',
  },
];
// Passenger = horizontal mirror (front on the LEFT, low x).
const passengerPanels: GuidePanel[] = [
  {
    name: 'Nose & Front Bumper',
    view: 'passenger',
    svgPath: 'M10 195 L220 215 L220 350 L10 340 Z',
  },
  { name: 'Front Fender', view: 'passenger', svgPath: 'M220 185 L365 195 L365 340 L220 340 Z' },
  { name: 'Front Door', view: 'passenger', svgPath: 'M365 182 L715 185 L715 340 L365 340 Z' },
  { name: 'Rear Door', view: 'passenger', svgPath: 'M715 185 L880 182 L880 340 L715 345 Z' },
  { name: 'Rear Quarter', view: 'passenger', svgPath: 'M880 185 L1004 190 L1004 345 L880 345 Z' },
];
const frontPanels: GuidePanel[] = [
  { name: 'Hood Front', view: 'front', svgPath: 'M100 100 L900 100 L900 300 L100 300 Z' },
  { name: 'Front Fascia', view: 'front', svgPath: 'M100 300 L900 300 L900 500 L100 500 Z' },
  { name: 'Front Bumper', view: 'front', svgPath: 'M100 500 L900 500 L900 600 L100 600 Z' },
];
const backPanels: GuidePanel[] = [
  { name: 'Tailgate', view: 'back', svgPath: 'M100 100 L900 100 L900 400 L100 400 Z' },
  { name: 'Rear Bumper', view: 'back', svgPath: 'M100 400 L900 400 L900 600 L100 600 Z' },
];

describe('normalizeHex', () => {
  it('accepts 6-digit hex (any case) and rejects junk', () => {
    expect(normalizeHex('#00AEEF')).toBe('#00AEEF');
    expect(normalizeHex('#00aeef')).toBe('#00aeef');
    expect(normalizeHex('00AEEF')).toBeNull();
    expect(normalizeHex('#fff')).toBeNull();
    expect(normalizeHex('cyan')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });
});

describe('panelEnd', () => {
  it('classifies front/rear panel names', () => {
    expect(panelEnd('Nose & Front Bumper')).toBe('front');
    expect(panelEnd('Front Door')).toBe('front');
    expect(panelEnd('Hood Front')).toBe('front');
    expect(panelEnd('Front Fascia')).toBe('front');
    expect(panelEnd('Rear Quarter')).toBe('rear');
    expect(panelEnd('Rear Door')).toBe('rear');
    expect(panelEnd('Tailgate')).toBe('rear');
    expect(panelEnd('Rear Bumper')).toBe('rear');
    expect(panelEnd('Roof')).toBeNull();
  });
});

describe('viewOrientation', () => {
  it('driver side: front is on the RIGHT (front-right)', () => {
    expect(viewOrientation(driverPanels)).toBe('front-right');
  });
  it('passenger side: front is on the LEFT (front-left)', () => {
    expect(viewOrientation(passengerPanels)).toBe('front-left');
  });
  it('front view: all-front', () => {
    expect(viewOrientation(frontPanels)).toBe('all-front');
  });
  it('back view: all-rear', () => {
    expect(viewOrientation(backPanels)).toBe('all-rear');
  });
  it('no classifiable panels: unknown', () => {
    expect(
      viewOrientation([{ name: 'Roof', view: 'top', svgPath: 'M0 0 L10 0 L10 10 L0 10 Z' }]),
    ).toBe('unknown');
  });
});

describe('buildGradientGuide', () => {
  const FRONT = '#000000'; // black at the front (start)
  const REAR = '#00AEEF'; // cyan at the rear (finish)

  async function meanLeftRight(buf: Buffer) {
    const sharp = (await import('sharp')).default;
    const W = 64;
    const { data, info } = await sharp(buf)
      .resize(W, 1, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const px = (i: number) => [data[i * 3]!, data[i * 3 + 1]!, data[i * 3 + 2]!] as const;
    const lum = ([r, g, b]: readonly [number, number, number]) => 0.299 * r + 0.587 * g + 0.114 * b;
    return { left: lum(px(2)), right: lum(px(info.width - 3)) };
  }

  it('driver (front-right): black on the RIGHT, cyan on the LEFT', async () => {
    const buf = await buildGradientGuide({
      panels: driverPanels,
      frontHex: FRONT,
      rearHex: REAR,
      width: 256,
      height: 192,
    });
    expect(buf).not.toBeNull();
    const { left, right } = await meanLeftRight(buf!);
    // front=black(dark) on the right, rear=cyan(bright) on the left.
    expect(right).toBeLessThan(left);
  });

  it('passenger (front-left): black on the LEFT, cyan on the RIGHT', async () => {
    const buf = await buildGradientGuide({
      panels: passengerPanels,
      frontHex: FRONT,
      rearHex: REAR,
      width: 256,
      height: 192,
    });
    const { left, right } = await meanLeftRight(buf!);
    expect(left).toBeLessThan(right);
  });

  it('front view: predominantly the front colour (black, dark)', async () => {
    const buf = await buildGradientGuide({
      panels: frontPanels,
      frontHex: FRONT,
      rearHex: REAR,
      width: 256,
      height: 192,
    });
    const { left, right } = await meanLeftRight(buf!);
    expect(left).toBeLessThan(40);
    expect(right).toBeLessThan(40);
  });

  it('back view: predominantly the rear colour (cyan, bright)', async () => {
    const buf = await buildGradientGuide({
      panels: backPanels,
      frontHex: FRONT,
      rearHex: REAR,
      width: 256,
      height: 192,
    });
    const { left, right } = await meanLeftRight(buf!);
    expect(left).toBeGreaterThan(80);
    expect(right).toBeGreaterThan(80);
  });

  it('returns null for unknown orientation (graceful fallback)', async () => {
    const buf = await buildGradientGuide({
      panels: [{ name: 'Roof', view: 'top', svgPath: 'M0 0 L10 0 L10 10 L0 10 Z' }],
      frontHex: FRONT,
      rearHex: REAR,
      width: 256,
      height: 192,
    });
    expect(buf).toBeNull();
  });

  it('returns null for invalid hex (skips the guide, never throws)', async () => {
    const buf = await buildGradientGuide({
      panels: driverPanels,
      frontHex: 'black',
      rearHex: REAR,
      width: 256,
      height: 192,
    });
    expect(buf).toBeNull();
  });
});
