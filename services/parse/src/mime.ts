// MIME allowlist + classification for the parse pipeline (GH-005).

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB (matches bucket limit)

// What conversion path an upload takes.
//   vector-ai  : Adobe Illustrator / EPS  -> SVG via Inkscape CLI
//   vector-pdf : PDF                       -> SVG via pdf2svg CLI
//   svg        : already SVG               -> sanitise/passthrough
//   raster     : PNG/JPG/WEBP/HEIC         -> normalise via Sharp (+ optional rembg)
export type ParseKind = 'vector-ai' | 'vector-pdf' | 'svg' | 'raster' | 'unsupported';

const RASTER = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
// Only the explicit vector MIME types. We deliberately do NOT accept
// `application/octet-stream` here: browsers send it for *any* unknown binary, so
// trusting it routes arbitrary blobs into the Inkscape path. The client picker
// already rejects octet-stream, and process.ts magic-byte-sniffs the bytes.
const VECTOR_AI = new Set(['application/postscript', 'application/illustrator']);

export function classifyMime(mimeType: string): ParseKind {
  const m = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (m === 'image/svg+xml') return 'svg';
  if (m === 'application/pdf') return 'vector-pdf';
  if (VECTOR_AI.has(m)) return 'vector-ai';
  if (RASTER.has(m)) return 'raster';
  return 'unsupported';
}

// Source file extension to hand the CLI converters so they detect the format.
export function sourceExtFor(mimeType: string): string {
  const m = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  switch (m) {
    case 'application/pdf':
      return 'pdf';
    case 'image/svg+xml':
      return 'svg';
    case 'application/illustrator':
      return 'ai';
    case 'application/postscript':
      return 'eps';
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
    case 'image/heif':
      return 'heic';
    default:
      return 'bin';
  }
}

export function isAllowedMime(mimeType: string): boolean {
  return classifyMime(mimeType) !== 'unsupported';
}
