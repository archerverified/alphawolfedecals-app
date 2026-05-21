// Format converters for the parse pipeline (GH-005).

import sharp from 'sharp';
import { convertViaCli } from './cli';
import { removeBackground } from './rembg';

export interface RasterResult {
  buffer: Buffer; // normalised PNG
  contentType: 'image/png';
  metadata: {
    naturalWidth: number | null;
    naturalHeight: number | null;
    rembg: { requested: boolean; removed: boolean; error?: string };
    // Detected content bounding box (transparent/edge trim), for the crop UI.
    contentBbox: { left: number; top: number; width: number; height: number } | null;
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

// Baseline anti-XSS sanitisation for stored/served SVGs (api-security guideline).
// The editor renders SVG via Konva/Image (not innerHTML), but the bytes are also
// served from Storage, so strip the obvious script vectors. Not a full DOMPurify
// (that needs a DOM); documented as a baseline in ADR-0007.
export function sanitizeSvg(input: Buffer): Buffer {
  let s = input.toString('utf8');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/(href|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '');
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
    },
  };
}
