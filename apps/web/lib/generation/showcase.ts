// Goal 21 T6 - On-brand multi-view marketing showcase compositor.
//
// Produces a deterministic 1600x1200 PNG that stitches:
//   - an on-photo hero image (top, large) when present
//   - the selected concept's per-view template renders (logo composited) in a row beneath
//   - a cyan (#00AEEF) brand bar at the top with "ALPHA WOLF" wordmark via SVG text overlay
//   - a small caption band: "Concept preview - not the print file."
//
// NO pricing or price-like content. NO Date, NO randomness (pure inputs -> pure output).
// Server-only: this module imports sharp and must not ship to the client bundle.

import 'server-only';

import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Brand tokens (match packages/db/src/svg/theme.ts)
// ---------------------------------------------------------------------------
const CYAN = '#00AEEF';
const INK = '#141b2d';

// Fixed canvas dimensions
const CANVAS_W = 1600;
const CANVAS_H = 1200;

// Brand bar at top
const BRAND_BAR_H = 72;

// Caption band at bottom
const CAPTION_H = 48;

// Hero area (between brand bar and tiles row, minus caption)
const TILE_ROW_H = 240;
const HERO_AREA_H = CANVAS_H - BRAND_BAR_H - TILE_ROW_H - CAPTION_H;

// Logo corner overlay inside the hero (modest fixed size, top-right)
const HERO_LOGO_MAX = 120;

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Render the brand bar as an SVG buffer: a solid cyan rect + "ALPHA WOLF" text.
 * Pure function of width/height, no external fonts needed (Helvetica/Arial fallback).
 */
function buildBrandBarSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(28, Math.round(height * 0.52));
  const wordmark = escapeXml('ALPHA WOLF');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${CYAN}"/>
  <text x="${Math.round(width / 2)}" y="${Math.round(height * 0.72)}"
    font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="${fontSize}"
    font-weight="bold"
    fill="${INK}"
    text-anchor="middle"
    letter-spacing="6">${wordmark}</text>
</svg>`;
  return Buffer.from(svg);
}

/**
 * Render the caption band as an SVG buffer: ink background + small paper-coloured text.
 */
function buildCaptionSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(14, Math.round(height * 0.38));
  const caption = escapeXml('Concept preview - not the print file.');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${INK}"/>
  <text x="${Math.round(width / 2)}" y="${Math.round(height * 0.68)}"
    font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="${fontSize}"
    fill="#f8f8f6"
    fill-opacity="0.72"
    text-anchor="middle">${caption}</text>
</svg>`;
  return Buffer.from(svg);
}

// ---------------------------------------------------------------------------
// Public compositor
// ---------------------------------------------------------------------------

export interface ShowcaseInput {
  /** On-photo hero render bytes (PNG/JPEG). Null when no vehicle photo was uploaded. */
  heroPng: Uint8Array | null;
  /** Template per-view renders with the logo already composited. */
  views: Array<{ view: string; png: Uint8Array }>;
  /** Customer logo bytes for a corner overlay on the hero (never AI-redrawn). */
  logoPng?: Uint8Array | null;
}

/**
 * Compose the on-brand marketing showcase.
 *
 * Returns a 1600x1200 PNG. Deterministic: same inputs produce the same output.
 * Never throws to the caller; internal errors surface as a fallback canvas.
 */
