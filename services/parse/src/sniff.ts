// Magic-byte sniffing for the parse pipeline (GH-005 review fixup, PR #38).
//
// The declared MIME from the upload grant is attacker-controllable, so before we
// hand bytes to a converter we read the file header and confirm it actually looks
// like what the client claimed. This is defence-in-depth on top of the MIME
// allowlist in mime.ts: it stops a renamed `.exe`/HTML/etc. from being fed to the
// Inkscape/pdf2svg CLIs or stored as a "vector".
//
// We sniff at the converter-kind granularity (matching classifyMime), not the
// exact MIME, because PNG-vs-JPEG both legitimately route to the raster path and
// modern Illustrator files are PDF-compatible.

import type { ParseKind } from './mime';

/** A coarse byte-signature category we can detect from a file header.
 *  'html' is tracked separately so an HTML document smuggled in as an SVG is a
 *  positive contradiction (rejected), not an "unknown" that passes leniently. */
export type ByteSignature =
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'heic'
  | 'pdf'
  | 'postscript'
  | 'svg'
  | 'html';

function startsWithAscii(buf: Buffer, ascii: string, offset = 0): boolean {
  if (buf.length < offset + ascii.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (buf[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Identify a file's byte signature from its header, or null when we can't tell.
 * Null means "no opinion" — callers treat that as allowed so we never reject a
 * valid-but-unusual file on a sniff miss.
 */
export function sniffSignature(buf: Buffer): ByteSignature | null {
  if (buf.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png';
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';

  // WEBP: 'RIFF' .... 'WEBP'
  if (startsWithAscii(buf, 'RIFF') && startsWithAscii(buf, 'WEBP', 8)) return 'webp';

  // HEIC/HEIF: ISO-BMFF box — bytes 4..7 are 'ftyp', brand at 8..11.
  if (startsWithAscii(buf, 'ftyp', 4)) {
    const brand = buf.toString('latin1', 8, 12).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'heif', 'mif1', 'msf1'].includes(brand)) return 'heic';
  }

  // PDF (and PDF-compatible AI): '%PDF-'
  if (startsWithAscii(buf, '%PDF-')) return 'pdf';

  // PostScript / EPS / classic AI: '%!PS-Adobe-' (or a bare '%!').
  if (startsWithAscii(buf, '%!PS') || startsWithAscii(buf, '%!')) return 'postscript';

  // SVG / XML: skip a UTF-8 BOM and leading whitespace, then look for '<?xml',
  // '<svg', or an XML comment/doctype that an SVG document may open with.
  let start = 0;
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) start = 3;
  while (start < buf.length && start < 64) {
    const c = buf[start]!;
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) {
      start++;
      continue;
    }
    break;
  }
  const head = buf.toString('utf8', start, Math.min(buf.length, start + 256)).toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  if (head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!doctype svg')) {
    return 'svg';
  }
  if (head.startsWith('<!--') && head.includes('<svg')) return 'svg';

  return null;
}

// Which byte signatures are acceptable for each converter kind.
const COMPATIBLE: Record<ParseKind, ReadonlySet<ByteSignature>> = {
  raster: new Set(['png', 'jpeg', 'webp', 'heic']),
  'vector-pdf': new Set(['pdf']),
  // Modern Illustrator files are PDF-compatible; classic ones are PostScript.
  'vector-ai': new Set(['postscript', 'pdf']),
  svg: new Set(['svg']),
  unsupported: new Set(),
};

/**
 * True when the file header is consistent with the declared converter kind.
 * Returns true on a sniff miss (null signature) — we only reject on a *positive*
 * contradiction, never on uncertainty.
 */
export function bytesMatchKind(kind: ParseKind, buf: Buffer): boolean {
  const sig = sniffSignature(buf);
  if (sig === null) return true;
  return COMPATIBLE[kind]?.has(sig) ?? false;
}

/** The signature we sniffed, for diagnostics in parse_metadata. */
export function describeSignature(buf: Buffer): string {
  return sniffSignature(buf) ?? 'unknown';
}
