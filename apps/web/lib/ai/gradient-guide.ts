// Deterministic directional-gradient GUIDE image (Goal 18).
//
// Root cause (proven on real fal, systematic-debugging): the image model ignores
// BOTH anatomical ("black at the front") and image-space ("black on the right")
// gradient-direction TEXT and paints the gradient by its own prior (first-named
// colour -> left, second -> right), so the briefed direction renders reversed for
// e.g. gloss-black -> cyan. Prose can never pin it. But the EXPORT model
// (flux2_pro_edit) reliably reproduces the left-to-right colour layout of a
// CONDITIONING image. So we build a tiny gradient guide (front colour at the
// vehicle's front end, rear colour at its rear end) and condition the final
// render on it; the guide wins the direction.
//
// Orientation is derived deterministically from each view's panel geometry (the
// authored svgPath, in view-local art space): front-classified panels vs
// rear-classified panels by mean centre-x tell us which image side is the front.
// Pure + offline (sharp rasterizes an SVG); no DB, no network, no provider.

import 'server-only';

import sharp from 'sharp';

import { geometry } from '@alphawolf/canvas';

export interface GuidePanel {
  name: string;
  view: string;
  svgPath: string;
}

/** Image-space orientation of a view's front->rear axis. */
export type ViewOrientation = 'front-right' | 'front-left' | 'all-front' | 'all-rear' | 'unknown';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Return the hex unchanged if it is a valid 6-digit #RRGGBB, else null. */
export function normalizeHex(hex: string): string | null {
  const h = (hex ?? '').trim();
  return HEX_RE.test(h) ? h : null;
}

// Rear is checked first so a hypothetical "rear ... front" never misclassifies;
// no real AW panel name carries both keywords.
const REAR_RE = /\b(rear|tail(gate)?|trunk|hatch|liftgate|quarter|boot)\b/i;
const FRONT_RE = /\b(front|nose|hood|bonnet|grille|fascia)\b/i;

/** Classify a panel as the front or rear end of the vehicle by its name. */
export function panelEnd(name: string): 'front' | 'rear' | null {
  if (REAR_RE.test(name)) return 'rear';
  if (FRONT_RE.test(name)) return 'front';
  return null;
}

function centreX(svgPath: string): number | null {
  const rings = geometry.parsePath(svgPath).filter((r) => r.length >= 3);
  if (rings.length === 0) return null;
  const b = geometry.bbox(rings);
  return (b.minX + b.maxX) / 2;
}

/**
 * Derive a view's image-space front->rear orientation from its panels' geometry.
 * Side views resolve to front-left / front-right by comparing the mean centre-x
 * of front-classified vs rear-classified panels; end views (only one end present)
 * resolve to all-front / all-rear; anything unclassifiable is unknown (the caller
 * then skips the guide and falls back to the prior conditioning).
 */
export function viewOrientation(panels: GuidePanel[]): ViewOrientation {
  const frontXs: number[] = [];
  const rearXs: number[] = [];
  for (const p of panels) {
    const end = panelEnd(p.name);
    if (!end) continue;
    const x = centreX(p.svgPath);
    if (x === null) continue;
    (end === 'front' ? frontXs : rearXs).push(x);
  }
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  if (frontXs.length > 0 && rearXs.length > 0) {
    return mean(frontXs) > mean(rearXs) ? 'front-right' : 'front-left';
  }
  if (frontXs.length > 0) return 'all-front';
  if (rearXs.length > 0) return 'all-rear';
  return 'unknown';
}

function svgFor(
  orientation: ViewOrientation,
  frontHex: string,
  rearHex: string,
  w: number,
  h: number,
): string | null {
  // A linear gradient where the FRONT colour sits on the front side of the image.
  const linear = (leftHex: string, rightHex: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${leftHex}"/><stop offset="100%" stop-color="${rightHex}"/>
      </linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`;
  const solid = (hex: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${hex}"/></svg>`;
  switch (orientation) {
    case 'front-right':
      return linear(rearHex, frontHex); // front colour on the right
    case 'front-left':
      return linear(frontHex, rearHex); // front colour on the left
    case 'all-front':
      return solid(frontHex);
    case 'all-rear':
      return solid(rearHex);
    case 'unknown':
      return null;
  }
}

/**
 * Build the directional gradient guide PNG for one view, or null when it cannot be
 * built (unknown orientation, or invalid hex) — the caller then falls back to the
 * prior conditioning for that view rather than forcing a bad guide.
 */
export async function buildGradientGuide(opts: {
  panels: GuidePanel[];
  frontHex: string;
  rearHex: string;
  width: number;
  height: number;
}): Promise<Buffer | null> {
  const front = normalizeHex(opts.frontHex);
  const rear = normalizeHex(opts.rearHex);
  if (!front || !rear) return null;
  const orientation = viewOrientation(opts.panels);
  const svg = svgFor(orientation, front, rear, opts.width, opts.height);
  if (!svg) return null;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
