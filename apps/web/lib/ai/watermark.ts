// Preview watermark (Goal 7 D5). Every gallery preview is resized to the
// config preview width and tiled with a diagonal "ALPHA WOLF · PREVIEW" text
// overlay — unwatermarked originals never leave owner-scoped signed URLs
// pre-selection (pipeline design §6). Deterministic: the overlay is a pure
// function of the output dimensions, so the same input bytes always produce
// the same output bytes (unit-tested).

import 'server-only';

import sharp from 'sharp';

import { AI_CONFIG } from '@alphawolf/db';

const WATERMARK_TEXT = 'ALPHA WOLF · PREVIEW';

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Tiled diagonal watermark overlay for a width×height canvas. Exported for
// the unit tests; pure string building, no sharp.
export function buildWatermarkSvg(width: number, height: number): string {
  const fontSize = Math.max(14, Math.round(width / 26));
  // Tile pitch: wide enough for the text plus breathing room, staggered rows.
  const tileW = Math.round(fontSize * 13.5);
  const tileH = Math.round(fontSize * 4.5);
  const text = escapeXml(WATERMARK_TEXT);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <pattern id="wm" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="0" y="${fontSize}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" fill-opacity="0.30">${text}</text>
      <text x="${Math.round(tileW / 2)}" y="${Math.round(fontSize + tileH / 2)}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#000000" fill-opacity="0.18">${text}</text>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#wm)"/>
</svg>`;
}

/**
 * Resize an image to the preview width (aspect preserved) and composite the
 * tiled diagonal watermark over it. Accepts any sharp-decodable input (the
 * providers return png/jpeg/webp); always outputs PNG.
 */
export async function watermarkPreview(
  png: Buffer,
  width: number = AI_CONFIG.previewWidth,
): Promise<Buffer> {
  if (!Number.isInteger(width) || width < 1) {
    throw new Error(`[watermark] width must be a positive integer (got ${width})`);
  }
  const meta = await sharp(png).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('[watermark] input image has no decodable dimensions');
  }
  const height = Math.max(1, Math.round((meta.height / meta.width) * width));
  const overlay = Buffer.from(buildWatermarkSvg(width, height));
  return sharp(png)
    .resize(width, height, { fit: 'fill' })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
