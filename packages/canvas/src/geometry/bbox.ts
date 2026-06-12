// Element -> axis-aligned bbox in panel-local coordinates (ADR-0006 §1, §6).
//
// Accounts for the element's position, scale, and rotation. The local box for
// each element type is taken in its own untransformed frame, then its four
// corners are rotated/scaled about the element origin (x, y) — matching Konva's
// node transform (offset at top-left, rotation about the node origin).

import type { CanvasElement } from '../schema/types.js';
import type { Bbox } from './polygon.js';

/** Local (pre-transform) box width/height for an element, origin at (0,0). */
function localSize(el: CanvasElement): { w: number; h: number } {
  switch (el.type) {
    case 'shape': {
      if (el.kind === 'line' && el.points && el.points.length >= 4) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i + 1 < el.points.length; i += 2) {
          const x = el.points[i]!;
          const y = el.points[i + 1]!;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
        return { w: maxX - minX, h: maxY - minY };
      }
      return { w: el.width, h: el.height };
    }
    case 'image': {
      // Use crop extent when present, else natural size.
      if (el.crop) return { w: el.crop.width, h: el.crop.height };
      return { w: el.naturalW, h: el.naturalH };
    }
    case 'text': {
      // Without a text-measurement engine in this DOM-free core, approximate
      // the box from fontSize and content length. Callers that need exact text
      // metrics measure in the render layer and pass an override width/height
      // via a future field; for clip/snap purposes this approximation suffices.
      const lines = el.content.split('\n');
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
      const w =
        Math.max(1, longest) * el.fontSize * 0.6 + el.letterSpacing * Math.max(0, longest - 1);
      const h = Math.max(1, lines.length) * el.fontSize * el.lineHeight;
      return { w, h };
    }
    default: {
      const _never: never = el;
      return _never;
    }
  }
}

/**
 * Axis-aligned bbox of an element in panel-local coordinates, after applying
 * scaleX/scaleY and rotation about the element origin (x, y).
 */
export function elementBbox(el: CanvasElement): Bbox {
  const { w, h } = localSize(el);
  const sw = w * el.scaleX;
  const sh = h * el.scaleY;

  // Local corners (origin at element position before rotation).
  const corners: Array<[number, number]> = [
    [0, 0],
    [sw, 0],
    [sw, sh],
    [0, sh],
  ];

  const rad = (el.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [cx, cy] of corners) {
    const rx = cx * cos - cy * sin + el.x;
    const ry = cx * sin + cy * cos + el.y;
    if (rx < minX) minX = rx;
    if (ry < minY) minY = ry;
    if (rx > maxX) maxX = rx;
    if (ry > maxY) maxY = ry;
  }
  return { minX, minY, maxX, maxY };
}
