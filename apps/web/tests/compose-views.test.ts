// Goal 15 D2/D4 — view compositor unit tests. Deterministic (synthetic images),
// no network. Verifies the logo lands at its zone, the no-logo path is a clean
// pass-through, junk never throws, and hero/default-zone selection.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  composeView,
  defaultLogoZonePanelIds,
  pickHeroView,
  type ExportPanel,
} from '../lib/export/compose-views';

async function changedFraction(a: Uint8Array, b: Uint8Array): Promise<number> {
  const ra = await sharp(Buffer.from(a)).raw().toBuffer();
  const rb = await sharp(Buffer.from(b)).raw().toBuffer();
  let changed = 0;
  const n = Math.min(ra.length, rb.length);
  for (let i = 0; i < n; i++) if (Math.abs(ra[i]! - rb[i]!) > 10) changed++;
  return changed / n;
}

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

  it('composites a REAL raster-embedded-SVG logo (the customer fixture) visibly (Goal 17)', async () => {
    // The fixture is a PNG wrapped in an SVG via a data: URI — the shape the parse
    // sanitizer used to blank. composeView must rasterize it to a visible logo, not
    // an empty box. (Paired with the services/parse sanitiser test that keeps the
    // raster, this proves the whole export-logo chain.)
    const render = await solid(400, 200, 0, 174, 239); // cyan front door
    const logo = readFileSync(join(__dirname, '..', 'e2e', 'fixtures', 'alpha-wolf-logo.svg'));
    const withLogo = await composeView({
      renderBytes: render,
      viewPanels: [panel],
      logoZonePanelIds: ['door'],
      logoBytes: new Uint8Array(logo),
    });
    const noLogo = await composeView({
      renderBytes: render,
      viewPanels: [panel],
      logoZonePanelIds: [],
      logoBytes: null,
    });
    expect(await changedFraction(withLogo, noLogo)).toBeGreaterThan(0.01);
    // Emit a visual artifact (the composited door) for the closeout proof.
    if (process.env.LOGO_PROOF_OUT) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(process.env.LOGO_PROOF_OUT, Buffer.from(withLogo));
    }
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