export async function composeShowcase(input: ShowcaseInput): Promise<Uint8Array> {
  const { heroPng, views, logoPng } = input;

  // Start with an ink-black canvas
  const canvas = sharp({
    create: {
      width: CANVAS_W,
      height: CANVAS_H,
      channels: 4,
      background: { r: 0x14, g: 0x1b, b: 0x2d, alpha: 1 },
    },
  });

  const overlays: sharp.OverlayOptions[] = [];

  // -------------------------------------------------------------------------
  // 1. Brand bar (top)
  // -------------------------------------------------------------------------
  const brandSvg = buildBrandBarSvg(CANVAS_W, BRAND_BAR_H);
  overlays.push({ input: brandSvg, left: 0, top: 0 });

  // -------------------------------------------------------------------------
  // 2. Hero area (or spread view tiles when no hero)
  // -------------------------------------------------------------------------
  const heroAreaTop = BRAND_BAR_H;
  const heroAreaBottom = BRAND_BAR_H + HERO_AREA_H;

  if (heroPng && heroPng.length > 0) {
    // Fit the hero into the hero area with small padding
    const heroPad = 16;
    const heroSlotW = CANVAS_W - heroPad * 2;
    const heroSlotH = HERO_AREA_H - heroPad * 2;

    try {
      const heroBuf = await sharp(Buffer.from(heroPng))
        .resize({ width: heroSlotW, height: heroSlotH, fit: 'inside', withoutEnlargement: false })
        .jpeg({ quality: 85 })
        .toBuffer();
      const heroMeta = await sharp(heroBuf).metadata();
      const hw = heroMeta.width ?? heroSlotW;
      // Center horizontally, top-aligned with padding
      const heroLeft = heroPad + Math.round((heroSlotW - hw) / 2);
      const heroTop = heroAreaTop + heroPad;
      overlays.push({ input: heroBuf, left: heroLeft, top: heroTop });

      // 2a. Corner logo overlay on the hero (top-right corner)
      if (logoPng && logoPng.length > 0) {
        try {
          const logoBuf = await sharp(Buffer.from(logoPng), { density: 300 })
            .resize({ width: HERO_LOGO_MAX, height: HERO_LOGO_MAX, fit: 'inside' })
            .png()
            .toBuffer();
          const lm = await sharp(logoBuf).metadata();
          const lw = lm.width ?? HERO_LOGO_MAX;
          const logoPad = 20;
          const logoLeft = heroLeft + hw - lw - logoPad;
          const logoTop = heroTop + logoPad;
          overlays.push({
            input: logoBuf,
            left: Math.max(0, logoLeft),
            top: Math.max(0, logoTop),
          });
        } catch {
          // logo overlay failure is non-fatal
        }
      }
    } catch {
      // hero render failure is non-fatal; the tile row still renders below
    }
  } else {
    // No hero: spread the view tiles to fill the hero area too
    // (handled by the tile section below with an expanded slot height)
  }

  // -------------------------------------------------------------------------
  // 3. Template view tiles row (or full-area grid when no hero)
  // -------------------------------------------------------------------------
  const tilesHaveHero = heroPng && heroPng.length > 0;
  const tilesTop = tilesHaveHero ? heroAreaBottom : heroAreaTop;
  const tilesHeight = tilesHaveHero ? TILE_ROW_H : HERO_AREA_H + TILE_ROW_H;
  const tilePad = 12;

  if (views.length > 0) {
    const tileCount = views.length;
    const totalPadW = tilePad * (tileCount + 1);
    const tileW = Math.floor((CANVAS_W - totalPadW) / tileCount);
    const tileH = tilesHeight - tilePad * 2;

    for (let i = 0; i < views.length; i++) {
      const v = views[i]!;
      try {
        const tileBuf = await sharp(Buffer.from(v.png))
          .resize({ width: tileW, height: tileH, fit: 'inside', withoutEnlargement: false })
          .jpeg({ quality: 82 })
          .toBuffer();
        const tm = await sharp(tileBuf).metadata();
        const th = tm.height ?? tileH;
        const tileLeft = tilePad + i * (tileW + tilePad);
        const tileTop = tilesTop + tilePad + Math.round((tileH - th) / 2);
        overlays.push({ input: tileBuf, left: tileLeft, top: Math.max(0, tileTop) });
      } catch {
        // A failing tile is skipped, not fatal
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Caption band (bottom)
  // -------------------------------------------------------------------------
  const captionTop = CANVAS_H - CAPTION_H;
  const captionSvg = buildCaptionSvg(CANVAS_W, CAPTION_H);
  overlays.push({ input: captionSvg, left: 0, top: captionTop });

  // -------------------------------------------------------------------------
  // 5. Composite and return PNG
  // -------------------------------------------------------------------------
  const png = await canvas.composite(overlays).png({ compressionLevel: 6 }).toBuffer();
  return new Uint8Array(png);
}
