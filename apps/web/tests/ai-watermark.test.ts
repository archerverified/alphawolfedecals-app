// Goal 7 D5 — preview watermark unit tests. All offline (sharp only).

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { AI_CONFIG } from '@alphawolf/db';

import { buildWatermarkSvg, watermarkPreview } from '@/lib/ai/watermark';

async function testPng(width = 1600, height = 1200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 180, g: 40, b: 40 } },
  })
    .png()
    .toBuffer();
}

describe('watermarkPreview', () => {
  it('is deterministic: same input bytes → identical output bytes', async () => {
    const input = await testPng();
    const a = await watermarkPreview(input);
    const b = await watermarkPreview(input);
    expect(a.equals(b)).toBe(true);
  });

  it('resizes to the config preview width with the aspect ratio preserved', async () => {
    const input = await testPng(2048, 1536); // 4:3
    const out = await watermarkPreview(input);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(AI_CONFIG.previewWidth);
    expect(meta.height).toBe(Math.round((1536 / 2048) * AI_CONFIG.previewWidth));
    expect(meta.format).toBe('png');
  });

  it('honors an explicit width override', async () => {
    const input = await testPng(1024, 768);
    const out = await watermarkPreview(input, 512);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(384);
  });

  it('actually marks the image (output differs from a plain resize)', async () => {
    const input = await testPng();
    const marked = await watermarkPreview(input);
    const plain = await sharp(input)
      .resize(AI_CONFIG.previewWidth, Math.round((1200 / 1600) * AI_CONFIG.previewWidth), {
        fit: 'fill',
      })
      .png()
      .toBuffer();
    expect(marked.equals(plain)).toBe(false);
    // The watermark is light text over a solid red field — pixel stats shift.
    const markedStats = await sharp(marked).stats();
    const plainStats = await sharp(plain).stats();
    expect(markedStats.channels[1]!.mean).not.toBeCloseTo(plainStats.channels[1]!.mean, 1);
  });

  it('rejects a non-positive width and undecodable input', async () => {
    const input = await testPng();
    await expect(watermarkPreview(input, 0)).rejects.toThrow(/width/);
    await expect(watermarkPreview(Buffer.from('not an image'))).rejects.toThrow();
  });
});

describe('buildWatermarkSvg', () => {
  it('tiles the brand preview text and scales with width', () => {
    const svg = buildWatermarkSvg(1024, 768);
    expect(svg).toContain('ALPHA WOLF');
    expect(svg).toContain('PREVIEW');
    expect(svg).toContain('rotate(-30)');
    expect(svg).toContain('width="1024"');
    // Pure function of the dimensions — deterministic by construction.
    expect(buildWatermarkSvg(1024, 768)).toBe(svg);
    expect(buildWatermarkSvg(512, 768)).not.toBe(svg);
  });
});
