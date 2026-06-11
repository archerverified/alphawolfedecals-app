// Pins the `opaque` field of RasterResult.metadata — the contract the wizard's
// logo quality gate (apps/web B2C-004) reads. True = no transparent pixel in
// the FINAL png; false when any alpha < 255 survives.

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { rasterToPng } from '../src/converters.js';

async function solidRgb(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

async function transparentRgba(): Promise<Buffer> {
  return sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 0.5 } },
  })
    .png()
    .toBuffer();
}

describe('rasterToPng opaque detection', () => {
  it('reports opaque=true for a solid RGB png', async () => {
    const out = await rasterToPng(await solidRgb(), { rembg: false });
    expect(out.metadata.opaque).toBe(true);
  });

  it('reports opaque=false when transparency is present', async () => {
    const out = await rasterToPng(await transparentRgba(), { rembg: false });
    expect(out.metadata.opaque).toBe(false);
  });
});
