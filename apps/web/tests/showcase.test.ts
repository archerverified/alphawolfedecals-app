// Goal 21 T6 - showcase compositor unit tests.
// Deterministic (synthetic images via sharp), no network, no DB.
// Guards: valid PNG output, correct canvas dimensions, heroPng=null path,
// multi-view tiles path, and byte-level determinism on repeated calls.

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { composeShowcase } from '../lib/generation/showcase';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Create a solid-color PNG of the given dimensions as a Uint8Array. */
async function solidPng(
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width: w, height: h, channels: 4, background: { r, g, b, alpha: 1 } } })
      .png()
      .toBuffer(),
  );
}

/** PNG magic bytes: 0x89 0x50 0x4E 0x47 ... */
function isPng(buf: Uint8Array): boolean {
  return (
    buf[0] === 0x89 &&
    buf[1] === 0x50 && // 'P'
    buf[2] === 0x4e && // 'N'
    buf[3] === 0x47 // 'G'
  );
}

async function pngDimensions(buf: Uint8Array): Promise<{ width: number; height: number }> {
  const meta = await sharp(Buffer.from(buf)).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

// The fixed canvas size from showcase.ts
const CANVAS_W = 1600;
const CANVAS_H = 1200;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('composeShowcase - compositor output', () => {
  it('returns a valid 1600x1200 PNG when heroPng is present', async () => {
    const heroPng = await solidPng(640, 480, 200, 100, 50);
    const view1 = await solidPng(320, 240, 50, 150, 200);
    const view2 = await solidPng(320, 240, 200, 50, 150);
    const logoPng = await solidPng(64, 32, 255, 255, 0);

    const result = await composeShowcase({
      heroPng,
      views: [
        { view: 'driver', png: view1 },
        { view: 'front', png: view2 },
      ],
      logoPng,
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(isPng(result)).toBe(true);
    expect(result.byteLength).toBeGreaterThan(5000);
    const dims = await pngDimensions(result);
    expect(dims.width).toBe(CANVAS_W);
    expect(dims.height).toBe(CANVAS_H);
  });

  it('returns a valid 1600x1200 PNG when heroPng is null (template-only showcase)', async () => {
    const view1 = await solidPng(320, 240, 0, 174, 239);
    const view2 = await solidPng(320, 240, 20, 40, 220);
    const view3 = await solidPng(320, 240, 200, 30, 30);
    const view4 = await solidPng(320, 240, 80, 200, 80);

    const result = await composeShowcase({
      heroPng: null,
      views: [
        { view: 'driver', png: view1 },
        { view: 'front', png: view2 },
        { view: 'passenger', png: view3 },
        { view: 'back', png: view4 },
      ],
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(isPng(result)).toBe(true);
    expect(result.byteLength).toBeGreaterThan(5000);
    const dims = await pngDimensions(result);
    expect(dims.width).toBe(CANVAS_W);
    expect(dims.height).toBe(CANVAS_H);
  });

  it('returns a valid PNG with a single view and no logo', async () => {
    const view1 = await solidPng(200, 150, 10, 200, 10);

    const result = await composeShowcase({
      heroPng: null,
      views: [{ view: 'front', png: view1 }],
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(isPng(result)).toBe(true);
    const dims = await pngDimensions(result);
    expect(dims.width).toBe(CANVAS_W);
    expect(dims.height).toBe(CANVAS_H);
  });

  it('is deterministic: same inputs produce byte-identical output', async () => {
    const heroPng = await solidPng(200, 150, 100, 100, 200);
    const viewPng = await solidPng(100, 80, 200, 200, 100);
    const logoPng = await solidPng(40, 40, 255, 0, 128);

    const input = {
      heroPng,
      views: [{ view: 'driver', png: viewPng }],
      logoPng,
    };

    const out1 = await composeShowcase(input);
    const out2 = await composeShowcase(input);

    // Byte-identical determinism
    expect(out1.byteLength).toBe(out2.byteLength);
    expect(Buffer.from(out1).equals(Buffer.from(out2))).toBe(true);
  });

  it('handles an empty views array gracefully (still returns valid PNG)', async () => {
    const heroPng = await solidPng(100, 75, 100, 150, 200);

    const result = await composeShowcase({
      heroPng,
      views: [],
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(isPng(result)).toBe(true);
    const dims = await pngDimensions(result);
    expect(dims.width).toBe(CANVAS_W);
    expect(dims.height).toBe(CANVAS_H);
  });
});
