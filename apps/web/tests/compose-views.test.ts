// Goal 15 D2/D4 — view compositor unit tests. Deterministic (synthetic images),
// no network. Verifies the logo lands at its zone, the no-logo path is a clean
// pass-through, junk never throws, and hero/default-zone selection.

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  composeView,
  defaultLogoZonePanelIds,
  pickHeroView,
  type ExportPanel,
} from '../lib/export/compose-views';

async function solid(w: number, h: number, r: number, g: number, b: number): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } })
      .png()
      .toBuffer(),
  );
}

async function pixelAt(bytes: Uint8Array, x: number, y: number) {
  const { data, info } = await sharp(Buffer.from(bytes))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return { r: data[idx]!, g: data[idx + 1]!, b: data[idx + 2]! };
}

// Full-view rectangle panel: bbox (0,0)→(400,200) so the logo centers at (200,100).
const panel: ExportPanel = {
  id: 'door',
  name: 'Front Door',
  view: 'driver',
  outlinePath: 'M 0 0 L 400 0 L 400 200 L 0 200 Z',
};

describe('composeView (D2 logo compositing)', () => {
  it('composites the logo onto the render at its zone', async () => {
    const render = await solid(400, 200, 200, 30, 30); // red render
    const logo = await solid(50, 50, 20, 40, 220); // blue logo
    const out = await composeView({
      renderBytes: render,
      viewPanels: [panel],
      logoZonePanelIds: ['door'],
      logoBytes: logo,
    });
    const center = await pixelAt(out, 200, 100); // logo center
    expect(center.b).toBeGreaterThan(120); // blue logo is present
    expect(center.r).toBeLessThan(120);
    const corner = await pixelAt(out, 4, 4); // outside the logo → red render
    expect(corner.r).toBeGreaterThan(120);
    expect(corner.b).toBeLessThan(120);
  });

  it('is a clean JPEG pass-through when there is no logo', async () => {
    const render = await solid(80, 60, 10, 200, 10); // green
    const out = await composeView({
      renderBytes: render,
      viewPanels: [panel],
      logoZonePanelIds: [],
      logoBytes: null,
    });
    expect(out[0]).toBe(0xff); // JPEG magic
    expect(out[1]).toBe(0xd8);
    const px = await pixelAt(out, 40, 30);
    expect(px.g).toBeGreaterThan(120); // still green
  });

  it('never throws on junk render bytes', async () => {
    const out = await composeView({
      renderBytes: new Uint8Array([1, 2, 3]),
      viewPanels: [panel],
      logoZonePanelIds: ['door'],
      logoBytes: await solid(10, 10, 0, 0, 255),
    });
    expect(out).toBeInstanceOf(Uint8Array);
  });
});

describe('hero + default-zone selection', () => {
  it('prefers a strong angle, never the bare rear', () => {
    expect(pickHeroView([{ view: 'back' }, { view: 'front' }, { view: 'driver' }])?.view).toBe(
      'driver',
    );
    expect(pickHeroView([{ view: 'back' }, { view: 'passenger' }])?.view).toBe('passenger');
    expect(pickHeroView([{ view: 'back' }])?.view).toBe('back'); // last resort
  });

  it('defaults a zone-less logo to a prominent panel (driver door, else hood)', () => {
    const panels: ExportPanel[] = [
      { id: 'a', name: 'Rear Bumper', view: 'back', outlinePath: '' },
      { id: 'b', name: 'Front Door', view: 'driver', outlinePath: '' },
      { id: 'c', name: 'Hood Front', view: 'front', outlinePath: '' },
    ];
    expect(defaultLogoZonePanelIds(panels)).toEqual(['b']); // driver Front Door wins
    expect(
      defaultLogoZonePanelIds([{ id: 'c', name: 'Hood Front', view: 'front', outlinePath: '' }]),
    ).toEqual(['c']); // falls back to the hood
  });
});
