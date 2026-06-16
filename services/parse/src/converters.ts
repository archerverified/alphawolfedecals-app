// Format converters for the parse pipeline (GH-005).

import sharp from 'sharp';
import { convertViaCli } from './cli.js';
import { removeBackground } from './rembg.js';

export interface RasterResult {
  buffer: Buffer; // normalised PNG
  contentType: 'image/png';
  metadata: {
    naturalWidth: number | null;
    naturalHeight: number | null;
    rembg: { requested: boolean; removed: boolean; error?: string };
    // Detected content bounding box (transparent/edge trim), for the crop UI.
    contentBbox: { left: number; top: number; width: number; height: number } | null;
    // True when the FINAL png (post-rembg) has no transparent pixels — drives
    // the logo quality gate's "solid background" warning (Goal 5 / B2C-004).
    // null when stats couldn't be computed.
    opaque: boolean | null;
  };
}

// AI / EPS -> SVG via Inkscape 1.x. `inExt` is 'ai' or 'eps' so Inkscape detects
// the format. Caller must have checked commandExists('inkscape').
export function aiToSvg(input: Buffer, inExt: 'ai' | 'eps'): Promise<Buffer> {
  return convertViaCli({
    cmd: 'inkscape',
    input,
    inExt,
    outExt: 'svg',
    buildArgs: (inPath, outPath) => [inPath, '--export-type=svg', `--export-filename=${outPath}`],
    timeoutMs: 120_000,
  });
}

// PDF -> SVG (first page) via pdf2svg. Caller must have checked commandExists('pdf2svg').
export function pdfToSvg(input: Buffer): Promise<Buffer> {
  return convertViaCli({
    cmd: 'pdf2svg',
    input,
    inExt: 'pdf',
    outExt: 'svg',
    buildArgs: (inPath, outPath) => [inPath, outPath, '1'],
    timeoutMs: 60_000,
  });
}

// Anti-XSS sanitisation for stored/served SVGs (api-security guideline).
// The editor renders SVG via Konva/Image (not innerHTML), but the bytes are also
// served from Storage and could be opened directly, so we strip every active
// content vector. This is a hardened string sanitiser, not a full DOM purifier
// (that needs a DOM in the worker); documented as a baseline in ADR-0007.
//
// Covered vectors:
//   • <script> and <style> elements (style can carry @import / expression()),
//   • <foreignObject> (arbitrary embedded HTML),
//   • event handlers in ANY namespace (on*, xlink:on*, ev:on*…),
//   • dangerous URI schemes (javascript:, data:, vbscript:) in href/xlink:href/src.
// Scheme-aware href/xlink:href/src cleaner. Strips javascript:/vbscript: and
// non-raster data: URIs, but KEEPS safe embedded rasters (data:image/png|jpeg|
// gif|webp) — legitimate logo artwork. Fragment (#id), http(s), and relative refs
// are untouched.
const SAFE_RASTER_DATA_URI = /^data:image\/(?:png|jpe?g|gif|webp)(?:;|,)/i;
function sanitizeUriSchemes(s: string): string {
  const attr = /\b((?:xlink:)?href|src)\s*=\s*(?:("|')([^"']*)\2|([^\s">]+))/gi;
  return s.replace(attr, (full, _name, _quote, quoted, unquoted) => {
    const value = ((quoted ?? unquoted) || '').trim();
    const isScript = /^(?:javascript|vbscript)\s*:/i.test(value);
    const isData = /^data\s*:/i.test(value);
    const dangerous = isScript || (isData && !SAFE_RASTER_DATA_URI.test(value));
    return dangerous ? '' : full;
  });
}

export function sanitizeSvg(input: Buffer): Buffer {
  let s = input.toString('utf8');
  // Active elements, both paired and self-closing forms.
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  s = s.replace(/<script\b[^>]*\/>/gi, '');
  s = s.replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
  s = s.replace(/<style\b[^>]*\/>/gi, '');
  s = s.replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '');
  s = s.replace(/<foreignObject\b[^>]*\/>/gi, '');
  // Event handlers regardless of namespace prefix: on*, xlink:on*, ev:on*, …
  s = s.replace(/\s[\w:-]*\bon\w+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\s[\w:-]*\bon\w+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/\s[\w:-]*\bon\w+\s*=\s*[^\s">]+/gi, '');
  // Dangerous URI schemes in any href/xlink:href/src (covers <image>, <use>, <a>).
  // javascript:/vbscript: are always stripped. data: is stripped EXCEPT safe
  // embedded rasters (data:image/png|jpeg|gif|webp) — a logo is frequently a raster
  // wrapped in an SVG via a data: URI (exported from Figma/Illustrator); the old
  // blanket data:-strip erased that artwork, rendering the logo invisible in the
  // export (Goal 17). data:image/svg+xml stays stripped — a nested SVG could
  // re-introduce active content. The bytes are only ever rasterised server-side
  // (sharp/resvg, no script execution) or rendered via Konva/Image, never innerHTML.
  s = sanitizeUriSchemes(s);
  return Buffer.from(s, 'utf8');
}

// Raster (PNG/JPG/WEBP/HEIC) -> normalised PNG, with optional rembg and content
// bbox detection. `failOn:'none'` so a slightly-malformed upload still processes.
export async function rasterToPng(input: Buffer, opts: { rembg: boolean }): Promise<RasterResult> {
  const base = sharp(input, { failOn: 'none' });
  const meta = await base.metadata();
  let png = await base.png().toBuffer();

  const rembg = { requested: opts.rembg, removed: false, error: undefined as string | undefined };
  if (opts.rembg) {
    const r = await removeBackground(png);
    png = r.buffer;
    rembg.removed = r.removed;
    rembg.error = r.error;
  }

  // Transparency check on the FINAL buffer: a JPG source re-encoded to PNG is
  // still opaque; a post-rembg PNG is not. sharp's stats().isOpaque is a full
  // pixel scan — runs on every raster upload (incl. large vehicle photos), an
  // accepted cost for a single decode-speed pass.
  let opaque: boolean | null = null;
  try {
    const stats = await sharp(png).stats();
    opaque = stats.isOpaque;
  } catch {
    opaque = null;
  }

  let contentBbox: RasterResult['metadata']['contentBbox'] = null;
  try {
    const { info } = await sharp(png).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
    const offLeft = (info as { trimOffsetLeft?: number }).trimOffsetLeft ?? 0;
    const offTop = (info as { trimOffsetTop?: number }).trimOffsetTop ?? 0;
    contentBbox = { left: -offLeft, top: -offTop, width: info.width, height: info.height };
  } catch {
    contentBbox = null; // fully-uniform image (nothing to trim) — leave null
  }

  return {
    buffer: png,
    contentType: 'image/png',
    metadata: {
      naturalWidth: meta.width ?? null,
      naturalHeight: meta.height ?? null,
      rembg,
      contentBbox,
      opaque,
    },
  };
}
