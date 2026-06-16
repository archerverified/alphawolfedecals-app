// Goal 15 D2/D4 — server-side view compositing for the spec pack.
//
// D2: the customer's logo must appear ON the vehicle, not just as a filename in
//     the spec table. We composite the real logo onto each final view render at
//     its assigned zone (sharp — the same pure-JS-friendly dep the watermarker
//     uses). THE LOGO IS COMPOSITED, NEVER AI-RENDERED (PRD §5).
// D4: the pack shows the design across MULTIPLE views with a strong hero — never
//     a bare rear (the Goal-13 export heroed the rear). pickHeroView orders the
//     side that best showcases a wrap first.
//
// Geometry mirrors the editor handoff (generation-finalize.ts): a view's render
// covers that view's content bbox, and the logo sits centered on its zone panel
// at ~45% of the panel width — so the export matches what the editor shows.

import sharp from 'sharp';

import { outlineBbox } from '@alphawolf/db';

export type ExportPanel = { id: string; name: string; view: string; outlinePath: string };

/** A view render normalized + logo-composited, ready for pdf-lib (always JPEG). */
export type ComposedView = { view: string; bytes: Uint8Array; kind: 'jpg' };

// Hero preference: the angle that best sells a wrap, never the bare rear.
const HERO_PREFERENCE = ['driver', 'front', 'passenger', 'back'] as const;

export function pickHeroView<T extends { view: string }>(views: T[]): T | null {
  for (const pref of HERO_PREFERENCE) {
    const found = views.find((v) => v.view === pref);
    if (found) return found;
  }
  return views[0] ?? null;
}

/**
 * When the brief carries a logo but assigned it to no zone, default to a
 * prominent panel (driver door, else hood, else the largest panel) so the logo
 * still lands somewhere flattering — D2's "defaulting to a prominent panel".
 */
export function defaultLogoZonePanelIds(panels: ExportPanel[]): string[] {
  const byName = (re: RegExp, view?: string) =>
    panels.find((p) => re.test(p.name) && (!view || p.view === view));
  const prominent =
    byName(/front door/i, 'driver') ?? byName(/\bhood\b/i) ?? byName(/front door/i) ?? panels[0];
  return prominent ? [prominent.id] : [];
}

function unionBbox(panels: ExportPanel[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of panels) {
    const b = outlineBbox(p.outlinePath);
    if (!b) continue;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  if (!Number.isFinite(minX) || maxX - minX <= 0 || maxY - minY <= 0) return null;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

const MAX_VIEW_WIDTH = 1280; // bounds PDF/email size; renders are ~1 MP anyway

/**
 * Composite the logo onto one view render at its zone panel(s) and return JPEG
 * bytes (the logo's transparency is flattened onto the render). NEVER throws:
 * any failure falls back to the normalized render alone, then the raw bytes.
 */
export async function composeView(opts: {
  renderBytes: Uint8Array;
  viewPanels: ExportPanel[];
  logoZonePanelIds: string[];
  logoBytes: Uint8Array | null;
}): Promise<Uint8Array> {
  const { renderBytes, viewPanels, logoZonePanelIds, logoBytes } = opts;
  try {
    // Resize to a buffer FIRST so overlay coordinates use the composited dims.
    const baseBuf = await sharp(Buffer.from(renderBytes))
      .resize({ width: MAX_VIEW_WIDTH, withoutEnlargement: true })
      .toBuffer();
    const base = sharp(baseBuf);
    const meta = await base.metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    const box = W && H && logoBytes ? unionBbox(viewPanels) : null;

    const overlays: sharp.OverlayOptions[] = [];
    if (logoBytes && box) {
      for (const id of logoZonePanelIds) {
        const panel = viewPanels.find((p) => p.id === id);
        if (!panel) continue;
        const pb = outlineBbox(panel.outlinePath);
        if (!pb) continue;
        const targetW = Math.max(24, Math.round((((pb.maxX - pb.minX) * 0.45) / box.width) * W));
        // density helps when the logo is an SVG (sharp rasterizes vector input).
        const logoBuf = await sharp(Buffer.from(logoBytes), { density: 300 })
          .resize({ width: Math.min(targetW, W), fit: 'inside' })
          .png()
          .toBuffer();
        const lm = await sharp(logoBuf).metadata();
        const lw = lm.width ?? targetW;
        const lh = lm.height ?? targetW;
        const cx = (((pb.minX + pb.maxX) / 2 - box.minX) / box.width) * W;
        const cy = (((pb.minY + pb.maxY) / 2 - box.minY) / box.height) * H;
        overlays.push({
          input: logoBuf,
          left: Math.max(0, Math.min(W - lw, Math.round(cx - lw / 2))),
          top: Math.max(0, Math.min(H - lh, Math.round(cy - lh / 2))),
        });
      }
    }

    const pipeline = overlays.length ? base.composite(overlays) : base;
    return new Uint8Array(await pipeline.jpeg({ quality: 82 }).toBuffer());
  } catch {
    try {
      return new Uint8Array(await sharp(Buffer.from(renderBytes)).jpeg({ quality: 82 }).toBuffer());
    } catch {
      return renderBytes; // last resort: hand back the original bytes untouched
    }
  }
}
