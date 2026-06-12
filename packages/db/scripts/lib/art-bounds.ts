// Raster ink measurement for QC overlays. The dimension callouts anchor on
// the TRUE extent of each view's art (roof, wheels, bumper tips), which panel
// geometry understates — so the renderer asks the rendered sheet itself.
// Lives with the scripts because it needs sharp; the pure SVG assembly is in
// src/svg/qc-overlay.ts.
//
// Measurement is connected-component based: a window-clipped scan would let a
// neighbouring view's protruding art (the bass boat's wakeboard tower crosses
// the midline between its rows) corrupt the bounds. Components keep each
// drawing whole: every ink blob is assigned to the view whose scan window
// contains its centroid, and a view's bounds are the union of its blobs.

import sharp from 'sharp';
import type { Bounds } from '../../src/svg/index.js';

type Component = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
  cx: number;
  cy: number;
};

/** Pixels darker than this (greyscale 0-255, near-white background) are art. */
const INK_THRESHOLD = 235;
/** Components smaller than this are antialiasing specks — ignored. */
const MIN_COMPONENT_PX = 25;

function labelComponents(mask: Uint8Array, w: number, h: number): Component[] {
  const visited = new Uint8Array(mask.length);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;
    let sx = 0;
    let sy = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      count++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // 4-connectivity is enough — art strokes are thick at raster scale.
      if (x > 0 && mask[i - 1] && !visited[i - 1]) {
        visited[i - 1] = 1;
        stack.push(i - 1);
      }
      if (x < w - 1 && mask[i + 1] && !visited[i + 1]) {
        visited[i + 1] = 1;
        stack.push(i + 1);
      }
      if (y > 0 && mask[i - w] && !visited[i - w]) {
        visited[i - w] = 1;
        stack.push(i - w);
      }
      if (y < h - 1 && mask[i + w] && !visited[i + w]) {
        visited[i + w] = 1;
        stack.push(i + w);
      }
    }
    if (count >= MIN_COMPONENT_PX) {
      out.push({ minX, minY, maxX, maxY, count, cx: sx / count, cy: sy / count });
    }
  }
  return out;
}

/**
 * Measure the ink bbox belonging to each view. `png` is the rendered sheet;
 * windows are viewBox coordinates (mapped to pixels via the png/viewBox
 * ratio) and act as ASSIGNMENT regions — a component belongs to the window
 * holding its centroid. Returns null for views that attracted no ink —
 * callers should fall back to the view's panel bounds.
 */
export async function measureArtBounds(
  png: Buffer,
  viewBox: { width: number; height: number },
  windows: Record<string, Bounds>,
): Promise<Record<string, Bounds | null>> {
  const { data, info } = await sharp(png)
    .flatten({ background: '#ffffff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sx = info.width / viewBox.width;
  const sy = info.height / viewBox.height;

  const mask = new Uint8Array(info.width * info.height);
  for (let i = 0; i < mask.length; i++) {
    if (data[i]! < INK_THRESHOLD) mask[i] = 1;
  }
  const components = labelComponents(mask, info.width, info.height);

  const out: Record<string, Bounds | null> = {};
  for (const view of Object.keys(windows)) out[view] = null;
  for (const c of components) {
    for (const [view, w] of Object.entries(windows)) {
      const inWindow =
        c.cx >= w.minX * sx && c.cx <= w.maxX * sx && c.cy >= w.minY * sy && c.cy <= w.maxY * sy;
      if (!inWindow) continue;
      const prev = out[view];
      out[view] = prev
        ? {
            minX: Math.min(prev.minX, c.minX / sx),
            minY: Math.min(prev.minY, c.minY / sy),
            maxX: Math.max(prev.maxX, c.maxX / sx),
            maxY: Math.max(prev.maxY, c.maxY / sy),
          }
        : { minX: c.minX / sx, minY: c.minY / sy, maxX: c.maxX / sx, maxY: c.maxY / sy };
      break;
    }
  }
  return out;
}
